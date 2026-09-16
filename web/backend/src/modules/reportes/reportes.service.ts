/**
 * Reportes administrativos.
 *
 * Todos son de sólo lectura y exclusivos de ADMIN. Devuelven siempre la misma
 * forma: `{ filtros, totales, filas }`, para que el backoffice pueda renderizar
 * cualquiera con el mismo componente de tabla y exportarlos igual.
 *
 * Los importes salen como `number`, nunca como `Decimal` de Prisma (que
 * serializa a un objeto inservible del lado del cliente).
 */

import {
  EstadoFactura,
  EstadoInscripcion,
  type CodigoRecorrido,
  type DiaSemana,
  type PrismaClient,
  type Prisma,
} from '@prisma/client';

import { aNumero, redondear, type RangoFechas } from '../shared/pagination';
import { minutosAHora } from '../deportes/horarios';

// ==================================================================
// 1. Alumnos por deporte / nivel / horario / docente
// ==================================================================

export interface FiltrosAlumnosPorDeporte {
  deporteId?: number;
  nivelId?: number;
  diaSemana?: DiaSemana;
  /** Profesor responsable del deporte o a cargo de alguno de sus horarios. */
  profesorId?: number;
  incluirBajas?: boolean;
}

/**
 * Listado de alumnos inscriptos en actividades deportivas, con todos los cortes
 * que pide la consigna combinables entre sí.
 *
 * El filtro por día y por docente se aplica sobre los horarios: un alumno
 * aparece si el deporte que cursa tiene al menos un grupo que cumple el filtro
 * **en el nivel del alumno**. Sin esa acotación, un alumno de Primario saldría
 * listado por un horario de Secundario del mismo deporte.
 */
export async function alumnosPorDeporte(
  prisma: PrismaClient,
  filtros: FiltrosAlumnosPorDeporte,
) {
  const where: Prisma.InscripcionDeporteWhereInput = {
    ...(filtros.incluirBajas ? {} : { estado: EstadoInscripcion.ACTIVA }),
    ...(filtros.deporteId ? { deporteId: filtros.deporteId } : {}),
    ...(filtros.nivelId ? { alumno: { curso: { nivelId: filtros.nivelId } } } : {}),
    ...(filtros.profesorId
      ? {
          deporte: {
            OR: [
              { profesorResponsableId: filtros.profesorId },
              { horarios: { some: { profesorId: filtros.profesorId } } },
            ],
          },
        }
      : {}),
  };

  const inscripciones = await prisma.inscripcionDeporte.findMany({
    where,
    include: {
      alumno: {
        include: {
          curso: { include: { nivel: { select: { id: true, nombre: true } } } },
          tutores: {
            where: { esResponsableFacturacion: true },
            include: { tutor: { select: { nombre: true, email: true } } },
          },
        },
      },
      deporte: {
        include: {
          profesorResponsable: { select: { id: true, apellido: true, nombres: true } },
          horarios: { where: { activo: true } },
        },
      },
    },
    orderBy: [{ deporte: { nombre: 'asc' } }, { alumno: { apellido: 'asc' } }],
  });

  const filas = inscripciones
    .map((i) => {
      // Horarios del deporte que aplican al nivel del alumno.
      const horarios = i.deporte.horarios.filter((h) => h.nivelId === i.alumno.curso.nivelId);
      const filtrados = filtros.diaSemana
        ? horarios.filter((h) => h.diaSemana === filtros.diaSemana)
        : horarios;

      return {
        inscripcionId: i.id,
        estado: i.estado,
        fechaAlta: i.fechaAlta,
        alumno: {
          id: i.alumno.id,
          legajo: i.alumno.legajo,
          apellido: i.alumno.apellido,
          nombres: i.alumno.nombres,
          dni: i.alumno.dni,
          telefono: i.alumno.telefono,
          curso: `${i.alumno.curso.nombre} "${i.alumno.curso.division}"`,
          nivel: i.alumno.curso.nivel.nombre,
          nivelId: i.alumno.curso.nivel.id,
        },
        tutorResponsable: i.alumno.tutores[0]?.tutor ?? null,
        deporte: {
          id: i.deporte.id,
          nombre: i.deporte.nombre,
          arancelMensual: aNumero(i.deporte.arancelMensual),
          profesorResponsable: i.deporte.profesorResponsable,
        },
        horarios: filtrados.map((h) => ({
          diaSemana: h.diaSemana,
          desde: minutosAHora(h.horaInicio),
          hasta: minutosAHora(h.horaFin),
          lugar: h.lugar,
        })),
        _coincideDia: filtrados.length > 0,
      };
    })
    // Si se filtró por día, quedan sólo los que efectivamente cursan ese día.
    .filter((f) => (filtros.diaSemana ? f._coincideDia : true))
    .map(({ _coincideDia, ...fila }) => fila);

  // Agregados por deporte, útiles para el encabezado del reporte.
  const porDeporte = new Map<string, { deporte: string; alumnos: number; recaudacionMensual: number }>();
  for (const f of filas) {
    const actual = porDeporte.get(f.deporte.nombre) ?? {
      deporte: f.deporte.nombre,
      alumnos: 0,
      recaudacionMensual: 0,
    };
    actual.alumnos += 1;
    actual.recaudacionMensual += f.deporte.arancelMensual;
    porDeporte.set(f.deporte.nombre, actual);
  }

  return {
    filtros,
    totales: {
      inscripciones: filas.length,
      alumnosDistintos: new Set(filas.map((f) => f.alumno.id)).size,
      recaudacionMensual: redondear(filas.reduce((s, f) => s + f.deporte.arancelMensual, 0)),
    },
    resumenPorDeporte: [...porDeporte.values()].sort((a, b) => b.alumnos - a.alumnos),
    filas,
  };
}

