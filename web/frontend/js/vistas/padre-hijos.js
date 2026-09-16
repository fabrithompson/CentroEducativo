/**
 * Panel del tutor — ficha de sus hijos.
 *
 * Consume `/api/padres/mis-hijos/...`, que es el único camino por el que un
 * tutor puede leer datos de un alumno: el backend verifica el vínculo antes de
 * devolver nada. Esta vista nunca pide un `alumnoId` que no haya salido de
 * `/mis-hijos`.
 *
 * Cuatro pestañas por hijo: ficha y materias, deportes, servicios, y estado de
 * cuenta con carga de comprobantes.
 */

import api from '../api.js';
import {
  badge,
  esc,
  estadoVacio,
  fecha,
  grillaIndicadores,
  hora,
  dia,
  moneda,
  periodoActual,
  render,
  tabla,
  avisar,
} from '../ui.js';

let hijos = [];
let hijoActivo = null;
let seccionActiva = 'ficha';

// ==================================================================
// Ficha y materias
// ==================================================================

async function seccionFicha(alumnoId) {
  const { alumno } = await api.padres.hijo(alumnoId);

  const materias = alumno.curso?.materias ?? [];

  const columnas = [
    { clave: 'nombre', titulo: 'Materia', render: (m) => `<strong>${esc(m.nombre)}</strong>` },
    {
      clave: 'docente', titulo: 'Docente a cargo',
      render: (m) =>
        m.profesor
          ? `${esc(m.profesor.apellido)}, ${esc(m.profesor.nombres)}<br><small>${esc(m.profesor.especialidad)}</small>`
          : '<em>Sin docente asignado</em>',
    },
    { clave: 'contacto', titulo: 'Contacto', render: (m) => (m.profesor?.email ? esc(m.profesor.email) : '—') },
    { clave: 'cargaHoraria', titulo: 'Horas', alinear: 'derecha', render: (m) => `${esc(m.cargaHoraria)} h` },
  ];

  return `
    <div class="ficha">
      <h3 class="ficha__titulo">
        <i class="fas fa-id-card" aria-hidden="true"></i>
        ${esc(alumno.apellido)}, ${esc(alumno.nombres)}
      </h3>
      <dl class="ficha__datos">
        <div><dt>Legajo</dt><dd>${esc(alumno.legajo)}</dd></div>
        <div><dt>DNI</dt><dd>${esc(alumno.dni)}</dd></div>
        <div><dt>Nacimiento</dt><dd>${fecha(alumno.fechaNacimiento)}</dd></div>
        <div><dt>Nivel</dt><dd>${esc(alumno.curso?.nivel?.nombre ?? '—')}</dd></div>
        <div><dt>Curso</dt><dd>${esc(alumno.curso?.nombre ?? '—')} "${esc(alumno.curso?.division ?? '')}"</dd></div>
        <div><dt>Turno</dt><dd>${esc(alumno.curso?.turno ?? '—')}</dd></div>
        <div><dt>Domicilio</dt><dd>${esc(alumno.domicilio)}, ${esc(alumno.localidad)}</dd></div>
        <div><dt>Teléfono</dt><dd>${esc(alumno.telefono ?? '—')}</dd></div>
        <div><dt>Estado</dt><dd>${badge(alumno.estado)}</dd></div>
        <div><dt>Ingreso</dt><dd>${fecha(alumno.fechaIngreso)}</dd></div>
      </dl>
    </div>

    <div class="ficha">
      <h3 class="ficha__titulo">
        <i class="fas fa-book-open" aria-hidden="true"></i>
        Materias y docentes a cargo
      </h3>
      ${tabla({
        caption: `Materias de ${alumno.curso?.nombre ?? 'el curso'}`,
        columnas,
        filas: materias,
        vacio: 'El curso todavía no tiene materias cargadas.',
      })}
    </div>`;
}

// ==================================================================
// Deportes
// ==================================================================

