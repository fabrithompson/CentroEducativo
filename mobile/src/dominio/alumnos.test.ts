/**
 * Tests de la deuda en la lista de alumnos de Administración. El número lo
 * calcula el backend; acá se prueba que se cruce con el alumno correcto y que
 * el texto no mienta: un alumno sin fila en la morosidad está al día.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { deudaPorAlumno, tieneDeuda, textoDeuda, type DeudaAlumno } from './alumnos.ts';
import { moneda } from './formato.ts';

const gomez: DeudaAlumno = { alumnoId: 6, deuda: 141000, facturasImpagas: 2, mesesAdeudados: ['08/2026', '09/2026'] };
const perez: DeudaAlumno = { alumnoId: 2, deuda: 50000, facturasImpagas: 1, mesesAdeudados: ['09/2026'] };

test('deudaPorAlumno indexa cada fila por su alumno', () => {
  const mapa = deudaPorAlumno([gomez, perez]);
  assert.equal(mapa.size, 2);
  assert.equal(mapa.get(6), gomez);
  assert.equal(mapa.get(2), perez);
  assert.equal(mapa.get(1), undefined);
});

test('un alumno que no figura en la morosidad está al día', () => {
  assert.equal(textoDeuda(undefined), 'Al día');
  assert.equal(tieneDeuda(undefined), false);
});

test('una deuda en cero o negativa también es "al día"', () => {
  assert.equal(textoDeuda({ ...perez, deuda: 0 }), 'Al día');
  assert.equal(tieneDeuda({ ...perez, deuda: -10 }), false);
});

test('el texto dice cuánto, cuántas cuotas y de qué meses', () => {
  assert.equal(textoDeuda(gomez), `Debe ${moneda(141000)} · 2 cuotas (08/2026, 09/2026)`);
  assert.equal(tieneDeuda(gomez), true);
});

test('una sola cuota va en singular', () => {
  assert.equal(textoDeuda(perez), `Debe ${moneda(50000)} · 1 cuota (09/2026)`);
});

test('con muchos meses se nombran tres y se resume el resto', () => {
  const larga: DeudaAlumno = {
    alumnoId: 9,
    deuda: 500000,
    facturasImpagas: 5,
    mesesAdeudados: ['05/2026', '06/2026', '07/2026', '08/2026', '09/2026'],
  };
  assert.equal(textoDeuda(larga), `Debe ${moneda(500000)} · 5 cuotas (05/2026, 06/2026, 07/2026 y 2 más)`);
});

test('sin meses informados no deja paréntesis vacíos', () => {
  assert.equal(textoDeuda({ ...perez, mesesAdeudados: [] }), `Debe ${moneda(50000)} · 1 cuota`);
});
