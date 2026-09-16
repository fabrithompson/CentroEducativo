/**
 * Verificación de integración contra PostgreSQL real.
 *
 * Levanta una instancia embebida de PostgreSQL 15, aplica las 8 migraciones,
 * carga el seed y ejecuta la suite completa apuntando a esa base.
 *
 * Es lo que valida aquello que ninguna prueba con doble puede validar: que los
 * disparadores en PL/pgSQL compilen, que las restricciones `CHECK` sean
 * aceptadas por el dialecto, y que el índice único parcial haga cumplir el
 * máximo de dos deportes.
 *
 *   pnpm --filter backend test:integracion
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { DATABASE_URL, levantar } from './db-test';

const RAIZ = path.resolve(import.meta.dirname ?? __dirname, '..');

const entorno = {
  ...process.env,
  DATABASE_URL,
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'a'.repeat(48),
  JWT_REFRESH_SECRET: 'b'.repeat(48),
};

function correr(titulo: string, comando: string, args: string[]): boolean {
  console.log(`\n${'='.repeat(66)}\n${titulo}\n${'='.repeat(66)}`);

  const r = spawnSync(comando, args, {
    cwd: RAIZ,
    env: entorno,
    stdio: 'inherit',
    shell: true,
  });

  const ok = r.status === 0;
  console.log(ok ? `\n[OK] ${titulo}` : `\n[FALLA] ${titulo} (código ${r.status})`);
  return ok;
}

async function main() {
  console.log('Levantando PostgreSQL 15 embebido…');
  const pg = await levantar();
  console.log(`Listo. ${DATABASE_URL}\n`);

  let exito = true;

  try {
    // 1. Las 8 migraciones, incluidas las funciones y disparadores escritos a mano.
    exito = correr('MIGRACIONES', 'pnpm', ['exec', 'prisma', 'migrate', 'deploy']) && exito;

    // 2. El cliente tipado.
    if (exito) exito = correr('PRISMA GENERATE', 'pnpm', ['exec', 'prisma', 'generate']) && exito;

    // 3. Datos de demostración: ejercita las reglas de negocio al insertarlos.
    if (exito) exito = correr('SEED', 'pnpm', ['exec', 'tsx', 'prisma/seed.ts']) && exito;

    // 4. Pruebas de que los mecanismos del motor efectivamente rechazan.
    if (exito) {
      exito =
        correr('REGLAS EN EL MOTOR', 'node', [
          '--import',
          'tsx',
          '--test',
          'scripts/reglas-motor.test.ts',
        ]) && exito;
    }

    // 5. Suite completa del backend.
    if (exito) exito = correr('SUITE COMPLETA', 'pnpm', ['test']) && exito;
  } finally {
    await pg.stop();
    console.log('\nPostgreSQL detenido.');
  }

  console.log(`\n${'='.repeat(66)}`);
  console.log(exito ? 'VERIFICACIÓN DE INTEGRACIÓN: TODO EN VERDE' : 'VERIFICACIÓN DE INTEGRACIÓN: HUBO FALLAS');
  console.log('='.repeat(66));

  process.exit(exito ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
