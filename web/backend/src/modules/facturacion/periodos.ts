/**
 * Cálculo de períodos, días hábiles y feriados.
 *
 * Módulo puro: no importa Prisma, Express ni `config/env`. Es lo que decide
 * cuándo corre la tarea del "último día hábil del mes", así que conviene que se
 * pueda probar contra un calendario completo sin levantar nada.
 *
 * Todas las fechas se manejan en **UTC**. Los jobs corren con el huso de
 * Argentina configurado en el cron (`America/Argentina/Buenos_Aires`), pero el
 * cálculo de qué día es hábil se hace sobre componentes de fecha, no sobre
 * instantes, así que no hay corrimiento posible.
 */

/** Feriados nacionales inamovibles y trasladables de Argentina. */
const FERIADOS: Record<number, string[]> = {
  2026: [
    '2026-01-01', // Año Nuevo
    '2026-02-16', // Carnaval
    '2026-02-17', // Carnaval
    '2026-03-24', // Día de la Memoria
    '2026-04-02', // Día del Veterano y de los Caídos en Malvinas
    '2026-04-03', // Viernes Santo
    '2026-05-01', // Día del Trabajador
    '2026-05-25', // Revolución de Mayo
    '2026-06-15', // Paso a la Inmortalidad del Gral. Güemes (trasladado)
    '2026-06-20', // Paso a la Inmortalidad del Gral. Belgrano
    '2026-07-09', // Día de la Independencia
    '2026-08-17', // Paso a la Inmortalidad del Gral. San Martín
    '2026-10-12', // Respeto a la Diversidad Cultural
    '2026-11-23', // Soberanía Nacional (trasladado)
    '2026-12-08', // Inmaculada Concepción
    '2026-12-25', // Navidad
  ],
  2027: [
    '2027-01-01',
    '2027-02-08',
    '2027-02-09',
    '2027-03-24',
    '2027-03-26', // Viernes Santo
    '2027-04-02',
    '2027-05-01',
    '2027-05-25',
    '2027-06-17', // Güemes
    '2027-06-20',
    '2027-07-09',
    '2027-08-16', // San Martín (trasladado)
    '2027-10-11', // Diversidad Cultural (trasladado)
    '2027-11-22', // Soberanía Nacional (trasladado)
    '2027-12-08',
    '2027-12-25',
  ],
};

/**
 * Feriados adicionales cargados en caliente (puentes turísticos, asuetos
 * provinciales del Chaco). El calendario nacional se publica año a año; esto
 * permite corregir sin tocar el código.
 */
const feriadosExtra = new Set<string>();

export function registrarFeriado(fechaISO: string): void {
  feriadosExtra.add(fechaISO);
}

export function limpiarFeriadosExtra(): void {
  feriadosExtra.clear();
}

/** `2026-09-15` a partir de un Date, en UTC. */
export function aISO(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export function esFeriado(fecha: Date): boolean {
  const iso = aISO(fecha);
  if (feriadosExtra.has(iso)) return true;
  return (FERIADOS[fecha.getUTCFullYear()] ?? []).includes(iso);
}

export function esFinDeSemana(fecha: Date): boolean {
  const dia = fecha.getUTCDay();
  return dia === 0 || dia === 6;
}

/** Día hábil: ni sábado, ni domingo, ni feriado. */
export function esDiaHabil(fecha: Date): boolean {
  return !esFinDeSemana(fecha) && !esFeriado(fecha);
}

/** Último día del mes (hábil o no). */
export function ultimoDiaDelMes(anio: number, mes: number): Date {
  // Día 0 del mes siguiente = último día de este mes.
  return new Date(Date.UTC(anio, mes, 0));
}

/**
 * Último día hábil del mes.
 *
 * Se retrocede desde el último día hasta encontrar uno hábil. El tope de 31
 * iteraciones es defensivo: si un mes entero fuera feriado, devuelve el día 1 en
 * lugar de colgarse.
 */
export function ultimoDiaHabilDelMes(anio: number, mes: number): Date {
  const cursor = ultimoDiaDelMes(anio, mes);

  for (let i = 0; i < 31; i++) {
    if (esDiaHabil(cursor)) return cursor;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return new Date(Date.UTC(anio, mes - 1, 1));
}

/** ¿La fecha dada es el último día hábil de su mes? */
export function esUltimoDiaHabilDelMes(fecha: Date): boolean {
  const ultimo = ultimoDiaHabilDelMes(fecha.getUTCFullYear(), fecha.getUTCMonth() + 1);
  return aISO(fecha) === aISO(ultimo);
}

/**
 * Primer día hábil igual o posterior a la fecha dada.
 * Se usa para el vencimiento: no se vence una factura un domingo.
 */
export function proximoDiaHabil(fecha: Date): Date {
  const cursor = new Date(fecha.getTime());

  for (let i = 0; i < 31; i++) {
    if (esDiaHabil(cursor)) return cursor;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return cursor;
}

export interface Periodo {
  anio: number;
  mes: number;
}

/** Período al que corresponde una fecha. */
export function periodoDe(fecha: Date): Periodo {
  return { anio: fecha.getUTCFullYear(), mes: fecha.getUTCMonth() + 1 };
}

/** Período siguiente, manejando el salto de diciembre a enero. */
export function periodoSiguiente(p: Periodo): Periodo {
  return p.mes === 12 ? { anio: p.anio + 1, mes: 1 } : { anio: p.anio, mes: p.mes + 1 };
}

export function periodoAnterior(p: Periodo): Periodo {
  return p.mes === 1 ? { anio: p.anio - 1, mes: 12 } : { anio: p.anio, mes: p.mes - 1 };
}

/** `09/2026` */
export function formatearPeriodo(p: Periodo): string {
  return `${String(p.mes).padStart(2, '0')}/${p.anio}`;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** `septiembre de 2026` */
export function nombrePeriodo(p: Periodo): string {
  return `${MESES[p.mes - 1]} de ${p.anio}`;
}

/**
 * Vencimiento de la factura de un período: el día 10 del mes siguiente,
 * corrido al próximo día hábil si cae fin de semana o feriado.
 */
export const DIA_VENCIMIENTO = 10;

export function fechaVencimiento(p: Periodo, dia: number = DIA_VENCIMIENTO): Date {
  const siguiente = periodoSiguiente(p);
  return proximoDiaHabil(new Date(Date.UTC(siguiente.anio, siguiente.mes - 1, dia)));
}

/** Fecha de emisión: el último día hábil del período facturado. */
export function fechaEmision(p: Periodo): Date {
  return ultimoDiaHabilDelMes(p.anio, p.mes);
}

/** Día del mes en que corre el recordatorio de deuda. */
export const DIA_RECORDATORIO = 20;

/** Formatea un importe en pesos argentinos. */
export function formatearMoneda(monto: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  }).format(monto);
}

/** `15/09/2026` */
export function formatearFecha(fecha: Date): string {
  const d = String(fecha.getUTCDate()).padStart(2, '0');
  const m = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${fecha.getUTCFullYear()}`;
}
