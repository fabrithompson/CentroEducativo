/**
 * Prueba de humo del circuito de autenticación, contra PostgreSQL real.
 *
 * Lo que verifica y ninguna prueba con doble puede verificar: que el refresh
 * token efectivamente deje de servir cuando cambia la contraseña. Esa es la
 * parte que estuvo rota mucho tiempo sin que se notara —el campo `v` del token
 * se incrementaba en cada renovación y no se contrastaba contra nada—, y el
 * modo de fallar es silencioso: todo parece funcionar, sólo que la revocación
 * no revoca.
 *
 *   pnpm --filter backend exec tsx scripts/humo-auth.ts
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { Server } from 'node:http';

const RAIZ = path.resolve(import.meta.dirname ?? __dirname, '..');

let fallas = 0;
let pasos = 0;

function afirmar(condicion: boolean, titulo: string, detalle?: unknown) {
  pasos += 1;
  if (condicion) {
    console.log(`  [OK]    ${titulo}`);
  } else {
    fallas += 1;
    console.log(`  [FALLA] ${titulo}`);
    if (detalle !== undefined) console.log(`          ${JSON.stringify(detalle)}`);
  }
}

/** Extrae la cookie de refresco de un `set-cookie`. */
function cookieDe(res: Response): string | null {
  const bruto = res.headers.getSetCookie?.() ?? [];
  for (const c of bruto) {
    if (c.startsWith('et_refresh=')) return c.split(';')[0]!;
  }
  return null;
}

async function main() {
  const { DATABASE_URL, levantar } = await import('./db-test.ts');

  console.log('Levantando PostgreSQL 15 embebido…');
  const pg = await levantar();

  process.env.DATABASE_URL = DATABASE_URL;
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(48);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(48);

  let server: Server | undefined;

  try {
    const entorno = { ...process.env, DATABASE_URL };
    const correr = (titulo: string, args: string[]) => {
      const r = spawnSync('pnpm', args, { cwd: RAIZ, env: entorno, stdio: 'inherit', shell: true });
      if (r.status !== 0) throw new Error(`${titulo} falló con código ${r.status}`);
    };

    console.log('\nAplicando migraciones…');
    correr('MIGRACIONES', ['exec', 'prisma', 'migrate', 'deploy']);
    console.log('\nCargando el seed…');
    correr('SEED', ['exec', 'tsx', 'prisma/seed.ts']);

    const { createApp } = await import('../src/app.ts');
    server = createApp().listen(0);
    const dir = server.address();
    if (!dir || typeof dir === 'string') throw new Error('no se pudo abrir el puerto');
    const base = `http://127.0.0.1:${dir.port}`;

    const pedir = (metodo: string, ruta: string, body?: unknown, cookie?: string) =>
      fetch(base + ruta, {
        method: metodo,
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });

    // ------------------------------------------------------------------
    console.log('\n=== Ingreso ===');
    const ingreso = await pedir('POST', '/api/auth/login', {
      usuario: 'jgarcia',
      password: '123456',
    });
    const cuerpoIngreso = (await ingreso.json()) as Record<string, any>;
    afirmar(ingreso.status === 200, 'el docente del seed puede ingresar', cuerpoIngreso);

    const cookie = cookieDe(ingreso);
    afirmar(Boolean(cookie), 'el ingreso deja la cookie de refresco');
    const accessInicial = cuerpoIngreso?.usuario?.token as string;

    // ------------------------------------------------------------------
    console.log('\n=== La renovación funciona antes del cambio ===');
    const renovar1 = await pedir('POST', '/api/auth/refresh', undefined, cookie!);
    const cuerpoRenovar1 = (await renovar1.json()) as Record<string, any>;
    afirmar(renovar1.status === 200, 'la cookie recién emitida renueva el acceso', cuerpoRenovar1);

    const cookieRenovada = cookieDe(renovar1) ?? cookie!;
    const renovar2 = await pedir('POST', '/api/auth/refresh', undefined, cookieRenovada);
    afirmar(renovar2.status === 200, 'la cookie renovada vuelve a renovar');

    // ------------------------------------------------------------------
    console.log('\n=== El cambio de contraseña revoca ===');
    // `change-password` exige sesión iniciada: va con el access token en el
    // encabezado, no con la cookie de refresco.
    const cambio = await fetch(base + '/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessInicial}` },
      body: JSON.stringify({ actual: '123456', nueva: 'claveNueva2026' }),
    });
    const cuerpoCambio = (await cambio.json()) as Record<string, any>;
    afirmar(cambio.status === 200, 'la contraseña se cambia', cuerpoCambio);

    const renovarTrasCambio = await pedir('POST', '/api/auth/refresh', undefined, cookieRenovada);
    const cuerpoTrasCambio = (await renovarTrasCambio.json()) as Record<string, any>;
    afirmar(
      renovarTrasCambio.status === 401,
      'REGLA: el refresh token anterior deja de servir tras cambiar la contraseña',
      { status: renovarTrasCambio.status, cuerpo: cuerpoTrasCambio },
    );
    afirmar(
      typeof cuerpoTrasCambio.message === 'string' && /contraseña/i.test(cuerpoTrasCambio.message),
      'y el motivo dice que fue por el cambio de contraseña',
      cuerpoTrasCambio.message,
    );

    // ------------------------------------------------------------------
    console.log('\n=== La contraseña vieja ya no entra, la nueva sí ===');
    const vieja = await pedir('POST', '/api/auth/login', {
      usuario: 'jgarcia',
      password: '123456',
    });
    afirmar(vieja.status === 401, 'la contraseña anterior se rechaza');

    const nueva = await pedir('POST', '/api/auth/login', {
      usuario: 'jgarcia',
      password: 'claveNueva2026',
    });
    afirmar(nueva.status === 200, 'la contraseña nueva permite ingresar');

    const cookieNueva = cookieDe(nueva);
    const renovarNueva = await pedir('POST', '/api/auth/refresh', undefined, cookieNueva!);
    afirmar(renovarNueva.status === 200, 'y su cookie renueva sin problemas');

    // ------------------------------------------------------------------
    console.log('\n=== Otras defensas del circuito ===');
    const sinCookie = await pedir('POST', '/api/auth/refresh');
    afirmar(sinCookie.status === 401, 'sin cookie no se renueva');

    const cookieRota = await pedir('POST', '/api/auth/refresh', undefined, 'et_refresh=no-es-un-jwt');
    afirmar(cookieRota.status === 401, 'una cookie manipulada se rechaza');

    const inexistente = await pedir('POST', '/api/auth/login', {
      usuario: 'no-existe-nadie',
      password: 'loquesea',
    });
    afirmar(inexistente.status === 401, 'un usuario inexistente se rechaza con 401');
  } finally {
    server?.close();
    await pg.stop();
    console.log('\nPostgreSQL detenido.');
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(fallas === 0 ? `TODO OK — ${pasos} comprobaciones` : `${fallas} de ${pasos} fallaron`);
  console.log('='.repeat(60));

  process.exit(fallas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nLa prueba de humo se interrumpió:', err);
  process.exit(1);
});
