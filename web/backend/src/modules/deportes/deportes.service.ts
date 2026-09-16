/**
 * Servicio de inscripciones deportivas.
 *
 * Hace cumplir, en capa de aplicación, las dos reglas estrictas de la consigna:
 *   - máximo 2 deportes simultáneos por alumno;
 *   - sin conflictos de horarios entre los deportes elegidos.
 *
 * La base de datos las vuelve a verificar (índice único parcial + triggers).
 * Esta capa existe para devolver errores que un tutor pueda entender, no para
 * ser la única defensa: si este código se saltea, el motor rechaza igual.
 */

import { EstadoInscripcion, Prisma, type PrismaClient } from '@prisma/client';

import { HttpError } from '../../utils/httpError';
import {
  MAX_DEPORTES_POR_ALUMNO,
  asignarSlotLibre,
  describirConflicto,
  detectarConflictos,
  type DiaSemana,
  type FranjaDeDeporte,
} from './horarios';

/** Cliente de Prisma o transacción: permite componer con `$transaction`. */
type PrismaLike = PrismaClient | Prisma.TransactionClient;

export interface InscribirEnDeporteInput {
  alumnoId: number;
  deporteId: number;
  observacion?: string | null;
}

/**
 * Trae las franjas horarias de un deporte para un nivel educativo dado.
 * Cada deporte abre grupos por nivel: a un alumno sólo le aplican los de su nivel.
 */
async function franjasDeDeporte(
  db: PrismaLike,
  deporteId: number,
  nivelId: number,
): Promise<FranjaDeDeporte[]> {
  const horarios = await db.horarioDeporte.findMany({
    where: { deporteId, nivelId, activo: true },
    include: { deporte: { select: { id: true, nombre: true } } },
  });

  return horarios.map((h) => ({
    deporteId: h.deporte.id,
    deporteNombre: h.deporte.nombre,
    diaSemana: h.diaSemana as DiaSemana,
    horaInicio: h.horaInicio,
    horaFin: h.horaFin,
  }));
}

/**
 * Inscribe a un alumno en un deporte.
 *
 * Corre dentro de una transacción `Serializable`: sin ese aislamiento, dos
 * pedidos concurrentes podrían leer "tiene 1 deporte" y escribir los dos, y el
 * alumno terminaría con 3. El índice único parcial lo atajaría igual, pero con
 * un error de clave duplicada en lugar de uno explicativo.
 */
