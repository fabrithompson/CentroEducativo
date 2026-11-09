/**
 * Panel del tutor — ficha de sus hijos.
 *
 * Consume `/api/padres/mis-hijos/...`, que es el único camino por el que un
 * tutor puede leer datos de un alumno: el backend verifica el vínculo antes de
 * devolver nada. Esta vista nunca pide un `alumnoId` que no haya salido de
 * `/mis-hijos`.
 *
 * Pestañas por hijo: ficha y materias (con el docente y el horario de cada
 * una), deportes, servicios, estado de cuenta con carga de comprobantes, e
 * inscripción al cursado.
 *
 * Desde deportes y servicios el tutor inscribe y da de baja: la consigna dice
 * que cada alumno puede inscribirse a dos deportes, al transporte por
 * recorrido (opcional, mes a mes) y al comedor. Ninguna regla se decide acá:
 * el tope de 2 deportes, los choques de horario y el vínculo con el hijo los
 * valida el backend, y su mensaje es el que se muestra.
 */

import api from '../api.js';
import { verComprobante } from '../comprobante.js';
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
  MESES,
  pieDialogo,
  plantillaDialogo,
  render,
  tabla,
  textosDialogo,
  turno,
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
    {
      clave: 'horarios', titulo: 'Horarios',
      render: (m) =>
        m.horarios?.length
          ? m.horarios.map((h) => `${esc(dia(h.diaSemana))} ${esc(hora(h.horaInicio))}–${esc(hora(h.horaFin))}`).join('<br>')
          : '—',
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
        <div><dt>Turno</dt><dd>${esc(turno(alumno.curso?.turno))}</dd></div>
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

function listaHorarios(horarios) {
  return `
    <ul class="lista-horarios">
      ${horarios
        .map(
          (h) => `<li>
            <span>${esc(dia(h.diaSemana))}</span>
            <span>${esc(h.horaInicioTexto ?? hora(h.horaInicio))}–${esc(h.horaFinTexto ?? hora(h.horaFin))}</span>
          </li>`,
        )
        .join('')}
    </ul>`;
}

async function seccionDeportes(alumnoId) {
  const [data, disponibles] = await Promise.all([
    api.padres.deportes(alumnoId),
    api.deportes.disponiblesPara(alumnoId),
  ]);
  const { cupo, deportes } = data;
  const inscriptos = new Set(deportes.map((d) => d.deporte.id));

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
        ${listaHorarios(d.deporte.horarios)}
        ${d.deporte.horarios[0]?.lugar ? `<p class="tarjeta__sub" style="margin-top:8px"><i class="fas fa-location-dot" aria-hidden="true"></i> ${esc(d.deporte.horarios[0].lugar)}</p>` : ''}
        <button type="button" class="btn btn--suave btn--chico" style="margin-top:12px"
                data-baja-deporte="${d.inscripcionId}" data-nombre="${esc(d.deporte.nombre)}">
          <i class="fas fa-user-minus" aria-hidden="true"></i> Dar de baja
        </button>
      </div>`,
    )
    .join('');

  const otros = disponibles.deportes
    .filter((d) => !inscriptos.has(d.id))
    .map(
      (d) => `
      <div class="tarjeta">
        <p class="tarjeta__titulo">${esc(d.nombre)}</p>
        <p class="tarjeta__sub">
          Profesor: ${esc(d.profesorResponsable.apellido)}, ${esc(d.profesorResponsable.nombres)}
        </p>
        <p class="tarjeta__sub"><strong>${moneda(d.arancelMensual)}</strong> por mes</p>
        ${listaHorarios(d.horarios)}
        ${d.inscribible
          ? `<button type="button" class="btn btn--primario btn--chico" style="margin-top:12px"
                     data-inscribir-deporte="${d.id}" data-nombre="${esc(d.nombre)}">
               <i class="fas fa-user-plus" aria-hidden="true"></i> Inscribir
             </button>`
          : `<p class="tarjeta__sub" style="margin-top:12px"><i class="fas fa-circle-info" aria-hidden="true"></i> ${esc(d.motivo)}</p>`}
      </div>`,
    )
    .join('');

  return `
    ${cupoDeportes(cupo)}
    ${deportes.length > 0
      ? `<div class="grilla-tarjetas">${tarjetas}</div>`
      : estadoVacio('Todavía no está inscripto en ninguna actividad deportiva.', 'fa-futbol')}
    <h3 class="ficha__titulo" style="margin-top:24px">
      <i class="fas fa-plus" aria-hidden="true"></i> Deportes disponibles para su nivel
    </h3>
    ${otros ? `<div class="grilla-tarjetas">${otros}</div>` : estadoVacio('No hay otros deportes disponibles para su nivel.', 'fa-futbol')}`;
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

const TURNOS_TRANSPORTE = [
  ['IDA_Y_VUELTA', 'Ida y vuelta'],
  ['IDA', 'Sólo ida'],
  ['VUELTA', 'Sólo vuelta'],
];

/** El mes actual y el siguiente: el transporte y el comedor se contratan mes a mes. */
function periodosContratables() {
  const p = periodoActual();
  const siguiente = p.mes === 12 ? { anio: p.anio + 1, mes: 1 } : { anio: p.anio, mes: p.mes + 1 };
  return [p, siguiente];
}

function selectorPeriodo(id) {
  return `
    <div class="form-group">
      <label for="${id}">Mes</label>
      <select id="${id}" name="periodo" class="form-select">
        ${periodosContratables()
          .map((p) => `<option value="${p.anio}-${p.mes}">${esc(MESES[p.mes - 1])} ${p.anio}</option>`)
          .join('')}
      </select>
    </div>`;
}

async function seccionServicios(alumnoId) {
  const p = periodoActual();
  const [data, recorridos, planes] = await Promise.all([
    api.padres.servicios(alumnoId, p),
    api.servicios.recorridos(p),
    api.servicios.planesComedor(p),
  ]);

  const transporte = data.transporte && data.transporte.estado === 'ACTIVA'
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
        <button type="button" class="btn btn--suave btn--chico" data-baja-transporte="${data.transporte.id}">
          <i class="fas fa-ban" aria-hidden="true"></i> Dar de baja este mes
        </button>
      </div>`
    : `
      <form class="tarjeta" id="form-transporte" novalidate>
        <p class="tarjeta__titulo"><i class="fas fa-bus" aria-hidden="true"></i> Contratar transporte</p>
        <p class="tarjeta__sub">Es opcional y se contrata mes a mes. Hay 4 recorridos, cada uno con su arancel.</p>
        <div class="form-group">
          <label for="tr-recorrido">Recorrido</label>
          <select id="tr-recorrido" name="recorridoId" class="form-select" required>
            ${recorridos.recorridos
              .map((r) => `<option value="${r.id}">${esc(r.codigo)} · ${esc(r.nombre)} — ${moneda(r.arancelMensual)} (${esc(r.horaSalidaTexto)} / ${esc(r.horaRegresoTexto)})</option>`)
              .join('')}
          </select>
        </div>
        <div class="form-group">
          <label for="tr-turno">Turno</label>
          <select id="tr-turno" name="turno" class="form-select">
            ${TURNOS_TRANSPORTE.map(([v, t]) => `<option value="${v}">${esc(t)}</option>`).join('')}
          </select>
        </div>
        ${selectorPeriodo('tr-periodo')}
        <button type="submit" class="btn btn--primario btn--chico">
          <i class="fas fa-check" aria-hidden="true"></i> Contratar
        </button>
      </form>`;

  const comedor = data.comedor && data.comedor.estado === 'ACTIVA'
    ? `
      <div class="tarjeta">
        <p class="tarjeta__titulo"><i class="fas fa-utensils" aria-hidden="true"></i> Comedor</p>
        <p class="tarjeta__sub">${esc(data.comedor.comedor.nombre)}</p>
        <dl class="ficha__datos">
          <div><dt>Días por semana</dt><dd>${esc(data.comedor.comedor.diasPorSemana)}</dd></div>
          <div><dt>Horario</dt><dd>${esc(hora(data.comedor.comedor.horaServicio))}</dd></div>
          <div><dt>Arancel</dt><dd>${moneda(data.comedor.comedor.arancelMensual)}</dd></div>
        </dl>
        <button type="button" class="btn btn--suave btn--chico" data-baja-comedor="${data.comedor.id}">
          <i class="fas fa-ban" aria-hidden="true"></i> Dar de baja este mes
        </button>
      </div>`
    : `
      <form class="tarjeta" id="form-comedor" novalidate>
        <p class="tarjeta__titulo"><i class="fas fa-utensils" aria-hidden="true"></i> Contratar comedor</p>
        <div class="form-group">
          <label for="co-plan">Plan</label>
          <select id="co-plan" name="comedorId" class="form-select" required>
            ${planes.planes
              .map((pl) => `<option value="${pl.id}">${esc(pl.nombre)} — ${moneda(pl.arancelMensual)}</option>`)
              .join('')}
          </select>
        </div>
        ${selectorPeriodo('co-periodo')}
        <button type="submit" class="btn btn--primario btn--chico">
          <i class="fas fa-check" aria-hidden="true"></i> Contratar
        </button>
      </form>`;

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
// Inscripción al cursado
// ==================================================================

/**
 * "Inscribir a su hijo al cursado" (consigna, Parte 2). Es la misma solicitud
 * que la del formulario de la página pública, con los datos del tutor ya
 * cargados; la aprueba Administración en "Solicitudes de inscripción".
 */
async function seccionCursado() {
  const yo = typeof window.usuarioSesion === 'function' ? window.usuarioSesion() : null;
  return `
    <form class="ficha" id="form-cursado" novalidate>
      <h3 class="ficha__titulo"><i class="fas fa-user-graduate" aria-hidden="true"></i> Solicitar inscripción</h3>
      <p>Para anotar a un hijo en un nivel o curso. Administración revisa la solicitud y se comunica con vos.</p>
      <div class="form-grid-2">
        <div class="form-group">
          <label for="cu-tutor">Tu nombre</label>
          <input id="cu-tutor" name="nombreTutor" class="form-input" required minlength="2" maxlength="120" value="${esc(yo?.nombre ?? '')}">
        </div>
        <div class="form-group">
          <label for="cu-email">Tu correo</label>
          <input id="cu-email" name="emailTutor" type="email" class="form-input" required value="${esc(yo?.email ?? '')}">
        </div>
        <div class="form-group">
          <label for="cu-tel">Tu teléfono</label>
          <input id="cu-tel" name="telefonoTutor" type="tel" class="form-input" required minlength="6" maxlength="30">
        </div>
        <div class="form-group">
          <label for="cu-alumno">Nombre y apellido del estudiante</label>
          <input id="cu-alumno" name="nombreEstudiante" class="form-input" required minlength="2" maxlength="120">
        </div>
        <div class="form-group">
          <label for="cu-nivel">Nivel</label>
          <select id="cu-nivel" name="nivel" class="form-select" required>
            <option value="">Elegí…</option>
            <option>Inicial</option><option>Primario</option><option>Secundario</option>
          </select>
        </div>
        <div class="form-group">
          <label for="cu-curso">Curso, grado o sala</label>
          <input id="cu-curso" name="curso" class="form-input" required maxlength="60" placeholder="Ej.: 1er Grado">
        </div>
      </div>
      <div class="form-group">
        <label for="cu-msj">Comentario (opcional)</label>
        <textarea id="cu-msj" name="mensaje" class="form-input" rows="3" maxlength="2000"></textarea>
      </div>
      <button type="submit" class="btn btn--primario"><i class="fas fa-paper-plane" aria-hidden="true"></i> Enviar solicitud</button>
    </form>`;
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
          <button type="button" class="btn btn--suave btn--chico" data-ver-comprobante="${f.id}" data-numero="${esc(f.numero)}"
                  aria-label="Ver el comprobante ${esc(f.numero)} en una pestaña nueva">
            <i class="fas fa-file-lines" aria-hidden="true"></i> Ver
          </button>
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

  dlg.querySelector('form').reset();
  dlg.querySelector('#cmp-error').hidden = true;
  dlg.querySelector('#cmp-factura').value = facturaId;
  textosDialogo(dlg, { subtitulo: `Comprobante ${numero} · saldo pendiente ${moneda(saldo)}` });

  const monto = dlg.querySelector('#cmp-monto');
  monto.value = saldo;
  monto.max = '';

  dlg.querySelector('#cmp-fecha').value = new Date().toISOString().slice(0, 10);
  dlg.querySelector('#cmp-fecha').max = new Date().toISOString().slice(0, 10);

  window.abrirDialogo(dlg, { foco: '#cmp-monto' });
}

function dialogoComprobante() {
  const cuerpo = `
    <form id="form-comprobante" novalidate>
      <input type="hidden" id="cmp-factura" name="facturaId">

      <div class="form-grid-2">
        <div class="form-group">
          <label for="cmp-monto"><i class="fas fa-money-bill-transfer" aria-hidden="true"></i> Importe transferido *</label>
          <input type="number" id="cmp-monto" name="monto" class="form-input" step="0.01" min="0.01" required>
        </div>
        <div class="form-group">
          <label for="cmp-fecha"><i class="fas fa-calendar" aria-hidden="true"></i> Fecha de la transferencia *</label>
          <input type="date" id="cmp-fecha" name="fechaTransferencia" class="form-input" required>
        </div>
        <div class="form-group">
          <label for="cmp-banco"><i class="fas fa-building-columns" aria-hidden="true"></i> Banco de origen *</label>
          <input type="text" id="cmp-banco" name="bancoOrigen" class="form-input" required maxlength="80"
                 placeholder="Banco Nación">
        </div>
        <div class="form-group">
          <label for="cmp-operacion"><i class="fas fa-hashtag" aria-hidden="true"></i> N° de operación *</label>
          <input type="text" id="cmp-operacion" name="numeroOperacion" class="form-input" required maxlength="60"
                 placeholder="NAC-7781204">
        </div>
        <div class="form-group full-width">
          <label for="cmp-archivo"><i class="fas fa-paperclip" aria-hidden="true"></i> Comprobante *</label>
          <input type="file" id="cmp-archivo" name="comprobante" class="form-input" required
                 accept="image/png,image/jpeg,image/webp,application/pdf"
                 aria-describedby="cmp-archivo-ayuda">
          <small class="form-ayuda" id="cmp-archivo-ayuda">
            Imagen o PDF del comprobante bancario. Sin el archivo adjunto no se puede registrar el pago.
          </small>
        </div>
      </div>

      <p class="campo__error" id="cmp-error" role="alert" hidden></p>
      ${pieDialogo({ textoGuardar: 'Enviar comprobante', iconoGuardar: 'fa-paper-plane', idGuardar: 'cmp-enviar' })}
    </form>`;

  return plantillaDialogo({
    id: 'dlg-comprobante',
    icono: 'fa-upload',
    titulo: 'Subir comprobante de transferencia',
    subtitulo: '',
    cuerpo,
  });
}

async function enviarComprobante(e) {
  e.preventDefault();

  const form = e.target;
  const error = document.getElementById('cmp-error');
  const boton = document.getElementById('cmp-enviar');

  error.hidden = true;

  // El formulario es `novalidate`: el mensaje sale dentro del diálogo.
  if (!form.checkValidity()) {
    const invalido = form.querySelector(':invalid');
    const etiqueta = form.querySelector(`label[for="${invalido.id}"]`)?.textContent.replace('*', '').trim();
    error.textContent = `Revisá el campo "${etiqueta}": ${invalido.validationMessage}`;
    error.hidden = false;
    invalido.focus();
    return;
  }

  boton.disabled = true;
  boton.textContent = 'Enviando…';

  try {
    const fd = new FormData(form);
    const resp = await api.facturacion.subirComprobante(fd);

    window.cerrarDialogo('dlg-comprobante');
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
  cursado: { titulo: 'Inscripción al cursado', icono: 'fa-user-graduate', fn: seccionCursado },
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

  cablearInscripciones(panel);

  panel.querySelectorAll('[data-ver-comprobante]').forEach((btn) => {
    btn.addEventListener('click', () => void verComprobante(btn.dataset.verComprobante, btn.dataset.numero));
  });
}

// ==================================================================
// Acciones de inscripción
// ==================================================================

async function confirmar(mensaje, titulo) {
  if (typeof window.uxConfirm === 'function') return window.uxConfirm(mensaje, { title: titulo });
  return window.confirm(mensaje);
}

/** Corre la acción, avisa con el mensaje del backend y vuelve a dibujar la pestaña. */
async function ejecutar(boton, accion) {
  if (boton) boton.disabled = true;
  try {
    const r = await accion();
    avisar(r?.mensaje ?? 'Listo.', 'ok');
    await dibujarSeccion();
  } catch (err) {
    avisar(err?.message ?? 'No se pudo completar la operación.', 'error');
    if (boton) boton.disabled = false;
  }
}

function leerPeriodo(form, nombre) {
  const [anio, mes] = String(new FormData(form).get(nombre) ?? '').split('-').map(Number);
  return { anio, mes };
}

function cablearInscripciones(panel) {
  panel.querySelectorAll('[data-inscribir-deporte]').forEach((btn) => {
    btn.addEventListener('click', () =>
      ejecutar(btn, () => api.deportes.inscribir(hijoActivo, Number(btn.dataset.inscribirDeporte))),
    );
  });

  panel.querySelectorAll('[data-baja-deporte]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar(`Se da de baja de ${btn.dataset.nombre} y se libera el cupo.`, 'Dar de baja'))) return;
      ejecutar(btn, () => api.deportes.darDeBaja(Number(btn.dataset.bajaDeporte)));
    });
  });

  panel.querySelectorAll('[data-baja-transporte]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Deja de usar el transporte este mes.', 'Dar de baja'))) return;
      ejecutar(btn, () => api.servicios.bajaTransporte(Number(btn.dataset.bajaTransporte)));
    });
  });

  panel.querySelectorAll('[data-baja-comedor]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!(await confirmar('Deja el comedor este mes.', 'Dar de baja'))) return;
      ejecutar(btn, () => api.servicios.bajaComedor(Number(btn.dataset.bajaComedor)));
    });
  });

  const formTransporte = panel.querySelector('#form-transporte');
  formTransporte?.addEventListener('submit', (e) => {
    e.preventDefault();
    const datos = new FormData(formTransporte);
    ejecutar(formTransporte.querySelector('button[type=submit]'), () =>
      api.servicios.contratarTransporte({
        alumnoId: hijoActivo,
        recorridoId: Number(datos.get('recorridoId')),
        turno: datos.get('turno'),
        ...leerPeriodo(formTransporte, 'periodo'),
      }),
    );
  });

  const formComedor = panel.querySelector('#form-comedor');
  formComedor?.addEventListener('submit', (e) => {
    e.preventDefault();
    const datos = new FormData(formComedor);
    ejecutar(formComedor.querySelector('button[type=submit]'), () =>
      api.servicios.contratarComedor({
        alumnoId: hijoActivo,
        comedorId: Number(datos.get('comedorId')),
        ...leerPeriodo(formComedor, 'periodo'),
      }),
    );
  });

  const formCursado = panel.querySelector('#form-cursado');
  formCursado?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!formCursado.reportValidity()) return;
    const datos = Object.fromEntries(new FormData(formCursado));
    const boton = formCursado.querySelector('button[type=submit]');
    boton.disabled = true;
    try {
      const r = await api.publico.solicitarInscripcion({ ...datos, mensaje: datos.mensaje || null });
      avisar(r.mensaje, 'ok');
      formCursado.reset();
    } catch (err) {
      avisar(err?.message ?? 'No se pudo enviar la solicitud.', 'error');
    } finally {
      boton.disabled = false;
    }
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
      void dibujarSeccion();
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
      void dibujarSeccion();
    });
  });

  const form = document.getElementById('form-comprobante');
  if (form) form.addEventListener('submit', enviarComprobante);

  await dibujarSeccion();
}

export default { iniciarMisHijos };