async function seccionDeportes(alumnoId) {
  const data = await api.padres.deportes(alumnoId);
  const { cupo, deportes } = data;

  if (deportes.length === 0) {
    return `
      ${cupoDeportes(cupo)}
      ${estadoVacio('Todavía no está inscripto en ninguna actividad deportiva. Consultá en Administración para anotarlo.', 'fa-futbol')}`;
  }

  const tarjetas = deportes
    .map(
      (d) => `
      <div class="tarjeta">
        <p class="tarjeta__titulo">${esc(d.deporte.nombre)}</p>
        <p class="tarjeta__sub">
          Profesor: ${esc(d.deporte.profesorResponsable.apellido)}, ${esc(d.deporte.profesorResponsable.nombres)}
        </p>
        <p class="tarjeta__sub">
          <strong>${moneda(d.deporte.arancelMensual)}</strong> por mes
        </p>
        <h4 class="sr-only">Horarios de ${esc(d.deporte.nombre)}</h4>
        <ul class="lista-horarios">
          ${d.deporte.horarios
            .map(
              (h) => `<li>
                <span>${esc(dia(h.diaSemana))}</span>
                <span>${esc(h.horaInicioTexto ?? hora(h.horaInicio))}–${esc(h.horaFinTexto ?? hora(h.horaFin))}</span>
              </li>`,
            )
            .join('')}
        </ul>
        ${d.deporte.horarios[0]?.lugar ? `<p class="tarjeta__sub" style="margin-top:8px"><i class="fas fa-location-dot" aria-hidden="true"></i> ${esc(d.deporte.horarios[0].lugar)}</p>` : ''}
      </div>`,
    )
    .join('');

  return `
    ${cupoDeportes(cupo)}
    <div class="grilla-tarjetas">${tarjetas}</div>`;
}

function cupoDeportes(cupo) {
  const lleno = cupo.usado >= cupo.maximo;
  return `
    <div class="aviso-cupo ${lleno ? 'aviso-cupo--lleno' : ''}" role="status">
      <i class="fas ${lleno ? 'fa-circle-check' : 'fa-circle-info'}" aria-hidden="true"></i>
      <span>
        Cursa <strong>${esc(cupo.usado)}</strong> de ${esc(cupo.maximo)} deportes permitidos.
        ${lleno
          ? 'Alcanzó el máximo: para sumar otro hay que dar de baja uno.'
          : `Puede sumar ${esc(cupo.maximo - cupo.usado)} más.`}
      </span>
    </div>`;
}

// ==================================================================
// Servicios
// ==================================================================

async function seccionServicios(alumnoId) {
  const p = periodoActual();
  const data = await api.padres.servicios(alumnoId, p);

  const transporte = data.transporte
    ? `
      <div class="tarjeta">
        <p class="tarjeta__titulo"><i class="fas fa-bus" aria-hidden="true"></i> Transporte escolar</p>
        <p class="tarjeta__sub">${esc(data.transporte.recorrido.nombre)}</p>
        <dl class="ficha__datos">
          <div><dt>Zonas</dt><dd>${esc(data.transporte.recorrido.zonas)}</dd></div>
          <div><dt>Turno</dt><dd>${badge(data.transporte.turno)}</dd></div>
          <div><dt>Salida</dt><dd>${esc(hora(data.transporte.recorrido.horaSalida))}</dd></div>
          <div><dt>Regreso</dt><dd>${esc(hora(data.transporte.recorrido.horaRegreso))}</dd></div>
          <div><dt>Arancel</dt><dd>${moneda(data.transporte.recorrido.arancelMensual)}</dd></div>
        </dl>
      </div>`
    : '';

  const comedor = data.comedor
    ? `
      <div class="tarjeta">
        <p class="tarjeta__titulo"><i class="fas fa-utensils" aria-hidden="true"></i> Comedor</p>
        <p class="tarjeta__sub">${esc(data.comedor.comedor.nombre)}</p>
        <dl class="ficha__datos">
          <div><dt>Días por semana</dt><dd>${esc(data.comedor.comedor.diasPorSemana)}</dd></div>
          <div><dt>Horario</dt><dd>${esc(hora(data.comedor.comedor.horaServicio))}</dd></div>
          <div><dt>Arancel</dt><dd>${moneda(data.comedor.comedor.arancelMensual)}</dd></div>
        </dl>
      </div>`
    : '';

  if (!transporte && !comedor && data.deportes.length === 0) {
    return estadoVacio('No tiene servicios opcionales contratados este mes.', 'fa-box-open');
  }

  const c = data.costoMensualEstimado;

  return `
    ${grillaIndicadores([
      { titulo: 'Transporte', valor: moneda(c.transporte), icono: 'fa-bus' },
      { titulo: 'Comedor', valor: moneda(c.comedor), icono: 'fa-utensils' },
      { titulo: 'Deportes', valor: moneda(c.deportes), icono: 'fa-futbol' },
      { titulo: 'Total de servicios', valor: moneda(c.total), tono: 'espera', detalle: 'Sin la cuota base', icono: 'fa-calculator' },
    ])}
    <div class="grilla-tarjetas">${transporte}${comedor}</div>`;
}

