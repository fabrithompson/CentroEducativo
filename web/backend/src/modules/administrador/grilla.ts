/**
 * Reglas de la grilla horaria de las materias.
 *
 * Un horario nuevo de una materia no puede superponerse con:
 *   - otra materia del **mismo curso**: los alumnos no pueden estar en dos
 *     aulas a la vez;
 *   - otra materia del **mismo docente**, aunque sea de otro curso o nivel.
 *
 * Módulo puro: recibe las franjas ya cargadas y devuelve el primer choque. La
 * comparación de franjas es la misma de los deportes (`haySolapamiento`, con
 * extremos semiabiertos), así un horario de 08:00 a 09:20 y otro de 09:20 a
 * 10:40 conviven sin problema.
 */

import { haySolapamiento, minutosAHora, type DiaSemana, type FranjaHoraria } from '../deportes/horarios';

export interface FranjaDeMateria extends FranjaHoraria {
  materiaId: number;
  materiaNombre: string;
  cursoId: number;
  cursoNombre: string;
  profesorId: number | null;
}

export interface ChoqueDeGrilla {
  motivo: 'curso' | 'docente';
  existente: FranjaDeMateria;
}

/**
 * Busca el primer choque de `nueva` contra `existentes`. Se ignoran las franjas
 * de la propia materia: dos horarios de la misma materia el mismo día los frena
 * el índice único, y uno que no se pisa con otro es una clase partida, válida.
 */
export function buscarChoque(
  nueva: FranjaDeMateria,
  existentes: readonly FranjaDeMateria[],
): ChoqueDeGrilla | null {
  for (const existente of existentes) {
    if (existente.materiaId === nueva.materiaId) continue;
    if (!haySolapamiento(nueva, existente)) continue;

    if (existente.cursoId === nueva.cursoId) return { motivo: 'curso', existente };
    if (nueva.profesorId !== null && existente.profesorId === nueva.profesorId) {
      return { motivo: 'docente', existente };
    }
  }
  return null;
}

const DIAS: Record<DiaSemana, string> = {
  LUNES: 'lunes',
  MARTES: 'martes',
  MIERCOLES: 'miércoles',
  JUEVES: 'jueves',
  VIERNES: 'viernes',
  SABADO: 'sábado',
};

/** Mensaje para el administrador, que dice con qué choca y por qué. */
export function describirChoque(nueva: FranjaDeMateria, choque: ChoqueDeGrilla): string {
  const e = choque.existente;
  const franja = `el ${DIAS[nueva.diaSemana]} de ${minutosAHora(nueva.horaInicio)} a ${minutosAHora(nueva.horaFin)}`;
  const otra = `${e.materiaNombre} (${minutosAHora(e.horaInicio)} a ${minutosAHora(e.horaFin)})`;
  return choque.motivo === 'curso'
    ? `${nueva.materiaNombre} ${franja} se superpone con ${otra}, del mismo curso.`
    : `${nueva.materiaNombre} ${franja} se superpone con ${otra} de ${e.cursoNombre}, que dicta el mismo docente.`;
}
