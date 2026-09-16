/**
 * Servicios opcionales mensuales: transporte escolar y comedor.
 *
 * Ambos se contratan por mes calendario y con precio diferenciado. Las
 * restricciones `@@unique([alumnoId, anio, mes])` garantizan que un alumno no
 * pueda tener dos recorridos ni dos planes de comedor en el mismo período.
 */

import {
  EstadoInscripcion,
  type CodigoRecorrido,
  type PrismaClient,
  type TurnoTransporte,
} from '@prisma/client';

import { HttpError } from '../../utils/httpError';
import { aNumero } from '../shared/pagination';

/** Período válido: no se contrata para un mes que ya pasó hace rato. */
export function validarPeriodo(anio: number, mes: number): void {
  if (mes < 1 || mes > 12) throw HttpError.badRequest('El mes debe estar entre 1 y 12.');

  const hoy = new Date();
  const limiteInferior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const solicitado = new Date(anio, mes - 1, 1);

  if (solicitado < limiteInferior) {
    throw HttpError.badRequest(
      'No se puede contratar un servicio para un período cerrado. Consultá con Administración.',
    );
  }
}

// ==================================================================
// TRANSPORTE
// ==================================================================

export async function listarRecorridos(prisma: PrismaClient, anio?: number, mes?: number) {
  const recorridos = await prisma.recorridoTransporte.findMany({
    include: {
      _count: {
        select: {
          inscripciones: {
            where: {
              estado: EstadoInscripcion.ACTIVA,
              ...(anio && mes ? { anio, mes } : {}),
            },
          },
        },
      },
    },
    orderBy: { codigo: 'asc' },
  });

  return recorridos.map((r) => ({
    ...r,
    arancelMensual: aNumero(r.arancelMensual),
    ocupados: r._count.inscripciones,
    lugaresDisponibles: Math.max(0, r.capacidad - r._count.inscripciones),
  }));
}

export interface InscribirTransporteInput {
  alumnoId: number;
  recorridoId?: number;
  codigo?: CodigoRecorrido;
  anio: number;
  mes: number;
  turno?: TurnoTransporte;
}

export async function inscribirEnTransporte(
  prisma: PrismaClient,
  input: InscribirTransporteInput,
) {
  validarPeriodo(input.anio, input.mes);

  const alumno = await prisma.alumno.findUnique({ where: { id: input.alumnoId } });
  if (!alumno) throw HttpError.notFound('El alumno no existe.');
  if (alumno.estado !== 'ACTIVO') {
    throw HttpError.conflict('El alumno no está activo: no puede contratar transporte.');
  }

  const recorrido = input.recorridoId
    ? await prisma.recorridoTransporte.findUnique({ where: { id: input.recorridoId } })
    : input.codigo
      ? await prisma.recorridoTransporte.findUnique({ where: { codigo: input.codigo } })
      : null;

  if (!recorrido) throw HttpError.notFound('El recorrido no existe.');
  if (!recorrido.activo) throw HttpError.conflict(`${recorrido.nombre} no está operativo.`);

  const ocupados = await prisma.inscripcionTransporte.count({
    where: {
      recorridoId: recorrido.id,
      anio: input.anio,
      mes: input.mes,
      estado: EstadoInscripcion.ACTIVA,
    },
  });
  if (ocupados >= recorrido.capacidad) {
    throw HttpError.conflict(
      `${recorrido.nombre} no tiene lugares para ${input.mes}/${input.anio} (${ocupados}/${recorrido.capacidad}).`,
    );
  }

  const existente = await prisma.inscripcionTransporte.findUnique({
    where: { alumnoId_anio_mes: { alumnoId: input.alumnoId, anio: input.anio, mes: input.mes } },
    include: { recorrido: { select: { nombre: true } } },
  });

  // Un alumno tiene un solo recorrido por mes: cambiar de recorrido es
  // actualizar la inscripción existente, no crear otra.
  if (existente) {
    if (existente.estado === EstadoInscripcion.ACTIVA && existente.recorridoId === recorrido.id) {
      throw HttpError.conflict(
        `El alumno ya viaja en ${existente.recorrido.nombre} en ${input.mes}/${input.anio}.`,
      );
    }

    return prisma.inscripcionTransporte.update({
      where: { id: existente.id },
      data: {
        recorridoId: recorrido.id,
        turno: input.turno ?? existente.turno,
        estado: EstadoInscripcion.ACTIVA,
        fechaBaja: null,
      },
      include: { recorrido: true, alumno: { select: { legajo: true, apellido: true, nombres: true } } },
    });
  }

  return prisma.inscripcionTransporte.create({
    data: {
      alumnoId: input.alumnoId,
      recorridoId: recorrido.id,
      anio: input.anio,
      mes: input.mes,
      turno: input.turno ?? 'IDA_Y_VUELTA',
    },
    include: { recorrido: true, alumno: { select: { legajo: true, apellido: true, nombres: true } } },
  });
}