// ==================================================================
// Estado de cuenta
// ==================================================================

async function seccionCuenta(alumnoId) {
  const [facturasResp, deudaResp] = await Promise.all([
    api.padres.facturas(alumnoId),
    api.padres.deuda(alumnoId),
  ]);

  const { facturas, resumen } = facturasResp;

  const columnas = [
    { clave: 'numero', titulo: 'Comprobante', render: (f) => `<strong>${esc(f.numero)}</strong>` },
    { clave: 'periodo', titulo: 'Período', render: (f) => `${String(f.mes).padStart(2, '0')}/${esc(f.anio)}` },
    { clave: 'total', titulo: 'Total', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.total)}</span>` },
    { clave: 'montoPagado', titulo: 'Pagado', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.montoPagado)}</span>` },
    { clave: 'saldo', titulo: 'Saldo', alinear: 'derecha', render: (f) => `<span class="numero">${moneda(f.saldo)}</span>` },
    { clave: 'fechaVencimiento', titulo: 'Vence', render: (f) => fecha(f.fechaVencimiento) },
    { clave: 'estado', titulo: 'Estado', render: (f) => badge(f.estado) },
    {
      clave: 'acciones', titulo: 'Acciones',
      render: (f) => `
        <div class="acciones-fila">
          <a class="btn btn--suave btn--chico" href="${esc(api.facturacion.urlComprobante(f.id))}" target="_blank" rel="noopener">
            <i class="fas fa-file-lines" aria-hidden="true"></i> Ver
          </a>
          ${f.saldo > 0 && f.estado !== 'ANULADA'
            ? `<button type="button" class="btn btn--primario btn--chico" data-pagar="${f.id}" data-numero="${esc(f.numero)}" data-saldo="${f.saldo}">
                 <i class="fas fa-upload" aria-hidden="true"></i> Subir comprobante
               </button>`
            : ''}
        </div>`,
    },
  ];

  const detalleItems = facturas
    .slice(0, 3)
    .map(
      (f) => `
      <details class="detalle-factura">
        <summary>Detalle del comprobante ${esc(f.numero)} — ${String(f.mes).padStart(2, '0')}/${esc(f.anio)}</summary>
        ${tabla({
          caption: `Conceptos facturados en ${esc(f.numero)}`,
          columnas: [
            { clave: 'tipo', titulo: 'Concepto', render: (i) => badge(i.tipo) },
            { clave: 'descripcion', titulo: 'Detalle' },
            { clave: 'subtotal', titulo: 'Importe', alinear: 'derecha', render: (i) => `<span class="numero">${moneda(i.subtotal)}</span>` },
          ],
          filas: f.items,
        })}
        ${f.comprobantes.length
          ? tabla({
              caption: `Transferencias cargadas para ${esc(f.numero)}`,
              columnas: [
                { clave: 'fechaTransferencia', titulo: 'Fecha', render: (c) => fecha(c.fechaTransferencia) },
                { clave: 'bancoOrigen', titulo: 'Banco' },
                { clave: 'numeroOperacion', titulo: 'N° operación' },
                { clave: 'monto', titulo: 'Importe', alinear: 'derecha', render: (c) => `<span class="numero">${moneda(c.monto)}</span>` },
                {
                  clave: 'estado', titulo: 'Estado',
                  render: (c) => `${badge(c.estado)}${c.motivoRechazo ? `<br><small>${esc(c.motivoRechazo)}</small>` : ''}`,
                },
              ],
              filas: f.comprobantes,
            })
          : ''}
      </details>`,
    )
    .join('');

  const deudaPorItem = deudaResp.deudaPorItem.length
    ? `
      <div class="ficha">
        <h3 class="ficha__titulo"><i class="fas fa-list-check" aria-hidden="true"></i> Deuda discriminada por concepto</h3>
        ${tabla({
          caption: 'Deuda por concepto',
          columnas: [
            { clave: 'tipo', titulo: 'Concepto', render: (d) => badge(d.tipo) },
            { clave: 'facturado', titulo: 'Facturado', alinear: 'derecha', render: (d) => `<span class="numero">${moneda(d.facturado)}</span>` },
            { clave: 'adeudado', titulo: 'Adeudado', alinear: 'derecha', render: (d) => `<span class="numero">${moneda(d.adeudado)}</span>` },
          ],
          filas: deudaResp.deudaPorItem,
        })}
        <p class="nota-criterio"><i class="fas fa-circle-info" aria-hidden="true"></i> ${esc(deudaResp.nota)}</p>
      </div>`
    : '';

  return `
    ${grillaIndicadores([
      { titulo: 'Deuda total', valor: moneda(resumen.deudaTotal), tono: resumen.deudaTotal > 0 ? 'alerta' : 'ok', icono: 'fa-wallet' },
      { titulo: 'Comprobantes', valor: resumen.cantidad, icono: 'fa-file-invoice' },
      { titulo: 'Vencidos', valor: resumen.vencidas, tono: resumen.vencidas > 0 ? 'alerta' : 'ok', icono: 'fa-triangle-exclamation' },
      { titulo: 'En revisión', valor: resumen.enRevision, tono: 'espera', detalle: 'Esperando validación', icono: 'fa-hourglass-half' },
    ])}

    <div class="aviso-cupo" role="note">
      <i class="fas fa-building-columns" aria-hidden="true"></i>
      <span>
        El pago se realiza <strong>únicamente por transferencia bancaria</strong>. Después de transferir,
        subí el comprobante con el botón de cada cuota. Podés pagar en varias transferencias.
      </span>
    </div>

    ${tabla({ caption: 'Estado de cuenta', columnas, filas: facturas, vacio: 'Todavía no hay comprobantes emitidos.' })}
    ${deudaPorItem}
    ${detalleItems}`;
}

