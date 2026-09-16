/**
 * Generación automática de cuotas mensuales.
 *
 * Arma una factura por alumno activo, discriminando en ítems separados:
 *   - cuota base del nivel educativo
 *   - comedor, si tiene plan contratado ese mes
 *   - transporte, según el recorrido contratado ese mes
 *   - un ítem por cada deporte que curse
 *
 * Es **idempotente**: `@@unique([alumnoId, anio, mes])` impide duplicar la
 * factura de un período, y el proceso saltea a los alumnos que ya la tienen.
 * Se puede volver a correr sin miedo si una corrida quedó a medias.
 */

import { EstadoAlumno, EstadoInscripcion, Prisma, TipoItemFactura, type PrismaClient } from '@prisma/client';

import { HttpError } from '../../utils/httpError';
import { logger } from '../../utils/logger';
import { aNumero, redondear } from '../shared/pagination';
import { fechaEmision, fechaVencimiento, formatearPeriodo, type Periodo } from './periodos';

/** Punto de venta de la facturación electrónica simulada. */
const PUNTO_VENTA = '0001';

export interface ItemCalculado {
  tipo: TipoItemFactura;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  referenciaId: number | null;
}

export interface FacturaCalculada {
  alumnoId: number;
  legajo: string;
  alumno: string;
  curso: string;
  nivel: string;
  tutorId: number | null;
  tutorNombre: string | null;
  tutorEmail: string | null;
  items: ItemCalculado[];
  subtotal: number;
  total: number;
}

/**
 * Calcula el detalle de lo que le corresponde pagar a un alumno en un período,
 * **sin escribir nada**. Separado del alta a propósito: el backoffice puede
 * previsualizar la facturación del mes antes de emitirla, y es lo que hace
 * testeable el cálculo.
 */
export async function calcularFacturaDeAlumno(
  prisma: PrismaClient | Prisma.TransactionClient,
  alumnoId: number,
  periodo: Periodo,
): Promise<FacturaCalculada | null> {
  const alumno = await prisma.alumno.findUnique({
    where: { id: alumnoId },
    include: {
      curso: { include: { nivel: true } },
      tutores: {
        include: { tutor: { select: { id: true, nombre: true, email: true } } },
        orderBy: { esResponsableFacturacion: 'desc' },
      },
      inscripcionesDeporte: {
        where: { estado: EstadoInscripcion.ACTIVA },
        include: { deporte: true },
        orderBy: { slot: 'asc' },
      },
      inscripcionesTransporte: {
        where: { anio: periodo.anio, mes: periodo.mes, estado: EstadoInscripcion.ACTIVA },
        include: { recorrido: true },
      },
      inscripcionesComedor: {
        where: { anio: periodo.anio, mes: periodo.mes, estado: EstadoInscripcion.ACTIVA },
        include: { comedor: true },
      },
    },
  });

  if (!alumno) return null;
  if (alumno.estado !== EstadoAlumno.ACTIVO) return null;

  const items: ItemCalculado[] = [];

  // --- 1. Cuota base del nivel ---
  const cuota = aNumero(alumno.curso.nivel.cuotaMensual);
  if (cuota > 0) {
    items.push({
      tipo: TipoItemFactura.CUOTA,
      descripcion: `Cuota mensual — ${alumno.curso.nivel.nombre} · ${alumno.curso.nombre} "${alumno.curso.division}"`,
      cantidad: 1,
      precioUnitario: cuota,
      subtotal: cuota,
      referenciaId: alumno.curso.nivel.id,
    });
  }

  // --- 2. Transporte, según el recorrido contratado ---
  const transporte = alumno.inscripcionesTransporte[0];
  if (transporte) {
    const arancel = aNumero(transporte.recorrido.arancelMensual);
    // Sólo ida o sólo vuelta paga la mitad: es medio servicio.
    const proporcion = transporte.turno === 'IDA_Y_VUELTA' ? 1 : 0.5;
    const monto = redondear(arancel * proporcion);

    const detalleTurno = transporte.turno === 'IDA_Y_VUELTA' ? 'ida y vuelta' : transporte.turno.toLowerCase();

    items.push({
      tipo: TipoItemFactura.TRANSPORTE,
      descripcion: `Transporte — ${transporte.recorrido.nombre} (${detalleTurno})`,
      cantidad: 1,
      precioUnitario: monto,
      subtotal: monto,
      referenciaId: transporte.recorrido.id,
    });
  }

  // --- 3. Comedor ---
  const comedor = alumno.inscripcionesComedor[0];
  if (comedor) {
    const monto = aNumero(comedor.comedor.arancelMensual);
    items.push({
      tipo: TipoItemFactura.COMEDOR,
      descripcion: `${comedor.comedor.nombre} (${comedor.comedor.diasPorSemana} días por semana)`,
      cantidad: 1,
      precioUnitario: monto,
      subtotal: monto,
      referenciaId: comedor.comedor.id,
    });
  }

  // --- 4. Un ítem por deporte ---
  for (const inscripcion of alumno.inscripcionesDeporte) {
    const monto = aNumero(inscripcion.deporte.arancelMensual);
    items.push({
      tipo: TipoItemFactura.DEPORTE,
      descripcion: `Actividad deportiva — ${inscripcion.deporte.nombre}`,
      cantidad: 1,
      precioUnitario: monto,
      subtotal: monto,
      referenciaId: inscripcion.deporte.id,
    });
  }

  const subtotal = redondear(items.reduce((s, i) => s + i.subtotal, 0));
  const responsable = alumno.tutores[0]?.tutor ?? null;

  return {
    alumnoId: alumno.id,
    legajo: alumno.legajo,
    alumno: `${alumno.apellido}, ${alumno.nombres}`,
    curso: `${alumno.curso.nombre} "${alumno.curso.division}"`,
    nivel: alumno.curso.nivel.nombre,
    tutorId: responsable?.id ?? null,
    tutorNombre: responsable?.nombre ?? null,
    tutorEmail: responsable?.email ?? null,
    items,
    subtotal,
    total: subtotal,
  };
}

