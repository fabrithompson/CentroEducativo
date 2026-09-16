/**
 * Tests de la lógica de rastreo del transporte (RF-08 / HU8).
 *
 * Cubren los criterios de aceptación: el mapa se habilita sólo durante el
 * recorrido, y fuera de horario se informa el motivo.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LIMITES_CHACO,
  MARGEN_MINUTOS,
  MINUTOS_SIN_SENAL,
  VELOCIDAD_REFERENCIA_KMH,
  distanciaEnMetros,
  esCoordenadaValida,
  estaEnFranja,
  estaEnZonaDeCobertura,
  estadoRastreo,
  estimarMinutos,
  formatearDistancia,
  minutosDelDia,
  type Posicion,
} from './geolocalizacion.ts';

/** Construye una fecha local con la hora indicada. */
const alas = (hora: number, minuto = 0) => new Date(2026, 8, 16, hora, minuto, 0);

// El Recorrido 3 (Fontana) sale 6:10 y regresa 14:00.
const SALIDA = 6 * 60 + 10;
const REGRESO = 14 * 60;

const posicionA = (fecha: Date, velocidad?: number): Posicion => ({
  latitud: -27.45,
  longitud: -58.99,
  registradoEn: fecha,
  velocidad: velocidad ?? null,
});

// ==================================================================
// Franja horaria
// ==================================================================

test('minutosDelDia convierte la hora local', () => {
  assert.equal(minutosDelDia(alas(0, 0)), 0);
  assert.equal(minutosDelDia(alas(6, 10)), 370);
  assert.equal(minutosDelDia(alas(23, 59)), 1439);
});

test('durante el recorrido la franja está activa', () => {
  assert.ok(estaEnFranja(SALIDA, REGRESO, alas(6, 30)));
  assert.ok(estaEnFranja(SALIDA, REGRESO, alas(10, 0)));
  assert.ok(estaEnFranja(SALIDA, REGRESO, alas(13, 50)));
});

test('el margen cubre el arranque anticipado y la demora', () => {
  // El micro arranca unos minutos antes y llega con atraso: sin margen, una
  // familia que abre la app a las 5:55 vería "fuera de servicio".
  assert.ok(estaEnFranja(SALIDA, REGRESO, alas(5, 55)), 'debería cubrir 15 min antes');
  assert.ok(estaEnFranja(SALIDA, REGRESO, alas(14, 15)), 'debería cubrir 15 min después');
  assert.equal(MARGEN_MINUTOS, 20);
});

test('fuera de la franja y del margen, el rastreo no está activo', () => {
  assert.ok(!estaEnFranja(SALIDA, REGRESO, alas(4, 0)));
  assert.ok(!estaEnFranja(SALIDA, REGRESO, alas(16, 0)));
  assert.ok(!estaEnFranja(SALIDA, REGRESO, alas(22, 0)));
});

// ==================================================================
// Estado del rastreo — criterios de aceptación de HU8
// ==================================================================

test('REGLA: durante el recorrido y con señal, el mapa se habilita', () => {
  const ahora = alas(7, 0);
  const r = estadoRastreo(SALIDA, REGRESO, posicionA(alas(6, 59)), ahora);

  assert.equal(r.estado, 'EN_RECORRIDO');
});

test('REGLA: antes de la salida informa "fuera de servicio"', () => {
  const r = estadoRastreo(SALIDA, REGRESO, posicionA(alas(4, 0)), alas(4, 30));

  assert.equal(r.estado, 'FUERA_DE_SERVICIO');
  assert.match(r.mensaje, /fuera de servicio/i);
});

test('REGLA: después del regreso informa "recorrido finalizado"', () => {
  const r = estadoRastreo(SALIDA, REGRESO, posicionA(alas(14, 0)), alas(16, 0));

  assert.equal(r.estado, 'RECORRIDO_FINALIZADO');
  assert.match(r.mensaje, /finalizado/i);
});

test('se distingue "finalizado" de "fuera de servicio"', () => {
  // Para la familia no es lo mismo: lo primero significa que el chico llegó,
  // lo segundo que todavía no salió.
  const antes = estadoRastreo(SALIDA, REGRESO, null, alas(4, 0));
  const despues = estadoRastreo(SALIDA, REGRESO, null, alas(18, 0));

  assert.notEqual(antes.estado, despues.estado);
});

test('sin ninguna posición reportada se informa que aún no reportó', () => {
  const r = estadoRastreo(SALIDA, REGRESO, null, alas(7, 0));

  assert.equal(r.estado, 'SIN_SENAL');
  assert.match(r.mensaje, /todavía no reportó/i);
});

test('una posición vieja se marca como sin señal', () => {
  // Zonas suburbanas del Gran Resistencia con cobertura intermitente: un dato
  // de hace diez minutos no puede mostrarse como si fuera actual.
  const r = estadoRastreo(SALIDA, REGRESO, posicionA(alas(7, 0)), alas(7, 10));

  assert.equal(r.estado, 'SIN_SENAL');
  assert.match(r.mensaje, /10 minutos/);
});