// ==================================================================
// 2. Alumnos por recorrido de transporte
// ==================================================================

export interface FiltrosAlumnosPorRecorrido {
  recorridoId?: number;
  codigo?: CodigoRecorrido;
  anio: number;
  mes: number;
  incluirBajas?: boolean;
}

export async function alumnosPorRecorrido(
  prisma: PrismaClient,
  filtros: FiltrosAlumnosPorRecorrido,
) {
  const inscripciones = await prisma.inscripcionTransporte.findMany({
    where: {
      anio: filtros.anio,
      mes: filtros.mes,
      ...(filtros.incluirBajas ? {} : { estado: EstadoInscripcion.ACTIVA }),
      ...(filtros.recorridoId ? { recorridoId: filtros.recorridoId } : {}),
      ...(filtros.codigo ? { recorrido: { codigo: filtros.codigo } } : {}),
    },
    include: {
      alumno: {
        include: {
          curso: { include: { nivel: { select: { nombre: true } } } },
          tutores: { include: { tutor: { select: { nombre: true, email: true } } } },
        },
      },
      recorrido: true,
    },
    orderBy: [{ recorrido: { codigo: 'asc' } }, { alumno: { apellido: 'asc' } }],
  });

  const filas = inscripciones.map((i) => ({
    inscripcionId: i.id,
    estado: i.estado,
    turno: i.turno,
    recorrido: {
      id: i.recorrido.id,
      codigo: i.recorrido.codigo,
      nombre: i.recorrido.nombre,
      zonas: i.recorrido.zonas,
      arancelMensual: aNumero(i.recorrido.arancelMensual),
      horaSalida: minutosAHora(i.recorrido.horaSalida),
      horaRegreso: minutosAHora(i.recorrido.horaRegreso),
      chofer: i.recorrido.choferNombre,
      patente: i.recorrido.patente,
    },
    alumno: {
      id: i.alumno.id,
      legajo: i.alumno.legajo,
      apellido: i.alumno.apellido,
      nombres: i.alumno.nombres,
      curso: `${i.alumno.curso.nombre} "${i.alumno.curso.division}"`,
      nivel: i.alumno.curso.nivel.nombre,
      domicilio: i.alumno.domicilio,
      localidad: i.alumno.localidad,
      telefono: i.alumno.telefono,
    },
    tutores: i.alumno.tutores.map((t) => t.tutor),
  }));

  // Ocupación de los 4 recorridos, incluidos los que no tienen pasajeros.
  const recorridos = await prisma.recorridoTransporte.findMany({ orderBy: { codigo: 'asc' } });

  const ocupacion = recorridos.map((r) => {
    const delRecorrido = filas.filter((f) => f.recorrido.id === r.id);
    return {
      codigo: r.codigo,
      nombre: r.nombre,
      capacidad: r.capacidad,
      ocupados: delRecorrido.length,
      lugaresDisponibles: Math.max(0, r.capacidad - delRecorrido.length),
      porcentajeOcupacion: r.capacidad === 0 ? 0 : Math.round((delRecorrido.length / r.capacidad) * 1000) / 10,
      recaudacionMensual: redondear(delRecorrido.length * aNumero(r.arancelMensual)),
    };
  });

  return {
    filtros,
    totales: {
      pasajeros: filas.length,
      recaudacionMensual: redondear(filas.reduce((s, f) => s + f.recorrido.arancelMensual, 0)),
    },
    ocupacionPorRecorrido: ocupacion,
    filas,
  };
}

