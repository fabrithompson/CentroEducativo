import test from 'node:test';
import assert from 'node:assert/strict';

import { mensajeDeError } from './errores';

test('un error de validación muestra el motivo de cada campo, no "Datos inválidos"', () => {
  const r = mensajeDeError({
    error: 'VALIDATION_ERROR',
    message: 'Datos inválidos',
    details: {
      numeroOperacion: ['Número de operación: tiene que tener al menos 3 caracteres.'],
      bancoOrigen: ['Banco de origen: no puede quedar vacío.'],
    },
  });
  assert.equal(
    r,
    'Número de operación: tiene que tener al menos 3 caracteres. Banco de origen: no puede quedar vacío.',
  );
});

test('sin detalle se usa el mensaje del servidor', () => {
  assert.equal(mensajeDeError({ message: 'La factura ya está saldada.' }), 'La factura ya está saldada.');
  assert.equal(mensajeDeError({ mensaje: 'Algo salió mal.' }), 'Algo salió mal.');
});

test('con detalle vacío también se usa el mensaje', () => {
  assert.equal(mensajeDeError({ message: 'Datos inválidos', details: {} }), 'Datos inválidos');
});

test('sin nada legible hay un texto por defecto', () => {
  assert.equal(mensajeDeError(null), 'No se pudo completar la operación.');
  assert.equal(mensajeDeError({}), 'No se pudo completar la operación.');
});