export async function inscribirEnDeporte(
  prisma: PrismaClient,
  input: InscribirEnDeporteInput,
) {
  const { alumnoId, deporteId, observacion = null } = input;

  return prisma.$transaction(
    async (tx) => {
      const alumno = await tx.alumno.findUnique({
        where: { id: alumnoId },
        include: { curso: { select: { nivelId: true } } },
      });
      if (!alumno) throw HttpError.notFound('El alumno no existe.');
      if (alumno.estado !== 'ACTIVO') {
        throw HttpError.conflict('El alumno no está activo: no puede inscribirse a deportes.');
      }

      const deporte = await tx.deporte.findUnique({ where: { id: deporteId } });
      if (!deporte) throw HttpError.notFound('El deporte no existe.');
      if (!deporte.activo) throw HttpError.conflict(`${deporte.nombre} no está disponible este ciclo.`);

      const nivelId = alumno.curso.nivelId;

      // ¿Ya está inscripto en este deporte?
      const yaInscripto = await tx.inscripcionDeporte.findUnique({
        where: { alumnoId_deporteId: { alumnoId, deporteId } },
      });
      if (yaInscripto && yaInscripto.estado === EstadoInscripcion.ACTIVA) {
        throw HttpError.conflict(`El alumno ya está inscripto en ${deporte.nombre}.`);
      }

      // --- Regla 1: máximo 2 deportes simultáneos ---
      const activas = await tx.inscripcionDeporte.findMany({
        where: { alumnoId, estado: EstadoInscripcion.ACTIVA },
        include: { deporte: { select: { nombre: true } } },
      });

      const slot = asignarSlotLibre(activas.map((i) => i.slot));
      if (slot === null) {
        const nombres = activas.map((i) => i.deporte.nombre).join(' y ');
        throw HttpError.conflict(
          `El alumno ya cursa ${activas.length} deportes (${nombres}). ` +
            `El máximo permitido es ${MAX_DEPORTES_POR_ALUMNO}: primero hay que dar de baja uno.`,
        );
      }

      // --- Regla 2: sin conflictos de horarios ---
      const nuevas = await franjasDeDeporte(tx, deporteId, nivelId);
      if (nuevas.length === 0) {
        throw HttpError.conflict(
          `${deporte.nombre} no tiene grupos abiertos para el nivel del alumno.`,
        );
      }

      const existentes: FranjaDeDeporte[] = [];
      for (const inscripcion of activas) {
        existentes.push(...(await franjasDeDeporte(tx, inscripcion.deporteId, nivelId)));
      }

      const conflictos = detectarConflictos(nuevas, existentes);
      if (conflictos.length > 0) {
        throw HttpError.conflict(describirConflicto(conflictos[0]), {
          conflictos: conflictos.map(describirConflicto),
        });
      }

      // --- Cupo del deporte ---
      const ocupados = await tx.inscripcionDeporte.count({
        where: { deporteId, estado: EstadoInscripcion.ACTIVA },
      });
      if (ocupados >= deporte.cupoMaximo) {
        throw HttpError.conflict(`${deporte.nombre} no tiene cupo disponible (${ocupados}/${deporte.cupoMaximo}).`);
      }

      // Una inscripción dada de baja se reactiva en lugar de duplicarse: la
      // restricción única (alumnoId, deporteId) no admite dos filas.
      if (yaInscripto) {
        return tx.inscripcionDeporte.update({
          where: { id: yaInscripto.id },
          data: { estado: EstadoInscripcion.ACTIVA, slot, fechaAlta: new Date(), fechaBaja: null, observacion },
          include: { deporte: true },
        });
      }

      return tx.inscripcionDeporte.create({
        data: { alumnoId, deporteId, slot, observacion },
        include: { deporte: true },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

/** Da de baja una inscripción y libera el slot para otro deporte. */
export async function darDeBajaDeporte(prisma: PrismaClient, inscripcionId: number) {
  const inscripcion = await prisma.inscripcionDeporte.findUnique({
    where: { id: inscripcionId },
    include: { deporte: { select: { nombre: true } } },
  });
  if (!inscripcion) throw HttpError.notFound('La inscripción no existe.');
  if (inscripcion.estado === EstadoInscripcion.BAJA) {
    throw HttpError.conflict(`La inscripción a ${inscripcion.deporte.nombre} ya estaba dada de baja.`);
  }

  return prisma.inscripcionDeporte.update({
    where: { id: inscripcionId },
    data: { estado: EstadoInscripcion.BAJA, fechaBaja: new Date() },
  });
}

/** Deportes que cursa el alumno, con su grilla semanal. */
export async function listarDeportesDeAlumno(prisma: PrismaClient, alumnoId: number) {
  const alumno = await prisma.alumno.findUnique({
    where: { id: alumnoId },
    include: { curso: { select: { nivelId: true } } },
  });
  if (!alumno) throw HttpError.notFound('El alumno no existe.');

  const inscripciones = await prisma.inscripcionDeporte.findMany({
    where: { alumnoId, estado: EstadoInscripcion.ACTIVA },
    include: {
      deporte: {
        include: {
          profesorResponsable: { select: { apellido: true, nombres: true } },
          horarios: {
            where: { nivelId: alumno.curso.nivelId, activo: true },
            orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
          },
        },
      },
    },
    orderBy: { slot: 'asc' },
  });

  return {
    cupo: { usado: inscripciones.length, maximo: MAX_DEPORTES_POR_ALUMNO },
    inscripciones,
  };
}

/**
 * Deportes que el alumno todavía podría cursar: excluye los que ya cursa y
 * marca los que chocarían de horario, para que la UI los muestre deshabilitados
 * con el motivo en lugar de dejar que el usuario descubra el error al enviar.
 */
export async function listarDeportesDisponibles(prisma: PrismaClient, alumnoId: number) {
  const alumno = await prisma.alumno.findUnique({
    where: { id: alumnoId },
    include: { curso: { select: { nivelId: true } } },
  });
  if (!alumno) throw HttpError.notFound('El alumno no existe.');

  const nivelId = alumno.curso.nivelId;

  const activas = await prisma.inscripcionDeporte.findMany({
    where: { alumnoId, estado: EstadoInscripcion.ACTIVA },
    select: { deporteId: true },
  });
  const yaCursa = new Set(activas.map((i) => i.deporteId));
  const alcanzoElMaximo = activas.length >= MAX_DEPORTES_POR_ALUMNO;

  const existentes: FranjaDeDeporte[] = [];
  for (const i of activas) {
    existentes.push(...(await franjasDeDeporte(prisma, i.deporteId, nivelId)));
  }

  const deportes = await prisma.deporte.findMany({
    where: { activo: true, horarios: { some: { nivelId, activo: true } } },
    include: {
      profesorResponsable: { select: { apellido: true, nombres: true } },
      horarios: { where: { nivelId, activo: true }, orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }] },
    },
    orderBy: { nombre: 'asc' },
  });

  return deportes.map((d) => {
    const franjas: FranjaDeDeporte[] = d.horarios.map((h) => ({
      deporteId: d.id,
      deporteNombre: d.nombre,
      diaSemana: h.diaSemana as DiaSemana,
      horaInicio: h.horaInicio,
      horaFin: h.horaFin,
    }));
    const conflictos = detectarConflictos(franjas, existentes);

    let motivo: string | null = null;
    if (yaCursa.has(d.id)) motivo = 'El alumno ya cursa este deporte.';
    else if (alcanzoElMaximo) motivo = `Alcanzó el máximo de ${MAX_DEPORTES_POR_ALUMNO} deportes simultáneos.`;
    else if (conflictos.length > 0) motivo = describirConflicto(conflictos[0]);

    return { ...d, inscribible: motivo === null, motivo };
  });
}
