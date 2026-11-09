import test from 'node:test';
import assert from 'node:assert/strict';

import { leerImporte, validarClaveNueva, validarSolicitudCursado } from './formularios.ts';

// ------------------------------------------------------------------
// Contraseña nueva
// ------------------------------------------------------------------

test('una contraseña nueva válida pasa', () => {
  assert.equal(validarClaveNueva('vieja123', 'Nueva2026', 'Nueva2026'), null);
});

test('la contraseña nueva sigue la política del backend', () => {
  assert.match(validarClaveNueva('x', 'corta1', 'corta1')!, /al menos 8/);
  assert.match(validarClaveNueva('x', 'solamenteletras', 'solamenteletras')!, /letras y números/);
  assert.match(validarClaveNueva('x', '12345678', '12345678')!, /letras y números/);
});

test('las dos contraseñas nuevas tienen que coincidir y diferir de la actual', () => {
  assert.match(validarClaveNueva('x', 'Nueva2026', 'Nueva2027')!, /no coinciden/);
  assert.match(validarClaveNueva('Igual2026', 'Igual2026', 'Igual2026')!, /distinta/);
  assert.match(validarClaveNueva('', 'Nueva2026', 'Nueva2026')!, /actual/);
});

// ------------------------------------------------------------------
// Importes
// ------------------------------------------------------------------

test('leerImporte entiende los formatos argentinos', () => {
  assert.deepEqual(leerImporte('104000'), { valor: 104000 });
  assert.deepEqual(leerImporte('104.000'), { valor: 104000 });
  assert.deepEqual(leerImporte('$ 104.000,50'), { valor: 104000.5 });
  assert.deepEqual(leerImporte('22000,5'), { valor: 22000.5 });
});

test('leerImporte rechaza lo que no es un importe positivo', () => {
  for (const malo of ['', 'abc', '10.00', '1,234', '0', '-5', '1.2.3']) {
    assert.ok('error' in leerImporte(malo), malo);
  }
});

// ------------------------------------------------------------------
// Solicitud de inscripción al cursado
// ------------------------------------------------------------------

const VALIDA = {
  nombreTutor: 'Patricia Medina',
  emailTutor: 'p.medina@et.edu.ar',
  telefonoTutor: '362 442-5100',
  nombreEstudiante: 'Tomás Medina',
  nivel: 'Primario',
  curso: '1er Grado',
};

test('una solicitud completa pasa', () => {
  assert.equal(validarSolicitudCursado(VALIDA), null);
});

test('la solicitud marca el primer dato que falta o está mal', () => {
  assert.match(validarSolicitudCursado({ ...VALIDA, emailTutor: 'sin-arroba' })!, /correo/);
  assert.match(validarSolicitudCursado({ ...VALIDA, telefonoTutor: '12' })!, /teléfono/);
  assert.match(validarSolicitudCursado({ ...VALIDA, nombreEstudiante: ' ' })!, /estudiante/);
  assert.match(validarSolicitudCursado({ ...VALIDA, nivel: '' })!, /nivel/);
  assert.match(validarSolicitudCursado({ ...VALIDA, curso: '' })!, /curso/);
});
