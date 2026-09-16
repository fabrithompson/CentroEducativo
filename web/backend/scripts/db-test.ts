/**
 * Levanta una instancia real de PostgreSQL para pruebas de integración.
 *
 * Usa `embedded-postgres`, que descarga y ejecuta las binarias oficiales de
 * PostgreSQL —no es un emulador—. Es lo que permite verificar los disparadores
 * en PL/pgSQL, las restricciones `CHECK` y el índice único parcial, que son
 * justamente lo que no se puede validar con un doble de prueba.
 *
 * Alternativa preferida en una máquina con Docker: `docker compose up -d db`,
 * que levanta el mismo PostgreSQL 15 definido en `docker-compose.yml`. Este
 * script existe para entornos sin Docker.
 *
 *   pnpm --filter backend db:test:up     levanta y aplica migraciones
 *   pnpm --filter backend db:test:down   detiene y borra
 */

import path from 'node:path';
import fs from 'node:fs';

import EmbeddedPostgres from 'embedded-postgres';

const RAIZ = path.resolve(import.meta.dirname ?? __dirname, '..');
const DIR_DATOS = path.join(RAIZ, '.tmp', 'pgdata');

export const CONFIG = {
  usuario: 'educar',
  password: 'educar',
  base: 'educar_transformar_test',
  puerto: 55432,
};

export const DATABASE_URL =
  `postgresql://${CONFIG.usuario}:${CONFIG.password}@localhost:${CONFIG.puerto}/${CONFIG.base}?schema=public`;

export function crearInstancia(): EmbeddedPostgres {
  return new EmbeddedPostgres({
    databaseDir: DIR_DATOS,
    user: CONFIG.usuario,
    password: CONFIG.password,
    port: CONFIG.puerto,
    persistent: false,
    // Sin esto, en Windows `initdb` toma el locale del sistema y crea la base
    // en WIN1252. Cualquier carácter fuera de Latin-1 en el SQL de una
    // migración —o en un apellido con caracteres poco comunes— falla con
    // "has no equivalent in encoding WIN1252". El servidor de producción usa
    // UTF8, así que la base de pruebas tiene que usar UTF8 también: si no, se
    // prueba contra una configuración distinta de la real.
    initdbFlags: ['--encoding=UTF8', '--lc-collate=C', '--lc-ctype=C'],
    onLog: () => {
      /* el log de PostgreSQL es muy ruidoso para la salida de los tests */
    },
  });
}

export async function levantar(): Promise<EmbeddedPostgres> {
  const pg = crearInstancia();

  // `persistent: false` deja el directorio para reusar; si quedó de una corrida
  // anterior interrumpida, se limpia para arrancar de cero.
  if (fs.existsSync(DIR_DATOS)) {
    fs.rmSync(DIR_DATOS, { recursive: true, force: true });
  }

  await pg.initialise();
  await pg.start();
  await pg.createDatabase(CONFIG.base);

  return pg;
}

// Ejecución directa: levanta, informa la URL y queda esperando.
const esEjecucionDirecta =
  process.argv[1] && process.argv[1].includes('db-test');

if (esEjecucionDirecta) {
  const accion = process.argv[2] ?? 'up';

  if (accion === 'down') {
    if (fs.existsSync(DIR_DATOS)) {
      fs.rmSync(DIR_DATOS, { recursive: true, force: true });
      console.log('Directorio de datos eliminado.');
    } else {
      console.log('No había datos que borrar.');
    }
  } else {
    levantar()
      .then(async (pg) => {
        console.log('PostgreSQL de pruebas levantado.');
        console.log(`DATABASE_URL="${DATABASE_URL}"`);

        const detener = async () => {
          await pg.stop();
          process.exit(0);
        };
        process.on('SIGINT', () => void detener());
        process.on('SIGTERM', () => void detener());
      })
      .catch((err) => {
        console.error('No se pudo levantar PostgreSQL:', err);
        process.exit(1);
      });
  }
}
