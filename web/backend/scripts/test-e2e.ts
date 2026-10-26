/**
 * Pruebas end-to-end con Selenium WebDriver contra la pila completa.
 *
 * Levanta PostgreSQL, aplica las migraciones, carga el seed y arranca la API
 * con el frontend estático en un puerto libre —igual que `servidor-qa.ts`—, y
 * después corre `e2e/**\/*.e2e.ts` con un navegador real que hace clic y
 * escribe como lo haría una persona.
 *
 *   pnpm --filter backend test:e2e
 *
 * De dónde sale la base, igual que en `test-integracion.ts`:
 * - `DATABASE_URL_TEST` definida: se usa esa (CI, con service container).
 * - Si no, PostgreSQL 15 embebido (máquina de desarrollo, sin Docker).
 *
 * El navegador lo elige `E2E_NAVEGADOR` (`chrome` o `MicrosoftEdge`). Por
 * omisión, Edge en Windows —viene instalado— y Chrome en el resto, que es lo
 * que traen los runners de GitHub. Selenium Manager descarga el driver que
 * corresponde a la versión instalada; no hay que bajar nada a mano.
 */

import { spawn, spawnSync } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname ?? __dirname, '..');

async function prepararBase(): Promise<{ url: string; detener: () => Promise<void> }> {
  if (process.env.DATABASE_URL_TEST) {
    return { url: process.env.DATABASE_URL_TEST, detener: async () => {} };
  }
  // Import diferido: las variantes de Linux de embedded-postgres están
  // deshabilitadas y en CI este módulo no carga.
  const { DATABASE_URL, levantar } = await import('./db-test.ts');
  console.log('Levantando PostgreSQL 15 embebido…');
  const pg = await levantar();
  return { url: DATABASE_URL, detener: () => pg.stop() };
}

function correr(titulo: string, args: string[], entorno: NodeJS.ProcessEnv) {
  console.log(`\n== ${titulo}`);
  const r = spawnSync('pnpm', args, { cwd: RAIZ, env: entorno, stdio: 'inherit', shell: true });
  if (r.status !== 0) throw new Error(`${titulo} falló con código ${r.status}`);
}

async function main() {
  const base = await prepararBase();

  // Antes de importar la aplicación: Prisma y la configuración leen el
  // entorno en el momento de cargarse.
  Object.assign(process.env, {
    DATABASE_URL: base.url,
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
  });

  let codigo = 1;
  try {
    correr('MIGRACIONES', ['exec', 'prisma', 'migrate', 'deploy'], process.env);
    correr('SEED', ['exec', 'tsx', 'prisma/seed.ts'], process.env);

    const [{ createApp }, http, { Server: SocketIOServer }, { attachSockets }] = await Promise.all([
      import('../src/app.ts'),
      import('node:http'),
      import('socket.io'),
      import('../src/sockets/io.ts'),
    ]);
    const server = http.createServer(createApp());
    attachSockets(new SocketIOServer(server, { cors: { origin: true, credentials: true } }));
    await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    console.log(`\n== API y frontend en ${url}`);

    // `spawn` y no `spawnSync`: el servidor vive en este mismo proceso, y un
    // spawnSync bloquearía el event loop justo cuando el navegador le pide
    // las páginas.
    codigo = await new Promise<number>((ok) => {
      const hijo = spawn(process.execPath, ['--import', 'tsx', '--test', 'e2e/**/*.e2e.ts'], {
        cwd: RAIZ,
        env: { ...process.env, E2E_URL: url },
        stdio: 'inherit',
      });
      hijo.on('exit', (c) => ok(c ?? 1));
    });

    server.close();
    // Cerrar el pool antes de apagar PostgreSQL; si no, Prisma registra
    // «connection reset» y parece una falla que no lo es.
    const { prisma } = await import('../src/db/prisma.ts');
    await prisma.$disconnect();
  } finally {
    await base.detener();
  }

  console.log(codigo === 0 ? '\nE2E: TODO EN VERDE' : '\nE2E: HUBO FALLAS');
  process.exit(codigo);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
