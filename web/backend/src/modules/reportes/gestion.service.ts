/**
 * Reportes del sistema de gestión que pide la consigna y no estaban:
 *
 *   Parte 2 — Por alumno, por docente y listado de docentes por nivel.
 *   Parte 3 — Pagos de alumnos por deporte (nivel, horario, profesor) y por
 *             recorrido de transporte.
 *
 * Los de pagos parten de los mismos listados de alumnos por deporte y por
 * recorrido (`reportes.service.ts`) y les suman la factura del período: así el
 * filtro por nivel, día y profesor es exactamente el del reporte de alumnos.
 *
 * El importe de cada concepto se toma del ítem de la factura (`referenciaId`
 * apunta al deporte o al recorrido), no del arancel actual: si el arancel
 * cambió después, el reporte muestra lo que se facturó. Lo cobrado y lo
 * adeudado de ese ítem se prorratean sobre la factura, con el mismo criterio
 * que la deuda por ítem del portal de familias: un pago parcial no se imputa a
 * un concepto puntual.
 */

import {
  EstadoFactura,
  EstadoInscripcion,
  PuntoControl,
  ResultadoAcceso,
  TipoItemFactura,
  type PrismaClient,
} from '@prisma/client';

import { HttpError } from '../../utils/httpError';
import { aNumero, redondear } from '../shared/pagination';
import { minutosAHora } from '../deportes/horarios';
import {
  alumnosPorDeporte,
  alumnosPorRecorrido,
  type FiltrosAlumnosPorDeporte,
  type FiltrosAlumnosPorRecorrido,
} from './reportes.service';

const ORDEN_DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO'];
const porDiaYHora = (a: { diaSemana: string; horaInicio: number }, b: { diaSemana: string; horaInicio: number }) =>
  ORDEN_DIAS.indexOf(a.diaSemana) - ORDEN_DIAS.indexOf(b.diaSemana) || a.horaInicio - b.horaInicio;

const franja = (h: { diaSemana: string; horaInicio: number; horaFin: number }) => ({
  diaSemana: h.diaSemana,
  desde: minutosAHora(h.horaInicio),
  hasta: minutosAHora(h.horaFin),
});

export interface Periodo {
  anio: number;
  mes: number;
}

// ==================================================================
// Por alumno
// ==================================================================

/**
 * Curso, materias con su profesor y horarios, deportes con sus horarios, y uso
 * del transporte y del comedor: la inscripción del período y cuántas veces se
 * registró el acceso con el carnet en ese mes.
 */
