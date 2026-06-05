import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from '../utils/logger';

let cached: Transporter | null = null;

function isSmtpConfigured(): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_PORT);
}

/**
 * Devuelve un transport real (si hay SMTP configurado) o uno de "stream" que
 * imprime el mail por consola — útil para dev sin SMTP.
 */
export function getMailer(): Transporter {
  if (cached) return cached;
  if (isSmtpConfigured()) {
    cached = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    logger.info(`Mailer: SMTP ${env.SMTP_HOST}:${env.SMTP_PORT}`);
  } else {
    cached = nodemailer.createTransport({ streamTransport: true, newline: 'unix', buffer: true });
    logger.info('Mailer: stream transport (sin SMTP — los mails se loggean por consola)');
  }
  return cached;
}

export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(input: MailInput): Promise<void> {
  try {
    const info = await getMailer().sendMail({
      from: env.SMTP_FROM || 'Educar para Transformar <no-reply@educarparatransformar.edu.ar>',
      ...input,
    });
    if (!isSmtpConfigured()) {
      // stream transport: lo logueamos
      const msg = (info.message as Buffer | undefined)?.toString();
      logger.info(`[mail-stub] to=${input.to} subject="${input.subject}"\n${msg?.slice(0, 600) ?? ''}`);
    } else {
      logger.info(`mail sent to=${input.to} id=${info.messageId}`);
    }
  } catch (err) {
    logger.error('Mail error', err);
  }
}