// ==================================================================
// 3. Reportes financieros
// ==================================================================

/** Estados que cuentan como deuda viva. */
const ESTADOS_IMPAGOS: EstadoFactura[] = [
  EstadoFactura.PENDIENTE,
  EstadoFactura.EN_REVISION,
  EstadoFactura.PARCIAL,
  EstadoFactura.VENCIDA,
];

export interface FiltrosPagos {
  anio?: number;
  mes?: number;
  nivelId?: number;
  cursoId?: number;
  alumnoId?: number;
}

/**
 * Pagos completos vs. incompletos.
 *
 * "Completo" = factura `PAGADA` (los comprobantes aprobados cubren el total).
 * "Incompleto" = cualquier otro estado con saldo, incluyendo el pago parcial y
 * el que está esperando que Administración valide el comprobante.
 */
export async function reportePagos(prisma: PrismaClient, filtros: FiltrosPagos) {
  const where: Prisma.FacturaWhereInput = {
    estado: { not: EstadoFactura.ANULADA },
    ...(filtros.anio ? { anio: filtros.anio } : {}),
    ...(filtros.mes ? { mes: filtros.mes } : {}),
    ...(filtros.alumnoId ? { alumnoId: filtros.alumnoId } : {}),
    ...(filtros.cursoId ? { alumno: { cursoId: filtros.cursoId } } : {}),
    ...(filtros.nivelId ? { alumno: { curso: { nivelId: filtros.nivelId } } } : {}),
  };

  const facturas = await prisma.factura.findMany({
    where,
    include: {
      alumno: {
        include: { curso: { include: { nivel: { select: { nombre: true } } } } },
      },
      tutor: { select: { id: true, nombre: true, email: true } },
      comprobantes: { select: { id: true, estado: true, monto: true } },
    },
    orderBy: [{ anio: 'desc' }, { mes: 'desc' }, { alumno: { apellido: 'asc' } }],
  });

  const filas = facturas.map((f) => {
    const total = aNumero(f.total);
    const pagado = aNumero(f.montoPagado);

    return {
      facturaId: f.id,
      numero: f.numero,
      periodo: `${String(f.mes).padStart(2, '0')}/${f.anio}`,
      anio: f.anio,
      mes: f.mes,
      fechaEmision: f.fechaEmision,
      fechaVencimiento: f.fechaVencimiento,
      estado: f.estado,
      total,
      pagado,
      saldo: redondear(total - pagado),
      completo: f.estado === EstadoFactura.PAGADA,
      comprobantes: {
        total: f.comprobantes.length,
        aprobados: f.comprobantes.filter((c) => c.estado === 'APROBADO').length,
        pendientes: f.comprobantes.filter((c) => c.estado === 'PENDIENTE').length,
        rechazados: f.comprobantes.filter((c) => c.estado === 'RECHAZADO').length,
      },
      alumno: {
        id: f.alumno.id,
        legajo: f.alumno.legajo,
        apellido: f.alumno.apellido,
        nombres: f.alumno.nombres,
        curso: `${f.alumno.curso.nombre} "${f.alumno.curso.division}"`,
        nivel: f.alumno.curso.nivel.nombre,
      },
      tutor: f.tutor,
    };
  });

  const completos = filas.filter((f) => f.completo);
  const incompletos = filas.filter((f) => !f.completo);

  return {
    filtros,
    totales: {
      facturas: filas.length,
      montoFacturado: redondear(filas.reduce((s, f) => s + f.total, 0)),
      montoCobrado: redondear(filas.reduce((s, f) => s + f.pagado, 0)),
      saldoPendiente: redondear(filas.reduce((s, f) => s + f.saldo, 0)),
      pagosCompletos: completos.length,
      pagosIncompletos: incompletos.length,
      tasaCobranza:
        filas.length === 0 ? null : Math.round((completos.length / filas.length) * 1000) / 10,
    },
    desglosePorEstado: Object.values(EstadoFactura)
      .filter((e) => e !== EstadoFactura.ANULADA)
      .map((estado) => {
        const delEstado = filas.filter((f) => f.estado === estado);
        return {
          estado,
          cantidad: delEstado.length,
          monto: redondear(delEstado.reduce((s, f) => s + f.total, 0)),
          saldo: redondear(delEstado.reduce((s, f) => s + f.saldo, 0)),
        };
      })
      .filter((d) => d.cantidad > 0),
    completos,
    incompletos,
  };
}

