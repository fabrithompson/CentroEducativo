/**
 * Verificación de integración contra PostgreSQL real.
 *
 * Aplica las 9 migraciones sobre un PostgreSQL real, carga el seed y ejecuta la
 * suite completa apuntando a esa base.
 *
 * Es lo que valida aquello que ninguna prueba con doble puede validar: que los
 * disparadores en PL/pgSQL compilen, que las restricciones `CHECK` sean
 * aceptadas por el dialecto, y que el índice único parcial haga cumplir el
 * máximo de dos deportes.
 *
 *   pnpm --filter backend test:integracion
 *
 * De dónde sale la base:
 *
 * - Si `DATABASE_URL_TEST` está definida, se usa esa y no se levanta nada. Es
 *   el camino de CI, donde PostgreSQL viene como service container, y también
 *   sirve para apuntar al `docker compose up -d db` de este repositorio.
 * - Si no, se levanta una instancia embebida de PostgreSQL 15. Es el camino de
 *   la máquina de desarrollo, que no tiene Docker.
 *
 * La distinción no es cosmética: `embedded-postgres` tiene sus variantes de
 * Linux deshabilitadas en `pnpm-workspace.yaml`, para no cargar ~100 MB de
 * binarias en la imagen de despliegue. Por eso el módulo que la usa se importa
 * en forma diferida y sólo cuando hace falta — importarlo arriba haría fallar
 * este script en CI antes de la primera línea útil.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname ?? __dirname, '..');

const URL_EXTERNA = process.env.DATABASE_URL_TEST;

interface BaseDePruebas {
  url: string;
  detener: () => Promise<void>;
  descripcion: string;
}

async function prepararBase(): Promise<BaseDePruebas> {
  if (URL_EXTERNA) {
    return {
      url: URL_EXTERNA,
      detener: async () => {},
      descripcion: 'PostgreSQL externo (DATABASE_URL_TEST)',
    };
  }

  const { DATABASE_URL, levantar } = await import('./db-test.ts');
  console.log('Levantando PostgreSQL 15 embebido…');
  const pg = await levantar();

  return {
    url: DATABASE_URL,
    detener: async () => {
      await pg.stop();
      console.log('\nPostgreSQL detenido.');
    },
    descripcion: 'PostgreSQL 15 embebido',
  };
}

let entorno: NodeJS.ProcessEnv;

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
  const base = await prepararBase();

  entorno = {
    ...process.env,
    DATABASE_URL: base.url,
    NODE_ENV: 'test',
    JWT_ACCESS_SECRET: 'a'.repeat(48),
    JWT_REFRESH_SECRET: 'b'.repeat(48),
  };

  console.log(`Listo. ${base.descripcion}.\n`);

  let exito = true;

  try {
    // 1. Las 9 migraciones, incluidas las funciones y disparadores escritos a mano.
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
    await base.detener();
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
