/**
 * Tests de formato. Son los textos que ve la familia, así que un error acá se
 * nota enseguida: un importe mal formateado o un vencimiento mal contado.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  dia,
  diasHasta,
  fecha,
  hora,
  hoyISO,
  moneda,
  monedaCorta,
  periodo,
  textoVencimiento,
  tipoItem,
} from './formato.ts';

const HOY = new Date('2026-09-16T10:00:00');

// ------------------------------------------------------------------
// Importes
// ------------------------------------------------------------------

test('moneda formatea en pesos argentinos', () => {
  const r = moneda(104000);
  assert.match(r, /104\.000/, 'debería usar punto como separador de miles');
  assert.match(r, /\$/);
});

test('moneda muestra los centavos', () => {
  assert.match(moneda(1234.5), /1\.234,50/);
});

test('moneda tolera null, undefined y NaN', () => {
  assert.equal(moneda(null), '—');
  assert.equal(moneda(undefined), '—');
  assert.equal(moneda(Number.NaN), '—');
});

test('moneda muestra el cero, no lo trata como vacío', () => {
  // Una deuda de $0 es información: significa que está al día.
  assert.notEqual(moneda(0), '—');
  assert.match(moneda(0), /0,00/);
});

test('monedaCorta omite los centavos', () => {
  assert.equal(monedaCorta(104000), '$ 104.000');
  assert.equal(monedaCorta(1234.56), '$ 1.235');
});

// ------------------------------------------------------------------
// Fechas
// ------------------------------------------------------------------

test('fecha usa DD/MM/AAAA', () => {
  assert.equal(fecha('2026-10-13T00:00:00.000Z'), '13/10/2026');
  assert.equal(fecha('2026-01-05T00:00:00.000Z'), '05/01/2026');
});

test('fecha no se corre de día por zona horaria', () => {
  // Con timeZone local, una fecha UTC a medianoche se mostraría el día anterior
  // en Argentina (UTC-3). Por eso se fuerza UTC.
  assert.equal(fecha('2026-10-13T00:00:00.000Z'), '13/10/2026');
});

test('fecha tolera valores inválidos', () => {
  assert.equal(fecha(null), '—');
  assert.equal(fecha('cualquier cosa'), '—');
});

test('hoyISO devuelve el formato que espera el backend', () => {
  assert.equal(hoyISO(new Date('2026-09-16T23:00:00')), '2026-09-16');
  assert.match(hoyISO(), /^\d{4}-\d{2}-\d{2}$/);
});

test('hoyISO usa la fecha local, no UTC', () => {
  // A las 22:00 en Argentina ya es el día siguiente en UTC. La familia
  // transfiere según su reloj, no según UTC.
  const nocheArgentina = new Date(2026, 8, 16, 22, 0, 0);
  assert.equal(hoyISO(nocheArgentina), '2026-09-16');
});

test('periodo escribe el mes en castellano', () => {
  assert.equal(periodo(2026, 9), 'septiembre 2026');
  assert.equal(periodo(2026, 1), 'enero 2026');
  assert.equal(periodo(2026, 12), 'diciembre 2026');
});

// ------------------------------------------------------------------
// Vencimientos
// ------------------------------------------------------------------

test('diasHasta cuenta bien hacia adelante y hacia atrás', () => {
  assert.equal(diasHasta('2026-09-16T00:00:00.000Z', HOY), 0);
  assert.equal(diasHasta('2026-09-17T00:00:00.000Z', HOY), 1);
  assert.equal(diasHasta('2026-09-20T00:00:00.000Z', HOY), 4);
  assert.equal(diasHasta('2026-09-15T00:00:00.000Z', HOY), -1);
});

test('una cuota que vence hoy no cuenta como vencida', () => {
  assert.equal(diasHasta('2026-09-16T00:00:00.000Z', HOY), 0);
  assert.equal(textoVencimiento('2026-09-16T00:00:00.000Z', HOY), 'Vence hoy');
});

test('textoVencimiento usa lenguaje natural', () => {
  assert.equal(textoVencimiento('2026-09-17T00:00:00.000Z', HOY), 'Vence mañana');
  assert.equal(textoVencimiento('2026-09-21T00:00:00.000Z', HOY), 'Vence en 5 días');
  assert.equal(textoVencimiento('2026-09-15T00:00:00.000Z', HOY), 'Venció ayer');
  assert.equal(textoVencimiento('2026-09-10T00:00:00.000Z', HOY), 'Venció hace 6 días');
});

test('textoVencimiento tolera una fecha inválida', () => {
  assert.equal(textoVencimiento('no es fecha', HOY), '—');
});

// ------------------------------------------------------------------
// Horarios y etiquetas
// ------------------------------------------------------------------

test('hora convierte minutos desde medianoche', () => {
  assert.equal(hora(0), '00:00');
  assert.equal(hora(450), '07:30');
  assert.equal(hora(1020), '17:00');
  assert.equal(hora(1439), '23:59');
});

test('hora tolera valores ausentes', () => {
  assert.equal(hora(null), '—');
  assert.equal(hora(undefined), '—');
});

test('dia traduce los códigos del backend', () => {
  assert.equal(dia('MIERCOLES'), 'Miércoles');
  assert.equal(dia('LUNES'), 'Lunes');
  assert.equal(dia('DESCONOCIDO'), 'DESCONOCIDO');
  assert.equal(dia(null), '—');
});

test('tipoItem traduce los conceptos de la factura', () => {
  assert.equal(tipoItem('CUOTA'), 'Cuota escolar');
  assert.equal(tipoItem('TRANSPORTE'), 'Transporte');
  assert.equal(tipoItem('COMEDOR'), 'Comedor');
  assert.equal(tipoItem('DEPORTE'), 'Deporte');
  assert.equal(tipoItem('INVENTADO'), 'INVENTADO');
});
