/**
 * Tests de las plantillas de la factura simulada y de los correos.
 *
 * Son funciones puras, así que se puede verificar exactamente qué le va a
 * llegar a la familia sin mandar un solo mail. Importa porque estos textos
 * salen del sistema sin que nadie los revise antes.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INSTITUCION,
  asuntoRecordatorio,
  asuntoResumenMensual,
  comprobanteAprobadoTexto,
  comprobanteRechazadoTexto,
  etiquetaTipo,
  facturaHtml,
  recordatorioHtml,
  recordatorioTexto,
  resumenMensualHtml,
  resumenMensualTexto,
  type DatosFactura,
  type DatosRecordatorio,
  type DatosResumenMensual,
} from './plantillas.ts';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

const FACTURA: DatosFactura = {
  numero: '0001-00000042',
  periodo: { anio: 2026, mes: 9 },
  fechaEmision: d('2026-09-30'),
  fechaVencimiento: d('2026-10-13'),
  alumno: 'Medina, Mateo Nicolás',
  legajo: 'A-0001',
  curso: '1er Año "A"',
  nivel: 'Secundario',
  tutor: 'Patricia Medina',
  items: [
    { tipo: 'CUOTA', descripcion: 'Cuota mensual — Secundario', cantidad: 1, precioUnitario: 104000, subtotal: 104000 },
    { tipo: 'TRANSPORTE', descripcion: 'Recorrido 1 — Centro', cantidad: 1, precioUnitario: 46000, subtotal: 46000 },
    { tipo: 'COMEDOR', descripcion: 'Comedor — 5 días', cantidad: 1, precioUnitario: 68000, subtotal: 68000 },
    { tipo: 'DEPORTE', descripcion: 'Fútbol', cantidad: 1, precioUnitario: 22000, subtotal: 22000 },
  ],
  subtotal: 240000,
  recargo: 0,
  total: 240000,
  montoPagado: 0,
  estado: 'PENDIENTE',
};

// ------------------------------------------------------------------
// Factura electrónica simulada
// ------------------------------------------------------------------

test('la factura incluye el número, el alumno y el legajo', () => {
  const html = facturaHtml(FACTURA);
  assert.match(html, /0001-00000042/);
  assert.match(html, /Medina, Mateo Nicolás/);
  assert.match(html, /A-0001/);
});

test('la factura lista los cuatro conceptos discriminados', () => {
  const html = facturaHtml(FACTURA);
  for (const etiqueta of ['Cuota', 'Transporte', 'Comedor', 'Deportes']) {
    assert.match(html, new RegExp(etiqueta), `falta el concepto ${etiqueta}`);
  }
});

test('la factura aclara que NO es un comprobante fiscal', () => {
  // Emitir algo con aspecto de factura sin aclararlo sería un problema serio.
  const html = facturaHtml(FACTURA);
  assert.match(html, /no válido como factura fiscal/i);
  assert.match(html, /AFIP/);
  assert.match(html, /CAE/);
});

test('la factura informa que sólo se acepta transferencia', () => {
  const html = facturaHtml(FACTURA);
  assert.match(html, /únicamente por transferencia bancaria|transferencia bancaria/i);
  assert.match(html, /No se acepta efectivo/i);
  assert.match(html, new RegExp(INSTITUCION.cbu));
  assert.match(html, new RegExp(INSTITUCION.alias.replace(/\./g, '\\.')));
});

test('la factura explica que se puede pagar en varias transferencias', () => {
  assert.match(facturaHtml(FACTURA), /varias transferencias/i);
});

test('la factura muestra el saldo sólo cuando hay un pago parcial', () => {
  assert.doesNotMatch(facturaHtml(FACTURA), /Saldo pendiente/);

  const parcial = { ...FACTURA, montoPagado: 100000, estado: 'PARCIAL' };
  assert.match(facturaHtml(parcial), /Saldo pendiente/);
});

test('la factura escapa el HTML de los nombres', () => {
  // Un apellido con comillas o & no puede romper el documento.
  const conHtml = { ...FACTURA, alumno: 'O\'Brien & <script>alert(1)</script>' };
  const html = facturaHtml(conHtml);

  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&amp;/);
});

test('etiquetaTipo traduce los tipos y deja pasar los desconocidos', () => {
  assert.equal(etiquetaTipo('CUOTA'), 'Cuota');
  assert.equal(etiquetaTipo('DEPORTE'), 'Deportes');
  assert.equal(etiquetaTipo('INVENTADO'), 'INVENTADO');
});

// ------------------------------------------------------------------
// Correo 1 — resumen mensual
// ------------------------------------------------------------------

const RESUMEN: DatosResumenMensual = {
  tutor: 'Patricia Medina',
  periodo: { anio: 2026, mes: 9 },
  fechaVencimiento: d('2026-10-13'),
  hijos: [
    {
      alumno: 'Medina, Mateo',
      curso: 'Secundario · 1er Año "A"',
      numero: '0001-00000042',
      items: FACTURA.items,
      total: 240000,
    },
    {
      alumno: 'Medina, Julieta',
      curso: 'Primario · 4to Grado "A"',
      numero: '0001-00000043',
      items: [{ tipo: 'CUOTA', descripcion: 'Cuota mensual — Primario', cantidad: 1, precioUnitario: 92000, subtotal: 92000 }],
      total: 92000,
    },
  ],
  totalGeneral: 332000,
};

test('el asunto del resumen nombra el período en castellano', () => {
  assert.match(asuntoResumenMensual({ anio: 2026, mes: 9 }), /septiembre de 2026/);
});

test('el resumen incluye a todos los hijos en un solo correo', () => {
  const texto = resumenMensualTexto(RESUMEN);
  assert.match(texto, /Medina, Mateo/);
  assert.match(texto, /Medina, Julieta/);
  assert.match(texto, /0001-00000042/);
  assert.match(texto, /0001-00000043/);
});

test('el resumen muestra el desglose detallado de cada ítem', () => {
  const texto = resumenMensualTexto(RESUMEN);
  for (const etiqueta of ['Cuota', 'Transporte', 'Comedor', 'Deportes']) {
    assert.match(texto, new RegExp(etiqueta));
  }
});

test('el resumen informa el total general y el vencimiento', () => {
  const texto = resumenMensualTexto(RESUMEN);
  assert.match(texto, /TOTAL A ABONAR/);
  assert.match(texto, /332\.000|332000/);
  assert.match(texto, /13\/10\/2026/);
});

test('el resumen explica la forma de pago y el CBU', () => {
  const texto = resumenMensualTexto(RESUMEN);
  assert.match(texto, /transferencia bancaria/i);
  assert.match(texto, /No se acepta efectivo/i);
  assert.match(texto, new RegExp(INSTITUCION.cbu));
});

test('la versión HTML del resumen contiene los mismos datos clave', () => {
  const html = resumenMensualHtml(RESUMEN);
  assert.match(html, /Medina, Mateo/);
  assert.match(html, /Medina, Julieta/);
  assert.match(html, /septiembre de 2026/);
  assert.match(html, new RegExp(INSTITUCION.cbu));
});

// ------------------------------------------------------------------
// Correo 2 — recordatorio de deuda
// ------------------------------------------------------------------

const RECORDATORIO: DatosRecordatorio = {
  tutor: 'Roberto Pérez',
  periodo: { anio: 2026, mes: 9 },
  facturas: [
    {
      numero: '0001-00000050',
      alumno: 'Pérez, Juan',
      total: 198000,
      pagado: 100000,
      saldo: 98000,
      fechaVencimiento: d('2026-10-13'),
      estado: 'PARCIAL',
      vencida: true,
    },
  ],
  deudaTotal: 98000,
};

test('el asunto del recordatorio distingue si hay facturas vencidas', () => {
  assert.match(asuntoRecordatorio({ anio: 2026, mes: 9 }, true), /vencida/i);
  assert.doesNotMatch(asuntoRecordatorio({ anio: 2026, mes: 9 }, false), /vencida/i);
});

test('el recordatorio muestra total, pagado y saldo', () => {
  const texto = recordatorioTexto(RECORDATORIO);
  assert.match(texto, /Total:/);
  assert.match(texto, /Ya abonado:/);
  assert.match(texto, /Saldo adeudado:/);
  assert.match(texto, /TOTAL ADEUDADO/);
});

test('el recordatorio marca las facturas vencidas', () => {
  assert.match(recordatorioTexto(RECORDATORIO), /VENCIDA/);

  const alDia = {
    ...RECORDATORIO,
    facturas: [{ ...RECORDATORIO.facturas[0], vencida: false }],
  };
  assert.doesNotMatch(recordatorioTexto(alDia), /VENCIDA/);
});

test('el recordatorio avisa cuando hay un comprobante esperando validación', () => {
  const enRevision = {
    ...RECORDATORIO,
    facturas: [{ ...RECORDATORIO.facturas[0], estado: 'EN_REVISION' }],
  };

  // Sin esta aclaración, una familia que ya pagó recibe un reclamo y se enoja
  // con razón.
  assert.match(recordatorioTexto(enRevision), /esperando validación/i);
});

test('el recordatorio aclara que se ignore si ya se pagó', () => {
  assert.match(recordatorioTexto(RECORDATORIO), /Si ya abonaste/i);
});

test('la versión HTML del recordatorio contiene el saldo', () => {
  const html = recordatorioHtml(RECORDATORIO);
  assert.match(html, /Pérez, Juan/);
  assert.match(html, /Total adeudado/);
  assert.match(html, /vencida/i);
});

// ------------------------------------------------------------------
// Correo 3 — validación del comprobante
// ------------------------------------------------------------------

test('el aviso de aprobación informa si queda saldo', () => {
  const conSaldo = comprobanteAprobadoTexto({
    tutor: 'Patricia',
    numero: '0001-00000042',
    alumno: 'Medina, Mateo',
    monto: 120000,
    saldo: 120000,
  });
  assert.match(conSaldo, /saldo pendiente/i);

  const saldado = comprobanteAprobadoTexto({
    tutor: 'Patricia',
    numero: '0001-00000042',
    alumno: 'Medina, Mateo',
    monto: 240000,
    saldo: 0,
  });
  assert.match(saldado, /totalmente saldada/i);
  assert.doesNotMatch(saldado, /saldo pendiente/i);
});

test('el aviso de rechazo incluye el motivo y cómo corregirlo', () => {
  const texto = comprobanteRechazadoTexto({
    tutor: 'Roberto',
    numero: '0001-00000050',
    alumno: 'Pérez, Juan',
    monto: 50000,
    motivo: 'El comprobante corresponde a otra cuenta de destino.',
  });

  assert.match(texto, /otra cuenta de destino/);
  assert.match(texto, /volver a subir/i);
  assert.match(texto, new RegExp(INSTITUCION.email.replace(/\./g, '\\.')));
});