// ==================================================================
// Carga de comprobante
// ==================================================================

function abrirDialogoComprobante(facturaId, numero, saldo) {
  const dlg = document.getElementById('dlg-comprobante');
  if (!dlg) return;

  dlg.querySelector('#cmp-factura').value = facturaId;
  dlg.querySelector('#cmp-numero-factura').textContent = numero;
  dlg.querySelector('#cmp-saldo').textContent = moneda(saldo);

  const monto = dlg.querySelector('#cmp-monto');
  monto.value = saldo;
  monto.max = '';

  dlg.querySelector('#cmp-fecha').value = new Date().toISOString().slice(0, 10);
  dlg.querySelector('#cmp-fecha').max = new Date().toISOString().slice(0, 10);

  dlg.showModal();
  dlg.querySelector('#cmp-monto').focus();
}

function dialogoComprobante() {
  return `
    <dialog id="dlg-comprobante" class="dialogo" aria-labelledby="dlg-titulo">
      <form method="dialog" id="form-comprobante">
        <h2 id="dlg-titulo" class="ficha__titulo">
          <i class="fas fa-upload" aria-hidden="true"></i> Subir comprobante de transferencia
        </h2>

        <p class="dialogo__contexto">
          Comprobante <strong id="cmp-numero-factura"></strong> ·
          saldo pendiente <strong id="cmp-saldo"></strong>
        </p>

        <input type="hidden" id="cmp-factura" name="facturaId">

        <div class="form-grid">
          <div class="campo">
            <label for="cmp-monto" class="requerido">Importe transferido</label>
            <input type="number" id="cmp-monto" name="monto" step="0.01" min="0.01" required>
          </div>
          <div class="campo">
            <label for="cmp-fecha" class="requerido">Fecha de la transferencia</label>
            <input type="date" id="cmp-fecha" name="fechaTransferencia" required>
          </div>
          <div class="campo">
            <label for="cmp-banco" class="requerido">Banco de origen</label>
            <input type="text" id="cmp-banco" name="bancoOrigen" required maxlength="80"
                   placeholder="Banco Nación">
          </div>
          <div class="campo">
            <label for="cmp-operacion" class="requerido">N° de operación</label>
            <input type="text" id="cmp-operacion" name="numeroOperacion" required maxlength="60"
                   placeholder="NAC-7781204">
          </div>
        </div>

        <div class="campo" style="margin-top:14px">
          <label for="cmp-archivo" class="requerido">Comprobante</label>
          <input type="file" id="cmp-archivo" name="comprobante" required
                 accept="image/png,image/jpeg,image/webp,application/pdf"
                 aria-describedby="cmp-archivo-ayuda">
          <span class="ayuda" id="cmp-archivo-ayuda">
            Imagen o PDF del comprobante bancario. Sin el archivo adjunto no se puede registrar el pago.
          </span>
        </div>

        <p class="campo__error" id="cmp-error" role="alert" hidden></p>

        <div class="acciones-fila" style="margin-top:18px;justify-content:flex-end">
          <button type="button" class="btn btn--suave" data-cerrar-dialogo>Cancelar</button>
          <button type="submit" class="btn btn--primario" id="cmp-enviar">
            <i class="fas fa-paper-plane" aria-hidden="true"></i> Enviar comprobante
          </button>
        </div>
      </form>
    </dialog>`;
}

