/**
 * Test de cableo de la API.
 *
 * Levanta la aplicación Express real en un puerto efímero y verifica que cada
 * módulo esté montado y que sus guards disparen. No necesita PostgreSQL: todos
 * los casos se resuelven antes de tocar la base — `requireAuth` rechaza sin
 * token, y Zod rechaza la entrada inválida, ambos antes de cualquier query.
 *
 * Esto es lo que atrapa el error clásico de olvidarse un `router.use(...)` en
 * `routes/index.ts`, o dejar un endpoint sin `requireRole`.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';

// El módulo `config/env` valida el entorno al importarse y aborta el proceso si
// falta algo. Se completa acá, antes del import dinámico de la app.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'a'.repeat(48);
process.env.JWT_REFRESH_SECRET ??= 'b'.repeat(48);

let server: Server;
let base: string;

before(async () => {
  const { createApp } = await import('./app.ts');
  server = createApp().listen(0);

  const dir = server.address();
  if (!dir || typeof dir === 'string') throw new Error('no se pudo abrir el puerto');
  base = `http://127.0.0.1:${dir.port}`;
});

after(() => {
  server?.close();
});

async function pedir(
  metodo: string,
  ruta: string,
  opts: { body?: unknown; auth?: string } = {},
): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.auth) headers.Authorization = opts.auth;

  return fetch(base + ruta, {
    method: metodo,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
}

// ------------------------------------------------------------------
// La app arranca y responde
// ------------------------------------------------------------------

test('GET /health responde 200', async () => {
  const res = await pedir('GET', '/health');
  assert.equal(res.status, 200);

  const body = (await res.json()) as { status: string };
  assert.equal(body.status, 'ok');
});

test('GET /api/ responde con la versión de la API', async () => {
  const res = await pedir('GET', '/api/');
  assert.equal(res.status, 200);

  const body = (await res.json()) as { name: string; version: string };
  assert.match(body.name, /Transformar para educar/);
  assert.ok(body.version);
});

// ------------------------------------------------------------------
// Todos los módulos nuevos están montados y protegidos
// ------------------------------------------------------------------

const RUTAS_PROTEGIDAS: [string, string][] = [
  ['GET', '/api/alumnos'],
  ['GET', '/api/alumnos/1'],
  ['POST', '/api/alumnos'],
  ['PATCH', '/api/alumnos/1'],
  ['DELETE', '/api/alumnos/1'],
  ['POST', '/api/alumnos/1/tutores'],
  ['GET', '/api/profesores'],
  ['GET', '/api/profesores/1'],
  ['POST', '/api/profesores'],
  ['GET', '/api/deportes'],
  ['GET', '/api/deportes/1'],
  ['POST', '/api/deportes'],
  ['GET', '/api/deportes/alumno/1'],
  ['GET', '/api/deportes/alumno/1/disponibles'],
  ['POST', '/api/deportes/inscripciones'],
  ['DELETE', '/api/deportes/inscripciones/1'],
  ['GET', '/api/servicios/transporte/recorridos'],
  ['POST', '/api/servicios/transporte'],
  ['GET', '/api/servicios/comedor/planes'],
  ['POST', '/api/servicios/comedor'],
  ['GET', '/api/servicios/alumno/1'],
  ['GET', '/api/padres/mis-hijos'],
  ['GET', '/api/padres/mis-hijos/1'],
  ['GET', '/api/padres/mis-hijos/1/deportes'],
  ['GET', '/api/padres/mis-hijos/1/servicios'],
  ['GET', '/api/padres/mis-hijos/1/facturas'],
  ['GET', '/api/padres/mis-hijos/1/deuda'],
  ['GET', '/api/padres/mis-hijos/1/calificaciones'],
  ['GET', '/api/padres/mis-hijos/1/asistencia'],
  ['GET', '/api/reportes/alumnos-por-deporte'],
  ['GET', '/api/reportes/alumnos-por-transporte'],
  ['GET', '/api/reportes/pagos'],
  ['GET', '/api/reportes/ingresos'],
  ['GET', '/api/reportes/morosidad'],
  ['GET', '/api/facturacion/facturas'],
  ['GET', '/api/facturacion/facturas/1'],
  ['GET', '/api/facturacion/facturas/1/comprobante'],
  ['POST', '/api/facturacion/facturas/1/anular'],
  ['GET', '/api/facturacion/previsualizar'],
  ['POST', '/api/facturacion/generar'],
  ['GET', '/api/facturacion/comprobantes/pendientes'],
  ['POST', '/api/facturacion/comprobantes/1/validar'],
  ['GET', '/api/facturacion/tareas'],
  ['POST', '/api/facturacion/tareas/FACTURACION_MENSUAL/ejecutar'],
  ['POST', '/api/facturacion/tareas/marcar-vencidas'],
  ['GET', '/api/facturacion/emails'],
  ['GET', '/api/credenciales/alumno/1'],
  ['POST', '/api/credenciales/alumno/1/reemitir'],
  ['POST', '/api/credenciales/alumno/1/revocar'],
  ['POST', '/api/accesos/escanear'],
  ['GET', '/api/accesos'],
  ['GET', '/api/accesos/alumno/1'],
  ['GET', '/api/reportes/alumnos-por-materia'],
  ['POST', '/api/avisos'],
  ['GET', '/api/avisos'],
  ['POST', '/api/avisos/1/reintentar'],
  ['POST', '/api/transporte/posicion'],
  ['GET', '/api/transporte/1/posicion'],
  ['GET', '/api/transporte/seguimiento/1'],
];

test('ninguna ruta del sistema de gestión responde sin autenticación', async () => {
  const filtradas: string[] = [];

  for (const [metodo, ruta] of RUTAS_PROTEGIDAS) {
    const res = await pedir(metodo, ruta);
    // 401 es lo correcto. Un 404 significaría que el router no está montado.
    if (res.status !== 401) filtradas.push(`${metodo} ${ruta} -> ${res.status}`);
  }

  assert.deepEqual(filtradas, [], 'estas rutas no exigieron autenticación');
});

test('un token inválido se rechaza igual que la ausencia de token', async () => {
  const res = await pedir('GET', '/api/alumnos', { auth: 'Bearer esto-no-es-un-jwt' });
  assert.equal(res.status, 401);
});

test('un Authorization mal formado no se toma como válido', async () => {
  for (const auth of ['Basic dXNlcjpwYXNz', 'Bearer', 'jwt-suelto-sin-esquema']) {
    const res = await pedir('GET', '/api/alumnos', { auth });
    assert.equal(res.status, 401, `"${auth}" debería rechazarse`);
  }
});

// ------------------------------------------------------------------
// Validación de entrada
// ------------------------------------------------------------------

test('forgot-password rechaza un email mal formado', async () => {
  const res = await pedir('POST', '/api/auth/forgot-password', { body: { email: 'no-es-mail' } });
  assert.equal(res.status, 400);
});

test('reset-password rechaza un token que no tenga 64 caracteres', async () => {
  const res = await pedir('POST', '/api/auth/reset-password', {
    body: { token: 'abc', password: 'Passw0rd' },
  });
  assert.equal(res.status, 400);
});

test('reset-password exige contraseña de 8+ con letras y números', async () => {
  const debiles = ['corta', 'solamenteletras', '12345678'];

  for (const password of debiles) {
    const res = await pedir('POST', '/api/auth/reset-password', {
      body: { token: 'a'.repeat(64), password },
    });
    assert.equal(res.status, 400, `"${password}" debería rechazarse`);
  }
});

test('change-password exige sesión iniciada', async () => {
  const res = await pedir('POST', '/api/auth/change-password', {
    body: { actual: 'x', nueva: 'Passw0rd1' },
  });
  assert.equal(res.status, 401);
});

// ------------------------------------------------------------------
// Manejo de errores
// ------------------------------------------------------------------

test('una ruta inexistente responde 404 con el formato de error de la API', async () => {
  const res = await pedir('GET', '/api/no-existe');
  assert.equal(res.status, 404);

  const body = (await res.json()) as { error: string; message: string };
  assert.equal(body.error, 'NOT_FOUND');
  assert.match(body.message, /Ruta no encontrada/);
});