test('un hueco corto de señal no invalida la posición', () => {
  const r = estadoRastreo(SALIDA, REGRESO, posicionA(alas(7, 0)), alas(7, 2));
  assert.equal(r.estado, 'EN_RECORRIDO');
});

test('el umbral de señal perdida es de 5 minutos', () => {
  assert.equal(MINUTOS_SIN_SENAL, 5);
});

// ==================================================================
// Distancias
// ==================================================================

test('la distancia entre un punto y sí mismo es cero', () => {
  const p = { latitud: -27.45, longitud: -58.99 };
  assert.equal(distanciaEnMetros(p, p), 0);
});

test('la distancia se calcula correctamente sobre una referencia conocida', () => {
  // Del centro de Resistencia a Barranqueras hay unos 7 km en línea recta.
  const resistencia = { latitud: -27.4512, longitud: -58.9866 };
  const barranqueras = { latitud: -27.4875, longitud: -58.9375 };

  const d = distanciaEnMetros(resistencia, barranqueras);

  assert.ok(d > 5000 && d < 9000, `distancia inesperada: ${d} m`);
});

test('la distancia es simétrica', () => {
  const a = { latitud: -27.45, longitud: -58.99 };
  const b = { latitud: -27.48, longitud: -58.93 };

  assert.equal(distanciaEnMetros(a, b), distanciaEnMetros(b, a));
});

test('formatearDistancia usa metros o kilómetros según corresponda', () => {
  assert.equal(formatearDistancia(350), '350 m');
  assert.equal(formatearDistancia(999), '999 m');
  assert.equal(formatearDistancia(1000), '1.0 km');
  assert.equal(formatearDistancia(7250), '7.3 km');
});

// ==================================================================
// Estimación de llegada
// ==================================================================

test('estimarMinutos usa la velocidad informada', () => {
  // 5 km a 60 km/h son 5 minutos.
  assert.equal(estimarMinutos(5000, 60), 5);
});

test('con el micro detenido se usa una velocidad de referencia', () => {
  // Informar "llega en 340 minutos" porque está parado en un semáforo sería
  // peor que no informar.
  const detenido = estimarMinutos(5000, 0);
  const referencia = estimarMinutos(5000, VELOCIDAD_REFERENCIA_KMH);

  assert.equal(detenido, referencia);
});

test('sin dato de velocidad se usa la referencia', () => {
  assert.equal(estimarMinutos(5000, null), estimarMinutos(5000, VELOCIDAD_REFERENCIA_KMH));
  assert.equal(estimarMinutos(5000, undefined), estimarMinutos(5000, VELOCIDAD_REFERENCIA_KMH));
});

test('la estimación nunca es cero salvo que ya haya llegado', () => {
  assert.equal(estimarMinutos(0, 40), 0);
  assert.ok(estimarMinutos(50, 40)! >= 1, 'a 50 metros debería informar al menos 1 minuto');
});

// ==================================================================
// Validación de coordenadas
// ==================================================================

test('se acepta una coordenada del Gran Resistencia', () => {
  const p = { latitud: -27.45, longitud: -58.99 };
  assert.ok(esCoordenadaValida(p));
  assert.ok(estaEnZonaDeCobertura(p));
});

test('REGLA: se rechaza la coordenada (0, 0)', () => {
  // Es lo que reporta un GPS que todavía no fijó posición. Mostrar el micro en
  // el Golfo de Guinea sería peor que no mostrar nada.
  assert.ok(!esCoordenadaValida({ latitud: 0, longitud: 0 }));
});

test('se rechazan valores fuera del rango geográfico', () => {
  assert.ok(!esCoordenadaValida({ latitud: 91, longitud: 0 }));
  assert.ok(!esCoordenadaValida({ latitud: 0, longitud: 181 }));
  assert.ok(!esCoordenadaValida({ latitud: Number.NaN, longitud: -58 }));
});

test('una coordenada válida pero lejana queda fuera de la zona de cobertura', () => {
  // Buenos Aires: es una coordenada legítima, pero no puede ser el micro.
  const bsas = { latitud: -34.6, longitud: -58.38 };

  assert.ok(esCoordenadaValida(bsas));
  assert.ok(!estaEnZonaDeCobertura(bsas), 'debería detectarse como fuera de zona');
});

test('los límites de cobertura abarcan las cuatro localidades de los recorridos', () => {
  const localidades = [
    { nombre: 'Resistencia centro', latitud: -27.4512, longitud: -58.9866 },
    { nombre: 'Barranqueras', latitud: -27.4875, longitud: -58.9375 },
    { nombre: 'Fontana', latitud: -27.4206, longitud: -59.0444 },
    { nombre: 'Puerto Vilelas', latitud: -27.5194, longitud: -58.9333 },
  ];

  for (const l of localidades) {
    assert.ok(estaEnZonaDeCobertura(l), `${l.nombre} debería estar dentro de la zona`);
  }

  assert.ok(LIMITES_CHACO.latMin < LIMITES_CHACO.latMax);
  assert.ok(LIMITES_CHACO.lonMin < LIMITES_CHACO.lonMax);
});
