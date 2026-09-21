/**
 * Recuperación de contraseña.
 *
 * Decisiones de seguridad, porque acá los detalles importan:
 *
 * 1. El token viaja al mail en claro pero **en la base se guarda su SHA-256**.
 *    Quien lea la tabla no puede usar los tokens vigentes.
 * 2. `solicitarReset` responde siempre lo mismo, exista o no el email. Si
 *    contestara distinto, sería un oráculo para averiguar qué direcciones están
 *    registradas en el colegio.
 * 3. Al emitir un token nuevo se invalidan los anteriores del usuario.
 * 4. Al consumirlo se invalidan todos los tokens pendientes del usuario.
 */

import bcrypt from 'bcrypt';
import type { PrismaClient } from '@prisma/client';

import { HttpError } from '../../utils/httpError';
import { logger } from '../../utils/logger';
import { sendMail } from '../../services/mailer';
import { calcularExpiracion, estaVencido, hashearToken, generarToken, compararHashes, RESET_TTL_MINUTOS } from './tokens';

export { generarToken, hashearToken, compararHashes, RESET_TTL_MINUTOS } from './tokens';

const BCRYPT_ROUNDS = 10;

export interface SolicitarResetInput {
  email: string;
  origen?: string;
  /** URL base del frontend, para armar el enlace del mail. */
  baseUrl?: string;
}

/**
 * Genera un token de recuperación y lo manda por mail.
 *
 * Siempre resuelve sin error, aunque el email no exista: el que llama no puede
 * distinguir un caso del otro.
 */
export async function solicitarReset(
  prisma: PrismaClient,
  input: SolicitarResetInput,
): Promise<void> {
  const email = input.email.trim().toLowerCase();

  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });

  if (!user || !user.isActive) {
    // Se registra para auditoría, pero la respuesta al cliente es idéntica.
    logger.info(`[password-reset] solicitud para email sin cuenta activa: ${email}`);
    return;
  }

  // Un token nuevo invalida los anteriores: no quedan varios válidos a la vez.
  await prisma.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = generarToken();
  const expiresAt = calcularExpiracion();

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashearToken(token),
      expiresAt,
      solicitadoDesde: input.origen ?? null,
    },
  });

  const base = input.baseUrl?.replace(/\/+$/, '') ?? '';
  const enlace = `${base}/restablecer.html?token=${token}`;

  await sendMail({
    to: user.email,
    subject: 'Recuperación de contraseña — Transformar para educar',
    text: [
      `Hola ${user.nombre},`,
      '',
      'Recibimos un pedido para restablecer la contraseña de tu cuenta del campus.',
      `Entrá en este enlace para elegir una nueva (vence en ${RESET_TTL_MINUTOS} minutos):`,
      '',
      enlace,
      '',
      'Si no pediste esto, ignorá el mensaje: tu contraseña actual sigue funcionando.',
      '',
      'Centro Educativo "Transformar para educar" — Resistencia, Chaco',
    ].join('\n'),
    html: `
      <p>Hola ${user.nombre},</p>
      <p>Recibimos un pedido para restablecer la contraseña de tu cuenta del campus.</p>
      <p><a href="${enlace}">Elegir una contraseña nueva</a> (el enlace vence en ${RESET_TTL_MINUTOS} minutos).</p>
      <p>Si no pediste esto, ignorá el mensaje: tu contraseña actual sigue funcionando.</p>
      <hr>
      <p><small>Centro Educativo "Transformar para educar" — Resistencia, Chaco</small></p>
    `,
  });

  logger.info(`[password-reset] token emitido para userId=${user.id}, vence ${expiresAt.toISOString()}`);
}

export interface ConfirmarResetInput {
  token: string;
  nuevaPassword: string;
}

/** Valida el token y cambia la contraseña. */
export async function confirmarReset(
  prisma: PrismaClient,
  input: ConfirmarResetInput,
): Promise<{ usuario: string }> {
  const tokenHash = hashearToken(input.token);

  const registro = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  // Mismo mensaje para token inexistente, usado o vencido: no se le informa al
  // atacante en cuál de los tres casos cayó.
  const invalido = () => HttpError.badRequest('El enlace de recuperación no es válido o ya venció.');

  if (!registro) throw invalido();
  if (registro.usedAt) throw invalido();
  if (estaVencido(registro.expiresAt)) throw invalido();
  if (!registro.user.isActive) throw invalido();

  if (!compararHashes(registro.tokenHash, tokenHash)) throw invalido();

  const hash = await bcrypt.hash(input.nuevaPassword, BCRYPT_ROUNDS);

  await prisma.$transaction([
    // `tokenVersion` sube junto con la contraseña: es lo que invalida los
    // refresh tokens ya emitidos. Sin esto, quien hubiera robado la sesión
    // seguiría entrando durante siete días aunque la víctima cambiara la
    // clave, que es justamente lo primero que uno hace al sospecharlo.
    prisma.user.update({
      where: { id: registro.userId },
      data: { password: hash, tokenVersion: { increment: 1 } },
    }),
    prisma.passwordResetToken.update({
      where: { id: registro.id },
      data: { usedAt: new Date() },
    }),
    // Cualquier otro token pendiente del usuario queda inutilizable.
    prisma.passwordResetToken.updateMany({
      where: { userId: registro.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  logger.info(`[password-reset] contraseña cambiada para userId=${registro.userId}`);

  return { usuario: registro.user.usuario };
}

/** Cambio de contraseña con la sesión iniciada: exige la contraseña actual. */
export async function cambiarPassword(
  prisma: PrismaClient,
  userId: number,
  actual: string,
  nueva: string,
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw HttpError.unauthorized('Sesión inválida.');

  const ok = await bcrypt.compare(actual, user.password);
  if (!ok) throw HttpError.badRequest('La contraseña actual no es correcta.');

  if (await bcrypt.compare(nueva, user.password)) {
    throw HttpError.badRequest('La contraseña nueva debe ser distinta de la actual.');
  }

  // Igual que en el reset: cambiar la contraseña cierra las sesiones abiertas.
  // Incluida la que está haciendo el cambio, que tendrá que renovar su token;
  // es el precio de que "cambié la clave" signifique algo.
  await prisma.user.update({
    where: { id: userId },
    data: {
      password: await bcrypt.hash(nueva, BCRYPT_ROUNDS),
      tokenVersion: { increment: 1 },
    },
  });
}

/** Borra los tokens vencidos. Pensado para una tarea programada. */
export async function purgarTokensVencidos(prisma: PrismaClient): Promise<number> {
  const { count } = await prisma.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
