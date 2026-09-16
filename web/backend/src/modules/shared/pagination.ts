/**
 * Paginación y utilidades de consulta compartidas por los routers del módulo.
 *
 * Funciones puras, sin Prisma ni Express: se pueden testear sin levantar nada.
 */

import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const paginacionSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export type Paginacion = z.infer<typeof paginacionSchema>;

/** Convierte página/tamaño en el `skip`/`take` que espera Prisma. */
export function toSkipTake(p: Paginacion): { skip: number; take: number } {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}

export interface Pagina<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export function armarPagina<T>(items: T[], total: number, p: Paginacion): Pagina<T> {
  return {
    items,
    page: p.page,
    pageSize: p.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / p.pageSize),
  };
}

/**
 * Rango de fechas para reportes. Acepta `desde`/`hasta` en formato YYYY-MM-DD.
 * `hasta` se interpreta inclusive: se lleva al final del día.
 */
export const rangoFechasSchema = z
  .object({
    desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado YYYY-MM-DD').optional(),
    hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado YYYY-MM-DD').optional(),
  })
  .refine(
    (v) => !v.desde || !v.hasta || v.desde <= v.hasta,
    { message: '"desde" no puede ser posterior a "hasta".', path: ['desde'] },
  );

export type RangoFechas = z.infer<typeof rangoFechasSchema>;

/** Traduce el rango a un filtro de Prisma sobre un campo de fecha. */
export function filtroFecha(rango: RangoFechas): { gte?: Date; lte?: Date } | undefined {
  const filtro: { gte?: Date; lte?: Date } = {};
  if (rango.desde) filtro.gte = new Date(`${rango.desde}T00:00:00.000Z`);
  if (rango.hasta) filtro.lte = new Date(`${rango.hasta}T23:59:59.999Z`);
  return Object.keys(filtro).length > 0 ? filtro : undefined;
}

/**
 * Prisma devuelve `Decimal` para las columnas monetarias. Serializarlo tal cual
 * produce un objeto `{s,e,d}` en el JSON, que del lado del cliente no sirve.
 * Todo importe que salga por la API pasa por acá.
 */
export function aNumero(valor: unknown): number {
  if (valor === null || valor === undefined) return 0;
  if (typeof valor === 'number') return valor;
  return Number(valor.toString());
}

/** Redondeo a dos decimales, para totales acumulados en memoria. */
export function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
