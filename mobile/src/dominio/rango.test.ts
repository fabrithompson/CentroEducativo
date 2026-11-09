/**
 * Tests del rango de meses con el que se filtran las cuotas.
 *
 * Lo que más importa acá es la consulta que viaja al backend: si el último día
 * del mes sale mal, la cuota de ese mes —que se emite justo al final— queda
 * afuera del listado sin ningún error a la vista.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  compararMeses,
  consultaDeRango,
  mesDe,
  mover,
  puedeMover,
  rangoInicial,
  sumarMeses,
  textoRango,
  ultimoDia,
  type RangoMeses,
} from './rango.ts';

const HOY = new Date('2026-11-09T10:00:00');

// ------------------------------------------------------------------
// Aritmética de meses
// ------------------------------------------------------------------

test('mesDe toma el mes local de la fecha', () => {
  assert.deepEqual(mesDe(HOY), { anio: 2026, mes: 11 });
});

test('sumarMeses cruza el fin de año hacia adelante', () => {
  assert.deepEqual(sumarMeses({ anio: 2026, mes: 11 }, 3), { anio: 2027, mes: 2 });
});

test('sumarMeses cruza el comienzo de año hacia atrás', () => {
  assert.deepEqual(sumarMeses({ anio: 2027, mes: 1 }, -1), { anio: 2026, mes: 12 });
  assert.deepEqual(sumarMeses({ anio: 2027, mes: 2 }, -14), { anio: 2025, mes: 12 });
});

test('sumarMeses con cero devuelve el mismo mes', () => {
  assert.deepEqual(sumarMeses({ anio: 2027, mes: 6 }, 0), { anio: 2027, mes: 6 });
});

test('compararMeses ordena por año y después por mes', () => {
  assert.ok(compararMeses({ anio: 2026, mes: 12 }, { anio: 2027, mes: 1 }) < 0);
  assert.ok(compararMeses({ anio: 2027, mes: 3 }, { anio: 2027, mes: 2 }) > 0);
  assert.equal(compararMeses({ anio: 2027, mes: 3 }, { anio: 2027, mes: 3 }), 0);
});

// ------------------------------------------------------------------
// Rango inicial y movimientos
// ------------------------------------------------------------------

test('rangoInicial abarca los últimos tres meses contando el actual', () => {
  assert.deepEqual(rangoInicial(HOY), {
    desde: { anio: 2026, mes: 9 },
    hasta: { anio: 2026, mes: 11 },
  });
});

test('rangoInicial cruza el año cuando hace falta', () => {
  assert.deepEqual(rangoInicial(new Date('2027-01-15T10:00:00')), {
    desde: { anio: 2026, mes: 11 },
    hasta: { anio: 2027, mes: 1 },
  });
});

test('rangoInicial nunca arma un rango de menos de un mes', () => {
  const r = rangoInicial(HOY, 0);
  assert.equal(compararMeses(r.desde, r.hasta), 0);
});

const MARZO_A_MAYO: RangoMeses = { desde: { anio: 2027, mes: 3 }, hasta: { anio: 2027, mes: 5 } };

test('mover corre el extremo pedido y deja el otro como estaba', () => {
  assert.deepEqual(mover(MARZO_A_MAYO, 'desde', -1), {
    desde: { anio: 2027, mes: 2 },
    hasta: { anio: 2027, mes: 5 },
  });
  assert.deepEqual(mover(MARZO_A_MAYO, 'hasta', 1), {
    desde: { anio: 2027, mes: 3 },
    hasta: { anio: 2027, mes: 6 },
  });
});

test('mover permite que desde y hasta queden en el mismo mes', () => {
  const r = mover(mover(MARZO_A_MAYO, 'desde', 1), 'desde', 1);
  assert.equal(compararMeses(r.desde, r.hasta), 0);
});

test('mover no deja desde después de hasta', () => {
  const unMes: RangoMeses = { desde: { anio: 2027, mes: 4 }, hasta: { anio: 2027, mes: 4 } };
  assert.equal(mover(unMes, 'desde', 1), unMes);
  assert.equal(mover(unMes, 'hasta', -1), unMes);
});

test('puedeMover refleja si la flecha tiene efecto', () => {
  const unMes: RangoMeses = { desde: { anio: 2027, mes: 4 }, hasta: { anio: 2027, mes: 4 } };
  assert.equal(puedeMover(unMes, 'desde', 1), false);
  assert.equal(puedeMover(unMes, 'hasta', -1), false);
  assert.equal(puedeMover(unMes, 'desde', -1), true);
  assert.equal(puedeMover(unMes, 'hasta', 1), true);
});

// ------------------------------------------------------------------
// Consulta al backend
// ------------------------------------------------------------------

test('ultimoDia conoce los meses de 30 y 31 días', () => {
  assert.equal(ultimoDia({ anio: 2027, mes: 4 }), 30);
  assert.equal(ultimoDia({ anio: 2027, mes: 12 }), 31);
});

test('ultimoDia distingue febrero de un año bisiesto', () => {
  assert.equal(ultimoDia({ anio: 2027, mes: 2 }), 28);
  assert.equal(ultimoDia({ anio: 2028, mes: 2 }), 29);
});

test('consultaDeRango va del primer día del mes inicial al último del final', () => {
  assert.deepEqual(consultaDeRango(MARZO_A_MAYO), { desde: '2027-03-01', hasta: '2027-05-31' });
});

test('consultaDeRango usa el formato AAAA-MM-DD que valida el backend', () => {
  const q = consultaDeRango({ desde: { anio: 2026, mes: 11 }, hasta: { anio: 2027, mes: 2 } });
  assert.match(q.desde, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(q.hasta, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(q, { desde: '2026-11-01', hasta: '2027-02-28' });
});

test('consultaDeRango de un solo mes lo cubre entero', () => {
  const abril: RangoMeses = { desde: { anio: 2027, mes: 4 }, hasta: { anio: 2027, mes: 4 } };
  assert.deepEqual(consultaDeRango(abril), { desde: '2027-04-01', hasta: '2027-04-30' });
});

// ------------------------------------------------------------------
// Texto
// ------------------------------------------------------------------

test('textoRango de un solo mes lo nombra una vez', () => {
  const abril: RangoMeses = { desde: { anio: 2027, mes: 4 }, hasta: { anio: 2027, mes: 4 } };
  assert.equal(textoRango(abril), 'abril 2027');
});

test('textoRango dentro de un año no repite el año', () => {
  assert.equal(textoRango(MARZO_A_MAYO), 'marzo a mayo 2027');
});

test('textoRango entre dos años nombra los dos', () => {
  assert.equal(
    textoRango({ desde: { anio: 2026, mes: 11 }, hasta: { anio: 2027, mes: 2 } }),
    'noviembre 2026 a febrero 2027',
  );
});