async function enviarComprobante(e) {
  e.preventDefault();

  const form = e.target;
  const error = document.getElementById('cmp-error');
  const boton = document.getElementById('cmp-enviar');

  error.hidden = true;
  boton.disabled = true;
  boton.textContent = 'Enviando…';

  try {
    const fd = new FormData(form);
    const resp = await api.facturacion.subirComprobante(fd);

    document.getElementById('dlg-comprobante').close();
    avisar(resp.mensaje, 'ok');
    if (resp.advertencia) avisar(resp.advertencia, 'info');

    await dibujarSeccion();
  } catch (err) {
    error.textContent = err?.message ?? 'No se pudo enviar el comprobante.';
    error.hidden = false;
  } finally {
    boton.disabled = false;
    boton.innerHTML = '<i class="fas fa-paper-plane" aria-hidden="true"></i> Enviar comprobante';
  }
}

// ==================================================================
// Navegación
// ==================================================================

const SECCIONES = {
  ficha: { titulo: 'Ficha y materias', icono: 'fa-id-card', fn: seccionFicha },
  deportes: { titulo: 'Deportes', icono: 'fa-futbol', fn: seccionDeportes },
  servicios: { titulo: 'Servicios', icono: 'fa-bus', fn: seccionServicios },
  cuenta: { titulo: 'Estado de cuenta', icono: 'fa-file-invoice-dollar', fn: seccionCuenta },
};