export async function reportePorAlumno(prisma: PrismaClient, alumnoId: number, periodo: Periodo) {
  const alumno = await prisma.alumno.findUnique({
    where: { id: alumnoId },
    include: {
      curso: {
        include: {
          nivel: { select: { id: true, nombre: true } },
          materias: {
            where: { activo: true },
            orderBy: { nombre: 'asc' },
            include: {
              profesor: { select: { id: true, apellido: true, nombres: true } },
              horarios: true,
            },
          },
        },
      },
      inscripcionesDeporte: {
        where: { estado: EstadoInscripcion.ACTIVA },
        orderBy: { slot: 'asc' },
        include: {
          deporte: {
            include: {
              profesorResponsable: { select: { apellido: true, nombres: true } },
              horarios: { where: { activo: true } },
            },
          },
        },
      },
      inscripcionesTransporte: {
        where: { anio: periodo.anio, mes: periodo.mes },
        include: { recorrido: true },
      },
      inscripcionesComedor: {
        where: { anio: periodo.anio, mes: periodo.mes },
        include: { comedor: true },
      },
    },
  });
  if (!alumno) throw HttpError.notFound('No se encontró el alumno.');

  const desde = new Date(Date.UTC(periodo.anio, periodo.mes - 1, 1));
  const hasta = new Date(Date.UTC(periodo.anio, periodo.mes, 1));
  const usos = (punto: PuntoControl) =>
    prisma.registroAcceso.count({
      where: { alumnoId, punto, resultado: ResultadoAcceso.PERMITIDO, createdAt: { gte: desde, lt: hasta } },
    });
  const [viajes, almuerzos] = await Promise.all([usos(PuntoControl.TRANSPORTE), usos(PuntoControl.COMEDOR)]);

  const transporte = alumno.inscripcionesTransporte[0] ?? null;
  const comedor = alumno.inscripcionesComedor[0] ?? null;

  return {
    periodo,
    alumno: {
      id: alumno.id,
      legajo: alumno.legajo,
      apellido: alumno.apellido,
      nombres: alumno.nombres,
      dni: alumno.dni,
      estado: alumno.estado,
    },
    curso: {
      id: alumno.curso.id,
      nombre: `${alumno.curso.nombre} "${alumno.curso.division}"`,
      turno: alumno.curso.turno,
      nivel: alumno.curso.nivel.nombre,
    },
    materias: alumno.curso.materias.map((m) => ({
      id: m.id,
      nombre: m.nombre,
      profesor: m.profesor ? `${m.profesor.apellido}, ${m.profesor.nombres}` : null,
      horarios: [...m.horarios].sort(porDiaYHora).map(franja),
    })),
    deportes: alumno.inscripcionesDeporte.map((i) => ({
      id: i.deporte.id,
      nombre: i.deporte.nombre,
      profesor: `${i.deporte.profesorResponsable.apellido}, ${i.deporte.profesorResponsable.nombres}`,
      horarios: i.deporte.horarios
        .filter((h) => h.nivelId === alumno.curso.nivel.id)
        .sort(porDiaYHora)
        .map((h) => ({ ...franja(h), lugar: h.lugar })),
    })),
    transporte: {
      inscripto: transporte !== null && transporte.estado === EstadoInscripcion.ACTIVA,
      recorrido: transporte ? `${transporte.recorrido.codigo} — ${transporte.recorrido.nombre}` : null,
      turno: transporte?.turno ?? null,
      viajesRegistrados: viajes,
    },
    comedor: {
      inscripto: comedor !== null && comedor.estado === EstadoInscripcion.ACTIVA,
      plan: comedor?.comedor.nombre ?? null,
      almuerzosRegistrados: almuerzos,
    },
  };
}

// ==================================================================
// Por docente
// ==================================================================

/** Cursos a cargo agrupados por nivel, con las materias y sus horarios. */
export async function reportePorDocente(prisma: PrismaClient, profesorId: number) {
  const profesor = await prisma.profesor.findUnique({
    where: { id: profesorId },
    include: {
      materias: {
        where: { activo: true },
        include: {
          curso: { include: { nivel: { select: { id: true, nombre: true, orden: true } } } },
          horarios: true,
        },
        orderBy: { nombre: 'asc' },
      },
      deportesACargo: {
        where: { activo: true },
        include: { horarios: { where: { activo: true }, include: { nivel: { select: { nombre: true } } } } },
        orderBy: { nombre: 'asc' },
      },
    },
  });
  if (!profesor) throw HttpError.notFound('No se encontró el profesor.');

  const porNivel = new Map<
    number,
    { nivel: string; orden: number; cursos: Map<number, { curso: string; turno: string; materias: unknown[] }> }
  >();
  for (const m of profesor.materias) {
    const n = m.curso.nivel;
    const nivel = porNivel.get(n.id) ?? { nivel: n.nombre, orden: n.orden, cursos: new Map() };
    const curso = nivel.cursos.get(m.curso.id) ?? {
      curso: `${m.curso.nombre} "${m.curso.division}"`,
      turno: m.curso.turno,
      materias: [],
    };
    curso.materias.push({
      id: m.id,
      nombre: m.nombre,
      cargaHoraria: m.cargaHoraria,
      horarios: [...m.horarios].sort(porDiaYHora).map((h) => ({ ...franja(h), aula: h.aula })),
    });
    nivel.cursos.set(m.curso.id, curso);
    porNivel.set(n.id, nivel);
  }

  const niveles = [...porNivel.values()]
    .sort((a, b) => a.orden - b.orden)
    .map((n) => ({ nivel: n.nivel, cursos: [...n.cursos.values()] }));

  return {
    profesor: {
      id: profesor.id,
      legajo: profesor.legajo,
      apellido: profesor.apellido,
      nombres: profesor.nombres,
      especialidad: profesor.especialidad,
    },
    totales: {
      niveles: niveles.length,
      cursos: niveles.reduce((s, n) => s + n.cursos.length, 0),
      materias: profesor.materias.length,
      horasSemanales: profesor.materias.reduce((s, m) => s + m.cargaHoraria, 0),
    },
    niveles,
    deportes: profesor.deportesACargo.map((d) => ({
      id: d.id,
      nombre: d.nombre,
      horarios: [...d.horarios].sort(porDiaYHora).map((h) => ({ ...franja(h), nivel: h.nivel.nombre, lugar: h.lugar })),
    })),
  };
}

