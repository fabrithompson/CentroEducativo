/**
 * Formato de importes, fechas y horarios.
 *
 * Módulo puro y testeable. Comparte la convención del backend: los horarios son
 * minutos desde medianoche, y las fechas de período vienen en UTC.
 */

const MONEDA = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
});

export function moneda(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return MONEDA.format(valor);
}

/** Versión corta para espacios apretados: `$ 104.000`. */
export function monedaCorta(valor: number | null | undefined): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return `$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(valor)}`;
}

export function fecha(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Fecha de hoy en formato `AAAA-MM-DD`, que es lo que espera el backend. */
export function hoyISO(hoy: Date = new Date()): string {
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** `9/2026` -> `septiembre 2026`. */
export function periodo(anio: number, mes: number): string {
  const nombre = MESES[mes - 1];
  return nombre ? `${nombre} ${anio}` : `${mes}/${anio}`;
}

/** `450` -> `07:30`. Misma convención que el backend. */
export function hora(minutos: number | null | undefined): string {
  if (typeof minutos !== 'number' || !Number.isFinite(minutos)) return '—';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const DIAS: Record<string, string> = {
  LUNES: 'Lunes',
  MARTES: 'Martes',
  MIERCOLES: 'Miércoles',
  JUEVES: 'Jueves',
  VIERNES: 'Viernes',
  SABADO: 'Sábado',
};

export function dia(codigo: string | null | undefined): string {
  if (!codigo) return '—';
  return DIAS[codigo] ?? codigo;
}

const TIPOS: Record<string, string> = {
  CUOTA: 'Cuota escolar',
  TRANSPORTE: 'Transporte',
  COMEDOR: 'Comedor',
  DEPORTE: 'Deporte',
  MATRICULA: 'Matrícula',
  RECARGO: 'Recargo',
  OTRO: 'Otros',
};

export function tipoItem(tipo: string): string {
  return TIPOS[tipo] ?? tipo;
}

/**
 * Cuántos días faltan para una fecha. Negativo si ya pasó.
 * Se compara sólo la parte de fecha: una cuota que vence hoy no está vencida.
 */
export function diasHasta(iso: string, hoy: Date = new Date()): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;

  const objetivo = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const referencia = Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  return Math.round((objetivo - referencia) / 86_400_000);
}

/** Texto humano del vencimiento: "vence en 3 días", "venció hace 2 días". */
export function textoVencimiento(iso: string, hoy: Date = new Date()): string {
  const dias = diasHasta(iso, hoy);
  if (dias === null) return '—';

  if (dias === 0) return 'Vence hoy';
  if (dias === 1) return 'Vence mañana';
  if (dias > 1) return `Vence en ${dias} días`;
  if (dias === -1) return 'Venció ayer';
  return `Venció hace ${Math.abs(dias)} días`;
}
