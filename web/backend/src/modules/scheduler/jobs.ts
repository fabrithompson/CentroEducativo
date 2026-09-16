/**
 * Las dos tareas programadas que pide la consigna.
 *
 *   1. Último día hábil del mes → genera las facturas del período y envía a cada
 *      tutor el desglose detallado con el comprobante adjunto.
 *   2. Día 20 de cada mes → revisa las facturas del mes en curso y, si tienen
 *      saldo pendiente, manda el recordatorio de deuda.
 *
 * Ambas son **idempotentes**: antes de trabajar consultan `EjecucionTarea` y, si
 * ya hay una corrida COMPLETADA para ese período, no hacen nada. Sin esto, un
 * reinicio del servidor el último día del mes mandaría los mails dos veces, que
 * es exactamente el tipo de error que las familias notan.
 *
 * Los correos se agrupan **por tutor**, no por alumno: una familia con tres hijos
 * recibe un mail con los tres desgloses, no tres mails.
 */

import { EstadoEjecucion, EstadoFactura, TipoTareaProgramada, type PrismaClient } from '@prisma/client';

import { logger } from '../../utils/logger';
import { aNumero, redondear } from '../shared/pagination';
import { generarFacturasDelPeriodo } from '../facturacion/facturacion.service';
import { registrarEnvio } from '../facturacion/mailer.facturacion';
import {
  asuntoRecordatorio,
  asuntoResumenMensual,
  facturaHtml,
  recordatorioHtml,
  recordatorioTexto,
  resumenMensualHtml,
  resumenMensualTexto,
  type DatosRecordatorio,
  type DatosResumenMensual,
} from '../facturacion/plantillas';
import {
  fechaVencimiento,
  formatearPeriodo,
  periodoDe,
  type Periodo,
} from '../facturacion/periodos';

export interface OpcionesJob {
  /** Período a procesar. Por defecto, el del momento de la corrida. */
  periodo?: Periodo;
  /** Repite la tarea aunque ya haya una corrida completada. */
  forzar?: boolean;
  /** `true` si la dispara una persona desde el backoffice. */
  manual?: boolean;
  ejecutadaPorId?: number;
}

/**
 * Abre el registro de ejecución, o devuelve `null` si ya se hizo.
 *
 * La restricción `@@unique([tarea, anio, mes])` es la que garantiza que dos
 * procesos concurrentes no arranquen la misma tarea: el segundo falla al crear
 * y se retira.
 */
async function abrirEjecucion(
  prisma: PrismaClient,
  tarea: TipoTareaProgramada,
  periodo: Periodo,
  opciones: OpcionesJob,
): Promise<number | null> {
  const previa = await prisma.ejecucionTarea.findUnique({
    where: { tarea_anio_mes: { tarea, anio: periodo.anio, mes: periodo.mes } },
  });

  if (previa && previa.estado === EstadoEjecucion.COMPLETADA && !opciones.forzar) {
    logger.info(
      `[scheduler] ${tarea} de ${formatearPeriodo(periodo)} ya se ejecutó el ` +
        `${previa.finalizadaEn?.toISOString()}. Se omite.`,
    );
    return null;
  }

  if (previa && previa.estado === EstadoEjecucion.EN_CURSO && !opciones.forzar) {
    logger.warn(`[scheduler] ${tarea} de ${formatearPeriodo(periodo)} ya está en curso. Se omite.`);
    return null;
  }

  const ejecucion = await prisma.ejecucionTarea.upsert({
    where: { tarea_anio_mes: { tarea, anio: periodo.anio, mes: periodo.mes } },
    update: {
      estado: EstadoEjecucion.EN_CURSO,
      iniciadaEn: new Date(),
      finalizadaEn: null,
      error: null,
      manual: opciones.manual ?? false,
      ejecutadaPorId: opciones.ejecutadaPorId ?? null,
    },
    create: {
      tarea,
      anio: periodo.anio,
      mes: periodo.mes,
      estado: EstadoEjecucion.EN_CURSO,
      manual: opciones.manual ?? false,
      ejecutadaPorId: opciones.ejecutadaPorId ?? null,
    },
  });

  return ejecucion.id;
}

async function cerrarEjecucion(
  prisma: PrismaClient,
  id: number,
  estado: EstadoEjecucion,
  resultado: unknown,
  error?: string,
): Promise<void> {
  await prisma.ejecucionTarea.update({
    where: { id },
    data: {
      estado,
      finalizadaEn: new Date(),
      resultado: resultado as never,
      error: error ?? null,
    },
  });
}

