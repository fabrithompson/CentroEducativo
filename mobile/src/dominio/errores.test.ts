import test from 'node:test';
import assert from 'node:assert/strict';

import { esImpresionCancelada, mensajeDeError } from './errores';

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

test('cerrar la hoja de impresión en iOS cuenta como cancelación, no como error', () => {
  const porCodigo = Object.assign(new Error('Calling the printAsync function has failed'), {
    code: 'ERR_PRINT_INCOMPLETE',
  });
  assert.equal(esImpresionCancelada(porCodigo), true);
  assert.equal(esImpresionCancelada(new Error('Printing did not complete')), true);
});

test('un error real de impresión o de red no se toma por cancelación', () => {
  assert.equal(esImpresionCancelada(new Error('No pudimos conectarnos con el colegio.')), false);
  assert.equal(esImpresionCancelada({ code: 'ERR_PRINTING_JOB_FAILED', message: 'Printing job encountered an error' }), false);
  assert.equal(esImpresionCancelada(null), false);
  assert.equal(esImpresionCancelada('Printing did not complete'), false);
});