/**
 * Ingresos por rango de fechas, discriminados por año y por alumno.
 *
 * El ingreso se cuenta por **fecha de la transferencia** del comprobante
 * aprobado, no por la fecha de emisión de la factura: una transferencia de
 * septiembre que salda la cuota de julio es un ingreso de septiembre. Es el
 * criterio de caja, que es el que le sirve a Administración.
 */
export async function reporteIngresos(
  prisma: PrismaClient,
  rango: RangoFechas & { alumnoId?: number; nivelId?: number },
) {
  const desde = rango.desde ? new Date(`${rango.desde}T00:00:00.000Z`) : undefined;
  const hasta = rango.hasta ? new Date(`${rango.hasta}T23:59:59.999Z`) : undefined;

  const comprobantes = await prisma.comprobantePago.findMany({
    where: {
      estado: 'APROBADO',
      ...(desde || hasta
        ? { fechaTransferencia: { ...(desde ? { gte: desde } : {}), ...(hasta ? { lte: hasta } : {}) } }
        : {}),
      factura: {
        estado: { not: EstadoFactura.ANULADA },
        ...(rango.alumnoId ? { alumnoId: rango.alumnoId } : {}),
        ...(rango.nivelId ? { alumno: { curso: { nivelId: rango.nivelId } } } : {}),
      },
    },
    include: {
      factura: {
        include: {
          alumno: {
            include: { curso: { include: { nivel: { select: { id: true, nombre: true } } } } },
          },
          items: true,
        },
      },
    },
    orderBy: { fechaTransferencia: 'asc' },
  });

  // --- Discriminado por año ---
  const porAnio = new Map<number, { anio: number; cobrado: number; transferencias: number }>();

  // --- Discriminado por alumno ---
  const porAlumno = new Map<
    number,
    {
      alumnoId: number;
      legajo: string;
      apellido: string;
      nombres: string;
      curso: string;
      nivel: string;
      cobrado: number;
      transferencias: number;
    }
  >();

  // --- Discriminado por concepto (cuota, transporte, comedor, deporte) ---
  const porConcepto = new Map<string, number>();

  // --- Serie mensual, para graficar ---
  const porMes = new Map<string, { periodo: string; cobrado: number }>();

  for (const c of comprobantes) {
    const monto = aNumero(c.monto);
    const anio = c.fechaTransferencia.getUTCFullYear();
    const mes = c.fechaTransferencia.getUTCMonth() + 1;
    const a = c.factura.alumno;

    const anioActual = porAnio.get(anio) ?? { anio, cobrado: 0, transferencias: 0 };
    anioActual.cobrado += monto;
    anioActual.transferencias += 1;
    porAnio.set(anio, anioActual);

    const alumnoActual = porAlumno.get(a.id) ?? {
      alumnoId: a.id,
      legajo: a.legajo,
      apellido: a.apellido,
      nombres: a.nombres,
      curso: `${a.curso.nombre} "${a.curso.division}"`,
      nivel: a.curso.nivel.nombre,
      cobrado: 0,
      transferencias: 0,
    };
    alumnoActual.cobrado += monto;
    alumnoActual.transferencias += 1;
    porAlumno.set(a.id, alumnoActual);

    const clavePeriodo = `${anio}-${String(mes).padStart(2, '0')}`;
    const mesActual = porMes.get(clavePeriodo) ?? { periodo: clavePeriodo, cobrado: 0 };
    mesActual.cobrado += monto;
    porMes.set(clavePeriodo, mesActual);

    // El pago se imputa a los ítems de la factura en proporción a su peso: un
    // comprobante salda la factura entera, no un concepto puntual.
    const totalFactura = aNumero(c.factura.total);
    if (totalFactura > 0) {
      for (const item of c.factura.items) {
        const proporcion = aNumero(item.subtotal) / totalFactura;
        porConcepto.set(item.tipo, (porConcepto.get(item.tipo) ?? 0) + monto * proporcion);
      }
    }
  }

  const totalCobrado = redondear(comprobantes.reduce((s, c) => s + aNumero(c.monto), 0));

  return {
    filtros: { desde: rango.desde ?? null, hasta: rango.hasta ?? null, alumnoId: rango.alumnoId ?? null },
    criterio:
      'Se computa por fecha de transferencia de los comprobantes APROBADOS (criterio de caja).',
    totales: {
      cobrado: totalCobrado,
      transferencias: comprobantes.length,
      alumnosQuePagaron: porAlumno.size,
      ticketPromedio:
        comprobantes.length === 0 ? 0 : redondear(totalCobrado / comprobantes.length),
    },
    porAnio: [...porAnio.values()]
      .map((v) => ({ ...v, cobrado: redondear(v.cobrado) }))
      .sort((a, b) => a.anio - b.anio),
    porMes: [...porMes.values()]
      .map((v) => ({ ...v, cobrado: redondear(v.cobrado) }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo)),
    porAlumno: [...porAlumno.values()]
      .map((v) => ({ ...v, cobrado: redondear(v.cobrado) }))
      .sort((a, b) => b.cobrado - a.cobrado),
    porConcepto: [...porConcepto.entries()]
      .map(([tipo, monto]) => ({ tipo, cobrado: redondear(monto) }))
      .sort((a, b) => b.cobrado - a.cobrado),
  };
}

