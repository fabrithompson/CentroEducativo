/**
 * Límite de intentos en el registro y en el login.
 *
 * No necesita PostgreSQL: el middleware `rateLimit` corre antes que el handler,
 * así que los pedidos de calentamiento se mandan con un cuerpo que Zod rechaza
 * y mueren en 400 sin llegar a la base. Lo que se verifica es el contador, no
 * el alta de usuarios.
 */

import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { Express } from 'express';

// `config/env` valida el entorno al importarse y aborta el proceso si falta
// algo. Se completa acá, antes del import dinámico de la app.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'a'.repeat(48);
process.env.JWT_REFRESH_SECRET ??= 'b'.repeat(48);

let server: Server;
let app: Express;
let base: string;
let resetRateLimit: () => void;

before(async () => {
  const { createApp } = await import('../../app.ts');
  ({ resetRateLimit } = await import('../shared/rateLimit.ts'));

  app = createApp();
  server = app.listen(0);

  const dir = server.address();
  if (!dir || typeof dir === 'string') throw new Error('no se pudo abrir el puerto');
  base = `http://127.0.0.1:${dir.port}`;
});

beforeEach(() => {
  // El contador vive en el módulo: sin esto, un test arrastra al siguiente.
  resetRateLimit();
});

after(() => {
  server?.close();
});

/** Cuerpo que Zod rechaza: llega al límite sin tocar PostgreSQL. */
function postear(ruta: string, body: unknown): Promise<Response> {
  return fetch(base + ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ------------------------------------------------------------------
// Registro
// ------------------------------------------------------------------

test('POST /api/auth/register corta al pasarse de 10 intentos por hora', async () => {
  for (let i = 1; i <= 10; i += 1) {
    const res = await postear('/api/auth/register', { tipo: 'padre' });
    assert.equal(res.status, 400, `el intento ${i} debería seguir permitido`);
  }

  const bloqueado = await postear('/api/auth/register', { tipo: 'padre' });
  assert.equal(bloqueado.status, 429);

  const cuerpo = (await bloqueado.json()) as { message?: string };
  assert.match(cuerpo.message ?? '', /Demasiados intentos de registro/);
});

test('el 429 del registro informa cuánto hay que esperar', async () => {
  for (let i = 0; i < 11; i += 1) await postear('/api/auth/register', {});

  const res = await postear('/api/auth/register', {});
  assert.equal(res.status, 429);

  // Sin `Retry-After` el cliente no tiene con qué decidir cuándo reintentar.
  const espera = Number(res.headers.get('retry-after'));
  assert.ok(Number.isFinite(espera) && espera > 0, 'falta la cabecera Retry-After');
  assert.ok(espera <= 3600, 'la espera no puede superar la ventana de una hora');
});

// ------------------------------------------------------------------
// Login
// ------------------------------------------------------------------

test('POST /api/auth/login corta al pasarse de 10 intentos por ventana', async () => {
  for (let i = 1; i <= 10; i += 1) {
    const res = await postear('/api/auth/login', { usuario: 'fabriynahuel' });
    assert.equal(res.status, 400, `el intento ${i} debería seguir permitido`);
  }

  const bloqueado = await postear('/api/auth/login', { usuario: 'fabriynahuel' });
  assert.equal(bloqueado.status, 429);
});

test('agotar el login de una cuenta no bloquea a las demás desde la misma IP', async () => {
  for (let i = 0; i < 11; i += 1) {
    await postear('/api/auth/login', { usuario: 'fabriynahuel' });
  }
  assert.equal(
    (await postear('/api/auth/login', { usuario: 'fabriynahuel' })).status,
    429,
    'la cuenta castigada tiene que estar bloqueada',
  );

  // Una escuela entera sale a internet por una sola IP. Si el contador fuera
  // sólo por IP, el chico que se equivoca diez veces dejaría afuera al resto
  // del turno; por eso la clave combina IP y usuario.
  const otra = await postear('/api/auth/login', { usuario: 'pmedina' });
  assert.equal(otra.status, 400, 'otra cuenta no debería pagar los intentos ajenos');
});

// ------------------------------------------------------------------
// Confianza en el proxy
// ------------------------------------------------------------------

test('fuera de producción no se confía en X-Forwarded-For', () => {
  // Si se confiara, cualquiera podría mandar una IP distinta en cada intento y
  // esquivar el límite entero. Sólo se activa detrás del edge de Railway.
  assert.equal(app.get('trust proxy'), 0);
});

test('el límite no se esquiva falseando X-Forwarded-For', async () => {
  for (let i = 0; i < 11; i += 1) {
    await fetch(base + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `203.0.113.${i}` },
      body: JSON.stringify({}),
    });
  }

  const res = await fetch(base + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '203.0.113.99' },
    body: JSON.stringify({}),
  });
  assert.equal(res.status, 429, 'cambiar la cabecera no debería reiniciar el contador');
});
