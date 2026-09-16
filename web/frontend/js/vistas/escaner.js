/**
 * Escáner de carnet digital para el personal.
 *
 * Pensado para usarse con una tablet o un celular en la mano, de pie, con
 * chicos haciendo fila. De ahí las decisiones:
 *
 *  - **La respuesta ocupa toda la pantalla y es verde o roja.** El operador la
 *    lee de reojo; no puede estar buscando un cartelito.
 *  - **Entrada manual siempre disponible.** Una pantalla rayada, el sol de
 *    frente o un teléfono sin batería no pueden dejar a un chico afuera del
 *    micro. El operador tipea el código de 8 dígitos.
 *  - **Antirrebote de 2 segundos por código.** La cámara dispara varias veces
 *    sobre el mismo QR; sin esto, el segundo disparo daría "código reutilizado"
 *    y confundiría al operador.
 *  - **El punto de control se elige una vez** y queda fijo mientras dure la
 *    jornada.
 */

import api from '../api.js';
import { esc, estadoVacio, fechaHora, render, tabla } from '../ui.js';

let configuracion = null;   // { punto, recorridoId, recorridoNombre }
let lector = null;          // BarcodeDetector
let stream = null;          // MediaStream de la cámara
let escaneando = false;
let ultimoCodigo = { texto: null, momento: 0 };
const historial = [];

const ANTIRREBOTE_MS = 2000;

// ==================================================================
// Configuración del punto de control
// ==================================================================

async function pantallaConfiguracion(contenedor) {
  let recorridos = [];
  try {
    const r = await api.servicios.recorridos();
    recorridos = r.recorridos ?? [];
  } catch {
    // Sin catálogo se puede igual operar el comedor.
  }

  contenedor.innerHTML = `
    <div class="ficha">
      <h3 class="ficha__titulo">
        <i class="fas fa-qrcode" aria-hidden="true"></i> ¿Dónde vas a controlar?
      </h3>
      <p class="nota-criterio">
        <i class="fas fa-circle-info" aria-hidden="true"></i>
        Elegí el punto una sola vez. Queda fijo hasta que lo cambies.
      </p>

      <form id="form-punto" class="form-grid">
        <div class="campo">
          <label for="pc-punto" class="requerido">Punto de control</label>
          <select id="pc-punto" name="punto" required>
            <option value="">Elegí…</option>
            <option value="COMEDOR">Comedor</option>
            <option value="TRANSPORTE">Transporte escolar</option>
          </select>
        </div>

        <div class="campo" id="campo-recorrido" hidden>
          <label for="pc-recorrido" class="requerido">Recorrido</label>
          <select id="pc-recorrido" name="recorridoId">
            <option value="">Elegí el recorrido…</option>
            ${recorridos
              .map((r) => `<option value="${esc(r.id)}">${esc(r.codigo)} — ${esc(r.nombre)}</option>`)
              .join('')}
          </select>
          <span class="ayuda">
            El sistema sólo deja subir a los alumnos que contrataron este recorrido.
          </span>
        </div>
      </form>

      <button type="submit" form="form-punto" class="btn btn--primario" style="margin-top:16px">
        <i class="fas fa-play" aria-hidden="true"></i> Comenzar a escanear
      </button>
    </div>`;

  const form = contenedor.querySelector('#form-punto');
  const selPunto = contenedor.querySelector('#pc-punto');
  const campoRec = contenedor.querySelector('#campo-recorrido');
  const selRec = contenedor.querySelector('#pc-recorrido');

  selPunto.addEventListener('change', () => {
    const esTransporte = selPunto.value === 'TRANSPORTE';
    campoRec.hidden = !esTransporte;
    selRec.required = esTransporte;
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    if (!selPunto.value) return;
    if (selPunto.value === 'TRANSPORTE' && !selRec.value) {
      selRec.focus();
      return;
    }

    configuracion = {
      punto: selPunto.value,
      recorridoId: selRec.value ? Number(selRec.value) : undefined,
      recorridoNombre: selRec.value ? selRec.options[selRec.selectedIndex].text : null,
    };

    void pantallaEscaneo(contenedor);
  });
}

// ==================================================================
// Pantalla de escaneo
// ==================================================================

