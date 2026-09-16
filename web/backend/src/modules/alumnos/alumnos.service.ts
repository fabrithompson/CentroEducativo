/**
 * Servicio del módulo Alumnos.
 *
 * El legajo lo asigna el sistema, no el usuario: es la identidad administrativa
 * del alumno dentro de la institución y no puede depender de que alguien no se
 * equivoque al tipearlo.
 */

import { EstadoAlumno, Prisma, type PrismaClient } from '@prisma/client';

import { HttpError } from '../../utils/httpError';
import { armarPagina, toSkipTake, type Paginacion } from '../shared/pagination';

/** Datos que se devuelven de un alumno en los listados. */
const seleccionListado = {
  id: true,
  legajo: true,
  dni: true,
  apellido: true,
  nombres: true,
  fechaNacimiento: true,
  domicilio: true,
  localidad: true,
  telefono: true,
  email: true,
  estado: true,
  fechaIngreso: true,
  curso: {
    select: {
      id: true,
      nombre: true,
      division: true,
      turno: true,
      anioLectivo: true,
      nivel: { select: { id: true, nombre: true } },
    },
  },
} satisfies Prisma.AlumnoSelect;

export interface FiltrosAlumno {
  busqueda?: string;
  cursoId?: number;
  nivelId?: number;
  estado?: EstadoAlumno;
  /** Restricción de visibilidad impuesta por el rol (ver `shared/authz`). */
  visibles?: { id?: { in: number[] } };
}

