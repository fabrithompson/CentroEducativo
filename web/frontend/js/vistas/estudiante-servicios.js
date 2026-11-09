/**
 * Panel del estudiante — Mis servicios y cuotas.
 *
 * Lo mismo que el estudiante ve en la app: el transporte y el comedor del mes,
 * sus cuotas con el estado de cada una y la deuda discriminada por concepto.
 * Es de sólo lectura: pagar e inscribir son de los padres (consigna, Parte 3).
 *
 * Usa las rutas del portal de familias (`/api/padres/mis-hijos/...`), que para
 * un estudiante devuelven sólo lo suyo: `assertPuedeVerAlumno` en el backend lo
 * limita a su propio legajo.
 */

import api from '../api.js';
import { verComprobante } from '../comprobante.js';
import { badge, esc, estadoVacio, fecha, grillaIndicadores, hora, moneda, periodoActual, render, tabla } from '../ui.js';

async function contenido() {
  const { hijos } = await api.padres.misHijos();
  const yo = hijos[0];
  if (!yo) {
    return estadoVacio('Tu usuario no está asociado a un legajo de alumno. Pedilo en secretaría.', 'fa-id-card');
  }
  const alumnoId = yo.alumno.id;

  const [servicios, { facturas, resumen }, deuda] = await Promise.all([
    api.padres.servicios(alumnoId, periodoActual()),
    api.padres.facturas(alumnoId),
    api.padres.deuda(alumnoId),
  ]);

  const transporte = servicios.transporte?.estado === 'ACTIVA' ? servicios.transporte : null;
  const comedor = servicios.comedor?.estado === 'ACTIVA' ? servicios.comedor : null;

  return `
    <h3 class="ficha__titulo"><i class="fas fa-bus" aria-hidden="true"></i> Servicios de este mes</h3>
    <div class="grilla-tarjetas">
      <div class="tarjeta">
        <p class="tarjeta__titulo">Transporte escolar</p>
        ${transporte
          ? `<p class="tarjeta__sub">${esc(transporte.recorrido.codigo)} · ${esc(transporte.recorrido.nombre)}</p>
             <p class="tarjeta__sub">Sale ${esc(hora(transporte.recorrido.horaSalida))} · regresa ${esc(hora(transporte.recorrido.horaRegreso))}</p>
             <p class="tarjeta__sub">${badge(transporte.turno)}</p>`
          : '<p class="tarjeta__sub">No tenés transporte contratado este mes.</p>'}
      </div>
      <div class="tarjeta">
        <p class="tarjeta__titulo">Comedor</p>
        ${comedor
          ? `<p class="tarjeta__sub">${esc(comedor.comedor.nombre)}</p>
             <p class="tarjeta__sub">Almuerzo a las ${esc(hora(comedor.comedor.horaServicio))}</p>`
          : '<p class="tarjeta__sub">No tenés comedor contratado este mes.</p>'}
      </div>
    </div>

    <h3 class="ficha__titulo" style="margin-top:24px"><i class="fas fa-file-invoice-dollar" aria-hidden="true"></i> Mis cuotas</h3>
    <p>Los pagos los hace tu familia desde la app o el campus.</p>
    ${grillaIndicadores([
      { titulo: 'Deuda total', valor: moneda(resumen.deudaTotal), tono: resumen.deudaTotal > 0 ? 'alerta' : 'ok', icono: 'fa-scale-balanced' },
      { titulo: 'Vencidas', valor: resumen.vencidas, icono: 'fa-calendar-xmark' },
      { titulo: 'En revisión', valor: resumen.enRevision, icono: 'fa-hourglass-half' },
    ])}
    ${tabla({
      caption: 'Cuotas y su estado',
      columnas: [
        { clave: 'periodo', titulo: 'Período', render: (f) => `${String(f.mes).padStart(2, '0')}/${esc(f.anio)}` },
        { clave: 'total', titulo: 'Total', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.total)}</span>` },
        { clave: 'pagado', titulo: 'Pagado', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.montoPagado)}</span>` },
        { clave: 'saldo', titulo: 'Saldo', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.saldo)}</span>` },
        { clave: 'vence', titulo: 'Vence', render: (f) => fecha(f.fechaVencimiento) },
        { clave: 'estado', titulo: 'Estado', render: (f) => badge(f.estado) },
        {
          clave: 'comprobante', titulo: 'Comprobante',
          render: (f) => `
            <button type="button" class="btn btn--suave btn--chico" data-ver-comprobante="${f.id}" data-numero="${esc(f.numero)}"
                    aria-label="Ver el comprobante ${esc(f.numero)} en una pestaña nueva">
              <i class="fas fa-file-lines" aria-hidden="true"></i> Ver
            </button>`,
        },
      ],
      filas: facturas.filter((f) => f.estado !== 'ANULADA'),
      vacio: 'Todavía no hay cuotas emitidas.',
    })}

    ${deuda.deudaPorItem.length
      ? `<h3 class="ficha__titulo" style="margin-top:24px">Deuda por concepto</h3>
         ${tabla({
           caption: 'Deuda discriminada por concepto',
           columnas: [
             { clave: 'tipo', titulo: 'Concepto', render: (d) => badge(d.tipo) },
             { clave: 'facturado', titulo: 'Facturado', alinear: 'derecha', render: (d) => `<span class="numero">${moneda(d.facturado)}</span>` },
             { clave: 'adeudado', titulo: 'Adeudado', alinear: 'derecha', render: (d) => `<span class="numero">${moneda(d.adeudado)}</span>` },
           ],
           filas: deuda.deudaPorItem,
         })}
         <p><small>${esc(deuda.nota)}</small></p>`
      : ''}`;
}

export async function iniciarServiciosEstudiante(idContenedor = 'vista-mis-servicios') {
  const contenedor = document.getElementById(idContenedor);
  if (!contenedor) return;
  await render(contenedor, contenido, { mensajeCarga: 'Cargando tus servicios y cuotas…' });
  contenedor.querySelectorAll('[data-ver-comprobante]').forEach((btn) => {
    btn.addEventListener('click', () => void verComprobante(btn.dataset.verComprobante, btn.dataset.numero));
  });
}

export default { iniciarServiciosEstudiante };
