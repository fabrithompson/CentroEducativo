/**
 * RF-08 — Geolocalización del transporte escolar. Lógica pura.
 *
 * Módulo sin dependencias de Prisma ni Express: es la parte que decide si el
 * rastreo está habilitado y qué tan lejos está el micro. Al ser pura, se puede
 * probar sin base de datos.
 *
 * Criterios de aceptación de HU8:
 *   - El mapa se habilita únicamente durante el recorrido.
 *   - Fuera de horario informa «Transporte fuera de servicio / Recorrido finalizado».
 *   - El padre sólo consulta el recorrido asignado a su hijo.
 */

export interface Coordenada {
  latitud: number;
  longitud: number;
}

export interface Posicion extends Coordenada {
  registradoEn: Date;
  velocidad?: number | null;
}

export type EstadoRastreo =
  | 'EN_RECORRIDO'
  | 'FUERA_DE_SERVICIO'
  | 'RECORRIDO_FINALIZADO'
  | 'SIN_SENAL';

/**
 * Margen, en minutos, antes de la salida y después del regreso.
 *
 * El micro arranca unos minutos antes de la hora teórica y llega con demora; sin
 * margen, una familia que abre la app a las 6:05 para un recorrido de 6:10 vería
 * "fuera de servicio" justo cuando más lo necesita.
 */
export const MARGEN_MINUTOS = 20;

/**
 * Cuántos minutos sin reportar posición hasta considerar que se perdió la señal.
 *
 * Los cuatro recorridos cubren zonas suburbanas del Gran Resistencia con
 * cobertura intermitente: un hueco de dos minutos es normal, uno de cinco ya
 * indica que el dato en pantalla dejó de ser confiable.
 */
export const MINUTOS_SIN_SENAL = 5;

/** Minutos desde medianoche de una fecha, en hora local de Argentina. */
export function minutosDelDia(fecha: Date): number {
  return fecha.getHours() * 60 + fecha.getMinutes();
}

/**
 * ¿El recorrido está en su franja de servicio?
 *
 * `horaSalida` y `horaRegreso` son minutos desde medianoche, misma convención
 * que el resto del sistema.
 */
export function estaEnFranja(
  horaSalida: number,
  horaRegreso: number,
  ahora: Date,
  margen = MARGEN_MINUTOS,
): boolean {
  const m = minutosDelDia(ahora);
  return m >= horaSalida - margen && m <= horaRegreso + margen;
}

/**
 * Estado del rastreo para mostrar en la aplicación.
 *
 * Se distingue «finalizado» de «fuera de servicio» porque para la familia no es
 * lo mismo: lo primero significa que el chico ya llegó, lo segundo que todavía
 * no salió.
 */
export function estadoRastreo(
  horaSalida: number,
  horaRegreso: number,
  ultimaPosicion: Posicion | null,
  ahora: Date = new Date(),
): { estado: EstadoRastreo; mensaje: string } {
  const m = minutosDelDia(ahora);

  if (m > horaRegreso + MARGEN_MINUTOS) {
    return { estado: 'RECORRIDO_FINALIZADO', mensaje: 'Recorrido finalizado por hoy.' };
  }

  if (m < horaSalida - MARGEN_MINUTOS) {
    return { estado: 'FUERA_DE_SERVICIO', mensaje: 'Transporte fuera de servicio.' };
  }

  if (!ultimaPosicion) {
    return {
      estado: 'SIN_SENAL',
      mensaje: 'El micro todavía no reportó su posición.',
    };
  }

  const minutosDesdeElUltimoReporte =
    (ahora.getTime() - ultimaPosicion.registradoEn.getTime()) / 60_000;

  if (minutosDesdeElUltimoReporte > MINUTOS_SIN_SENAL) {
    return {
      estado: 'SIN_SENAL',
      mensaje: `Sin señal desde hace ${Math.round(minutosDesdeElUltimoReporte)} minutos. La posición puede estar desactualizada.`,
    };
  }

  return { estado: 'EN_RECORRIDO', mensaje: 'El micro está en recorrido.' };
}

/**
 * Distancia entre dos puntos, en metros (fórmula de Haversine).
 *
 * Se usa para decirle a la familia cuán lejos está el micro de su domicilio.
 * La aproximación esférica alcanza de sobra: a escala de una ciudad el error
 * es de centímetros.
 */
export function distanciaEnMetros(a: Coordenada, b: Coordenada): number {
  const RADIO_TIERRA = 6_371_000;
  const rad = (grados: number) => (grados * Math.PI) / 180;

  const dLat = rad(b.latitud - a.latitud);
  const dLon = rad(b.longitud - a.longitud);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitud)) * Math.cos(rad(b.latitud)) * Math.sin(dLon / 2) ** 2;

  return Math.round(RADIO_TIERRA * 2 * Math.asin(Math.sqrt(h)));
}

/** Texto legible de una distancia. */
export function formatearDistancia(metros: number): string {
  if (metros < 1000) return `${metros} m`;
  return `${(metros / 1000).toFixed(1)} km`;
}

/**
 * Minutos estimados de llegada a partir de la distancia y la velocidad.
 *
 * Es una estimación deliberadamente conservadora: si el micro está detenido o
 * muy lento se usa una velocidad urbana de referencia, porque informar «llega
 * en 340 minutos» porque está parado en un semáforo sería peor que no informar.
 */
export const VELOCIDAD_REFERENCIA_KMH = 25;

export function estimarMinutos(metros: number, velocidadKmh?: number | null): number | null {
  if (metros <= 0) return 0;

  const velocidad =
    velocidadKmh !== null && velocidadKmh !== undefined && velocidadKmh > 5
      ? velocidadKmh
      : VELOCIDAD_REFERENCIA_KMH;

  return Math.max(1, Math.round((metros / 1000 / velocidad) * 60));
}

/**
 * Valida una coordenada informada por el dispositivo.
 *
 * Además del rango global, se acota al Gran Resistencia: un GPS que arranca
 * suele reportar (0, 0), y mostrar el micro en el Golfo de Guinea sería peor
 * que no mostrar nada.
 */
export const LIMITES_CHACO = {
  latMin: -28.2,
  latMax: -26.8,
  lonMin: -59.5,
  lonMax: -58.4,
};

export function esCoordenadaValida(c: Coordenada): boolean {
  if (!Number.isFinite(c.latitud) || !Number.isFinite(c.longitud)) return false;
  if (c.latitud < -90 || c.latitud > 90) return false;
  if (c.longitud < -180 || c.longitud > 180) return false;
  if (c.latitud === 0 && c.longitud === 0) return false;
  return true;
}

export function estaEnZonaDeCobertura(c: Coordenada): boolean {
  return (
    c.latitud >= LIMITES_CHACO.latMin &&
    c.latitud <= LIMITES_CHACO.latMax &&
    c.longitud >= LIMITES_CHACO.lonMin &&
    c.longitud <= LIMITES_CHACO.lonMax
  );
}
