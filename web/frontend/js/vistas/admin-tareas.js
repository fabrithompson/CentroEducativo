/**
 * Tareas programadas — panel de administración.
 *
 * Las dos tareas que pide la consigna —la factura del último día hábil y el
 * recordatorio del día 20— corren solas y hasta ahora no había forma de saber
 * si habían corrido. Eso importa porque el modo de fallar de un scheduler es
 * silencioso: nadie nota que el mail no salió hasta que una familia reclama, y
 * para entonces ya pasó el mes.
 *
 * La vista muestra qué está programado, qué se ejecutó y con qué resultado, y
 * permite disparar una tarea a mano. El disparo manual respeta la
 * idempotencia: sin marcar "forzar", una tarea ya completada para ese período
 * no se repite y el servidor lo informa en vez de duplicar los correos.
 */

import api from '../api.js';
import { avisar, badge, esc, estadoVacio, fechaHora, grillaIndicadores, render, tabla } from '../ui.js';

const ETIQUETA_TAREA = {
  FACTURACION_MENSUAL: 'Facturación mensual',
  RECORDATORIO_DEUDA: 'Recordatorio de deuda',
};

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// ==================================================================
// Lo que está programado
// ==================================================================

function tarjetasProgramadas(scheduler) {
  const filas = (scheduler.tareas ?? [])
    .map(
      (t) => `
      <li class="tarjeta">
        <p class="tarjeta__titulo">${esc(t.nombre)}</p>
        <p class="tarjeta__sub"><code>${esc(t.cron)}</code> · ${esc(t.condicion)}</p>
        <p class="tarjeta__sub">${esc(t.descripcion)}</p>
      </li>`,
    )
    .join('');

  return `
    <h3 class="ficha__titulo">
      <i class="fas fa-clock" aria-hidden="true"></i> Lo que está programado
    </h3>
    <p class="subtitulo">
      Horarios en <strong>${esc(scheduler.timezone ?? '—')}</strong>. El cron corre a diario y
      cada tarea decide si hoy le toca: el "último día hábil del mes" no se puede expresar
      en sintaxis cron.
    </p>
    <ul class="grilla-tarjetas">${filas}</ul>`;
}

// ==================================================================
// Historial de ejecuciones
// ==================================================================

function columnaPeriodo(e) {
  return `${esc(MESES[e.mes - 1] ?? e.mes)} ${e.anio}`;
}

function columnaResultado(e) {
  if (e.estado === 'FALLIDA') {
    return `<span class="campo__error">${esc(e.error ?? 'Falló sin detalle.')}</span>`;
  }
  if (!e.resultado) return '—';

  // `resultado` es JSON libre: se muestran sus claves numéricas, que son las
  // que interesan (facturas generadas, correos enviados, fallidos).
  const partes = Object.entries(e.resultado)
    .filter(([, v]) => typeof v === 'number' || typeof v === 'string')
    .slice(0, 4)
    .map(([k, v]) => `${esc(k)}: <strong>${esc(String(v))}</strong>`);

  return partes.length > 0 ? partes.join(' · ') : '—';
}

function historial(ejecuciones) {
  if (!ejecuciones || ejecuciones.length === 0) {
    return estadoVacio(
      'Todavía no se ejecutó ninguna tarea. Podés disparar una a mano desde los botones de arriba.',
      'fa-hourglass-start',
    );
  }

  return tabla({
    caption: 'Últimas ejecuciones de las tareas programadas',
    columnas: [
      {
        clave: 'tarea',
        titulo: 'Tarea',
        render: (e) => esc(ETIQUETA_TAREA[e.tarea] ?? e.tarea),
      },
      { clave: 'periodo', titulo: 'Período', render: columnaPeriodo },
      { clave: 'estado', titulo: 'Estado', alinear: 'centro', render: (e) => badge(e.estado) },
      {
        clave: 'disparo',
        titulo: 'Disparo',
        alinear: 'centro',
        render: (e) => (e.manual ? 'manual' : 'automático'),
      },
      { clave: 'iniciadaEn', titulo: 'Inició', render: (e) => fechaHora(e.iniciadaEn) },
      {
        clave: 'finalizadaEn',
        titulo: 'Terminó',
        render: (e) => (e.finalizadaEn ? fechaHora(e.finalizadaEn) : '—'),
      },
      { clave: 'resultado', titulo: 'Resultado', render: columnaResultado },
    ],
    filas: ejecuciones,
  });
}

