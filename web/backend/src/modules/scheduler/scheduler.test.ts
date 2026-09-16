/**
 * Tests del registro de tareas programadas.
 *
 * Verifica que el scheduler se registre con las expresiones cron correctas y en
 * el huso horario de Argentina, y que la condición de disparo de cada tarea sea
 * la que pide la consigna. No ejecuta los jobs: eso necesita base de datos.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

// El scheduler arrastra `config/env` a través de `db/prisma`, y ese módulo
// aborta el proceso si falta una variable. Se completan antes de importarlo.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'a'.repeat(48);
process.env.JWT_REFRESH_SECRET ??= 'b'.repeat(48);

// El proyecto compila a CommonJS, que no admite `await` de nivel superior:
// los imports dinámicos van dentro de `before`.
type ModScheduler = typeof import('./index.ts');
type ModPeriodos = typeof import('../facturacion/periodos.ts');

let detenerScheduler: ModScheduler['detenerScheduler'];
let estadoScheduler: ModScheduler['estadoScheduler'];
let iniciarScheduler: ModScheduler['iniciarScheduler'];
let DIA_RECORDATORIO: ModPeriodos['DIA_RECORDATORIO'];
let esUltimoDiaHabilDelMes: ModPeriodos['esUltimoDiaHabilDelMes'];

before(async () => {
  const scheduler = await import('./index.ts');
  const periodos = await import('../facturacion/periodos.ts');

  ({ detenerScheduler, estadoScheduler, iniciarScheduler } = scheduler);
  ({ DIA_RECORDATORIO, esUltimoDiaHabilDelMes } = periodos);
});

after(() => {
  // Un cron vivo mantiene el proceso abierto y el runner no termina.
  detenerScheduler?.();
});

test('el scheduler arranca y registra las tres tareas', () => {
  detenerScheduler();

  const cantidad = iniciarScheduler();
  assert.equal(cantidad, 3, 'facturación, recordatorio y marcado de vencimientos');
  assert.equal(estadoScheduler().activo, true);

  detenerScheduler();
  assert.equal(estadoScheduler().activo, false);
});

test('llamar a iniciarScheduler dos veces no duplica las tareas', () => {
  detenerScheduler();

  iniciarScheduler();
  const segunda = iniciarScheduler();

  // Duplicarlas mandaría los mails dos veces.
  assert.equal(segunda, 3);

  detenerScheduler();
});

test('las tareas usan el huso horario de Argentina', () => {
  // Sin fijarlo, una tarea de "fin de mes" en UTC puede caer el día 1 a las
  // 21:00 hora local del mes anterior.
  assert.equal(estadoScheduler().timezone, 'America/Argentina/Buenos_Aires');
});

test('el estado describe las tres tareas con su condición de disparo', () => {
  const estado = estadoScheduler();
  assert.equal(estado.tareas.length, 3);

  const facturacion = estado.tareas.find((t) => t.nombre === 'Facturación mensual');
  assert.ok(facturacion);
  assert.match(facturacion.condicion, /último día hábil/i);

  const recordatorio = estado.tareas.find((t) => t.nombre === 'Recordatorio de deuda');
  assert.ok(recordatorio);
  assert.match(recordatorio.condicion, new RegExp(`día ${DIA_RECORDATORIO}`));
});

test('las expresiones cron son diarias: la condición fina la evalúa el job', () => {
  // "El último día hábil del mes" no se puede expresar en sintaxis cron, porque
  // depende de feriados. Por eso el cron corre todos los días y el job decide.
  for (const tarea of estadoScheduler().tareas) {
    const campos = tarea.cron.split(' ');
    assert.equal(campos.length, 5, `"${tarea.cron}" debería tener 5 campos`);
    assert.equal(campos[2], '*', 'el día del mes lo decide el job, no el cron');
    assert.equal(campos[3], '*', 'el mes debe ser comodín');
    assert.equal(campos[4], '*', 'el día de la semana debe ser comodín');
  }
});

test('la condición de la facturación coincide con el cálculo de días hábiles', () => {
  // La tarea 1 dispara cuando `esUltimoDiaHabilDelMes` es verdadero; en 2026 eso
  // pasa exactamente 12 veces. Es el mismo invariante que cubre periodos.test.ts,
  // verificado acá desde la perspectiva del scheduler.
  let disparos = 0;
  const cursor = new Date(Date.UTC(2026, 0, 1));

  while (cursor.getUTCFullYear() === 2026) {
    if (esUltimoDiaHabilDelMes(cursor)) disparos++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  assert.equal(disparos, 12);
});
