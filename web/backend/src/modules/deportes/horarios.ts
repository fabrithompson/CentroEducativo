/**
 * Dominio puro de horarios deportivos.
 *
 * Este módulo no importa Prisma, Express ni nada de infraestructura: es lógica
 * de negocio pura y, por lo tanto, testeable sin base de datos. El trigger
 * `fn_validar_solapamiento_deporte` implementa exactamente el mismo predicado
 * en SQL; si alguna de las dos definiciones cambia, la otra debe cambiar igual.
 *
 * Convención horaria: minutos desde medianoche (0..1439). 7:30 => 450.
 */

/** Espejo del enum `DiaSemana` de Prisma, sin depender de `@prisma/client`. */
export type DiaSemana = 'LUNES' | 'MARTES' | 'MIERCOLES' | 'JUEVES' | 'VIERNES' | 'SABADO';

export const MAX_DEPORTES_POR_ALUMNO = 2;

export const MINUTOS_POR_DIA = 1440;

export interface FranjaHoraria {
  diaSemana: DiaSemana;
  /** Minutos desde medianoche, inclusive. */
  horaInicio: number;
  /** Minutos desde medianoche, exclusivo. */
  horaFin: number;
}

export interface FranjaDeDeporte extends FranjaHoraria {
  deporteId: number;
  deporteNombre: string;
}

export interface ConflictoHorario {
  dia: DiaSemana;
  nuevo: FranjaDeDeporte;
  existente: FranjaDeDeporte;
}

/** `450` -> `"07:30"`. */
export function minutosAHora(minutos: number): string {
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** `"07:30"` -> `450`. Lanza si el formato o el rango no son válidos. */
export function horaAMinutos(hora: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hora.trim());
  if (!match) {
    throw new RangeError(`Hora inválida: "${hora}". Formato esperado HH:MM entre 00:00 y 23:59.`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

export function esFranjaValida(franja: FranjaHoraria): boolean {
  const { horaInicio, horaFin } = franja;
  return (
    Number.isInteger(horaInicio) &&
    Number.isInteger(horaFin) &&
    horaInicio >= 0 &&
    horaInicio < MINUTOS_POR_DIA &&
    horaFin > 0 &&
    horaFin <= MINUTOS_POR_DIA &&
    horaFin > horaInicio
  );
}

/**
 * Dos franjas se solapan si caen el mismo día y sus intervalos se intersecan.
 *
 * El predicado es `aInicio < bFin && bInicio < aFin`. Los extremos son
 * semiabiertos a propósito: una actividad que termina 18:30 y otra que empieza
 * 18:30 NO se solapan, que es como lo entiende cualquier preceptor.
 */
export function haySolapamiento(a: FranjaHoraria, b: FranjaHoraria): boolean {
  if (a.diaSemana !== b.diaSemana) return false;
  return a.horaInicio < b.horaFin && b.horaInicio < a.horaFin;
}

/**
 * Devuelve todos los cruces entre los horarios del deporte que se quiere sumar
 * y los de los deportes que el alumno ya cursa. Se ignoran las franjas del
 * mismo deporte: reinscribirse al propio deporte no es un conflicto.
 */
export function detectarConflictos(
  nuevas: readonly FranjaDeDeporte[],
  existentes: readonly FranjaDeDeporte[],
): ConflictoHorario[] {
  const conflictos: ConflictoHorario[] = [];

  for (const nueva of nuevas) {
    for (const existente of existentes) {
      if (nueva.deporteId === existente.deporteId) continue;
      if (haySolapamiento(nueva, existente)) {
        conflictos.push({ dia: nueva.diaSemana, nuevo: nueva, existente });
      }
    }
  }

  return conflictos;
}

/** Mensaje legible para el primer conflicto, pensado para mostrarse al tutor. */
export function describirConflicto(c: ConflictoHorario): string {
  const dia = c.dia.charAt(0) + c.dia.slice(1).toLowerCase();
  return (
    `${c.nuevo.deporteNombre} (${dia} de ${minutosAHora(c.nuevo.horaInicio)} a ${minutosAHora(c.nuevo.horaFin)}) ` +
    `se superpone con ${c.existente.deporteNombre} ` +
    `(${minutosAHora(c.existente.horaInicio)} a ${minutosAHora(c.existente.horaFin)}), que el alumno ya cursa.`
  );
}

/**
 * Asigna el primer slot libre (1 o 2). Devolver `null` significa que el alumno
 * llegó al máximo de deportes simultáneos permitido por la regla de negocio.
 */
export function asignarSlotLibre(slotsOcupados: readonly number[]): number | null {
  for (let slot = 1; slot <= MAX_DEPORTES_POR_ALUMNO; slot++) {
    if (!slotsOcupados.includes(slot)) return slot;
  }
  return null;
}