function selectorHijos() {
  return `
    <div class="selector-hijo" role="group" aria-label="Elegí a cuál de tus hijos querés ver">
      ${hijos
        .map(
          (h) => `
        <button type="button" data-hijo="${h.alumno.id}" aria-pressed="${h.alumno.id === hijoActivo}">
          ${esc(h.alumno.apellido)}, ${esc(h.alumno.nombres)}
          <small> · ${esc(h.alumno.curso?.nombre ?? '')}</small>
        </button>`,
        )
        .join('')}
    </div>`;
}

function pestaniasSeccion() {
  return `
    <div class="pestanias" role="tablist" aria-label="Información del alumno">
      ${Object.entries(SECCIONES)
        .map(
          ([clave, s]) => `
        <button type="button" role="tab" id="tab-hijo-${clave}"
                aria-selected="${clave === seccionActiva}"
                aria-controls="panel-hijo"
                data-seccion="${clave}"
                class="pestania${clave === seccionActiva ? ' pestania--activa' : ''}">
          <i class="fas ${s.icono}" aria-hidden="true"></i> ${esc(s.titulo)}
        </button>`,
        )
        .join('')}
    </div>`;
}

async function dibujarSeccion() {
  const panel = document.getElementById('panel-hijo');
  if (!panel || hijoActivo === null) return;

  const seccion = SECCIONES[seccionActiva];
  await render(panel, () => seccion.fn(hijoActivo), { mensajeCarga: `Cargando ${seccion.titulo.toLowerCase()}…` });

  panel.querySelectorAll('[data-pagar]').forEach((btn) => {
    btn.addEventListener('click', () =>
      abrirDialogoComprobante(btn.dataset.pagar, btn.dataset.numero, Number(btn.dataset.saldo)),
    );
  });
}

/** Punto de entrada. Lo llama el panel del tutor al abrir la vista. */
export async function iniciarMisHijos(idContenedor = 'vista-mis-hijos') {
  const contenedor = document.getElementById(idContenedor);
  if (!contenedor) return;

  await render(contenedor, async () => {
    const data = await api.padres.misHijos();
    hijos = data.hijos ?? [];

    if (hijos.length === 0) {
      return estadoVacio(
        'Todavía no tenés hijos vinculados a tu cuenta. Administración realiza la vinculación; acercate a secretaría con tu DNI.',
        'fa-children',
      );
    }

    if (hijoActivo === null) hijoActivo = hijos[0].alumno.id;

    return `
      ${selectorHijos()}
      ${pestaniasSeccion()}
      <div id="panel-hijo" role="tabpanel" aria-labelledby="tab-hijo-${seccionActiva}" tabindex="0"></div>
      ${dialogoComprobante()}`;
  }, { mensajeCarga: 'Cargando tus hijos…' });

  if (hijos.length === 0) return;

  contenedor.querySelectorAll('[data-hijo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      hijoActivo = Number(btn.dataset.hijo);
      contenedor.querySelectorAll('[data-hijo]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      dibujarSeccion();
    });
  });

  contenedor.querySelectorAll('[data-seccion]').forEach((btn) => {
    btn.addEventListener('click', () => {
      seccionActiva = btn.dataset.seccion;
      contenedor.querySelectorAll('.pestania').forEach((b) => {
        const activa = b === btn;
        b.classList.toggle('pestania--activa', activa);
        b.setAttribute('aria-selected', String(activa));
      });
      document.getElementById('panel-hijo').setAttribute('aria-labelledby', `tab-hijo-${seccionActiva}`);
      dibujarSeccion();
    });
  });

  const form = document.getElementById('form-comprobante');
  if (form) form.addEventListener('submit', enviarComprobante);

  contenedor.querySelectorAll('[data-cerrar-dialogo]').forEach((btn) => {
    btn.addEventListener('click', () => document.getElementById('dlg-comprobante')?.close());
  });

  await dibujarSeccion();
}

export default { iniciarMisHijos };
