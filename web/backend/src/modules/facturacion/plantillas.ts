/**
 * Plantillas de la factura electrónica simulada y de los correos de cobranza.
 *
 * Funciones puras: reciben datos planos y devuelven strings. No tocan la base ni
 * envían nada, así que el contenido de los mails se puede verificar en un test.
 *
 * La factura es **simulada**: tiene el aspecto y los datos de un comprobante
 * real, pero no está autorizada por AFIP ni lleva CAE. Se genera como HTML —no
 * como PDF— para no sumar una dependencia de renderizado al proyecto; se adjunta
 * al mail y el navegador la imprime a PDF sin problema.
 */

import { formatearFecha, formatearMoneda, nombrePeriodo, type Periodo } from './periodos';

const INSTITUCION = {
  nombre: 'Centro Educativo "Transformar para educar"',
  domicilio: 'Av. 9 de Julio 1250 — Resistencia, Chaco',
  cuit: '30-71234567-9',
  email: 'administracion@educarparatransformar.edu.ar',
  telefono: '362-4123456',
  cbu: '0110599520000012345678',
  alias: 'EDUCAR.TRANSFORMAR.CTA',
  banco: 'Banco de la Nación Argentina',
};

export interface ItemPlantilla {
  tipo: string;
  descripcion: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
}

export interface DatosFactura {
  numero: string;
  periodo: Periodo;
  fechaEmision: Date;
  fechaVencimiento: Date;
  alumno: string;
  legajo: string;
  curso: string;
  nivel: string;
  tutor: string | null;
  items: ItemPlantilla[];
  subtotal: number;
  recargo: number;
  total: number;
  montoPagado: number;
  estado: string;
}

const ETIQUETA_TIPO: Record<string, string> = {
  CUOTA: 'Cuota',
  TRANSPORTE: 'Transporte',
  COMEDOR: 'Comedor',
  DEPORTE: 'Deportes',
  MATRICULA: 'Matrícula',
  RECARGO: 'Recargo',
  OTRO: 'Otros',
};

export function etiquetaTipo(tipo: string): string {
  return ETIQUETA_TIPO[tipo] ?? tipo;
}

