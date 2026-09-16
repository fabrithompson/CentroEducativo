/**
 * Primitivas criptográficas de los tokens de recuperación.
 *
 * Módulo deliberadamente aislado: sólo importa `node:crypto`. No toca Prisma,
 * ni Express, ni `config/env` — que aborta el proceso si faltan variables de
 * entorno y, por lo tanto, vuelve intesteable a todo lo que lo arrastre.
 *
 * Gracias a eso esta lógica se puede probar sin base de datos ni `.env`.
 */

import crypto from 'node:crypto';

/** Ventana de validez del token de recuperación. Corta a propósito. */
export const RESET_TTL_MINUTOS = 30;

/** Token de 32 bytes en hex: 256 bits de entropía, imposible de adivinar. */
export function generarToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash determinístico del token; es lo único que se persiste.
 *
 * Se usa SHA-256 y no bcrypt a propósito: el token ya tiene 256 bits de
 * entropía aleatoria, así que no hay nada que un ataque de diccionario pueda
 * aprovechar, y la búsqueda por `tokenHash` necesita ser determinística para
 * poder indexarse.
 */
export function hashearToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Comparación en tiempo constante. Con `===` el tiempo de respuesta filtra
 * cuántos caracteres iniciales coinciden.
 */
export function compararHashes(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  // timingSafeEqual lanza si las longitudes difieren; se atajan antes.
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Momento de expiración de un token emitido ahora. */
export function calcularExpiracion(desde: Date = new Date()): Date {
  return new Date(desde.getTime() + RESET_TTL_MINUTOS * 60 * 1000);
}

/** Un token vence cuando su fecha de expiración quedó atrás. */
export function estaVencido(expiresAt: Date, ahora: Date = new Date()): boolean {
  return expiresAt <= ahora;
}