// ==================================================================
// Retención de datos (RNF-09)
// ==================================================================

async function bloqueRetencion() {
  let informe;
  try {
    informe = await api.admin.retencion();
  } catch (err) {
    return `<p class="campo__error">No se pudo leer el informe de retención: ${esc(err?.message ?? '')}</p>`;
  }

  const conDatos = (informe.lineas ?? []).filter((l) => l.alcanzados > 0);

  const estado = informe.purgaActiva
    ? '<span class="badge badge--alerta">purga activa</span>'
    : '<span class="badge badge--espera">modo informe</span>';

  const explicacion = informe.purgaActiva
    ? 'La tarea de la 01:00 borra lo que figura acá abajo.'
    : 'La tarea de la 01:00 <strong>no borra nada</strong>: sólo cuenta. Los plazos son una ' +
      'propuesta y hay que confirmarlos con la institución antes de activar la purga ' +
      '(<code>RETENCION_ACTIVA=true</code>).';

  const tablaLineas =
    conDatos.length > 0
      ? tabla({
          caption: 'Datos que superaron su plazo de conservación',
          columnas: [
            { clave: 'concepto', titulo: 'Qué' },
            { clave: 'modelo', titulo: 'Tabla' },
            {
              clave: 'plazoDias',
              titulo: 'Plazo',
              alinear: 'centro',
              render: (l) => `${l.plazoDias} días`,
            },
            {
              clave: 'alcanzados',
              titulo: informe.purgaActiva ? 'Se borran' : 'Se borrarían',
              alinear: 'derecha',
              render: (l) => `<strong>${l.alcanzados}</strong>`,
            },
          ],
          filas: conDatos,
        })
      : estadoVacio('Nada superó todavía su plazo de conservación.', 'fa-circle-check');

  return `
    <div class="ficha" style="margin: 22px 0">
      <h3 class="ficha__titulo">
        <i class="fas fa-broom" aria-hidden="true"></i> Retención de datos ${estado}
      </h3>
      <p class="subtitulo">${explicacion}</p>
      ${tablaLineas}
      <p class="subtitulo" style="margin-top:12px">
        No alcanza a alumnos, calificaciones, asistencias ni facturas: tienen obligación
        de conservación documental y sus bajas son lógicas.
      </p>
    </div>`;
}

// ==================================================================
// Disparo manual
// ==================================================================

function barraDisparo() {
  const hoy = new Date();

  return `
    <div class="ficha" style="margin: 22px 0">
      <h3 class="ficha__titulo">
        <i class="fas fa-play" aria-hidden="true"></i> Ejecutar una tarea a mano
      </h3>
      <p class="subtitulo">
        Sirve para reintentar una corrida que falló, o para demostrarlas sin esperar al
        último día hábil. Sin marcar <em>forzar</em>, una tarea ya completada para ese
        período no se repite.
      </p>

      <form class="filtros" id="form-tarea">
        <div class="filtros__campo">
          <label for="tarea-tipo">Tarea</label>
          <select id="tarea-tipo" name="tarea">
            <option value="FACTURACION_MENSUAL">Facturación mensual</option>
            <option value="RECORDATORIO_DEUDA">Recordatorio de deuda</option>
          </select>
        </div>
        <div class="filtros__campo">
          <label for="tarea-mes">Mes</label>
          <select id="tarea-mes" name="mes">
            ${MESES.map(
              (m, i) =>
                `<option value="${i + 1}"${i === hoy.getMonth() ? ' selected' : ''}>${esc(m)}</option>`,
            ).join('')}
          </select>
        </div>
        <div class="filtros__campo">
          <label for="tarea-anio">Año</label>
          <input type="number" id="tarea-anio" name="anio" min="2000" max="2100"
                 value="${hoy.getFullYear()}">
        </div>
        <div class="filtros__campo">
          <label for="tarea-forzar">Forzar</label>
          <select id="tarea-forzar" name="forzar">
            <option value="false">No repetir si ya corrió</option>
            <option value="true">Forzar, aunque ya haya corrido</option>
          </select>
        </div>
        <div class="filtros__acciones">
          <button type="submit" class="btn btn--primario" id="tarea-ejecutar">
            <i class="fas fa-play" aria-hidden="true"></i> Ejecutar
          </button>
        </div>
      </form>
    </div>`;
}