// ==================================================================
// TAREA 1 — Último día hábil del mes
// ==================================================================

export interface ResultadoFacturacionMensual {
  periodo: string;
  facturasGeneradas: number;
  facturasOmitidas: number;
  alumnosSinCargos: number;
  montoTotal: number;
  tutoresNotificados: number;
  mailsEnviados: number;
  mailsFallidos: number;
  alumnosSinTutor: number;
  errores: { alumnoId: number; legajo?: string; error: string }[];
}

/**
 * Genera las facturas del período y manda a cada tutor el desglose detallado.
 *
 * Si un tutor no tiene mail o el alumno no tiene tutor asignado, la factura se
 * emite igual y el caso queda contado en `alumnosSinTutor`. La deuda existe
 * aunque no se haya podido avisar; Administración lo ve en el reporte.
 */
export async function ejecutarFacturacionMensual(
  prisma: PrismaClient,
  opciones: OpcionesJob = {},
): Promise<ResultadoFacturacionMensual | null> {
  const periodo = opciones.periodo ?? periodoDe(new Date());

  const ejecucionId = await abrirEjecucion(
    prisma,
    TipoTareaProgramada.FACTURACION_MENSUAL,
    periodo,
    opciones,
  );
  if (ejecucionId === null) return null;

  logger.info(`[scheduler] facturación mensual de ${formatearPeriodo(periodo)} — inicio`);

  try {
    // --- 1. Emitir las facturas ---
    const generacion = await generarFacturasDelPeriodo(prisma, periodo);

    // --- 2. Recuperar todo lo emitido en el período, incluso de corridas previas ---
    const facturas = await prisma.factura.findMany({
      where: { anio: periodo.anio, mes: periodo.mes, estado: { not: EstadoFactura.ANULADA } },
      include: {
        items: { orderBy: { id: 'asc' } },
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

    // --- 3. Agrupar por tutor: una familia recibe un solo mail ---
    interface Grupo {
      tutor: { id: number; nombre: string; email: string };
      facturas: typeof facturas;
    }
    const porTutor = new Map<number, Grupo>();
    let sinTutor = 0;

    for (const f of facturas) {
      const tutor = f.tutor ?? f.alumno.tutores[0]?.tutor ?? null;
      if (!tutor || !tutor.email) {
        sinTutor += 1;
        logger.warn(`[scheduler] factura ${f.numero} sin tutor con correo; no se notifica.`);
        continue;
      }

      const grupo = porTutor.get(tutor.id) ?? { tutor, facturas: [] };
      grupo.facturas.push(f);
      porTutor.set(tutor.id, grupo);
    }

    // --- 4. Enviar el desglose ---
    const vencimiento = fechaVencimiento(periodo);
    let enviados = 0;
    let fallidos = 0;

    for (const grupo of porTutor.values()) {
      const datos: DatosResumenMensual = {
        tutor: grupo.tutor.nombre,
        periodo,
        fechaVencimiento: vencimiento,
        hijos: grupo.facturas.map((f) => ({
          alumno: `${f.alumno.apellido}, ${f.alumno.nombres}`,
          curso: `${f.alumno.curso.nivel.nombre} · ${f.alumno.curso.nombre} "${f.alumno.curso.division}"`,
          numero: f.numero,
          items: f.items.map((i) => ({
            tipo: i.tipo,
            descripcion: i.descripcion,
            cantidad: i.cantidad,
            precioUnitario: aNumero(i.precioUnitario),
            subtotal: aNumero(i.subtotal),
          })),
          total: aNumero(f.total),
        })),
        totalGeneral: redondear(grupo.facturas.reduce((s, f) => s + aNumero(f.total), 0)),
      };

      // La factura electrónica simulada de cada hijo, adjunta.
      const adjuntos = grupo.facturas.map((f) => ({
        filename: `factura-${f.numero}-${f.alumno.legajo}.html`,
        content: facturaHtml({
          numero: f.numero,
          periodo,
          fechaEmision: f.fechaEmision,
          fechaVencimiento: f.fechaVencimiento,
          alumno: `${f.alumno.apellido}, ${f.alumno.nombres}`,
          legajo: f.alumno.legajo,
          curso: `${f.alumno.curso.nombre} "${f.alumno.curso.division}"`,
          nivel: f.alumno.curso.nivel.nombre,
          tutor: grupo.tutor.nombre,
          items: f.items.map((i) => ({
            tipo: i.tipo,
            descripcion: i.descripcion,
            cantidad: i.cantidad,
            precioUnitario: aNumero(i.precioUnitario),
            subtotal: aNumero(i.subtotal),
          })),
          subtotal: aNumero(f.subtotal),
          recargo: aNumero(f.recargo),
          total: aNumero(f.total),
          montoPagado: aNumero(f.montoPagado),
          estado: f.estado,
        }),
        contentType: 'text/html; charset=utf-8',
      }));

      const ok = await registrarEnvio(prisma, {
        to: grupo.tutor.email,
        subject: asuntoResumenMensual(periodo),
        text: resumenMensualTexto(datos),
        html: resumenMensualHtml(datos),
        attachments: adjuntos,
        tipo: 'FACTURACION_MENSUAL',
        ejecucionId,
      });

      ok ? enviados++ : fallidos++;

      // Notificación dentro del campus, además del mail.
      await prisma.notification.create({
        data: {
          userId: grupo.tutor.id,
          titulo: `Cuota de ${formatearPeriodo(periodo)} disponible`,
          contenido: `Total a abonar: $${datos.totalGeneral}. Vence el ${vencimiento.toISOString().slice(0, 10)}.`,
          link: '/panel_padre.html#finanzas',
        },
      });
    }

    const resultado: ResultadoFacturacionMensual = {
      periodo: formatearPeriodo(periodo),
      facturasGeneradas: generacion.generadas,
      facturasOmitidas: generacion.omitidas,
      alumnosSinCargos: generacion.sinCargos,
      montoTotal: generacion.montoTotal,
      tutoresNotificados: porTutor.size,
      mailsEnviados: enviados,
      mailsFallidos: fallidos,
      alumnosSinTutor: sinTutor,
      errores: generacion.errores,
    };

    await cerrarEjecucion(prisma, ejecucionId, EstadoEjecucion.COMPLETADA, resultado);

    logger.info(
      `[scheduler] facturación mensual de ${formatearPeriodo(periodo)} — fin: ` +
        `${resultado.facturasGeneradas} facturas, ${enviados} mails, ${fallidos} fallidos`,
    );

    return resultado;
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    await cerrarEjecucion(prisma, ejecucionId, EstadoEjecucion.FALLIDA, null, mensaje);
    logger.error('[scheduler] facturación mensual falló', mensaje);
    throw err;
  }
}

// ==================================================================
// TAREA 2 — Día 20: recordatorio de deuda
// ==================================================================

export interface ResultadoRecordatorio {
  periodo: string;
  facturasConSaldo: number;
  deudaTotal: number;
  tutoresNotificados: number;
  mailsEnviados: number;
  mailsFallidos: number;
  facturasSinTutor: number;
}

/** Estados que significan "todavía debe algo". */
const CON_SALDO: EstadoFactura[] = [
  EstadoFactura.PENDIENTE,
  EstadoFactura.EN_REVISION,
  EstadoFactura.PARCIAL,
  EstadoFactura.VENCIDA,
];

/**
 * Revisa las facturas del mes en curso y avisa a quienes tengan saldo.
 *
 * Incluye a propósito las que están en `EN_REVISION`: el comprobante está
 * cargado pero todavía no acreditado, así que la deuda sigue viva. El correo lo
 * aclara para que la familia no crea que se perdió su pago.
 *
 * El período por defecto es el del mes anterior al de la corrida: el día 20 de
 * octubre se reclama la cuota de septiembre, que venció el 10 de octubre.
 */
export async function ejecutarRecordatorioDeuda(
  prisma: PrismaClient,
  opciones: OpcionesJob = {},
): Promise<ResultadoRecordatorio | null> {
  const hoy = new Date();
  const periodo = opciones.periodo ?? periodoDe(hoy);

  const ejecucionId = await abrirEjecucion(
    prisma,
    TipoTareaProgramada.RECORDATORIO_DEUDA,
    periodo,
    opciones,
  );
  if (ejecucionId === null) return null;

  logger.info(`[scheduler] recordatorio de deuda de ${formatearPeriodo(periodo)} — inicio`);

  try {
    const facturas = await prisma.factura.findMany({
      where: { anio: periodo.anio, mes: periodo.mes, estado: { in: CON_SALDO } },
      include: {
        alumno: {
          include: {
            tutores: {
              include: { tutor: { select: { id: true, nombre: true, email: true } } },
              orderBy: { esResponsableFacturacion: 'desc' },
            },
          },
        },
        tutor: { select: { id: true, nombre: true, email: true } },
      },
    });

    // Una factura puede figurar con saldo cero si el trigger todavía no corrió;
    // se filtra por el importe real, no sólo por el estado.
    const conSaldo = facturas.filter((f) => aNumero(f.total) - aNumero(f.montoPagado) > 0);

    interface Grupo {
      tutor: { id: number; nombre: string; email: string };
      facturas: typeof conSaldo;
    }
    const porTutor = new Map<number, Grupo>();
    let sinTutor = 0;

    for (const f of conSaldo) {
      const tutor = f.tutor ?? f.alumno.tutores[0]?.tutor ?? null;
      if (!tutor || !tutor.email) {
        sinTutor += 1;
        continue;
      }

      const grupo = porTutor.get(tutor.id) ?? { tutor, facturas: [] };
      grupo.facturas.push(f);
      porTutor.set(tutor.id, grupo);
    }

    const hoySinHora = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
    let enviados = 0;
    let fallidos = 0;

    for (const grupo of porTutor.values()) {
      const detalle = grupo.facturas.map((f) => {
        const total = aNumero(f.total);
        const pagado = aNumero(f.montoPagado);
        return {
          numero: f.numero,
          alumno: `${f.alumno.apellido}, ${f.alumno.nombres}`,
          total,
          pagado,
          saldo: redondear(total - pagado),
          fechaVencimiento: f.fechaVencimiento,
          estado: f.estado,
          vencida: f.fechaVencimiento < hoySinHora,
        };
      });

      const datos: DatosRecordatorio = {
        tutor: grupo.tutor.nombre,
        periodo,
        facturas: detalle,
        deudaTotal: redondear(detalle.reduce((s, f) => s + f.saldo, 0)),
      };

      const hayVencidas = detalle.some((f) => f.vencida);

      const ok = await registrarEnvio(prisma, {
        to: grupo.tutor.email,
        subject: asuntoRecordatorio(periodo, hayVencidas),
        text: recordatorioTexto(datos),
        html: recordatorioHtml(datos),
        tipo: 'RECORDATORIO_DEUDA',
        ejecucionId,
      });

      ok ? enviados++ : fallidos++;

      await prisma.notification.create({
        data: {
          userId: grupo.tutor.id,
          titulo: hayVencidas ? 'Cuota vencida' : 'Recordatorio de pago',
          contenido: `Tenés un saldo pendiente de $${datos.deudaTotal} de ${formatearPeriodo(periodo)}.`,
          link: '/panel_padre.html#finanzas',
        },
      });
    }

    const resultado: ResultadoRecordatorio = {
      periodo: formatearPeriodo(periodo),
      facturasConSaldo: conSaldo.length,
      deudaTotal: redondear(
        conSaldo.reduce((s, f) => s + (aNumero(f.total) - aNumero(f.montoPagado)), 0),
      ),
      tutoresNotificados: porTutor.size,
      mailsEnviados: enviados,
      mailsFallidos: fallidos,
      facturasSinTutor: sinTutor,
    };

    await cerrarEjecucion(prisma, ejecucionId, EstadoEjecucion.COMPLETADA, resultado);

    logger.info(
      `[scheduler] recordatorio de ${formatearPeriodo(periodo)} — fin: ` +
        `${resultado.facturasConSaldo} facturas con saldo, ${enviados} mails`,
    );

    return resultado;
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err);
    await cerrarEjecucion(prisma, ejecucionId, EstadoEjecucion.FALLIDA, null, mensaje);
    logger.error('[scheduler] recordatorio de deuda falló', mensaje);
    throw err;
  }
}

/**
 * Marca como VENCIDAS las facturas cuyo vencimiento pasó y siguen impagas.
 *
 * El trigger sólo recalcula el estado cuando se toca un comprobante; una factura
 * que nadie pagó nunca pasa sola de PENDIENTE a VENCIDA. Esta pasada diaria lo
 * corrige.
 */
export async function marcarFacturasVencidas(prisma: PrismaClient): Promise<number> {
  const hoy = new Date();
  const hoySinHora = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));

  const { count } = await prisma.factura.updateMany({
    where: {
      estado: EstadoFactura.PENDIENTE,
      fechaVencimiento: { lt: hoySinHora },
    },
    data: { estado: EstadoFactura.VENCIDA },
  });

  if (count > 0) logger.info(`[scheduler] ${count} facturas pasaron a VENCIDA`);
  return count;
}