/** Escapa HTML. Los nombres vienen de la base y pueden traer `&` o comillas. */
function esc(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==================================================================
// Factura electrónica simulada
// ==================================================================

export function facturaHtml(f: DatosFactura): string {
  const filas = f.items
    .map(
      (i) => `
        <tr>
          <td>${esc(etiquetaTipo(i.tipo))}</td>
          <td>${esc(i.descripcion)}</td>
          <td class="num">${i.cantidad}</td>
          <td class="num">${formatearMoneda(i.precioUnitario)}</td>
          <td class="num">${formatearMoneda(i.subtotal)}</td>
        </tr>`,
    )
    .join('');

  const saldo = f.total - f.montoPagado;

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Factura ${esc(f.numero)} — ${esc(INSTITUCION.nombre)}</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; color: #1c1c1c; margin: 32px; }
  .cab { display: flex; justify-content: space-between; border-bottom: 3px solid #1f4e79; padding-bottom: 16px; }
  .cab h1 { margin: 0 0 4px; font-size: 20px; color: #1f4e79; }
  .cab p { margin: 2px 0; font-size: 12px; color: #555; }
  .doc { text-align: right; }
  .doc .num { font-size: 18px; font-weight: 700; letter-spacing: 1px; }
  .aviso { background: #fff4e5; border-left: 4px solid #d98324; padding: 8px 12px; margin: 16px 0;
           font-size: 12px; color: #6b4310; }
  .datos { display: flex; gap: 40px; margin: 20px 0; font-size: 13px; }
  .datos dt { font-weight: 600; color: #555; font-size: 11px; text-transform: uppercase; }
  .datos dd { margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
  th { background: #1f4e79; color: #fff; text-align: left; padding: 8px; font-size: 12px; }
  td { padding: 8px; border-bottom: 1px solid #e3e3e3; }
  td.num, th.num { text-align: right; }
  .totales { margin-top: 16px; margin-left: auto; width: 320px; font-size: 14px; }
  .totales tr td { border: none; padding: 4px 8px; }
  .totales .final td { border-top: 2px solid #1f4e79; font-weight: 700; font-size: 16px; padding-top: 8px; }
  .saldo { color: #b3261e; }
  .pago { margin-top: 28px; background: #f3f6fa; border: 1px solid #d3dce8; padding: 14px; font-size: 13px; }
  .pago h3 { margin: 0 0 8px; font-size: 14px; color: #1f4e79; }
  .pie { margin-top: 28px; font-size: 11px; color: #777; border-top: 1px solid #ddd; padding-top: 10px; }
</style>
</head>
<body>
  <div class="cab">
    <div>
      <h1>${esc(INSTITUCION.nombre)}</h1>
      <p>${esc(INSTITUCION.domicilio)}</p>
      <p>CUIT ${esc(INSTITUCION.cuit)} · ${esc(INSTITUCION.telefono)}</p>
      <p>${esc(INSTITUCION.email)}</p>
    </div>
    <div class="doc">
      <p>COMPROBANTE DE CUOTA</p>
      <p class="num">N° ${esc(f.numero)}</p>
      <p>Emisión: ${formatearFecha(f.fechaEmision)}</p>
      <p>Vencimiento: <strong>${formatearFecha(f.fechaVencimiento)}</strong></p>
    </div>
  </div>

  <p class="aviso">
    <strong>Documento no válido como factura fiscal.</strong>
    Comprobante interno de gestión escolar, emitido a los fines del Trabajo Práctico
    Integrador. No está autorizado por AFIP ni posee CAE.
  </p>

  <div class="datos">
    <dl>
      <dt>Alumno</dt><dd>${esc(f.alumno)}</dd>
      <dt>Legajo</dt><dd>${esc(f.legajo)}</dd>
    </dl>
    <dl>
      <dt>Nivel y curso</dt><dd>${esc(f.nivel)} · ${esc(f.curso)}</dd>
      <dt>Período</dt><dd>${nombrePeriodo(f.periodo)}</dd>
    </dl>
    <dl>
      <dt>Responsable de pago</dt><dd>${esc(f.tutor ?? 'Sin tutor asignado')}</dd>
      <dt>Estado</dt><dd>${esc(f.estado)}</dd>
    </dl>
  </div>

  <table>
    <thead>
      <tr>
        <th>Concepto</th><th>Detalle</th>
        <th class="num">Cant.</th><th class="num">Unitario</th><th class="num">Subtotal</th>
      </tr>
    </thead>
    <tbody>${filas}</tbody>
  </table>

  <table class="totales">
    <tr><td>Subtotal</td><td class="num">${formatearMoneda(f.subtotal)}</td></tr>
    ${f.recargo > 0 ? `<tr><td>Recargo por mora</td><td class="num">${formatearMoneda(f.recargo)}</td></tr>` : ''}
    <tr class="final"><td>TOTAL</td><td class="num">${formatearMoneda(f.total)}</td></tr>
    ${f.montoPagado > 0 ? `<tr><td>Pagado</td><td class="num">${formatearMoneda(f.montoPagado)}</td></tr>` : ''}
    ${saldo > 0 && f.montoPagado > 0 ? `<tr class="saldo"><td>Saldo pendiente</td><td class="num">${formatearMoneda(saldo)}</td></tr>` : ''}
  </table>

  <div class="pago">
    <h3>Cómo abonar</h3>
    <p>
      El pago se realiza <strong>únicamente por transferencia bancaria</strong>.
      No se acepta efectivo.
    </p>
    <p>
      Banco: ${esc(INSTITUCION.banco)}<br>
      CBU: <strong>${esc(INSTITUCION.cbu)}</strong><br>
      Alias: <strong>${esc(INSTITUCION.alias)}</strong><br>
      Titular: ${esc(INSTITUCION.nombre)} — CUIT ${esc(INSTITUCION.cuit)}
    </p>
    <p>
      Una vez realizada la transferencia, <strong>subí el comprobante desde el campus o la
      aplicación móvil</strong>. Administración lo valida y la cuota queda saldada.
      Podés abonar en varias transferencias: el sistema acumula los importes aprobados.
    </p>
  </div>

  <p class="pie">
    ${esc(INSTITUCION.nombre)} — Resistencia, Chaco.
    Comprobante generado automáticamente el ${formatearFecha(new Date())}.
    Ante cualquier diferencia, comunicate con Administración a ${esc(INSTITUCION.email)}.
  </p>
</body>
</html>`;
}

// ==================================================================
// Correo 1 — Resumen mensual (último día hábil)
// ==================================================================

export interface DatosResumenMensual {
  tutor: string;
  periodo: Periodo;
  fechaVencimiento: Date;
  hijos: {
    alumno: string;
    curso: string;
    numero: string;
    items: ItemPlantilla[];
    total: number;
  }[];
  totalGeneral: number;
}

export function asuntoResumenMensual(periodo: Periodo): string {
  return `Cuota de ${nombrePeriodo(periodo)} — Transformar para educar`;
}

export function resumenMensualTexto(d: DatosResumenMensual): string {
  const lineas: string[] = [
    `Hola ${d.tutor},`,
    '',
    `Te enviamos el detalle de lo que corresponde abonar por ${nombrePeriodo(d.periodo)}.`,
    '',
  ];

  for (const hijo of d.hijos) {
    lineas.push(`${hijo.alumno} — ${hijo.curso}  (comprobante ${hijo.numero})`);
    for (const item of hijo.items) {
      lineas.push(`   ${etiquetaTipo(item.tipo).padEnd(12)} ${item.descripcion}`);
      lineas.push(`   ${''.padEnd(12)} ${formatearMoneda(item.subtotal)}`);
    }
    lineas.push(`   Subtotal del alumno: ${formatearMoneda(hijo.total)}`);
    lineas.push('');
  }

  lineas.push(
    `TOTAL A ABONAR: ${formatearMoneda(d.totalGeneral)}`,
    `Vencimiento: ${formatearFecha(d.fechaVencimiento)}`,
    '',
    'Forma de pago: únicamente transferencia bancaria. No se acepta efectivo.',
    `  Banco: ${INSTITUCION.banco}`,
    `  CBU:   ${INSTITUCION.cbu}`,
    `  Alias: ${INSTITUCION.alias}`,
    '',
    'Después de transferir, subí el comprobante desde el campus o la aplicación móvil.',
    'Podés abonar en varias transferencias: se acumulan hasta cubrir el total.',
    '',
    'Adjuntamos el comprobante detallado de cada alumno.',
    '',
    `${INSTITUCION.nombre} — Resistencia, Chaco`,
    INSTITUCION.email,
  );

  return lineas.join('\n');
}

export function resumenMensualHtml(d: DatosResumenMensual): string {
  const bloques = d.hijos
    .map(
      (hijo) => `
      <div style="border:1px solid #d3dce8;border-radius:6px;padding:14px;margin-bottom:14px;">
        <p style="margin:0 0 4px;font-weight:600;color:#1f4e79;">${esc(hijo.alumno)}</p>
        <p style="margin:0 0 10px;font-size:12px;color:#666;">${esc(hijo.curso)} · Comprobante ${esc(hijo.numero)}</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          ${hijo.items
            .map(
              (i) => `<tr>
                <td style="padding:4px 0;color:#555;">${esc(etiquetaTipo(i.tipo))}</td>
                <td style="padding:4px 0;">${esc(i.descripcion)}</td>
                <td style="padding:4px 0;text-align:right;white-space:nowrap;">${formatearMoneda(i.subtotal)}</td>
              </tr>`,
            )
            .join('')}
          <tr>
            <td colspan="2" style="padding:8px 0 0;border-top:1px solid #e3e3e3;font-weight:600;">Subtotal</td>
            <td style="padding:8px 0 0;border-top:1px solid #e3e3e3;text-align:right;font-weight:600;">
              ${formatearMoneda(hijo.total)}
            </td>
          </tr>
        </table>
      </div>`,
    )
    .join('');

  return `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1c1c;max-width:640px;">
    <h2 style="color:#1f4e79;margin:0 0 4px;">Cuota de ${nombrePeriodo(d.periodo)}</h2>
    <p style="margin:0 0 18px;color:#555;">Hola ${esc(d.tutor)}, este es el detalle del período.</p>

    ${bloques}

    <div style="background:#1f4e79;color:#fff;padding:14px;border-radius:6px;">
      <p style="margin:0;font-size:13px;opacity:.85;">Total a abonar</p>
      <p style="margin:2px 0 0;font-size:24px;font-weight:700;">${formatearMoneda(d.totalGeneral)}</p>
      <p style="margin:6px 0 0;font-size:13px;">Vence el ${formatearFecha(d.fechaVencimiento)}</p>
    </div>

    <div style="background:#f3f6fa;border:1px solid #d3dce8;padding:14px;margin-top:16px;font-size:13px;">
      <p style="margin:0 0 8px;font-weight:600;color:#1f4e79;">Cómo abonar</p>
      <p style="margin:0 0 8px;">
        Únicamente por <strong>transferencia bancaria</strong>. No se acepta efectivo.
      </p>
      <p style="margin:0 0 8px;">
        ${esc(INSTITUCION.banco)}<br>
        CBU: <strong>${esc(INSTITUCION.cbu)}</strong><br>
        Alias: <strong>${esc(INSTITUCION.alias)}</strong>
      </p>
      <p style="margin:0;">
        Después de transferir, subí el comprobante desde el campus o la app.
        Podés pagar en varias transferencias: se acumulan hasta cubrir el total.
      </p>
    </div>

    <p style="margin-top:20px;font-size:11px;color:#777;">
      ${esc(INSTITUCION.nombre)} — Resistencia, Chaco · ${esc(INSTITUCION.email)}
    </p>
  </div>`;
}

// ==================================================================
// Correo 2 — Recordatorio de deuda (día 20)
// ==================================================================

export interface DatosRecordatorio {
  tutor: string;
  periodo: Periodo;
  facturas: {
    numero: string;
    alumno: string;
    total: number;
    pagado: number;
    saldo: number;
    fechaVencimiento: Date;
    estado: string;
    vencida: boolean;
  }[];
  deudaTotal: number;
}

export function asuntoRecordatorio(periodo: Periodo, hayVencidas: boolean): string {
  return hayVencidas
    ? `Cuota vencida de ${nombrePeriodo(periodo)} — Transformar para educar`
    : `Recordatorio de pago — ${nombrePeriodo(periodo)}`;
}

export function recordatorioTexto(d: DatosRecordatorio): string {
  const lineas: string[] = [
    `Hola ${d.tutor},`,
    '',
    `Te recordamos que hay saldo pendiente correspondiente a ${nombrePeriodo(d.periodo)}.`,
    '',
  ];

  for (const f of d.facturas) {
    lineas.push(`Comprobante ${f.numero} — ${f.alumno}`);
    lineas.push(`   Total:          ${formatearMoneda(f.total)}`);
    if (f.pagado > 0) lineas.push(`   Ya abonado:     ${formatearMoneda(f.pagado)}`);
    lineas.push(`   Saldo adeudado: ${formatearMoneda(f.saldo)}`);
    lineas.push(
      `   Vencimiento:    ${formatearFecha(f.fechaVencimiento)}${f.vencida ? '  (VENCIDA)' : ''}`,
    );
    if (f.estado === 'EN_REVISION') {
      lineas.push('   Hay un comprobante cargado esperando validación de Administración.');
    }
    lineas.push('');
  }

  lineas.push(
    `TOTAL ADEUDADO: ${formatearMoneda(d.deudaTotal)}`,
    '',
    'Para regularizar, transferí a:',
    `  Banco: ${INSTITUCION.banco}`,
    `  CBU:   ${INSTITUCION.cbu}`,
    `  Alias: ${INSTITUCION.alias}`,
    '',
    'y subí el comprobante desde el campus o la aplicación móvil.',
    '',
    'Si ya abonaste y el comprobante está cargado, ignorá este mensaje: puede estar',
    'pendiente de validación.',
    '',
    `Ante cualquier consulta, escribinos a ${INSTITUCION.email}.`,
    '',
    `${INSTITUCION.nombre} — Resistencia, Chaco`,
  );

  return lineas.join('\n');
}

export function recordatorioHtml(d: DatosRecordatorio): string {
  const filas = d.facturas
    .map(
      (f) => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e3e3e3;">
          <strong>${esc(f.alumno)}</strong><br>
          <span style="font-size:11px;color:#777;">${esc(f.numero)}</span>
          ${f.estado === 'EN_REVISION' ? '<br><span style="font-size:11px;color:#b06d00;">Comprobante en revisión</span>' : ''}
        </td>
        <td style="padding:8px;border-bottom:1px solid #e3e3e3;text-align:right;white-space:nowrap;">
          ${formatearMoneda(f.saldo)}
        </td>
        <td style="padding:8px;border-bottom:1px solid #e3e3e3;text-align:right;white-space:nowrap;
                   ${f.vencida ? 'color:#b3261e;font-weight:600;' : ''}">
          ${formatearFecha(f.fechaVencimiento)}${f.vencida ? '<br><span style="font-size:11px;">vencida</span>' : ''}
        </td>
      </tr>`,
    )
    .join('');

  return `
  <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#1c1c1c;max-width:600px;">
    <h2 style="color:#1f4e79;margin:0 0 4px;">Recordatorio de pago</h2>
    <p style="margin:0 0 18px;color:#555;">
      Hola ${esc(d.tutor)}, hay saldo pendiente de ${nombrePeriodo(d.periodo)}.
    </p>

    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f3f6fa;">
          <th style="padding:8px;text-align:left;font-size:12px;color:#555;">Alumno</th>
          <th style="padding:8px;text-align:right;font-size:12px;color:#555;">Saldo</th>
          <th style="padding:8px;text-align:right;font-size:12px;color:#555;">Vencimiento</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>

    <div style="background:#b3261e;color:#fff;padding:14px;border-radius:6px;margin-top:16px;">
      <p style="margin:0;font-size:13px;opacity:.85;">Total adeudado</p>
      <p style="margin:2px 0 0;font-size:24px;font-weight:700;">${formatearMoneda(d.deudaTotal)}</p>
    </div>

    <div style="background:#f3f6fa;border:1px solid #d3dce8;padding:14px;margin-top:16px;font-size:13px;">
      <p style="margin:0 0 8px;font-weight:600;color:#1f4e79;">Para regularizar</p>
      <p style="margin:0 0 8px;">
        ${esc(INSTITUCION.banco)}<br>
        CBU: <strong>${esc(INSTITUCION.cbu)}</strong><br>
        Alias: <strong>${esc(INSTITUCION.alias)}</strong>
      </p>
      <p style="margin:0;">Después de transferir, subí el comprobante desde el campus o la app.</p>
    </div>

    <p style="margin-top:16px;font-size:12px;color:#777;">
      Si ya abonaste y el comprobante está cargado, ignorá este mensaje: puede estar pendiente de validación.
    </p>
    <p style="margin-top:12px;font-size:11px;color:#777;">
      ${esc(INSTITUCION.nombre)} — Resistencia, Chaco · ${esc(INSTITUCION.email)}
    </p>
  </div>`;
}

// ==================================================================
// Correo 3 — Resultado de la validación del comprobante
// ==================================================================

export function comprobanteAprobadoTexto(d: {
  tutor: string;
  numero: string;
  alumno: string;
  monto: number;
  saldo: number;
}): string {
  return [
    `Hola ${d.tutor},`,
    '',
    `Confirmamos la acreditación de tu transferencia de ${formatearMoneda(d.monto)}`,
    `para el comprobante ${d.numero} (${d.alumno}).`,
    '',
    d.saldo > 0
      ? `Queda un saldo pendiente de ${formatearMoneda(d.saldo)}.`
      : 'La cuota quedó totalmente saldada. ¡Gracias!',
    '',
    `${INSTITUCION.nombre} — Resistencia, Chaco`,
  ].join('\n');
}

export function comprobanteRechazadoTexto(d: {
  tutor: string;
  numero: string;
  alumno: string;
  monto: number;
  motivo: string;
}): string {
  return [
    `Hola ${d.tutor},`,
    '',
    `No pudimos acreditar la transferencia de ${formatearMoneda(d.monto)} que cargaste`,
    `para el comprobante ${d.numero} (${d.alumno}).`,
    '',
    `Motivo: ${d.motivo}`,
    '',
    'Podés volver a subir el comprobante corregido desde el campus o la aplicación móvil.',
    `Ante cualquier duda, escribinos a ${INSTITUCION.email}.`,
    '',
    `${INSTITUCION.nombre} — Resistencia, Chaco`,
  ].join('\n');
}

export { INSTITUCION };