export async function darDeBajaTransporte(prisma: PrismaClient, inscripcionId: number) {
  const inscripcion = await prisma.inscripcionTransporte.findUnique({ where: { id: inscripcionId } });
  if (!inscripcion) throw HttpError.notFound('La inscripción no existe.');
  if (inscripcion.estado === EstadoInscripcion.BAJA) {
    throw HttpError.conflict('La inscripción ya estaba dada de baja.');
  }

  return prisma.inscripcionTransporte.update({
    where: { id: inscripcionId },
    data: { estado: EstadoInscripcion.BAJA, fechaBaja: new Date() },
  });
}

// ==================================================================
// COMEDOR
// ==================================================================

export async function listarPlanesComedor(prisma: PrismaClient, anio?: number, mes?: number) {
  const planes = await prisma.comedor.findMany({
    where: { activo: true },
    include: {
      _count: {
        select: {
          inscripciones: {
            where: {
              estado: EstadoInscripcion.ACTIVA,
              ...(anio && mes ? { anio, mes } : {}),
            },
          },
        },
      },
    },
    orderBy: { diasPorSemana: 'desc' },
  });

  return planes.map((p) => ({
    ...p,
    arancelMensual: aNumero(p.arancelMensual),
    ocupados: p._count.inscripciones,
    lugaresDisponibles: Math.max(0, p.cupoMaximo - p._count.inscripciones),
  }));
}

export interface InscribirComedorInput {
  alumnoId: number;
  comedorId: number;
  anio: number;
  mes: number;
}

export async function inscribirEnComedor(prisma: PrismaClient, input: InscribirComedorInput) {
  validarPeriodo(input.anio, input.mes);

  const alumno = await prisma.alumno.findUnique({ where: { id: input.alumnoId } });
  if (!alumno) throw HttpError.notFound('El alumno no existe.');
  if (alumno.estado !== 'ACTIVO') {
    throw HttpError.conflict('El alumno no está activo: no puede contratar comedor.');
  }

  const plan = await prisma.comedor.findUnique({ where: { id: input.comedorId } });
  if (!plan) throw HttpError.notFound('El plan de comedor no existe.');
  if (!plan.activo) throw HttpError.conflict(`${plan.nombre} no está disponible.`);

  const ocupados = await prisma.inscripcionComedor.count({
    where: {
      comedorId: plan.id,
      anio: input.anio,
      mes: input.mes,
      estado: EstadoInscripcion.ACTIVA,
    },
  });
  if (ocupados >= plan.cupoMaximo) {
    throw HttpError.conflict(
      `${plan.nombre} no tiene cupo para ${input.mes}/${input.anio} (${ocupados}/${plan.cupoMaximo}).`,
    );
  }

  const existente = await prisma.inscripcionComedor.findUnique({
    where: { alumnoId_anio_mes: { alumnoId: input.alumnoId, anio: input.anio, mes: input.mes } },
    include: { comedor: { select: { nombre: true } } },
  });

  if (existente) {
    if (existente.estado === EstadoInscripcion.ACTIVA && existente.comedorId === plan.id) {
      throw HttpError.conflict(
        `El alumno ya tiene contratado ${existente.comedor.nombre} en ${input.mes}/${input.anio}.`,
      );
    }

    return prisma.inscripcionComedor.update({
      where: { id: existente.id },
      data: { comedorId: plan.id, estado: EstadoInscripcion.ACTIVA, fechaBaja: null },
      include: { comedor: true, alumno: { select: { legajo: true, apellido: true, nombres: true } } },
    });
  }

  return prisma.inscripcionComedor.create({
    data: {
      alumnoId: input.alumnoId,
      comedorId: plan.id,
      anio: input.anio,
      mes: input.mes,
    },
    include: { comedor: true, alumno: { select: { legajo: true, apellido: true, nombres: true } } },
  });
}

