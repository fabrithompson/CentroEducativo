/**
 * Tests de los helpers de paginación, rangos de fechas e importes.
 * Son funciones puras que usan todos los reportes: si acá hay un error,
 * se propaga a todos los listados del backoffice.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  aNumero,
  armarPagina,
  filtroFecha,
  paginacionSchema,
  rangoFechasSchema,
  redondear,
  toSkipTake,
} from './pagination.ts';

// ------------------------------------------------------------------
// Paginación
// ------------------------------------------------------------------

test('paginacionSchema aplica los valores por defecto', () => {
  const p = paginacionSchema.parse({});
  assert.equal(p.page, 1);
  assert.equal(p.pageSize, DEFAULT_PAGE_SIZE);
});

test('paginacionSchema acepta valores de query como texto', () => {
  const p = paginacionSchema.parse({ page: '3', pageSize: '50' });
  assert.equal(p.page, 3);
  assert.equal(p.pageSize, 50);
});

test('paginacionSchema rechaza páginas no positivas', () => {
  assert.throws(() => paginacionSchema.parse({ page: '0' }));
  assert.throws(() => paginacionSchema.parse({ page: '-1' }));
});

test('paginacionSchema pone techo al tamaño de página', () => {
  // Sin techo, un pageSize=100000 sería una denegación de servicio gratuita.
  assert.throws(() => paginacionSchema.parse({ pageSize: String(MAX_PAGE_SIZE + 1) }));
  assert.doesNotThrow(() => paginacionSchema.parse({ pageSize: String(MAX_PAGE_SIZE) }));
});

test('toSkipTake traduce página a offset', () => {
  assert.deepEqual(toSkipTake({ page: 1, pageSize: 20 }), { skip: 0, take: 20 });
  assert.deepEqual(toSkipTake({ page: 2, pageSize: 20 }), { skip: 20, take: 20 });
  assert.deepEqual(toSkipTake({ page: 5, pageSize: 10 }), { skip: 40, take: 10 });
});

test('armarPagina calcula el total de páginas', () => {
  assert.equal(armarPagina([], 0, { page: 1, pageSize: 20 }).totalPages, 0);
  assert.equal(armarPagina([], 1, { page: 1, pageSize: 20 }).totalPages, 1);
  assert.equal(armarPagina([], 20, { page: 1, pageSize: 20 }).totalPages, 1);
  assert.equal(armarPagina([], 21, { page: 1, pageSize: 20 }).totalPages, 2);
  assert.equal(armarPagina([], 100, { page: 1, pageSize: 20 }).totalPages, 5);
});

// ------------------------------------------------------------------
// Rangos de fechas
// ------------------------------------------------------------------

test('rangoFechasSchema acepta un rango válido', () => {
  const r = rangoFechasSchema.parse({ desde: '2026-01-01', hasta: '2026-12-31' });
  assert.equal(r.desde, '2026-01-01');
});

test('rangoFechasSchema acepta extremos sueltos', () => {
  assert.doesNotThrow(() => rangoFechasSchema.parse({ desde: '2026-01-01' }));
  assert.doesNotThrow(() => rangoFechasSchema.parse({ hasta: '2026-12-31' }));
  assert.doesNotThrow(() => rangoFechasSchema.parse({}));
});

test('rangoFechasSchema rechaza un rango invertido', () => {
  assert.throws(() => rangoFechasSchema.parse({ desde: '2026-12-31', hasta: '2026-01-01' }));
});

test('rangoFechasSchema rechaza formatos que no sean YYYY-MM-DD', () => {
  assert.throws(() => rangoFechasSchema.parse({ desde: '01/01/2026' }));
  assert.throws(() => rangoFechasSchema.parse({ desde: '2026-1-1' }));
});

test('filtroFecha incluye el día "hasta" completo', () => {
  const f = filtroFecha({ desde: '2026-03-01', hasta: '2026-03-31' })!;

  assert.equal(f.gte?.toISOString(), '2026-03-01T00:00:00.000Z');
  assert.equal(f.lte?.toISOString(), '2026-03-31T23:59:59.999Z');

  // Una transferencia hecha a las 20:00 del 31 tiene que entrar en el rango.
  const transferencia = new Date('2026-03-31T20:00:00.000Z');
  assert.ok(transferencia <= f.lte!, 'el último día debe quedar incluido');
});

test('filtroFecha devuelve undefined si no hay rango', () => {
  assert.equal(filtroFecha({}), undefined);
});

// ------------------------------------------------------------------
// Importes
// ------------------------------------------------------------------

test('aNumero convierte el Decimal de Prisma', () => {
  // Prisma devuelve un objeto con toString(); así se comporta en runtime.
  const decimalFalso = { toString: () => '104000.50' };
  assert.equal(aNumero(decimalFalso), 104000.5);
});

test('aNumero trata null y undefined como cero', () => {
  assert.equal(aNumero(null), 0);
  assert.equal(aNumero(undefined), 0);
});

test('aNumero deja pasar los números', () => {
  assert.equal(aNumero(1500), 1500);
  assert.equal(aNumero(0), 0);
});

test('redondear corrige el error de punto flotante', () => {
  assert.equal(redondear(0.1 + 0.2), 0.3);
  assert.equal(redondear(104000.555), 104000.56);
  assert.equal(redondear(1.005), 1.01);
});

test('redondear no altera un importe ya exacto', () => {
  assert.equal(redondear(46000), 46000);
  assert.equal(redondear(46000.25), 46000.25);
});
