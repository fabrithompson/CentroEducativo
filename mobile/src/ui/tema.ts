/**
 * Tokens visuales de la app.
 *
 * Los colores acompañan a los del campus web (azul institucional #1f4e79) y los
 * estados usan la misma semántica que `componentes.css`: verde para saldado,
 * ámbar para en revisión, rojo para vencido.
 *
 * Los estados nunca se comunican sólo por color: cada uno lleva su texto.
 */

export const colores = {
  primario: '#1f4e79',
  primarioOscuro: '#17395a',
  fondo: '#f4f6f9',
  superficie: '#ffffff',
  superficieSuave: '#f7f9fc',
  borde: '#d6dce5',
  texto: '#1f2933',
  textoSuave: '#5a6775',
  textoInverso: '#ffffff',

  ok: '#1b7f4f',
  okFondo: '#e4f5ec',
  espera: '#8a5a00',
  esperaFondo: '#fdf3e0',
  alerta: '#b3261e',
  alertaFondo: '#fdeceb',
  neutro: '#4a5568',
  neutroFondo: '#edf0f4',
} as const;

export const espaciado = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radio = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
} as const;

export const tipografia = {
  titulo: { fontSize: 22, fontWeight: '700' as const },
  subtitulo: { fontSize: 17, fontWeight: '600' as const },
  cuerpo: { fontSize: 15, fontWeight: '400' as const },
  etiqueta: { fontSize: 12, fontWeight: '600' as const },
  importe: { fontSize: 26, fontWeight: '700' as const },
} as const;

/**
 * Alto mínimo de un elemento tocable.
 *
 * 48dp es lo que recomienda Material Design para Android; iOS pide 44pt. Se usa
 * el mayor de los dos.
 */
export const ALTO_TOCABLE = 48;

type Tono = 'ok' | 'espera' | 'alerta' | 'neutro';

const TONO_POR_ESTADO: Record<string, Tono> = {
  PAGADA: 'ok',
  APROBADO: 'ok',
  ACTIVA: 'ok',
  ACTIVO: 'ok',
  PENDIENTE: 'espera',
  EN_REVISION: 'espera',
  PARCIAL: 'espera',
  VENCIDA: 'alerta',
  RECHAZADO: 'alerta',
  ANULADA: 'neutro',
};

const ETIQUETA_POR_ESTADO: Record<string, string> = {
  PAGADA: 'Pagada',
  PENDIENTE: 'Pendiente',
  EN_REVISION: 'En revisión',
  PARCIAL: 'Pago parcial',
  VENCIDA: 'Vencida',
  ANULADA: 'Anulada',
  APROBADO: 'Aprobado',
  RECHAZADO: 'Rechazado',
};

export function tonoDeEstado(estado: string): Tono {
  return TONO_POR_ESTADO[estado] ?? 'neutro';
}

export function etiquetaDeEstado(estado: string): string {
  return ETIQUETA_POR_ESTADO[estado] ?? estado.replace(/_/g, ' ').toLowerCase();
}

export function coloresDeTono(tono: Tono): { texto: string; fondo: string } {
  switch (tono) {
    case 'ok':
      return { texto: colores.ok, fondo: colores.okFondo };
    case 'espera':
      return { texto: colores.espera, fondo: colores.esperaFondo };
    case 'alerta':
      return { texto: colores.alerta, fondo: colores.alertaFondo };
    default:
      return { texto: colores.neutro, fondo: colores.neutroFondo };
  }
}
