/**
 * Componentes de interfaz compartidos por los paneles.
 *
 * Decisiones de accesibilidad que se aplican en todo lo que se renderiza acá:
 *
 * - **Todo texto que viene del servidor se escapa.** Los nombres de alumnos y
 *   los motivos de rechazo los escriben personas; sin escapar, un apellido con
 *   `<` rompe la tabla.
 * - **Las tablas llevan `<caption>` y `scope` en los encabezados.** Es lo que
 *   permite que un lector de pantalla anuncie "columna Saldo, fila Pérez" en
 *   vez de leer celdas sueltas sin contexto.
 * - **El estado de carga y los errores se anuncian con `aria-live`.** Si no,
 *   quien usa lector de pantalla no se entera de que la tabla se actualizó.
 * - **Los estados no se comunican sólo por color.** Cada badge lleva texto.
 */

// ==================================================================
// Formato
// ==================================================================

const formateadorMoneda = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  minimumFractionDigits: 2,
});

export function moneda(valor) {
  const n = Number(valor ?? 0);
  return Number.isFinite(n) ? formateadorMoneda.format(n) : '—';
}

export function fecha(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
}

export function fechaHora(valor) {
  if (!valor) return '—';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** Minutos desde medianoche -> `07:30`. Misma convención que el backend. */
export function hora(minutos) {
  if (typeof minutos !== 'number') return '—';
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const DIAS = {
  LUNES: 'Lunes', MARTES: 'Martes', MIERCOLES: 'Miércoles',
  JUEVES: 'Jueves', VIERNES: 'Viernes', SABADO: 'Sábado',
};

export const dia = (d) => DIAS[d] ?? d ?? '—';

/** Escapa HTML. Todo texto de origen externo pasa por acá antes de inyectarse. */
export function esc(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ==================================================================
// Badges de estado
// ==================================================================

const TONO_ESTADO = {
  PAGADA: 'ok', APROBADO: 'ok', ACTIVO: 'ok', ACTIVA: 'ok', ENVIADO: 'ok', COMPLETADA: 'ok',
  PENDIENTE: 'espera', EN_REVISION: 'espera', EN_CURSO: 'espera', PARCIAL: 'espera',
  VENCIDA: 'alerta', RECHAZADO: 'alerta', FALLIDA: 'alerta', FALLIDO: 'alerta',
  ANULADA: 'neutro', INACTIVO: 'neutro', BAJA: 'neutro', EGRESADO: 'neutro',
  SUSPENDIDO: 'alerta', LICENCIA: 'espera',
};

const ETIQUETA_ESTADO = {
  EN_REVISION: 'En revisión', IDA_Y_VUELTA: 'Ida y vuelta',
  EN_CURSO: 'En curso', SIN_CARGOS: 'Sin cargos',
};

/**
 * Badge de estado. El tono es sólo un refuerzo: la palabra siempre está, así
 * que alguien que no distingue colores igual entiende el estado.
 */
export function badge(estado, textoExtra) {
  if (!estado) return '<span class="badge badge--neutro">—</span>';
  const tono = TONO_ESTADO[estado] ?? 'neutro';
  const etiqueta = ETIQUETA_ESTADO[estado] ?? estado.replace(/_/g, ' ').toLowerCase();
  const sufijo = textoExtra ? ` ${esc(textoExtra)}` : '';
  return `<span class="badge badge--${tono}">${esc(etiqueta)}${sufijo}</span>`;
}

// ==================================================================
// Tabla
// ==================================================================

/**
 * Renderiza una tabla accesible.
 *
 * @param {object} cfg
 * @param {string} cfg.caption  Descripción de la tabla. Obligatoria.
 * @param {Array<{clave:string,titulo:string,alinear?:string,render?:Function}>} cfg.columnas
 * @param {Array<object>} cfg.filas
 * @param {string} [cfg.vacio]  Mensaje cuando no hay filas.
 */
export function tabla({ caption, columnas, filas, vacio = 'No hay datos para mostrar.' }) {
  if (!filas || filas.length === 0) return estadoVacio(vacio);

  const encabezados = columnas
    .map((c) => `<th scope="col"${c.alinear ? ` class="ta-${c.alinear}"` : ''}>${esc(c.titulo)}</th>`)
    .join('');

  const cuerpo = filas
    .map((fila) => {
      const celdas = columnas
        .map((c) => {
          const contenido = c.render ? c.render(fila) : esc(fila[c.clave] ?? '—');
          // `data-label` alimenta el modo tarjeta en pantallas angostas.
          return `<td data-label="${esc(c.titulo)}"${c.alinear ? ` class="ta-${c.alinear}"` : ''}>${contenido}</td>`;
        })
        .join('');
      return `<tr>${celdas}</tr>`;
    })
    .join('');

  return `
    <div class="tabla-scroll" tabindex="0" role="region" aria-label="${esc(caption)}">
      <table class="tabla">
        <caption class="tabla__caption">${esc(caption)}</caption>
        <thead><tr>${encabezados}</tr></thead>
        <tbody>${cuerpo}</tbody>
      </table>
    </div>`;
}

// ==================================================================
// Estados
// ==================================================================

export function estadoVacio(mensaje, icono = 'fa-inbox') {
  return `
    <div class="estado estado--vacio">
      <i class="fas ${esc(icono)}" aria-hidden="true"></i>
      <p>${esc(mensaje)}</p>
    </div>`;
}

export function estadoCargando(mensaje = 'Cargando…') {
  return `
    <div class="estado estado--cargando">
      <span class="spinner" aria-hidden="true"></span>
      <p>${esc(mensaje)}</p>
    </div>`;
}

export function estadoError(mensaje) {
  return `
    <div class="estado estado--error" role="alert">
      <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
      <p>${esc(mensaje)}</p>
    </div>`;
}

// ==================================================================
// Tarjetas de indicador
// ==================================================================

export function indicador({ titulo, valor, detalle, tono = 'neutro', icono }) {
  return `
    <div class="indicador indicador--${esc(tono)}">
      ${icono ? `<i class="fas ${esc(icono)} indicador__icono" aria-hidden="true"></i>` : ''}
      <p class="indicador__titulo">${esc(titulo)}</p>
      <p class="indicador__valor">${esc(valor)}</p>
      ${detalle ? `<p class="indicador__detalle">${esc(detalle)}</p>` : ''}
    </div>`;
}

export const grillaIndicadores = (items) =>
  `<div class="indicadores">${items.map(indicador).join('')}</div>`;

// ==================================================================
// Render con manejo de estados
// ==================================================================

/**
 * Ejecuta `cargar()` mostrando el estado de carga y captura el error.
 *
 * Evita el patrón de dejar un "Cargando…" colgado para siempre cuando la
 * petición falla, que es lo que hacen hoy varias vistas del panel.
 */
export async function render(contenedor, cargar, { mensajeCarga } = {}) {
  const nodo = typeof contenedor === 'string' ? document.getElementById(contenedor) : contenedor;
  if (!nodo) return;

  nodo.setAttribute('aria-busy', 'true');
  nodo.innerHTML = estadoCargando(mensajeCarga);

  try {
    nodo.innerHTML = await cargar();
  } catch (err) {
    const mensaje = err?.message || 'No se pudo cargar la información.';
    nodo.innerHTML = estadoError(mensaje);
    console.error('[ui]', err);
  } finally {
    nodo.removeAttribute('aria-busy');
  }
}

/** Avisos breves. Reutiliza el toast del proyecto si está disponible. */
export function avisar(mensaje, tipo = 'info') {
  const fn = tipo === 'error' ? window.toastError : tipo === 'ok' ? window.toastSuccess : window.toastInfo;
  if (typeof fn === 'function') {
    fn(mensaje);
    return;
  }
  // Sin toast, se anuncia por la región viva compartida.
  let region = document.getElementById('avisos-vivos');
  if (!region) {
    region = document.createElement('div');
    region.id = 'avisos-vivos';
    region.className = 'sr-only';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  region.textContent = mensaje;
}

// ==================================================================
// Filtros
// ==================================================================

/**
 * Barra de filtros. Cada control lleva `<label>` asociado por `for`: sin eso,
 * un lector de pantalla lee "cuadro de edición" sin decir de qué.
 */
export function filtros({ id, campos, textoBoton = 'Aplicar filtros' }) {
  const controles = campos
    .map((campo) => {
      const idCampo = `${id}-${campo.nombre}`;
      let control;

      if (campo.tipo === 'select') {
        const opciones = (campo.opciones ?? [])
          .map((o) => `<option value="${esc(o.valor)}"${o.valor === campo.valor ? ' selected' : ''}>${esc(o.texto)}</option>`)
          .join('');
        control = `<select id="${esc(idCampo)}" name="${esc(campo.nombre)}">${opciones}</select>`;
      } else {
        control = `<input id="${esc(idCampo)}" name="${esc(campo.nombre)}" type="${esc(campo.tipo ?? 'text')}"
                     ${campo.valor !== undefined ? `value="${esc(campo.valor)}"` : ''}
                     ${campo.min !== undefined ? `min="${esc(campo.min)}"` : ''}
                     ${campo.max !== undefined ? `max="${esc(campo.max)}"` : ''}
                     ${campo.placeholder ? `placeholder="${esc(campo.placeholder)}"` : ''}>`;
      }

      return `
        <div class="filtros__campo">
          <label for="${esc(idCampo)}">${esc(campo.etiqueta)}</label>
          ${control}
        </div>`;
    })
    .join('');

  return `
    <form class="filtros" id="${esc(id)}" role="search" aria-label="Filtros del reporte">
      ${controles}
      <div class="filtros__acciones">
        <button type="submit" class="btn btn--primario">
          <i class="fas fa-filter" aria-hidden="true"></i> ${esc(textoBoton)}
        </button>
        <button type="reset" class="btn btn--suave">Limpiar</button>
      </div>
    </form>`;
}

/** Lee un formulario de filtros como objeto plano, sin los campos vacíos. */
export function leerFiltros(form) {
  const datos = {};
  for (const [clave, valor] of new FormData(form).entries()) {
    if (valor !== '' && valor !== null) datos[clave] = valor;
  }
  return datos;
}

/** Descarga las filas como CSV. Administración lo pide para cruzar en planilla. */
export function exportarCSV(nombreArchivo, columnas, filas) {
  const escaparCelda = (v) => {
    const texto = v === null || v === undefined ? '' : String(v);
    return /[";\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  };

  const lineas = [
    columnas.map((c) => escaparCelda(c.titulo)).join(';'),
    ...filas.map((fila) => columnas.map((c) => escaparCelda(c.valor(fila))).join(';')),
  ];

  // BOM para que Excel en español abra los acentos correctamente.
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const periodoActual = () => {
  const hoy = new Date();
  return { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 };
};

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
