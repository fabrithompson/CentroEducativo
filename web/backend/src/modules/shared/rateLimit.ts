/**
 * Limitador de intentos en memoria, sin dependencias.
 *
 * Cubre el hallazgo 5.3 de la auditoría para los endpoints sensibles: login y
 * recuperación de contraseña. Sin esto, probar tokens de reseteo por fuerza
 * bruta es gratis.
 *
 * Limitación conocida: el estado vive en el proceso. Con varias instancias detrás
 * de un balanceador cada una lleva su propia cuenta. Para el alcance del TP
 * alcanza; en producción real esto va a Redis.
 */

import type { RequestHandler } from 'express';

import { HttpError } from '../../utils/httpError';

interface Intento {
  contador: number;
  reiniciaEn: number;
}

const registros = new Map<string, Intento>();

/** Evita que el Map crezca sin techo si llegan muchas claves distintas. */
const MAX_CLAVES = 10_000;

function limpiarVencidos(ahora: number): void {
  for (const [clave, intento] of registros) {
    if (intento.reiniciaEn <= ahora) registros.delete(clave);
  }
}

export interface RateLimitOpts {
  /** Intentos permitidos dentro de la ventana. */
  max: number;
  /** Duración de la ventana, en milisegundos. */
  ventanaMs: number;
  /** Cómo se identifica al solicitante. Por defecto, su IP. */
  clave?: (req: Parameters<RequestHandler>[0]) => string;
  mensaje?: string;
}

export function rateLimit(opts: RateLimitOpts): RequestHandler {
  const { max, ventanaMs, mensaje } = opts;
  const obtenerClave = opts.clave ?? ((req) => req.ip ?? 'desconocida');

  return (req, res, next) => {
    const ahora = Date.now();

    if (registros.size > MAX_CLAVES) limpiarVencidos(ahora);

    const clave = `${req.method}:${req.baseUrl}${req.path}:${obtenerClave(req)}`;
    const actual = registros.get(clave);

    if (!actual || actual.reiniciaEn <= ahora) {
      registros.set(clave, { contador: 1, reiniciaEn: ahora + ventanaMs });
      next();
      return;
    }

    actual.contador += 1;

    if (actual.contador > max) {
      const segundos = Math.ceil((actual.reiniciaEn - ahora) / 1000);
      res.setHeader('Retry-After', String(segundos));
      next(
        new HttpError(
          429,
          mensaje ?? `Demasiados intentos. Probá de nuevo en ${segundos} segundos.`,
        ),
      );
      return;
    }

    next();
  };
}

/** Sólo para los tests: vacía el estado acumulado. */
export function resetRateLimit(): void {
  registros.clear();
}
