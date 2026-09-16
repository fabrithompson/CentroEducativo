/**
 * Tests del dominio de pagos de la app móvil.
 *
 * Es la única lógica de cálculo que vive en el cliente, así que conviene que
 * esté cubierta: un error acá le muestra a una familia un importe distinto del
 * que realmente va a transferir.
 *
 *   pnpm --filter mobile test
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  alternarItem,
  calcularMonto,
  contarPorSolapa,
  deudaTotal,
  filtrarPorSolapa,
  hayAlgoSeleccionado,
  marcarTodos,
  porcentajePagado,
  prepararSeleccion,
  redondear,
  solapaDe,
  validarComprobante,
  type FacturaResumen,
  type ItemFactura,
} from './pagos.ts';

// ------------------------------------------------------------------
// Datos de ejemplo: una factura típica con los cinco conceptos
// ------------------------------------------------------------------

const ITEMS: ItemFactura[] = [
  { id: 1, tipo: 'CUOTA', descripcion: 'Cuota mensual — Secundario', subtotal: 104000 },
  { id: 2, tipo: 'TRANSPORTE', descripcion: 'Recorrido 1 — Centro', subtotal: 46000 },
  { id: 3, tipo: 'COMEDOR', descripcion: 'Comedor — 5 días', subtotal: 68000 },
  { id: 4, tipo: 'DEPORTE', descripcion: 'Fútbol', subtotal: 22000 },
  { id: 5, tipo: 'DEPORTE', descripcion: 'Ajedrez', subtotal: 15000 },
];

const TOTAL = 255000;

// ------------------------------------------------------------------
// Cálculo del monto
// ------------------------------------------------------------------

test('prepararSeleccion marca todo: pagar el total es lo habitual', () => {
  const sel = prepararSeleccion(ITEMS);
  assert.equal(sel.length, 5);
  assert.ok(sel.every((i) => i.seleccionado));
  assert.equal(calcularMonto(sel), TOTAL);
});

test('calcularMonto suma sólo lo marcado', () => {
  let sel = prepararSeleccion(ITEMS);
  sel = marcarTodos(sel, false);
  assert.equal(calcularMonto(sel), 0);

  sel = alternarItem(sel, 1); // cuota
  assert.equal(calcularMonto(sel), 104000);

  sel = alternarItem(sel, 4); // fútbol
  assert.equal(calcularMonto(sel), 126000);
});

test('calcularMonto contempla los dos deportes por separado', () => {
  // La consigna pide "deporte 1, deporte 2" discriminados: son ítems distintos.
  let sel = marcarTodos(prepararSeleccion(ITEMS), false);
  sel = alternarItem(sel, 4);
  sel = alternarItem(sel, 5);

  assert.equal(calcularMonto(sel), 37000);
  assert.equal(sel.filter((i) => i.seleccionado && i.tipo === 'DEPORTE').length, 2);
});

test('alternarItem no muta el arreglo original', () => {
  const sel = prepararSeleccion(ITEMS);
  const nuevo = alternarItem(sel, 1);

  assert.notEqual(sel, nuevo);
  assert.equal(sel[0]!.seleccionado, true, 'el original no debería cambiar');
  assert.equal(nuevo[0]!.seleccionado, false);
});

test('alternarItem ignora un id que no existe', () => {
  const sel = prepararSeleccion(ITEMS);
  assert.equal(calcularMonto(alternarItem(sel, 999)), TOTAL);
});

test('hayAlgoSeleccionado distingue el caso vacío', () => {
  assert.ok(hayAlgoSeleccionado(prepararSeleccion(ITEMS)));
  assert.ok(!hayAlgoSeleccionado(marcarTodos(prepararSeleccion(ITEMS), false)));
  assert.ok(!hayAlgoSeleccionado([]));
});

test('redondear corrige el error de punto flotante', () => {
  assert.equal(redondear(0.1 + 0.2), 0.3);
  assert.equal(redondear(104000.555), 104000.56);
});

test('el monto de importes con centavos no arrastra decimales sucios', () => {
  const conCentavos: ItemFactura[] = [
    { id: 1, tipo: 'CUOTA', descripcion: 'a', subtotal: 0.1 },
    { id: 2, tipo: 'DEPORTE', descripcion: 'b', subtotal: 0.2 },
  ];
  assert.equal(calcularMonto(prepararSeleccion(conCentavos)), 0.3);
});

// ------------------------------------------------------------------
// Validación del comprobante
// ------------------------------------------------------------------

const HOY = new Date('2026-09-16T12:00:00.000Z');

const VALIDO = {
  monto: 255000,
  fechaTransferencia: '2026-09-15',
  bancoOrigen: 'Banco Nación',
  numeroOperacion: 'NAC-7781204',
  archivo: { uri: 'file:///comprobante.jpg', nombre: 'comprobante.jpg', tipo: 'image/jpeg' },
};

test('un comprobante completo pasa la validación', () => {
  const r = validarComprobante(VALIDO, HOY);
  assert.equal(r.valido, true);
  assert.deepEqual(r.errores, {});
});

test('sin ítems seleccionados el monto es cero y no se puede enviar', () => {
  const r = validarComprobante({ ...VALIDO, monto: 0 }, HOY);
  assert.equal(r.valido, false);
  assert.match(r.errores.monto!, /al menos un ítem/i);
});

test('un monto negativo se rechaza', () => {
  assert.equal(validarComprobante({ ...VALIDO, monto: -100 }, HOY).valido, false);
});

test('REGLA: sin archivo adjunto no se puede registrar el pago', () => {
  // No se acepta efectivo: todo pago necesita respaldo documental.
  const r = validarComprobante({ ...VALIDO, archivo: null }, HOY);
  assert.equal(r.valido, false);
  assert.match(r.errores.archivo!, /comprobante/i);
});

test('la fecha de transferencia no puede ser futura', () => {
  const r = validarComprobante({ ...VALIDO, fechaTransferencia: '2026-09-17' }, HOY);
  assert.equal(r.valido, false);
  assert.match(r.errores.fechaTransferencia!, /futura/i);
});

test('la fecha de hoy sí se acepta', () => {
  const r = validarComprobante({ ...VALIDO, fechaTransferencia: '2026-09-16' }, HOY);
  assert.equal(r.valido, true, 'transferir hoy y cargarlo hoy es lo normal');
});

test('se rechaza una fecha con formato distinto de AAAA-MM-DD', () => {
  for (const mala of ['15/09/2026', '2026-9-15', 'ayer', '']) {
    const r = validarComprobante({ ...VALIDO, fechaTransferencia: mala }, HOY);
    assert.equal(r.valido, false, `debería rechazar "${mala}"`);
  }
});

test('banco y número de operación son obligatorios', () => {
  assert.equal(validarComprobante({ ...VALIDO, bancoOrigen: ' ' }, HOY).valido, false);
  assert.equal(validarComprobante({ ...VALIDO, numeroOperacion: 'ab' }, HOY).valido, false);
});

test('la validación acumula todos los errores, no corta en el primero', () => {
  const r = validarComprobante(
    { monto: 0, fechaTransferencia: 'mal', bancoOrigen: '', numeroOperacion: '', archivo: null },
    HOY,
  );

  assert.equal(r.valido, false);
  assert.equal(Object.keys(r.errores).length, 5, 'el formulario debe marcar todos los campos');
});

// ------------------------------------------------------------------
// Clasificación de cuotas
// ------------------------------------------------------------------

const factura = (id: number, estado: FacturaResumen['estado'], total: number, pagado: number): FacturaResumen => ({
  id,
  numero: `0001-${String(id).padStart(8, '0')}`,
  anio: 2026,
  mes: 9,
  total,
  montoPagado: pagado,
  saldo: redondear(total - pagado),
  estado,
  fechaVencimiento: '2026-10-13',
});

const FACTURAS: FacturaResumen[] = [
  factura(1, 'PAGADA', 255000, 255000),
  factura(2, 'VENCIDA', 255000, 0),
  factura(3, 'PENDIENTE', 255000, 0),
  factura(4, 'PARCIAL', 255000, 120000),
  factura(5, 'EN_REVISION', 255000, 0),
  factura(6, 'ANULADA', 255000, 0),
];

test('cada estado cae en la solapa correcta', () => {
  assert.equal(solapaDe(FACTURAS[0]!), 'pagadas');
  assert.equal(solapaDe(FACTURAS[1]!), 'vencidas');
  assert.equal(solapaDe(FACTURAS[2]!), 'pendientes');
  assert.equal(solapaDe(FACTURAS[3]!), 'pendientes');
  assert.equal(solapaDe(FACTURAS[4]!), 'pendientes');
});

test('una factura anulada no figura en ninguna solapa', () => {
  // No es deuda ni es un pago: mostrarla confundiría.
  assert.equal(solapaDe(FACTURAS[5]!), null);
});

test('las tres solapas cubren todo menos las anuladas', () => {
  const conteo = contarPorSolapa(FACTURAS);
  assert.deepEqual(conteo, { pendientes: 3, vencidas: 1, pagadas: 1 });
  assert.equal(conteo.pendientes + conteo.vencidas + conteo.pagadas, FACTURAS.length - 1);
});

test('filtrarPorSolapa devuelve sólo lo que corresponde', () => {
  assert.equal(filtrarPorSolapa(FACTURAS, 'vencidas').length, 1);
  assert.equal(filtrarPorSolapa(FACTURAS, 'pagadas')[0]!.estado, 'PAGADA');
});

test('la solapa se decide por el estado del backend, no por la fecha', () => {
  // Una factura PENDIENTE con vencimiento pasado sigue siendo "pendiente" hasta
  // que el backend la marque VENCIDA. Si la app decidiera por su cuenta,
  // mostraría algo distinto de lo que dice el sistema.
  const vencidaSegunFecha = { ...factura(7, 'PENDIENTE', 1000, 0), fechaVencimiento: '2020-01-01' };
  assert.equal(solapaDe(vencidaSegunFecha), 'pendientes');
});

test('deudaTotal suma los saldos vivos e ignora pagadas y anuladas', () => {
  // vencida 255000 + pendiente 255000 + parcial 135000 + en revisión 255000
  assert.equal(deudaTotal(FACTURAS), 900000);
});

test('deudaTotal es cero si está todo pagado', () => {
  assert.equal(deudaTotal([factura(1, 'PAGADA', 1000, 1000)]), 0);
});

test('porcentajePagado alimenta la barra de progreso', () => {
  assert.equal(porcentajePagado(factura(1, 'PARCIAL', 200000, 50000)), 25);
  assert.equal(porcentajePagado(factura(2, 'PAGADA', 200000, 200000)), 100);
  assert.equal(porcentajePagado(factura(3, 'PENDIENTE', 200000, 0)), 0);
});

test('porcentajePagado no se pasa de 100 si se pagó de más', () => {
  // Pagar de más es legítimo (un adelanto): la barra no debe desbordar.
  assert.equal(porcentajePagado(factura(4, 'PAGADA', 100000, 150000)), 100);
});

test('porcentajePagado no divide por cero', () => {
  assert.equal(porcentajePagado(factura(5, 'PENDIENTE', 0, 0)), 0);
});