/**
 * Próximo número de factura, con formato `0001-00000001`.
 *
 * Se calcula dentro de la transacción del alta y con aislamiento `Serializable`:
 * dos facturas concurrentes no pueden tomar el mismo número.
 */
async function proximoNumero(tx: Prisma.TransactionClient): Promise<string> {
  const ultima = await tx.factura.findFirst({
    where: { numero: { startsWith: `${PUNTO_VENTA}-` } },
    orderBy: { numero: 'desc' },
    select: { numero: true },
  });

  const siguiente = ultima ? Number(ultima.numero.split('-')[1]) + 1 : 1;
  return `${PUNTO_VENTA}-${String(siguiente).padStart(8, '0')}`;
}

export interface ResultadoGeneracion {
  periodo: Periodo;
  generadas: number;
  omitidas: number;
  sinCargos: number;
  errores: { alumnoId: number; legajo?: string; error: string }[];
  montoTotal: number;
  facturasIds: number[];
}

/**
 * Genera las facturas del período para todos los alumnos activos.
 *
 * Cada alumno se procesa en su propia transacción: si uno falla —por ejemplo,
 * porque quedó sin curso— los demás se emiten igual y el error queda registrado.
 * Facturar es una operación mensual masiva; que se caiga entera por un caso
 * puntual sería peor que emitir 119 de 120 y reportar el faltante.
 */
