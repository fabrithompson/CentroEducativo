/**
 * Tests del dominio de horarios deportivos.
 *
 * Se ejecutan con el runner nativo de Node (>=22), sin dependencias ni base de
 * datos:  `node --test src/modules/deportes/horarios.test.ts`
 * o bien  `pnpm --filter backend test`
 *
 * Cubren las dos reglas que la cátedra declara estrictas:
 *   - máximo 2 deportes simultáneos por alumno;
 *   - sin solapamiento de horarios entre deportes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_DEPORTES_POR_ALUMNO,
  asignarSlotLibre,
  describirConflicto,
  detectarConflictos,
  esFranjaValida,
  haySolapamiento,
  horaAMinutos,
  minutosAHora,
  type FranjaDeDeporte,
} from './horarios.ts';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function franja(
  deporteId: number,
  deporteNombre: string,
  diaSemana: FranjaDeDeporte['diaSemana'],
  desde: string,
  hasta: string,
): FranjaDeDeporte {
  return {
    deporteId,
    deporteNombre,
    diaSemana,
    horaInicio: horaAMinutos(desde),
    horaFin: horaAMinutos(hasta),
  };
}

const FUTBOL_MARTES = franja(1, 'Fútbol', 'MARTES', '17:00', '18:30');
const BASQUET_MARTES = franja(2, 'Básquet', 'MARTES', '17:00', '18:30');
const VOLEY_LUNES = franja(3, 'Vóley', 'LUNES', '17:00', '18:30');
const HANDBALL_MARTES_TARDE = franja(4, 'Handball', 'MARTES', '18:30', '20:00');

// ------------------------------------------------------------------
// Conversión de horas
// ------------------------------------------------------------------

test('horaAMinutos convierte correctamente', () => {
  assert.equal(horaAMinutos('00:00'), 0);
  assert.equal(horaAMinutos('07:30'), 450);
  assert.equal(horaAMinutos('12:00'), 720);
  assert.equal(horaAMinutos('18:45'), 1125);
  assert.equal(horaAMinutos('23:59'), 1439);
});

test('minutosAHora es la inversa de horaAMinutos', () => {
  for (const h of ['00:00', '07:30', '12:00', '18:45', '23:59']) {
    assert.equal(minutosAHora(horaAMinutos(h)), h);
  }
});

test('horaAMinutos rechaza formatos y rangos inválidos', () => {
  for (const malo of ['24:00', '7:30', '12:60', 'mediodía', '', '18:5']) {
    assert.throws(() => horaAMinutos(malo), RangeError, `debería rechazar "${malo}"`);
  }
});

test('esFranjaValida exige fin posterior al inicio y rango de un día', () => {
  assert.ok(esFranjaValida({ diaSemana: 'LUNES', horaInicio: 450, horaFin: 540 }));
  assert.ok(!esFranjaValida({ diaSemana: 'LUNES', horaInicio: 540, horaFin: 450 }));
  assert.ok(!esFranjaValida({ diaSemana: 'LUNES', horaInicio: 450, horaFin: 450 }));
  assert.ok(!esFranjaValida({ diaSemana: 'LUNES', horaInicio: -1, horaFin: 100 }));
  assert.ok(!esFranjaValida({ diaSemana: 'LUNES', horaInicio: 0, horaFin: 1441 }));
  assert.ok(!esFranjaValida({ diaSemana: 'LUNES', horaInicio: 10.5, horaFin: 100 }));
});

// ------------------------------------------------------------------
// Regla: sin solapamiento de horarios
// ------------------------------------------------------------------

test('dos actividades idénticas el mismo día se solapan', () => {
  assert.ok(haySolapamiento(FUTBOL_MARTES, BASQUET_MARTES));
});

test('el mismo horario en días distintos no se solapa', () => {
  assert.ok(!haySolapamiento(FUTBOL_MARTES, franja(9, 'X', 'JUEVES', '17:00', '18:30')));
  assert.ok(!haySolapamiento(FUTBOL_MARTES, VOLEY_LUNES));
});

test('actividades consecutivas no se solapan (extremos semiabiertos)', () => {
  // Fútbol termina 18:30, Handball arranca 18:30: el alumno llega justo.
  assert.ok(!haySolapamiento(FUTBOL_MARTES, HANDBALL_MARTES_TARDE));
  assert.ok(!haySolapamiento(HANDBALL_MARTES_TARDE, FUTBOL_MARTES));
});

test('un solapamiento parcial cuenta como conflicto', () => {
  const natacion = franja(5, 'Natación', 'MARTES', '18:00', '19:30');
  assert.ok(haySolapamiento(FUTBOL_MARTES, natacion));
  assert.ok(haySolapamiento(natacion, FUTBOL_MARTES));
});

test('una actividad contenida dentro de otra cuenta como conflicto', () => {
  const ajedrez = franja(6, 'Ajedrez', 'MARTES', '17:15', '18:00');
  assert.ok(haySolapamiento(FUTBOL_MARTES, ajedrez));
  assert.ok(haySolapamiento(ajedrez, FUTBOL_MARTES));
});

test('haySolapamiento es simétrico', () => {
  const casos: [FranjaDeDeporte, FranjaDeDeporte][] = [
    [FUTBOL_MARTES, BASQUET_MARTES],
    [FUTBOL_MARTES, HANDBALL_MARTES_TARDE],
    [FUTBOL_MARTES, VOLEY_LUNES],
  ];
  for (const [a, b] of casos) {
    assert.equal(haySolapamiento(a, b), haySolapamiento(b, a));
  }
});

test('detectarConflictos encuentra el cruce entre Fútbol y Básquet los martes', () => {
  const conflictos = detectarConflictos([BASQUET_MARTES], [FUTBOL_MARTES]);
  assert.equal(conflictos.length, 1);
  assert.equal(conflictos[0].dia, 'MARTES');
  assert.equal(conflictos[0].nuevo.deporteNombre, 'Básquet');
  assert.equal(conflictos[0].existente.deporteNombre, 'Fútbol');
});

test('detectarConflictos no reporta nada cuando los días no coinciden', () => {
  assert.deepEqual(detectarConflictos([VOLEY_LUNES], [FUTBOL_MARTES]), []);
});

test('detectarConflictos ignora el mismo deporte contra sí mismo', () => {
  const otraSesion = franja(1, 'Fútbol', 'MARTES', '17:00', '18:30');
  assert.deepEqual(detectarConflictos([otraSesion], [FUTBOL_MARTES]), []);
});

test('detectarConflictos evalúa todas las sesiones semanales del deporte', () => {
  // Hockey cursa miércoles y viernes; Vóley, lunes y miércoles. Cruzan el miércoles.
  const hockey = [
    franja(7, 'Hockey', 'MIERCOLES', '17:00', '18:30'),
    franja(7, 'Hockey', 'VIERNES', '17:00', '18:30'),
  ];
  const voley = [
    franja(3, 'Vóley', 'LUNES', '17:00', '18:30'),
    franja(3, 'Vóley', 'MIERCOLES', '17:00', '18:30'),
  ];

  const conflictos = detectarConflictos(hockey, voley);
  assert.equal(conflictos.length, 1);
  assert.equal(conflictos[0].dia, 'MIERCOLES');
});

test('detectarConflictos acumula cruces contra varios deportes ya cursados', () => {
  const nuevo = [franja(8, 'Atletismo', 'MARTES', '17:30', '19:00')];
  const existentes = [FUTBOL_MARTES, HANDBALL_MARTES_TARDE];

  const conflictos = detectarConflictos(nuevo, existentes);
  assert.equal(conflictos.length, 2);
});

test('describirConflicto produce un mensaje legible', () => {
  const [c] = detectarConflictos([BASQUET_MARTES], [FUTBOL_MARTES]);
  const msg = describirConflicto(c);
  assert.match(msg, /Básquet/);
  assert.match(msg, /Fútbol/);
  assert.match(msg, /Martes/);
  assert.match(msg, /17:00/);
  assert.match(msg, /18:30/);
});

// ------------------------------------------------------------------
// Regla: máximo 2 deportes por alumno
// ------------------------------------------------------------------

test('el máximo de deportes simultáneos es 2', () => {
  assert.equal(MAX_DEPORTES_POR_ALUMNO, 2);
});

test('asignarSlotLibre entrega el slot 1 cuando el alumno no cursa nada', () => {
  assert.equal(asignarSlotLibre([]), 1);
});

test('asignarSlotLibre entrega el slot 2 cuando ya cursa un deporte', () => {
  assert.equal(asignarSlotLibre([1]), 2);
});

test('asignarSlotLibre reutiliza el slot liberado por una baja', () => {
  assert.equal(asignarSlotLibre([2]), 1);
});

test('asignarSlotLibre devuelve null al llegar al máximo', () => {
  assert.equal(asignarSlotLibre([1, 2]), null);
  assert.equal(asignarSlotLibre([2, 1]), null);
});