// ==================================================================
// Docentes por nivel
// ==================================================================

/** Nivel, profesor, materias a cargo y cursos. Un profesor de dos niveles figura en los dos. */
export async function docentesPorNivel(prisma: PrismaClient, filtros: { nivelId?: number } = {}) {
  const materias = await prisma.materia.findMany({
    where: {
      activo: true,
      profesorId: { not: null },
      ...(filtros.nivelId ? { curso: { nivelId: filtros.nivelId } } : {}),
    },
    include: {
      profesor: { select: { id: true, legajo: true, apellido: true, nombres: true, especialidad: true } },
      curso: { include: { nivel: { select: { id: true, nombre: true, orden: true } } } },
    },
  });

  const filas = new Map<
    string,
    {
      nivel: string;
      orden: number;
      profesor: { id: number; legajo: string; apellido: string; nombres: string; especialidad: string | null };
      materias: Set<string>;
      cursos: Set<string>;
    }
  >();
  for (const m of materias) {
    const clave = `${m.curso.nivel.id}|${m.profesor!.id}`;
    const fila = filas.get(clave) ?? {
      nivel: m.curso.nivel.nombre,
      orden: m.curso.nivel.orden,
      profesor: m.profesor!,
      materias: new Set<string>(),
      cursos: new Set<string>(),
    };
    fila.materias.add(m.nombre);
    fila.cursos.add(`${m.curso.nombre} "${m.curso.division}"`);
    filas.set(clave, fila);
  }

  const resultado = [...filas.values()]
    .sort((a, b) => a.orden - b.orden || a.profesor.apellido.localeCompare(b.profesor.apellido, 'es'))
    .map((f) => ({
      nivel: f.nivel,
      profesor: f.profesor,
      materias: [...f.materias].sort((a, b) => a.localeCompare(b, 'es')),
      cursos: [...f.cursos].sort((a, b) => a.localeCompare(b, 'es')),
    }));

  return {
    filtros,
    totales: {
      filas: resultado.length,
      docentesDistintos: new Set(resultado.map((f) => f.profesor.id)).size,
    },
    filas: resultado,
  };
}

// ==================================================================
// Pagos por deporte y por recorrido
// ==================================================================

export type EstadoDePago = EstadoFactura | 'SIN_FACTURA';

interface PagoDeConcepto {
  factura: { id: number; numero: string; estado: EstadoFactura } | null;
  estadoPago: EstadoDePago;
  pagado: boolean;
  facturado: number;
  cobrado: number;
  adeudado: number;
}

/**
 * Para cada alumno, el ítem del concepto en su factura del período. Las
 * anuladas no cuentan: no son deuda ni pago.
 */