export async function darDeBajaComedor(prisma: PrismaClient, inscripcionId: number) {
  const inscripcion = await prisma.inscripcionComedor.findUnique({ where: { id: inscripcionId } });
  if (!inscripcion) throw HttpError.notFound('La inscripción no existe.');
  if (inscripcion.estado === EstadoInscripcion.BAJA) {
    throw HttpError.conflict('La inscripción ya estaba dada de baja.');
  }

  return prisma.inscripcionComedor.update({
    where: { id: inscripcionId },
    data: { estado: EstadoInscripcion.BAJA, fechaBaja: new Date() },
  });
}

// ==================================================================
// Vista consolidada por alumno
// ==================================================================

/** Todos los servicios contratados por un alumno en un período. */
export async function serviciosDeAlumno(
  prisma: PrismaClient,
  alumnoId: number,
  anio: number,
  mes: number,
) {
  const [transporte, comedor, deportes] = await Promise.all([
    prisma.inscripcionTransporte.findUnique({
      where: { alumnoId_anio_mes: { alumnoId, anio, mes } },
      include: { recorrido: true },
    }),
    prisma.inscripcionComedor.findUnique({
      where: { alumnoId_anio_mes: { alumnoId, anio, mes } },
      include: { comedor: true },
    }),
    prisma.inscripcionDeporte.findMany({
      where: { alumnoId, estado: EstadoInscripcion.ACTIVA },
      include: { deporte: { select: { id: true, nombre: true, arancelMensual: true } } },
      orderBy: { slot: 'asc' },
    }),
  ]);

  const costoDeportes = deportes.reduce((s, d) => s + aNumero(d.deporte.arancelMensual), 0);
  const costoTransporte =
    transporte && transporte.estado === EstadoInscripcion.ACTIVA
      ? aNumero(transporte.recorrido.arancelMensual)
      : 0;
  const costoComedor =
    comedor && comedor.estado === EstadoInscripcion.ACTIVA
      ? aNumero(comedor.comedor.arancelMensual)
      : 0;

  return {
    periodo: { anio, mes },
    transporte: transporte
      ? {
          ...transporte,
          recorrido: { ...transporte.recorrido, arancelMensual: aNumero(transporte.recorrido.arancelMensual) },
        }
      : null,
    comedor: comedor
      ? {
          ...comedor,
          comedor: { ...comedor.comedor, arancelMensual: aNumero(comedor.comedor.arancelMensual) },
        }
      : null,
    deportes: deportes.map((d) => ({
      ...d,
      deporte: { ...d.deporte, arancelMensual: aNumero(d.deporte.arancelMensual) },
    })),
    costoMensualEstimado: {
      transporte: costoTransporte,
      comedor: costoComedor,
      deportes: costoDeportes,
      total: costoTransporte + costoComedor + costoDeportes,
    },
  };
}
