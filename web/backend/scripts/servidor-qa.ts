/**
 * Levanta la pila completa (PostgreSQL embebido + migraciones + seed + API +
 * frontend estático) en un puerto fijo y queda esperando.
 *
 * Es para revisar los paneles en un navegador real sin tocar la base de
 * desarrollo. Se detiene con Ctrl-C.
 *
 *   pnpm --filter backend qa
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname ?? __dirname, '..');
const PUERTO = Number(process.env.PUERTO_QA ?? 4599);

async function main() {
  const { DATABASE_URL, levantar } = await import('./db-test.ts');

  console.log('Levantando PostgreSQL 15 embebido…');
  const pg = await levantar();

  process.env.DATABASE_URL = DATABASE_URL;
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(48);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(48);

  const entorno = { ...process.env, DATABASE_URL };
  const correr = (titulo: string, args: string[]) => {
    const r = spawnSync('pnpm', args, { cwd: RAIZ, env: entorno, stdio: 'inherit', shell: true });
    if (r.status !== 0) throw new Error(`${titulo} falló con código ${r.status}`);
  };

  correr('MIGRACIONES', ['exec', 'prisma', 'migrate', 'deploy']);
  correr('SEED', ['exec', 'tsx', 'prisma/seed.ts']);

  const { createApp } = await import('../src/app.ts');
  const server = createApp().listen(PUERTO);

  console.log(`\nListo: http://127.0.0.1:${PUERTO}`);
  console.log('Usuario administrador: fabriynahuel / 123456\n');

  const detener = async () => {
    server.close();
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void detener());
  process.on('SIGTERM', () => void detener());
}

main().catch((err) => {
  console.error('No se pudo levantar el entorno de QA:', err);
  process.exit(1);
});
