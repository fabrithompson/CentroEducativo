import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().url().default('http://localhost:5173'),

  // Cuántos proxies hay delante de la aplicación. Ver `TRUST_PROXY` más abajo:
  // sin esto el limitador de intentos cuenta a todos los visitantes como uno.
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).optional(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL es obligatorio'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().positive().default(20),

  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default(''),

  /**
   * Purga de datos vencidos según la política de retención (RNF-09).
   *
   * Arranca apagada a propósito: mientras sea `false` la tarea informa qué
   * borraría y no borra. Los plazos de `shared/retencion.ts` son una propuesta
   * razonada, no una decisión de la institución, y encenderla antes de que
   * alguien los confirme sería decidir por la escuela algo irreversible.
   */
  RETENCION_ACTIVA: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Variables de entorno inválidas:');
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;

/**
 * Valor para `app.set('trust proxy', …)`.
 *
 * Express, por omisión, toma como IP del cliente la del socket. Detrás del edge
 * de Railway esa IP es siempre la del proxy, así que todos los visitantes
 * comparten una única clave en `rateLimit`: el primero que se pasa del límite
 * deja afuera a todos los demás, y el atacante que se quiere frenar avanza
 * igual mientras los usuarios legítimos reciben 429.
 *
 * Confiar en `X-Forwarded-For` sin un proxy delante es peor todavía, porque la
 * cabecera la pone el cliente y se puede falsear una IP distinta en cada
 * intento, que es exactamente esquivar el límite. Por eso se activa solo en
 * producción, donde sí hay un proxy, y se puede forzar con la variable para
 * otras topologías (por ejemplo, dos saltos detrás de un CDN).
 */
export const TRUST_PROXY: number =
  parsed.data.TRUST_PROXY ?? (parsed.data.NODE_ENV === 'production' ? 1 : 0);
