/**
 * Registro de las tareas programadas con node-cron.
 *
 * Huso horario: `America/Argentina/Buenos_Aires`. Sin fijarlo, el cron usaría el
 * del servidor, y una tarea de "fin de mes" en UTC puede caer el día 1 a las
 * 21:00 hora local del mes anterior. Es el error clásico de estos schedulers.
 *
 * El "último día hábil del mes" no se puede expresar en sintaxis cron: depende
 * de fines de semana y feriados. Por eso el cron corre **todos los días** a la
 * hora indicada y el propio job comprueba si hoy corresponde. La verificación
 * real está en `periodos.esUltimoDiaHabilDelMes`, que sí tiene tests.
 */

import cron, { type ScheduledTask } from 'node-cron';

import { logger } from '../../utils/logger';
import { prisma } from '../../db/prisma';
import { esUltimoDiaHabilDelMes, periodoAnterior, periodoDe, DIA_RECORDATORIO } from '../facturacion/periodos';
import { ejecutarFacturacionMensual, ejecutarRecordatorioDeuda, marcarFacturasVencidas } from './jobs';

const TIMEZONE = 'America/Argentina/Buenos_Aires';

/** Hora a la que corren las tareas de cobranza. */
const HORA_FACTURACION = '0 20 * * *'; // 20:00, todos los días
const HORA_RECORDATORIO = '0 9 * * *'; // 09:00, todos los días
const HORA_VENCIMIENTOS = '30 0 * * *'; // 00:30, todos los días

let tareas: ScheduledTask[] = [];

/**
 * Arranca los schedulers. Se llama una vez desde `src/index.ts`.
 *
 * Devuelve la cantidad de tareas registradas para que el arranque lo pueda
 * loguear y para poder verificarlo en un test.
 */
export function iniciarScheduler(): number {
  if (tareas.length > 0) {
    logger.warn('[scheduler] ya estaba iniciado; se ignora la segunda llamada.');
    return tareas.length;
  }

  // ---------------------------------------------------------------
  // Tarea 1 — último día hábil del mes
  // ---------------------------------------------------------------
  tareas.push(
    cron.schedule(
      HORA_FACTURACION,
      async () => {
        const hoy = new Date();

        if (!esUltimoDiaHabilDelMes(hoy)) return;

        logger.info('[scheduler] hoy es el último día hábil del mes: se factura.');
        try {
          await ejecutarFacturacionMensual(prisma, { periodo: periodoDe(hoy) });
        } catch (err) {
          logger.error('[scheduler] la facturación mensual terminó con error', err);
        }
      },
      { timezone: TIMEZONE },
    ),
  );

  // ---------------------------------------------------------------
  // Tarea 2 — día 20 de cada mes
  // ---------------------------------------------------------------
  tareas.push(
    cron.schedule(
      HORA_RECORDATORIO,
      async () => {
        const hoy = new Date();

        if (hoy.getDate() !== DIA_RECORDATORIO) return;

        // El día 20 se reclama la cuota del mes anterior, que venció el 10.
        const periodo = periodoAnterior(periodoDe(hoy));

        logger.info(`[scheduler] día ${DIA_RECORDATORIO}: recordatorio de deuda.`);
        try {
          await marcarFacturasVencidas(prisma);
          await ejecutarRecordatorioDeuda(prisma, { periodo });
        } catch (err) {
          logger.error('[scheduler] el recordatorio de deuda terminó con error', err);
        }
      },
      { timezone: TIMEZONE },
    ),
  );

  // ---------------------------------------------------------------
  // Mantenimiento diario — marcar vencimientos
  // ---------------------------------------------------------------
  tareas.push(
    cron.schedule(
      HORA_VENCIMIENTOS,
      async () => {
        try {
          await marcarFacturasVencidas(prisma);
        } catch (err) {
          logger.error('[scheduler] no se pudieron marcar los vencimientos', err);
        }
      },
      { timezone: TIMEZONE },
    ),
  );

  logger.info(
    `[scheduler] ${tareas.length} tareas registradas (huso ${TIMEZONE}): ` +
      'facturación 20:00, recordatorio 09:00, vencimientos 00:30.',
  );

  return tareas.length;
}

/** Detiene los schedulers. Se usa en el apagado ordenado y en los tests. */
export function detenerScheduler(): void {
  for (const tarea of tareas) tarea.stop();
  tareas = [];
}

/** Descripción de lo programado, para exponerla en el backoffice. */
export function estadoScheduler() {
  return {
    activo: tareas.length > 0,
    timezone: TIMEZONE,
    tareas: [
      {
        nombre: 'Facturación mensual',
        cron: HORA_FACTURACION,
        condicion: 'Sólo corre si hoy es el último día hábil del mes.',
        descripcion: 'Genera las facturas del período y envía el desglose con el comprobante adjunto.',
      },
      {
        nombre: 'Recordatorio de deuda',
        cron: HORA_RECORDATORIO,
        condicion: `Sólo corre el día ${DIA_RECORDATORIO} de cada mes.`,
        descripcion: 'Avisa a los tutores con saldo pendiente del período anterior.',
      },
      {
        nombre: 'Marcado de vencimientos',
        cron: HORA_VENCIMIENTOS,
        condicion: 'Diaria.',
        descripcion: 'Pasa a VENCIDA las facturas impagas cuyo vencimiento quedó atrás.',
      },
    ],
  };
}

export { ejecutarFacturacionMensual, ejecutarRecordatorioDeuda, marcarFacturasVencidas } from './jobs';
