/**
 * Envío de correos con registro de auditoría.
 *
 * Envuelve a `services/mailer` para que **todo correo del circuito de cobranza
 * quede asentado en `EmailLog`**. Sin eso no hay forma de responder "¿se le avisó
 * a esta familia y cuándo?", que es la primera pregunta cuando una familia
 * reclama que nunca le llegó la cuota.
 *
 * `sendMail` no propaga errores —los loguea y sigue— así que acá se verifica el
 * resultado por separado para poder marcar el envío como FALLIDO.
 */

import type { PrismaClient } from '@prisma/client';

import { logger } from '../../utils/logger';
import { sendMail } from '../../services/mailer';

export interface EnvioInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
  /** Etiqueta del tipo de correo, para filtrar la auditoría. */
  tipo: string;
  facturaId?: number;
  alumnoId?: number;
  ejecucionId?: number;
}

/**
 * Envía y registra. Nunca lanza: un fallo de SMTP no puede cortar la corrida
 * mensual a mitad de camino y dejar a media matrícula sin aviso.
 */
export async function registrarEnvio(prisma: PrismaClient, input: EnvioInput): Promise<boolean> {
  let ok = true;
  let error: string | null = null;

  if (!input.to || !input.to.includes('@')) {
    ok = false;
    error = 'destinatario sin dirección de correo válida';
  } else {
    try {
      await sendMail({
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        attachments: input.attachments,
      });
    } catch (err) {
      ok = false;
      error = err instanceof Error ? err.message : String(err);
      logger.error(`[mail] fallo al enviar a ${input.to}`, error);
    }
  }

  try {
    await prisma.emailLog.create({
      data: {
        destino: input.to || '(sin destino)',
        asunto: input.subject,
        tipo: input.tipo,
        estado: ok ? 'ENVIADO' : 'FALLIDO',
        error,
        facturaId: input.facturaId ?? null,
        alumnoId: input.alumnoId ?? null,
        ejecucionId: input.ejecucionId ?? null,
      },
    });
  } catch (err) {
    // Si falla el registro, el mail igual se mandó: se loguea y se sigue.
    logger.error('[mail] no se pudo registrar el envío en EmailLog', err);
  }

  return ok;
}

/** Historial de correos, para el backoffice. */
export async function historialEnvios(
  prisma: PrismaClient,
  filtros: { tipo?: string; destino?: string; ejecucionId?: number; limite?: number },
) {
  return prisma.emailLog.findMany({
    where: {
      ...(filtros.tipo ? { tipo: filtros.tipo } : {}),
      ...(filtros.destino ? { destino: { contains: filtros.destino, mode: 'insensitive' } } : {}),
      ...(filtros.ejecucionId ? { ejecucionId: filtros.ejecucionId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(filtros.limite ?? 100, 500),
  });
}