async function pagosDelConcepto(
  prisma: PrismaClient,
  alumnoIds: number[],
  periodo: Periodo,
  tipo: TipoItemFactura,
): Promise<Map<string, PagoDeConcepto>> {
  const facturas = await prisma.factura.findMany({
    where: {
      alumnoId: { in: alumnoIds },
      anio: periodo.anio,
      mes: periodo.mes,
      estado: { not: EstadoFactura.ANULADA },
    },
    include: { items: { where: { tipo } } },
  });

  const resultado = new Map<string, PagoDeConcepto>();
  for (const f of facturas) {
    const total = aNumero(f.total);
    const pagado = aNumero(f.montoPagado);
    for (const item of f.items) {
      const facturado = aNumero(item.subtotal);
      const proporcion = total > 0 ? facturado / total : 0;
      resultado.set(`${f.alumnoId}|${item.referenciaId}`, {
        factura: { id: f.id, numero: f.numero, estado: f.estado },
        estadoPago: f.estado,
        pagado: f.estado === EstadoFactura.PAGADA,
        facturado,
        cobrado: redondear(Math.min(pagado, total) * proporcion),
        adeudado: redondear(Math.max(total - pagado, 0) * proporcion),
      });
    }
  }
  return resultado;
}

const SIN_FACTURA: PagoDeConcepto = {
  factura: null,
  estadoPago: 'SIN_FACTURA',
  pagado: false,
  facturado: 0,
  cobrado: 0,
  adeudado: 0,
};

function totalesDePago(filas: { pago: PagoDeConcepto }[]) {
  return {
    filas: filas.length,
    pagados: filas.filter((f) => f.pago.pagado).length,
    conDeuda: filas.filter((f) => !f.pago.pagado && f.pago.factura !== null).length,
    sinFactura: filas.filter((f) => f.pago.factura === null).length,
    facturado: redondear(filas.reduce((s, f) => s + f.pago.facturado, 0)),
    cobrado: redondear(filas.reduce((s, f) => s + f.pago.cobrado, 0)),
    adeudado: redondear(filas.reduce((s, f) => s + f.pago.adeudado, 0)),
  };
}

export async function pagosPorDeporte(prisma: PrismaClient, filtros: FiltrosAlumnosPorDeporte & Periodo) {
  const { anio, mes, ...filtrosAlumnos } = filtros;
  const base = await alumnosPorDeporte(prisma, filtrosAlumnos);
  const pagos = await pagosDelConcepto(prisma, base.filas.map((f) => f.alumno.id), { anio, mes }, TipoItemFactura.DEPORTE);

  const filas = base.filas.map((f) => ({
    ...f,
    pago: pagos.get(`${f.alumno.id}|${f.deporte.id}`) ?? SIN_FACTURA,
  }));

  return { filtros, periodo: { anio, mes }, totales: totalesDePago(filas), filas };
}

export async function pagosPorRecorrido(prisma: PrismaClient, filtros: FiltrosAlumnosPorRecorrido) {
  const base = await alumnosPorRecorrido(prisma, filtros);
  const pagos = await pagosDelConcepto(
    prisma,
    base.filas.map((f) => f.alumno.id),
    { anio: filtros.anio, mes: filtros.mes },
    TipoItemFactura.TRANSPORTE,
  );

  const filas = base.filas.map((f) => ({
    ...f,
    pago: pagos.get(`${f.alumno.id}|${f.recorrido.id}`) ?? SIN_FACTURA,
  }));

  const porRecorrido = new Map<string, { recorrido: string; alumnos: number; pagados: number; adeudado: number }>();
  for (const f of filas) {
    const clave = `${f.recorrido.codigo} — ${f.recorrido.nombre}`;
    const r = porRecorrido.get(clave) ?? { recorrido: clave, alumnos: 0, pagados: 0, adeudado: 0 };
    r.alumnos += 1;
    if (f.pago.pagado) r.pagados += 1;
    r.adeudado = redondear(r.adeudado + f.pago.adeudado);
    porRecorrido.set(clave, r);
  }

  return {
    filtros,
    periodo: { anio: filtros.anio, mes: filtros.mes },
    totales: totalesDePago(filas),
    resumenPorRecorrido: [...porRecorrido.values()],
    filas,
  };
}