async function pantallaEscaneo(contenedor) {
  const soportaCamara = 'BarcodeDetector' in window;

  contenedor.innerHTML = `
    <div class="escaner">
      <div class="escaner__barra">
        <div>
          <p class="escaner__punto">
            ${configuracion.punto === 'COMEDOR' ? 'Comedor' : 'Transporte escolar'}
          </p>
          ${configuracion.recorridoNombre
            ? `<p class="escaner__detalle">${esc(configuracion.recorridoNombre)}</p>`
            : ''}
        </div>
        <button type="button" class="btn btn--suave btn--chico" data-accion="cambiar-punto">
          Cambiar punto
        </button>
      </div>

      <div class="escaner__cuerpo">
        <div class="escaner__camara">
          ${soportaCamara
            ? `<video id="video-escaner" playsinline muted
                      aria-label="Vista de la cámara para escanear el carnet"></video>
               <div class="escaner__mira" aria-hidden="true"></div>`
            : `<div class="estado estado--vacio">
                 <i class="fas fa-keyboard" aria-hidden="true"></i>
                 <p><strong>Este navegador no puede leer códigos QR.</strong></p>
                 <p>Usá la entrada manual de abajo, o abrí esta página en Chrome sobre Android.</p>
               </div>`}
        </div>

        <div class="escaner__panel">
          <div id="resultado-escaneo" role="status" aria-live="assertive">
            ${estadoVacio('Acercá el carnet del alumno a la cámara.', 'fa-qrcode')}
          </div>

          <form id="form-manual" class="ficha" style="margin-top:16px">
            <h4 class="ficha__titulo" style="font-size:0.95rem">
              <i class="fas fa-keyboard" aria-hidden="true"></i> Entrada manual
            </h4>
            <p class="ayuda" style="margin-bottom:10px">
              Si la cámara no engancha, pedile al alumno el número que muestra el carnet.
            </p>
            <div class="campo">
              <label for="manual-credencial">N° de credencial</label>
              <input type="number" id="manual-credencial" name="credencialId" min="1" required
                     inputmode="numeric" placeholder="Ej: 12">
            </div>
            <div class="campo">
              <label for="manual-codigo">Código de 8 dígitos</label>
              <input type="text" id="manual-codigo" name="codigo" required
                     inputmode="numeric" pattern="[0-9]{8}" maxlength="8" placeholder="12345678">
            </div>
            <button type="submit" class="btn btn--primario" style="margin-top:10px">
              Validar
            </button>
          </form>
        </div>
      </div>

      <div id="historial-escaneos" class="ficha" style="margin-top:20px"></div>
    </div>`;

  contenedor.querySelector('[data-accion="cambiar-punto"]').addEventListener('click', () => {
    detenerCamara();
    void pantallaConfiguracion(contenedor);
  });

  contenedor.querySelector('#form-manual').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const credencialId = form.credencialId.value;
    const codigo = form.codigo.value;

    if (!/^\d{8}$/.test(codigo)) return;

    // Se rearma el contenido del QR con la ventana actual: el operador sólo
    // tipea el código, no el contador.
    const contador = Math.floor(Date.now() / 1000 / 30);
    await validar(`ETQ1|${credencialId}|${contador}|${codigo}`);

    form.codigo.value = '';
    form.codigo.focus();
  });

  dibujarHistorial();

  if (soportaCamara) await iniciarCamara();
}

// ==================================================================
// Cámara
// ==================================================================

async function iniciarCamara() {
  const video = document.getElementById('video-escaner');
  if (!video) return;

  try {
    // `environment` pide la cámara trasera, que es la que se usa de pie.
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });

    video.srcObject = stream;
    await video.play();

    lector = new window.BarcodeDetector({ formats: ['qr_code'] });
    escaneando = true;
    void bucleEscaneo(video);
  } catch (err) {
    mostrarResultado({
      permitido: false,
      mensaje: 'No pudimos abrir la cámara',
      detalle:
        'Revisá que el navegador tenga permiso de cámara. Mientras tanto podés usar la entrada manual.',
      alumno: null,
    });
    console.error('[escaner]', err);
  }
}

function detenerCamara() {
  escaneando = false;
  if (stream) {
    for (const pista of stream.getTracks()) pista.stop();
    stream = null;
  }
}

