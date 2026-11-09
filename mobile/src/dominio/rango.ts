/**
 * Rango de meses para filtrar las cuotas.
 *
 * La consigna pide el listado de facturas y comprobantes "en un período de
 * fechas". El backend ya lo resuelve: `GET /padres/mis-hijos/:id/facturas`
 * acepta `desde` y `hasta` (AAAA-MM-DD) y filtra por `fechaEmision`.
 *
 * El selector es por mes y no por día a propósito. Las facturas son mensuales y
 * el backend las emite el último día hábil del mes que facturan
 * (`fechaEmision` en `facturacion/periodos.ts`), así que pedir del 1 de marzo
 * al 31 de mayo trae exactamente las cuotas de marzo, abril y mayo. Con un
 * selector de días, elegir "del 5 al 20 de abril" devolvería una lista vacía y
 * la familia no tendría cómo saber por qué.
 *
 * Módulo puro y testeable, como el resto de `dominio/`.
 */

import { periodo } from './formato';

/** `mes` va de 1 a 12, como en el backend. */
export interface Mes {
  anio: number;
  mes: number;
}

export interface RangoMeses {
  desde: Mes;
  hasta: Mes;
}

export type Extremo = 'desde' | 'hasta';

/** El mes de una fecha, en hora local del teléfono. */
export function mesDe(fecha: Date = new Date()): Mes {
  return { anio: fecha.getFullYear(), mes: fecha.getMonth() + 1 };
}

/** Suma (o resta, con `n` negativo) meses, cruzando años si hace falta. */
export function sumarMeses(m: Mes, n: number): Mes {
  const total = m.anio * 12 + (m.mes - 1) + n;
  const anio = Math.floor(total / 12);
  return { anio, mes: total - anio * 12 + 1 };
}

/** Negativo si `a` es anterior a `b`, 0 si es el mismo mes, positivo si es posterior. */
export function compararMeses(a: Mes, b: Mes): number {
  return a.anio * 12 + a.mes - (b.anio * 12 + b.mes);
}

/**
 * Rango con el que se abre el filtro: los últimos `meses` meses, contando el
 * actual. Tres meses alcanzan para ver la cuota en curso y las dos anteriores,
 * que es donde suele estar lo que la familia viene a buscar.
 */
export function rangoInicial(hoy: Date = new Date(), meses = 3): RangoMeses {
  const hasta = mesDe(hoy);
  return { desde: sumarMeses(hasta, -(Math.max(1, meses) - 1)), hasta };
}

/**
 * Corre un extremo del rango. Si el movimiento dejaría `desde` después de
 * `hasta`, devuelve el mismo rango sin cambios: la pantalla deshabilita esa
 * flecha con `puedeMover`, y esto es la red por si igual llega el toque.
 */
export function mover(r: RangoMeses, extremo: Extremo, delta: number): RangoMeses {
  const candidato: RangoMeses = { ...r, [extremo]: sumarMeses(r[extremo], delta) };
  return compararMeses(candidato.desde, candidato.hasta) <= 0 ? candidato : r;
}

export function puedeMover(r: RangoMeses, extremo: Extremo, delta: number): boolean {
  return mover(r, extremo, delta) !== r;
}

/** Último día de un mes: 28, 29, 30 o 31. */
export function ultimoDia(m: Mes): number {
  return new Date(Date.UTC(m.anio, m.mes, 0)).getUTCDate();
}

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Traduce el rango a la consulta que espera el backend: del primer día del mes
 * inicial al último del mes final, en AAAA-MM-DD. El backend toma `hasta`
 * inclusive (lo lleva al final del día).
 */
export function consultaDeRango(r: RangoMeses): { desde: string; hasta: string } {
  return {
    desde: `${r.desde.anio}-${dosDigitos(r.desde.mes)}-01`,
    hasta: `${r.hasta.anio}-${dosDigitos(r.hasta.mes)}-${dosDigitos(ultimoDia(r.hasta))}`,
  };
}

/** `marzo 2027`, `marzo a mayo 2027` o `noviembre 2026 a febrero 2027`. */
export function textoRango(r: RangoMeses): string {
  if (compararMeses(r.desde, r.hasta) === 0) return periodo(r.desde.anio, r.desde.mes);
  if (r.desde.anio === r.hasta.anio) {
    const inicio = periodo(r.desde.anio, r.desde.mes).replace(` ${r.desde.anio}`, '');
    return `${inicio} a ${periodo(r.hasta.anio, r.hasta.mes)}`;
  }
  return `${periodo(r.desde.anio, r.desde.mes)} a ${periodo(r.hasta.anio, r.hasta.mes)}`;
}