function armarWhere(f: FiltrosAlumno): Prisma.AlumnoWhereInput {
  const where: Prisma.AlumnoWhereInput = { ...f.visibles };

  if (f.estado) where.estado = f.estado;
  if (f.cursoId) where.cursoId = f.cursoId;
  if (f.nivelId) where.curso = { nivelId: f.nivelId };

  if (f.busqueda) {
    const q = f.busqueda.trim();
    where.OR = [
      { apellido: { contains: q, mode: 'insensitive' } },
      { nombres: { contains: q, mode: 'insensitive' } },
      { dni: { contains: q } },
      { legajo: { contains: q, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function listarAlumnos(
  prisma: PrismaClient,
  filtros: FiltrosAlumno,
  paginacion: Paginacion,
) {
  const where = armarWhere(filtros);
  const { skip, take } = toSkipTake(paginacion);

  const [items, total] = await Promise.all([
    prisma.alumno.findMany({
      where,
      select: seleccionListado,
      orderBy: [{ apellido: 'asc' }, { nombres: 'asc' }],
      skip,
      take,
    }),
    prisma.alumno.count({ where }),
  ]);

  return armarPagina(items, total, paginacion);
}

export async function obtenerAlumno(prisma: PrismaClient, id: number) {
  const alumno = await prisma.alumno.findUnique({
    where: { id },
    include: {
      curso: { include: { nivel: true } },
      user: { select: { id: true, usuario: true, email: true, isActive: true } },
      tutores: {
        include: { tutor: { select: { id: true, nombre: true, email: true, dni: true } } },
      },
      inscripcionesDeporte: {
        where: { estado: 'ACTIVA' },
        include: { deporte: { select: { id: true, nombre: true, arancelMensual: true } } },
      },
    },
  });

  if (!alumno) throw HttpError.notFound('El alumno no existe.');
  return alumno;
}

/**
 * Genera el próximo legajo con el formato `A-0001`.
 *
 * Corre dentro de la misma transacción que el alta y con nivel `Serializable`:
 * si dos altas concurrentes leyeran el mismo máximo, generarían legajos
 * repetidos y la restricción única haría fallar a una de las dos.
 */
async function proximoLegajo(tx: Prisma.TransactionClient): Promise<string> {
  const ultimo = await tx.alumno.findFirst({
    where: { legajo: { startsWith: 'A-' } },
    orderBy: { legajo: 'desc' },
    select: { legajo: true },
  });

  const numero = ultimo ? Number(ultimo.legajo.slice(2)) + 1 : 1;
  return `A-${String(numero).padStart(4, '0')}`;
}

export interface CrearAlumnoInput {
  dni: string;
  apellido: string;
  nombres: string;
  fechaNacimiento: Date;
  domicilio: string;
  localidad?: string;
  provincia?: string;
  telefono?: string | null;
  email?: string | null;
  cursoId: number;
  fechaIngreso?: Date;
  observaciones?: string | null;
  /** Usuario del campus a vincular, si el alumno ya tiene cuenta. */
  userId?: number | null;
}

export async function crearAlumno(prisma: PrismaClient, input: CrearAlumnoInput) {
  return prisma.$transaction(
    async (tx) => {
      const duplicado = await tx.alumno.findUnique({ where: { dni: input.dni } });
      if (duplicado) {
        throw HttpError.conflict(
          `Ya existe un alumno con DNI ${input.dni} (legajo ${duplicado.legajo}).`,
        );
      }

      const curso = await tx.curso.findUnique({
        where: { id: input.cursoId },
        include: { nivel: true, _count: { select: { alumnos: true } } },
      });
      if (!curso) throw HttpError.notFound('El curso indicado no existe.');
      if (!curso.activo) throw HttpError.conflict('El curso indicado no está activo.');

      if (curso._count.alumnos >= curso.cupoMaximo) {
        throw HttpError.conflict(
          `${curso.nombre} "${curso.division}" no tiene cupo (${curso._count.alumnos}/${curso.cupoMaximo}).`,
        );
      }

      if (input.userId) {
        const user = await tx.user.findUnique({ where: { id: input.userId } });
        if (!user) throw HttpError.notFound('El usuario a vincular no existe.');

        const yaVinculado = await tx.alumno.findUnique({ where: { userId: input.userId } });
        if (yaVinculado) {
          throw HttpError.conflict('Ese usuario ya está vinculado a otro alumno.');
        }
      }

      return tx.alumno.create({
        data: {
          legajo: await proximoLegajo(tx),
          dni: input.dni,
          apellido: input.apellido,
          nombres: input.nombres,
          fechaNacimiento: input.fechaNacimiento,
          domicilio: input.domicilio,
          localidad: input.localidad ?? 'Resistencia',
          provincia: input.provincia ?? 'Chaco',
          telefono: input.telefono ?? null,
          email: input.email ?? null,
          cursoId: input.cursoId,
          fechaIngreso: input.fechaIngreso ?? new Date(),
          observaciones: input.observaciones ?? null,
          userId: input.userId ?? null,
        },
        include: { curso: { include: { nivel: true } } },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export type ActualizarAlumnoInput = Partial<Omit<CrearAlumnoInput, 'dni'>> & {
  estado?: EstadoAlumno;
};

export async function actualizarAlumno(
  prisma: PrismaClient,
  id: number,
  input: ActualizarAlumnoInput,
) {
  const alumno = await prisma.alumno.findUnique({ where: { id } });
  if (!alumno) throw HttpError.notFound('El alumno no existe.');

  if (input.cursoId && input.cursoId !== alumno.cursoId) {
    const curso = await prisma.curso.findUnique({ where: { id: input.cursoId } });
    if (!curso) throw HttpError.notFound('El curso indicado no existe.');
    if (!curso.activo) throw HttpError.conflict('El curso indicado no está activo.');
  }

  if (input.userId) {
    const yaVinculado = await prisma.alumno.findUnique({ where: { userId: input.userId } });
    if (yaVinculado && yaVinculado.id !== id) {
      throw HttpError.conflict('Ese usuario ya está vinculado a otro alumno.');
    }
  }

  return prisma.alumno.update({
    where: { id },
    data: {
      apellido: input.apellido,
      nombres: input.nombres,
      fechaNacimiento: input.fechaNacimiento,
      domicilio: input.domicilio,
      localidad: input.localidad,
      provincia: input.provincia,
      telefono: input.telefono,
      email: input.email,
      cursoId: input.cursoId,
      estado: input.estado,
      observaciones: input.observaciones,
      userId: input.userId,
    },
    include: { curso: { include: { nivel: true } } },
  });
}

/**
 * Baja lógica. No se borra el registro: un alumno tiene facturas, notas y
 * asistencias asociadas, y el historial institucional tiene que sobrevivir a
 * que se vaya del colegio. La FK `ON DELETE RESTRICT` de `Factura` lo impediría
 * de todos modos.
 */
export async function darDeBajaAlumno(
  prisma: PrismaClient,
  id: number,
  estado: EstadoAlumno = EstadoAlumno.INACTIVO,
) {
  const alumno = await prisma.alumno.findUnique({ where: { id } });
  if (!alumno) throw HttpError.notFound('El alumno no existe.');

  if (alumno.estado === estado) {
    throw HttpError.conflict(`El alumno ya está en estado ${estado}.`);
  }

  return prisma.$transaction(async (tx) => {
    // Al darlo de baja se liberan sus inscripciones a deportes y servicios: de
    // lo contrario seguiría ocupando cupo y generando cargos.
    await tx.inscripcionDeporte.updateMany({
      where: { alumnoId: id, estado: 'ACTIVA' },
      data: { estado: 'BAJA', fechaBaja: new Date() },
    });
    await tx.inscripcionTransporte.updateMany({
      where: { alumnoId: id, estado: 'ACTIVA' },
      data: { estado: 'BAJA', fechaBaja: new Date() },
    });
    await tx.inscripcionComedor.updateMany({
      where: { alumnoId: id, estado: 'ACTIVA' },
      data: { estado: 'BAJA', fechaBaja: new Date() },
    });

    return tx.alumno.update({ where: { id }, data: { estado } });
  });
}

// ------------------------------------------------------------------
// Vínculos tutor — alumno
// ------------------------------------------------------------------

/**
 * Crea el vínculo entre un tutor y un alumno.
 *
 * Esta operación es exclusiva de ADMIN. Es el punto que cierra el hallazgo 5.2
 * de la auditoría: antes cualquier usuario con rol PADRE se vinculaba a
 * cualquier alumno con sólo conocer su DNI.
 */
export async function vincularTutor(
  prisma: PrismaClient,
  input: {
    tutorId: number;
    alumnoId: number;
    parentesco?: string | null;
    esResponsableFacturacion?: boolean;
    creadoPorId: number;
  },
) {
  const [tutor, alumno] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.tutorId } }),
    prisma.alumno.findUnique({ where: { id: input.alumnoId } }),
  ]);

  if (!tutor) throw HttpError.notFound('El tutor indicado no existe.');
  if (tutor.role !== 'PADRE') {
    throw HttpError.badRequest(`El usuario "${tutor.usuario}" no tiene rol PADRE.`);
  }
  if (!alumno) throw HttpError.notFound('El alumno indicado no existe.');

  const existente = await prisma.tutorAlumno.findUnique({
    where: { tutorId_alumnoId: { tutorId: input.tutorId, alumnoId: input.alumnoId } },
  });
  if (existente) throw HttpError.conflict('El tutor ya está vinculado a ese alumno.');

  return prisma.$transaction(async (tx) => {
    // Un alumno tiene un solo responsable de facturación (índice único parcial).
    if (input.esResponsableFacturacion) {
      await tx.tutorAlumno.updateMany({
        where: { alumnoId: input.alumnoId, esResponsableFacturacion: true },
        data: { esResponsableFacturacion: false },
      });
    }

    return tx.tutorAlumno.create({
      data: {
        tutorId: input.tutorId,
        alumnoId: input.alumnoId,
        parentesco: input.parentesco ?? null,
        esResponsableFacturacion: input.esResponsableFacturacion ?? false,
        creadoPorId: input.creadoPorId,
      },
      include: {
        tutor: { select: { id: true, nombre: true, email: true } },
        alumno: { select: { id: true, legajo: true, apellido: true, nombres: true } },
      },
    });
  });
}

export async function desvincularTutor(prisma: PrismaClient, vinculoId: number) {
  const vinculo = await prisma.tutorAlumno.findUnique({ where: { id: vinculoId } });
  if (!vinculo) throw HttpError.notFound('El vínculo no existe.');

  await prisma.tutorAlumno.delete({ where: { id: vinculoId } });
  return { id: vinculoId };
}