export async function generarFacturasDelPeriodo(
  prisma: PrismaClient,
  periodo: Periodo,
  opciones: { alumnoIds?: number[] } = {},
): Promise<ResultadoGeneracion> {
  const resultado: ResultadoGeneracion = {
    periodo,
    generadas: 0,
    omitidas: 0,
    sinCargos: 0,
    errores: [],
    montoTotal: 0,
    facturasIds: [],
  };

  const alumnos = await prisma.alumno.findMany({
    where: {
      estado: EstadoAlumno.ACTIVO,
      ...(opciones.alumnoIds ? { id: { in: opciones.alumnoIds } } : {}),
    },
    select: { id: true, legajo: true },
    orderBy: { legajo: 'asc' },
  });

  const emision = fechaEmision(periodo);
  const vencimiento = fechaVencimiento(periodo);

  for (const { id: alumnoId, legajo } of alumnos) {
    try {
      // Idempotencia: si ya tiene factura de este período, no se toca.
      const existente = await prisma.factura.findUnique({
        where: { alumnoId_anio_mes: { alumnoId, anio: periodo.anio, mes: periodo.mes } },
        select: { id: true },
      });
      if (existente) {
        resultado.omitidas += 1;
        continue;
      }

      const calculo = await calcularFacturaDeAlumno(prisma, alumnoId, periodo);
      if (!calculo) {
        resultado.omitidas += 1;
        continue;
      }

      // Un alumno sin cargos no genera factura en cero: sería ruido para la
      // familia y para el reporte de cobranza.
      if (calculo.items.length === 0 || calculo.total <= 0) {
        resultado.sinCargos += 1;
        continue;
      }

      const factura = await prisma.$transaction(
        async (tx) =>
          tx.factura.create({
            data: {
              numero: await proximoNumero(tx),
              alumnoId: calculo.alumnoId,
              tutorId: calculo.tutorId,
              anio: periodo.anio,
              mes: periodo.mes,
              fechaEmision: emision,
              fechaVencimiento: vencimiento,
              subtotal: calculo.subtotal,
              recargo: 0,
              total: calculo.total,
              items: {
                create: calculo.items.map((i) => ({
                  tipo: i.tipo,
                  descripcion: i.descripcion,
                  cantidad: i.cantidad,
                  precioUnitario: i.precioUnitario,
                  subtotal: i.subtotal,
                  referenciaId: i.referenciaId,
                })),
              },
            },
            select: { id: true },
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      resultado.generadas += 1;
      resultado.montoTotal = redondear(resultado.montoTotal + calculo.total);
      resultado.facturasIds.push(factura.id);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      logger.error(`[facturacion] error con el alumno ${legajo}`, mensaje);
      resultado.errores.push({ alumnoId, legajo, error: mensaje });
    }
  }

  logger.info(
    `[facturacion] ${formatearPeriodo(periodo)}: ${resultado.generadas} generadas, ` +
      `${resultado.omitidas} omitidas, ${resultado.sinCargos} sin cargos, ${resultado.errores.length} errores`,
  );

  return resultado;
}

/**
 * Previsualización de la facturación del período, sin escribir nada.
 * Permite que Administración revise los importes antes de emitir.
 */
export async function previsualizarFacturacion(prisma: PrismaClient, periodo: Periodo) {
  const alumnos = await prisma.alumno.findMany({
    where: { estado: EstadoAlumno.ACTIVO },
    select: { id: true },
    orderBy: { legajo: 'asc' },
  });

  const calculos: FacturaCalculada[] = [];
  const yaFacturados: number[] = [];

  for (const { id } of alumnos) {
    const existente = await prisma.factura.findUnique({
      where: { alumnoId_anio_mes: { alumnoId: id, anio: periodo.anio, mes: periodo.mes } },
      select: { id: true },
    });
    if (existente) {
      yaFacturados.push(id);
      continue;
    }

    const calculo = await calcularFacturaDeAlumno(prisma, id, periodo);
    if (calculo && calculo.items.length > 0) calculos.push(calculo);
  }

  const porConcepto = new Map<string, number>();
  for (const c of calculos) {
    for (const item of c.items) {
      porConcepto.set(item.tipo, redondear((porConcepto.get(item.tipo) ?? 0) + item.subtotal));
    }
  }

  return {
    periodo,
    fechaEmision: fechaEmision(periodo),
    fechaVencimiento: fechaVencimiento(periodo),
    aFacturar: calculos.length,
    yaFacturados: yaFacturados.length,
    montoTotal: redondear(calculos.reduce((s, c) => s + c.total, 0)),
    porConcepto: [...porConcepto.entries()]
      .map(([tipo, monto]) => ({ tipo, monto }))
      .sort((a, b) => b.monto - a.monto),
    sinTutorAsignado: calculos.filter((c) => c.tutorEmail === null).length,
    facturas: calculos,
  };
}

/** Factura con todo lo que hace falta para armar el mail y el comprobante. */
export async function obtenerFacturaCompleta(prisma: PrismaClient, facturaId: number) {
  const factura = await prisma.factura.findUnique({
    where: { id: facturaId },
    include: {
      items: { orderBy: { id: 'asc' } },
      comprobantes: { orderBy: { createdAt: 'desc' } },
      alumno: {
        include: {
          curso: { include: { nivel: true } },
          tutores: {
            include: { tutor: { select: { id: true, nombre: true, email: true } } },
            orderBy: { esResponsableFacturacion: 'desc' },
          },
        },
      },
      tutor: { select: { id: true, nombre: true, email: true } },
    },
  });

  if (!factura) throw HttpError.notFound('La factura no existe.');
  return factura;
}

/** Anula una factura. Sólo ADMIN, y sólo si no tiene pagos aprobados. */
export async function anularFactura(prisma: PrismaClient, facturaId: number, motivo: string) {
  const factura = await prisma.factura.findUnique({
    where: { id: facturaId },
    include: { comprobantes: { where: { estado: 'APROBADO' }, select: { id: true } } },
  });

  if (!factura) throw HttpError.notFound('La factura no existe.');
  if (factura.estado === 'ANULADA') throw HttpError.conflict('La factura ya está anulada.');

  if (factura.comprobantes.length > 0) {
    throw HttpError.conflict(
      'No se puede anular una factura con pagos aprobados. Primero hay que revertir los comprobantes.',
    );
  }

  return prisma.factura.update({
    where: { id: facturaId },
    data: {
      estado: 'ANULADA',
      observaciones: [factura.observaciones, `ANULADA: ${motivo}`].filter(Boolean).join(' | '),
    },
  });
}
