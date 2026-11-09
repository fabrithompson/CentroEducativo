/**
 * Tests de la grilla horaria de materias: qué choques se frenan y cuáles no.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { buscarChoque, describirChoque, type FranjaDeMateria } from './grilla.ts';
import { horaAMinutos } from '../deportes/horarios.ts';

function franja(
  materiaId: number,
  materiaNombre: string,
  cursoId: number,
  profesorId: number | null,
  dia: FranjaDeMateria['diaSemana'],
  desde: string,
  hasta: string,
): FranjaDeMateria {
  return {
    materiaId,
    materiaNombre,
    cursoId,
    cursoNombre: `Curso ${cursoId}`,
    profesorId,
    diaSemana: dia,
    horaInicio: horaAMinutos(desde),
    horaFin: horaAMinutos(hasta),
  };
}

// Profesor 1 da Álgebra en el curso 10 y en el curso 20.
const ALGEBRA_C10_LUNES = franja(1, 'Álgebra', 10, 1, 'LUNES', '08:00', '09:20');
const LITERATURA_C10_LUNES = franja(2, 'Literatura', 10, 2, 'LUNES', '09:20', '10:40');

test('dos materias del mismo curso que se pisan chocan por curso', () => {
  const nueva = franja(3, 'Historia', 10, 3, 'LUNES', '09:00', '10:00');
  const choque = buscarChoque(nueva, [ALGEBRA_C10_LUNES]);
  assert.equal(choque?.motivo, 'curso');
  assert.equal(choque?.existente.materiaNombre, 'Álgebra');
});

test('el mismo docente no puede dar dos clases a la vez en cursos distintos', () => {
  const nueva = franja(4, 'Álgebra', 20, 1, 'LUNES', '08:30', '09:50');
  const choque = buscarChoque(nueva, [ALGEBRA_C10_LUNES]);
  assert.equal(choque?.motivo, 'docente');
});

test('una clase que empieza justo cuando termina otra no choca', () => {
  assert.equal(buscarChoque(LITERATURA_C10_LUNES, [ALGEBRA_C10_LUNES]), null);
});

test('otro día u otro curso con otro docente no choca', () => {
  const otroDia = franja(3, 'Historia', 10, 3, 'MARTES', '08:00', '09:20');
  const otroCursoYDocente = franja(5, 'Biología', 20, 4, 'LUNES', '08:00', '09:20');
  assert.equal(buscarChoque(otroDia, [ALGEBRA_C10_LUNES]), null);
  assert.equal(buscarChoque(otroCursoYDocente, [ALGEBRA_C10_LUNES]), null);
});

test('las franjas de la propia materia no cuentan como choque', () => {
  const partida = franja(1, 'Álgebra', 10, 1, 'LUNES', '08:30', '09:00');
  assert.equal(buscarChoque(partida, [ALGEBRA_C10_LUNES]), null);
});

test('una materia sin docente asignado sólo choca por curso', () => {
  const sinDocente = franja(6, 'Taller', 20, null, 'LUNES', '08:00', '09:20');
  const otroSinDocente = franja(7, 'Coro', 30, null, 'LUNES', '08:00', '09:20');
  assert.equal(buscarChoque(sinDocente, [ALGEBRA_C10_LUNES, otroSinDocente]), null);
});

test('el mensaje nombra la materia, el día, las horas y el motivo', () => {
  const nueva = franja(4, 'Álgebra', 20, 1, 'MIERCOLES', '08:30', '09:50');
  const existente = franja(1, 'Álgebra', 10, 1, 'MIERCOLES', '08:00', '09:20');
  const msg = describirChoque(nueva, buscarChoque(nueva, [existente])!);
  assert.match(msg, /miércoles de 08:30 a 09:50/);
  assert.match(msg, /08:00 a 09:20/);
  assert.match(msg, /mismo docente/);
  assert.match(msg, /Curso 10/);
});
