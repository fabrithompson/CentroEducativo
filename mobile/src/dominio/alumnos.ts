/**
 * Deuda de cada alumno para la lista de Administración.
 *
 * La calcula el backend en el reporte de morosidad (`GET /api/reportes/morosidad`):
 * saldo de las cuotas impagas, cuántas son y de qué meses. Acá sólo se indexa
 * por alumno, para cruzarla con el listado, y se arma el texto que se muestra.
 * La app no suma ni decide qué cuota está impaga.
 */

import { moneda } from './formato';

export interface DeudaAlumno {
  alumnoId: number;
  deuda: number;
  facturasImpagas: number;
  /** "MM/AAAA", ya ordenados por el backend. */
  mesesAdeudados: string[];
}

/** Cuántos meses se nombran antes de resumir el resto: la línea tiene que entrar en un teléfono. */
const MESES_VISIBLES = 3;

export function deudaPorAlumno(filas: readonly DeudaAlumno[]): Map<number, DeudaAlumno> {
  return new Map(filas.map((f) => [f.alumnoId, f]));
}

/** "Al día" o "Debe $ 141.000 · 2 cuotas (08/2026, 09/2026)". */
export function textoDeuda(d: DeudaAlumno | undefined): string {
  if (!d || d.deuda <= 0) return 'Al día';

  const cuotas = d.facturasImpagas === 1 ? '1 cuota' : `${d.facturasImpagas} cuotas`;
  const visibles = d.mesesAdeudados.slice(0, MESES_VISIBLES).join(', ');
  const resto = d.mesesAdeudados.length - MESES_VISIBLES;
  const meses = resto > 0 ? `${visibles} y ${resto} más` : visibles;

  return meses ? `Debe ${moneda(d.deuda)} · ${cuotas} (${meses})` : `Debe ${moneda(d.deuda)} · ${cuotas}`;
}

export function tieneDeuda(d: DeudaAlumno | undefined): boolean {
  return Boolean(d && d.deuda > 0);
}