/** Deuda viva por alumno, ordenada de mayor a menor. */
export async function reporteMorosidad(prisma: PrismaClient, filtros: { nivelId?: number; anio?: number }) {
  const facturas = await prisma.factura.findMany({
    where: {
      estado: { in: ESTADOS_IMPAGOS },
      ...(filtros.anio ? { anio: filtros.anio } : {}),
      ...(filtros.nivelId ? { alumno: { curso: { nivelId: filtros.nivelId } } } : {}),
    },
    include: {
      alumno: {
        include: {
          curso: { include: { nivel: { select: { nombre: true } } } },
          tutores: {
            where: { esResponsableFacturacion: true },
            include: { tutor: { select: { id: true, nombre: true, email: true } } },
          },
        },
      },
    },
  });

  const porAlumno = new Map<number, {
    alumnoId: number;
    legajo: string;
    apellido: string;
    nombres: string;
    curso: string;
    nivel: string;
    tutor: { id: number; nombre: string; email: string } | null;
    facturasImpagas: number;
    mesesAdeudados: string[];
    deuda: number;
  }>();

  for (const f of facturas) {
    const a = f.alumno;
    const saldo = aNumero(f.total) - aNumero(f.montoPagado);
    if (saldo <= 0) continue;

    const actual = porAlumno.get(a.id) ?? {
      alumnoId: a.id,
      legajo: a.legajo,
      apellido: a.apellido,
      nombres: a.nombres,
      curso: `${a.curso.nombre} "${a.curso.division}"`,
      nivel: a.curso.nivel.nombre,
      tutor: a.tutores[0]?.tutor ?? null,
      facturasImpagas: 0,
      mesesAdeudados: [] as string[],
      deuda: 0,
    };

    actual.facturasImpagas += 1;
    actual.mesesAdeudados.push(`${String(f.mes).padStart(2, '0')}/${f.anio}`);
    actual.deuda += saldo;
    porAlumno.set(a.id, actual);
  }

  const filas = [...porAlumno.values()]
    .map((v) => ({ ...v, deuda: redondear(v.deuda), mesesAdeudados: v.mesesAdeudados.sort() }))
    .sort((a, b) => b.deuda - a.deuda);

  return {
    filtros,
    totales: {
      alumnosConDeuda: filas.length,
      deudaTotal: redondear(filas.reduce((s, f) => s + f.deuda, 0)),
      facturasImpagas: filas.reduce((s, f) => s + f.facturasImpagas, 0),
    },
    filas,
  };
}