async function bucleEscaneo(video) {
  while (escaneando) {
    try {
      const codigos = await lector.detect(video);

      if (codigos.length > 0) {
        const texto = codigos[0].rawValue;
        const ahora = Date.now();

        // Antirrebote: la cámara dispara varias veces sobre el mismo QR.
        const repetido = texto === ultimoCodigo.texto && ahora - ultimoCodigo.momento < ANTIRREBOTE_MS;

        if (!repetido) {
          ultimoCodigo = { texto, momento: ahora };
          await validar(texto);
        }
      }
    } catch (err) {
      console.error('[escaner] error leyendo', err);
    }

    // Una pausa corta evita saturar el CPU de una tablet modesta.
    await new Promise((r) => setTimeout(r, 250));
  }
}

// ==================================================================
// Validación
// ==================================================================

async function validar(qr) {
  try {
    const r = await api.accesos.escanear({
      qr,
      punto: configuracion.punto,
      recorridoId: configuracion.recorridoId,
      dispositivo: navigator.userAgent.slice(0, 80),
    });

    mostrarResultado(r);
    historial.unshift({ ...r, fecha: new Date().toISOString() });
    if (historial.length > 20) historial.pop();
    dibujarHistorial();

    // Un pitido corto ayuda a operar sin mirar la pantalla.
    pitar(r.permitido);
  } catch (err) {
    mostrarResultado({
      permitido: false,
      mensaje: 'No se pudo validar',
      detalle: err?.message ?? 'Revisá la conexión con el servidor.',
      alumno: null,
    });
  }
}

function mostrarResultado(r) {
  const nodo = document.getElementById('resultado-escaneo');
  if (!nodo) return;

  nodo.innerHTML = `
    <div class="resultado ${r.permitido ? 'resultado--ok' : 'resultado--no'}">
      <i class="fas ${r.permitido ? 'fa-circle-check' : 'fa-circle-xmark'}" aria-hidden="true"></i>
      <p class="resultado__mensaje">${esc(r.mensaje)}</p>
      ${r.alumno
        ? `<p class="resultado__alumno">${esc(r.alumno.nombre)}</p>
           <p class="resultado__curso">${esc(r.alumno.curso)} · Legajo ${esc(r.alumno.legajo)}</p>`
        : ''}
      ${r.detalle ? `<p class="resultado__detalle">${esc(r.detalle)}</p>` : ''}
    </div>`;
}

/** Pitido con Web Audio: no hace falta cargar un archivo de sonido. */
function pitar(exito) {
  try {
    const ctx = new (window.AudioContext ?? window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gan = ctx.createGain();

    osc.connect(gan);
    gan.connect(ctx.destination);

    // Agudo para el permitido, grave para el rechazo: se distinguen sin mirar.
    osc.frequency.value = exito ? 880 : 220;
    gan.gain.value = 0.1;

    osc.start();
    setTimeout(() => {
      osc.stop();
      void ctx.close();
    }, exito ? 120 : 300);
  } catch {
    /* sin audio, el color y el texto alcanzan */
  }
}

function dibujarHistorial() {
  const nodo = document.getElementById('historial-escaneos');
  if (!nodo) return;

  if (historial.length === 0) {
    nodo.innerHTML = estadoVacio('Todavía no escaneaste ningún carnet en esta sesión.', 'fa-clock-rotate-left');
    return;
  }

  nodo.innerHTML = `
    <h4 class="ficha__titulo" style="font-size:0.95rem">
      <i class="fas fa-clock-rotate-left" aria-hidden="true"></i> Últimos escaneos
    </h4>
    ${tabla({
      caption: 'Escaneos de esta sesión',
      columnas: [
        { clave: 'fecha', titulo: 'Hora', render: (h) => fechaHora(h.fecha) },
        { clave: 'alumno', titulo: 'Alumno', render: (h) => esc(h.alumno?.nombre ?? '—') },
        { clave: 'curso', titulo: 'Curso', render: (h) => esc(h.alumno?.curso ?? '—') },
        {
          clave: 'resultado',
          titulo: 'Resultado',
          render: (h) =>
            `<span class="badge badge--${h.permitido ? 'ok' : 'alerta'}">${esc(h.mensaje)}</span>`,
        },
      ],
      filas: historial,
    })}`;
}

// ==================================================================
// Punto de entrada
// ==================================================================

export async function iniciarEscaner(idContenedor = 'vista-escaner') {
  const contenedor = document.getElementById(idContenedor);
  if (!contenedor) return;

  detenerCamara();

  if (configuracion) await pantallaEscaneo(contenedor);
  else await pantallaConfiguracion(contenedor);
}

/** Libera la cámara al salir de la vista. */
export function detenerEscaner() {
  detenerCamara();
}

export default { iniciarEscaner, detenerEscaner };