async function ejecutar(e) {
  e.preventDefault();

  const tarea = document.getElementById('tarea-tipo').value;
  const mes = Number(document.getElementById('tarea-mes').value);
  const anio = Number(document.getElementById('tarea-anio').value);
  const forzar = document.getElementById('tarea-forzar').value === 'true';
  const boton = document.getElementById('tarea-ejecutar');

  // Forzar la facturación manda correos de verdad a todas las familias del
  // período. No es algo que convenga poder hacer sin querer.
  if (forzar) {
    const seguir = window.confirm(
      `Vas a ejecutar "${ETIQUETA_TAREA[tarea]}" para ${MESES[mes - 1]} ${anio} forzando la ` +
        'repetición.\n\nSi ya había corrido, se vuelven a enviar los correos. ¿Continuar?',
    );
    if (!seguir) return;
  }

  boton.disabled = true;
  try {
    const r = await api.facturacion.ejecutarTarea(tarea, { anio, mes, forzar });
    avisar(r.mensaje || (r.omitida ? 'La tarea ya había corrido.' : 'Tarea ejecutada.'), 'ok');
    await dibujar();
  } catch (err) {
    avisar(err?.message || 'No se pudo ejecutar la tarea.', 'error');
  } finally {
    boton.disabled = false;
  }
}

// ==================================================================
// Armado
// ==================================================================

let contenedor = null;

async function dibujar() {
  await render(contenedor, async () => {
    const datos = await api.facturacion.tareas();
    const scheduler = datos.scheduler ?? {};

    const estado = grillaIndicadores([
      {
        titulo: 'Programador',
        valor: scheduler.activo ? 'Activo' : 'Detenido',
        detalle: scheduler.activo
          ? 'Las tareas corren solas'
          : 'No hay tareas registradas en este proceso',
        icono: scheduler.activo ? 'fa-circle-check' : 'fa-circle-exclamation',
        tono: scheduler.activo ? 'ok' : 'alerta',
      },
      {
        titulo: 'Ejecuciones registradas',
        valor: String((datos.ejecuciones ?? []).length),
        detalle: 'Últimas 24',
        icono: 'fa-list-check',
      },
      {
        titulo: 'Fallidas',
        valor: String((datos.ejecuciones ?? []).filter((e) => e.estado === 'FALLIDA').length),
        icono: 'fa-triangle-exclamation',
        tono: (datos.ejecuciones ?? []).some((e) => e.estado === 'FALLIDA') ? 'alerta' : 'ok',
      },
    ]);

    return `
      ${estado}
      ${tarjetasProgramadas(scheduler)}
      ${await bloqueRetencion()}
      ${barraDisparo()}
      ${historial(datos.ejecuciones)}`;
  });

  const form = document.getElementById('form-tarea');
  if (form) form.addEventListener('submit', ejecutar);
}

export async function iniciarTareas(id) {
  contenedor = document.getElementById(id);
  if (!contenedor) return;
  await dibujar();
}

export default { iniciarTareas };
