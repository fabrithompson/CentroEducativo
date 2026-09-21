/**
 * Cola de comprobantes de transferencia — panel de administración.
 *
 * La consigna es explícita: no se acepta efectivo, sólo transferencia con
 * comprobante adjunto. El endpoint de validación existía desde el sprint de
 * facturación y no había pantalla, así que la única forma de acreditar un pago
 * era llamar a la API a mano. Mientras tanto la cuota le queda a la familia en
 * "en revisión" y el recordatorio del día 20 la sigue contando como deuda.
 *
 * Lo más útil de esta vista no es el listado sino `coincideConSaldo`, que el
 * servicio ya calcula: avisa cuando el importe transferido no coincide con el
 * saldo de la factura. Es el caso que hay que mirar con atención —un pago
 * parcial, un importe de más, o el comprobante de otra cuota— y el que se
 * escapa cuando se aprueba en piloto automático.
 */

import api from '../api.js';
import {
  avisar,
  badge,
  esc,
  estadoVacio,
  fecha,
  fechaHora,
  grillaIndicadores,
  moneda,
  render,
  tabla,
} from '../ui.js';

let pendientes = [];

// ==================================================================
// Listado
// ==================================================================

function indicadores(datos) {
  const descuadrados = (datos.comprobantes ?? []).filter((c) => !c.coincideConSaldo).length;

  return grillaIndicadores([
    {
      titulo: 'Esperando validación',
      valor: String(datos.cantidad ?? 0),
      icono: 'fa-inbox',
      tono: (datos.cantidad ?? 0) > 0 ? 'espera' : 'ok',
    },
    {
      titulo: 'Monto informado',
      valor: moneda(datos.montoTotal ?? 0),
      detalle: 'Suma de lo que las familias declararon haber transferido',
      icono: 'fa-money-bill-transfer',
    },
    {
      titulo: 'No coinciden con el saldo',
      valor: String(descuadrados),
      detalle: descuadrados > 0 ? 'Revisalos antes de aprobar' : 'Todos cuadran',
      icono: 'fa-triangle-exclamation',
      tono: descuadrados > 0 ? 'alerta' : 'ok',
    },
  ]);
}

function columnaAlumno(c) {
  return `
    <strong>${esc(c.factura.alumno)}</strong><br>
    <span class="tarjeta__sub">
      Legajo ${esc(c.factura.legajo)} · ${esc(c.factura.curso)}
    </span>`;
}

function columnaFactura(c) {
  return `
    ${esc(c.factura.numero)}<br>
    <span class="tarjeta__sub">Período ${esc(c.factura.periodo)}</span>`;
}

function columnaImporte(c) {
  // Se muestran los dos números juntos, y no sólo el transferido, porque la
  // decisión de aprobar depende de compararlos.
  const aviso = c.coincideConSaldo
    ? ''
    : `<br><span class="badge badge--alerta">saldo ${moneda(c.factura.saldo)}</span>`;
  return `<strong>${moneda(c.monto)}</strong>${aviso}`;
}

function columnaTransferencia(c) {
  return `
    ${esc(c.bancoOrigen)}<br>
    <span class="tarjeta__sub">
      Op. ${esc(c.numeroOperacion)} · ${fecha(c.fechaTransferencia)}
    </span>`;
}

function columnaAcciones(c) {
  return `
    <div class="acciones-fila">
      <a class="btn btn--chico btn--suave" href="${esc(c.archivoUrl)}" target="_blank" rel="noopener">
        <i class="fas fa-file-invoice" aria-hidden="true"></i> Ver
      </a>
      <button type="button" class="btn btn--chico btn--ok" data-aprobar="${c.id}">
        <i class="fas fa-check" aria-hidden="true"></i> Acreditar
      </button>
      <button type="button" class="btn btn--chico btn--peligro" data-rechazar="${c.id}">
        <i class="fas fa-xmark" aria-hidden="true"></i> Rechazar
      </button>
    </div>`;
}

async function contenido() {
  const datos = await api.facturacion.pendientes();
  pendientes = datos.comprobantes ?? [];

  if (pendientes.length === 0) {
    return `
      ${indicadores(datos)}
      ${estadoVacio('No hay comprobantes esperando validación.', 'fa-circle-check')}`;
  }

  return `
    ${indicadores(datos)}
    ${tabla({
      caption: 'Comprobantes de transferencia pendientes de validación',
      columnas: [
        { clave: 'alumno', titulo: 'Alumno', render: columnaAlumno },
        { clave: 'factura', titulo: 'Factura', render: columnaFactura },
        { clave: 'monto', titulo: 'Transferido', alinear: 'derecha', render: columnaImporte },
        { clave: 'transferencia', titulo: 'Origen', render: columnaTransferencia },
        {
          clave: 'subidoPor',
          titulo: 'Lo cargó',
          render: (c) => esc(c.subidoPor?.nombre ?? '—'),
        },
        { clave: 'cargadoEl', titulo: 'Cargado', render: (c) => fechaHora(c.cargadoEl) },
        { clave: 'estado', titulo: 'Factura', alinear: 'centro', render: (c) => badge(c.factura.estado) },
        { clave: 'acciones', titulo: 'Acciones', render: columnaAcciones },
      ],
      filas: pendientes,
    })}`;
}

// ==================================================================
// Validación
// ==================================================================

async function aprobar(id) {
  const c = pendientes.find((x) => x.id === id);
  if (!c) return;

  // Si el importe no cuadra con el saldo se pide una confirmación explícita:
  // es el error caro de esta pantalla y no debería poder cometerse de un clic.
  if (!c.coincideConSaldo) {
    const seguir = window.confirm(
      `El importe transferido (${moneda(c.monto)}) no coincide con el saldo de la ` +
        `factura (${moneda(c.factura.saldo)}).\n\n` +
        'Si acreditás igual, la factura queda con la diferencia. ¿Continuar?',
    );
    if (!seguir) return;
  }

  try {
    const r = await api.facturacion.validar(id, true);
    avisar(r.mensaje || 'Pago acreditado.', 'ok');
    await dibujar();
  } catch (err) {
    avisar(err?.message || 'No se pudo acreditar el pago.', 'error');
  }
}

async function rechazar(id) {
  // El motivo es obligatorio del lado del servidor, y con razón: le llega a la
  // familia por correo y es lo único que le dice qué corregir.
  const motivo = window.prompt(
    'Motivo del rechazo.\n\nSe le envía a la familia tal como lo escribas, así que conviene ' +
      'que diga qué tiene que corregir.',
    '',
  );
  if (motivo === null) return;

  if (!motivo.trim()) {
    avisar('Para rechazar un comprobante hay que indicar el motivo.', 'error');
    return;
  }

  try {
    const r = await api.facturacion.validar(id, false, motivo.trim());
    avisar(r.mensaje || 'Comprobante rechazado.', 'ok');
    await dibujar();
  } catch (err) {
    avisar(err?.message || 'No se pudo rechazar el comprobante.', 'error');
  }
}

// ==================================================================
// Armado
// ==================================================================

let contenedor = null;

async function dibujar() {
  await render(contenedor, contenido);

  contenedor.querySelectorAll('[data-aprobar]').forEach((b) => {
    b.addEventListener('click', () => aprobar(Number(b.dataset.aprobar)));
  });
  contenedor.querySelectorAll('[data-rechazar]').forEach((b) => {
    b.addEventListener('click', () => rechazar(Number(b.dataset.rechazar)));
  });
}

export async function iniciarComprobantes(id) {
  contenedor = document.getElementById(id);
  if (!contenedor) return;
  await dibujar();
}

export default { iniciarComprobantes };