// ==================================================================
// RF-06 — Listado de alumnos por materia
// ==================================================================

export interface FiltrosAlumnosPorMateria {
  materiaId?: number;
  cursoId?: number;
  nivelId?: number;
  profesorId?: number;
}

/**
 * RF-06: listado consolidado de alumnos por materia.
 *
 * La Dirección lo arma hoy cruzando planillas a mano. Debe mostrar, según el
 * requerimiento: **nivel educativo, curso, materia, profesor a cargo, nombre
 * del alumno y legajo**.
 *
 * Criterio de aceptación de HU6: *«Si no hay inscriptos, informa 0 inscriptos»*.
 * Por eso se parte de las materias y no de los alumnos: una consulta que
 * arrancara por alumnos haría desaparecer las materias sin inscriptos, que son
 * justamente las que la Dirección necesita detectar.
 */
export async function alumnosPorMateria(
  prisma: PrismaClient,
  filtros: FiltrosAlumnosPorMateria,
) {
  const materias = await prisma.materia.findMany({
    where: {
      activo: true,
      ...(filtros.materiaId ? { id: filtros.materiaId } : {}),
      ...(filtros.cursoId ? { cursoId: filtros.cursoId } : {}),
      ...(filtros.profesorId ? { profesorId: filtros.profesorId } : {}),
      ...(filtros.nivelId ? { curso: { nivelId: filtros.nivelId } } : {}),
    },
    include: {
      profesor: { select: { id: true, apellido: true, nombres: true, especialidad: true } },
      curso: {
        include: {
          nivel: { select: { id: true, nombre: true } },
          alumnos: {
            where: { estado: 'ACTIVO' },
            select: { id: true, legajo: true, apellido: true, nombres: true, dni: true },
            orderBy: [{ apellido: 'asc' }, { nombres: 'asc' }],
          },
        },
      },
    },
    orderBy: [{ curso: { nombre: 'asc' } }, { nombre: 'asc' }],
  });

  // Una fila por par (materia, alumno): es el formato que la Dirección exporta.
  const filas = materias.flatMap((m) =>
    m.curso.alumnos.map((a) => ({
      nivel: m.curso.nivel.nombre,
      curso: `${m.curso.nombre} "${m.curso.division}"`,
      materia: m.nombre,
      profesor: m.profesor
        ? `${m.profesor.apellido}, ${m.profesor.nombres}`
        : 'Sin docente asignado',
      alumno: `${a.apellido}, ${a.nombres}`,
      legajo: a.legajo,
      dni: a.dni,
      materiaId: m.id,
      alumnoId: a.id,
    })),
  );

  const porMateria = materias.map((m) => ({
    materiaId: m.id,
    nivel: m.curso.nivel.nombre,
    curso: `${m.curso.nombre} "${m.curso.division}"`,
    materia: m.nombre,
    profesor: m.profesor ? `${m.profesor.apellido}, ${m.profesor.nombres}` : 'Sin docente asignado',
    inscriptos: m.curso.alumnos.length,
    // El criterio de aceptación pide este texto literal.
    leyenda: m.curso.alumnos.length === 0 ? '0 inscriptos' : `${m.curso.alumnos.length} inscriptos`,
  }));

  return {
    filtros,
    totales: {
      materias: materias.length,
      filas: filas.length,
      alumnosDistintos: new Set(filas.map((f) => f.alumnoId)).size,
      materiasSinInscriptos: porMateria.filter((m) => m.inscriptos === 0).length,
      materiasSinDocente: porMateria.filter((m) => m.profesor === 'Sin docente asignado').length,
    },
    resumenPorMateria: porMateria,
    filas,
  };
}
