/**
 * Escáner de carnet digital para el personal.
 *
 * Pensado para usarse con una tablet o un celular en la mano, de pie, con
 * chicos haciendo fila. De ahí las decisiones:
 *
 *  - **La respuesta ocupa toda la pantalla y es verde o roja.** El operador la
 *    lee de reojo; no puede estar buscando un cartelito.
 *  - **Lee con la cámara en cualquier navegador.** `BarcodeDetector` no existe
 *    en Chrome ni Edge de escritorio, ni en Firefox, ni en Safari de iPhone:
 *    antes, en todos ellos la cámara ni se abría. Donde falta, cada cuadro del
 *    video pasa por jsQR, cargado del CDN con hash de integridad.
 *  - **Entrada manual siempre disponible.** Una pantalla rayada, el sol de
 *    frente o un teléfono sin batería no pueden dejar a un chico afuera del
 *    micro. El operador tipea lo que el carnet muestra a la vista: el legajo y
 *    el código de 8 dígitos. Antes pedía un "N° de credencial" que el carnet no
 *    muestra, y armaba el contador con el reloj de la PC.
 *  - **Un mismo QR se ignora mientras vale (90 segundos).** La cámara lo ve
 *    muchas veces seguidas; con un antirrebote de 2 segundos, el segundo envío
 *    pisaba el verde con "Este código ya fue usado".
 *  - **La cámara se apaga al salir de la sección** o al cambiar de pestaña, no
 *    sólo al cerrar la página.
 *  - **El punto de control se elige una vez** y queda fijo mientras dure la
 *    jornada.
 */

import api from '../api.js';
import { esc, estadoVacio, fechaHora, render, tabla } from '../ui.js';

let configuracion = null;   // { punto, recorridoId, recorridoNombre }
let stream = null;          // MediaStream de la cámara
// Cada encendido de la cámara abre una sesión y cada apagado la cierra. El
// bucle de lectura corre mientras su sesión sea la vigente: así un apagado
// mientras se esperaba el permiso, o un reinicio rápido, no dejan dos bucles
// ni una cámara encendida sin nadie que la use.
let sesionCamara = 0;
const vistos = new Map();   // texto del QR -> momento en que se validó
const historial = [];

/** Un QR vale su ventana de 30 s más una de tolerancia a cada lado. */
const VIGENCIA_QR_MS = 90_000;
const PAUSA_ENTRE_CUADROS_MS = 250;

const JSQR = {
  url: 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js',
  // Si el archivo del CDN cambiara, el navegador se niega a ejecutarlo.
  integridad: 'sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx',
};
let cargaJsQR = null;

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
          <video id="video-escaner" playsinline muted
                 aria-label="Vista de la cámara para escanear el carnet"></video>
          <div class="escaner__mira" aria-hidden="true"></div>
        </div>

        <div class="escaner__panel">
          <div id="resultado-escaneo" role="status" aria-live="assertive">
            ${estadoVacio('Acercá el carnet del alumno a la cámara.', 'fa-qrcode')}
          </div>

          <form id="form-manual" class="ficha" style="margin-top:16px" novalidate>
            <h4 class="ficha__titulo" style="font-size:0.95rem">
              <i class="fas fa-keyboard" aria-hidden="true"></i> Entrada manual
            </h4>
            <p class="ayuda" style="margin-bottom:10px">
              Si la cámara no lee el carnet, pedile al alumno el legajo y el código de 8 dígitos
              que muestra la pantalla, debajo del QR.
            </p>
            <div class="campo">
              <label for="manual-legajo">Legajo</label>
              <input type="text" id="manual-legajo" name="legajo" required maxlength="12"
                     autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="A-0012">
            </div>
            <div class="campo">
              <label for="manual-codigo">Código de 8 dígitos</label>
              <input type="text" id="manual-codigo" name="codigo" required maxlength="9"
                     inputmode="numeric" autocomplete="off" placeholder="1234 5678">
            </div>
            <p class="campo__error" id="manual-error" role="alert" hidden></p>
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
    const error = form.querySelector('#manual-error');
    const legajo = form.legajo.value.trim();
    // El carnet muestra el código partido en dos: "1234 5678".
    const codigo = form.codigo.value.replace(/[\s-]/g, '');

    if (!legajo || !/^\d{8}$/.test(codigo)) {
      error.textContent = !legajo
        ? 'Tipeá el legajo del alumno.'
        : 'El código tiene 8 dígitos, como lo muestra el carnet.';
      error.hidden = false;
      (!legajo ? form.legajo : form.codigo).focus();
      return;
    }
    error.hidden = true;

    // El servidor busca la credencial por legajo y prueba el código contra la
    // ventana actual y la anterior: el operador no tiene que saber nada más.
    const boton = form.querySelector('[type="submit"]');
    boton.disabled = true;
    try {
      const r = await validar({ legajo, codigo });
      if (r && r.permitido) {
        form.reset();
        form.legajo.focus();
      } else {
        form.codigo.select();
      }
    } finally {
      boton.disabled = false;
    }
  });

  dibujarHistorial();

  await iniciarCamara();
}

// ==================================================================
// Cámara
// ==================================================================

/** Carga jsQR una sola vez. */
function cargarJsQR() {
  if (window.jsQR) return Promise.resolve(window.jsQR);
  if (!cargaJsQR) {
    cargaJsQR = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = JSQR.url;
      s.integrity = JSQR.integridad;
      s.crossOrigin = 'anonymous';
      s.onload = () => (window.jsQR ? resolve(window.jsQR) : reject(new Error('El lector de QR no quedó disponible.')));
      s.onerror = () => {
        cargaJsQR = null;
        reject(new Error('No se pudo descargar el lector de QR.'));
      };
      document.head.appendChild(s);
    });
  }
  return cargaJsQR;
}

/**
 * Devuelve `leer(video) -> Promise<string | null>`. `BarcodeDetector` es el
 * camino rápido donde existe; si no, jsQR sobre un `<canvas>`.
 */
async function crearLector() {
  if ('BarcodeDetector' in window) {
    try {
      const formatos = await window.BarcodeDetector.getSupportedFormats?.();
      if (!formatos || formatos.includes('qr_code')) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        return async (video) => {
          const codigos = await detector.detect(video);
          return codigos.length > 0 ? codigos[0].rawValue : null;
        };
      }
    } catch {
      /* se usa jsQR */
    }
  }

  const jsQR = await cargarJsQR();
  const lienzo = document.createElement('canvas');
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });

  return async (video) => {
    const ancho = video.videoWidth;
    const alto = video.videoHeight;
    if (!ancho || !alto) return null;
    // Un QR en una pantalla se lee igual a 640 px, y en una tablet modesta
    // procesar cada cuadro completo cuesta.
    const escala = Math.min(1, 640 / Math.max(ancho, alto));
    lienzo.width = Math.round(ancho * escala);
    lienzo.height = Math.round(alto * escala);
    ctx.drawImage(video, 0, 0, lienzo.width, lienzo.height);
    const imagen = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
    const r = jsQR(imagen.data, imagen.width, imagen.height, { inversionAttempts: 'dontInvert' });
    return r ? r.data : null;
  };
}

/** Qué decirle al operador según por qué no se abrió la cámara. */
function motivoCamara(err) {
  switch (err && err.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'El navegador no tiene permiso para usar la cámara. Habilitalo desde el candado de la barra de direcciones y volvé a entrar a esta sección.';
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return 'La cámara está en uso por otra aplicación o pestaña. Cerrala y volvé a entrar a esta sección.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'No se encontró una cámara en este equipo.';
    default:
      return 'No se pudo abrir la cámara.';
  }
}

function avisoCamara(mensaje) {
  const caja = document.querySelector('.escaner__camara');
  if (!caja) return;
  caja.innerHTML = `
    <div class="estado estado--vacio">
      <i class="fas fa-video-slash" aria-hidden="true"></i>
      <p><strong>${esc(mensaje)}</strong></p>
      <p>Mientras tanto podés usar la entrada manual.</p>
    </div>`;
}

function apagar(s) {
  for (const pista of s.getTracks()) pista.stop();
}

async function iniciarCamara() {
  const video = document.getElementById('video-escaner');
  if (!video) return;
  const sesion = ++sesionCamara;

  if (!navigator.mediaDevices?.getUserMedia) {
    avisoCamara('La cámara sólo se puede usar en una conexión segura (https).');
    return;
  }

  let pedido;
  try {
    // `environment` pide la cámara trasera, que es la que se usa de pie.
    pedido = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (err) {
    if (sesion === sesionCamara) avisoCamara(motivoCamara(err));
    console.error('[escaner]', err);
    return;
  }

  // Mientras se esperaba el permiso, el operador pudo haber salido de la sección.
  if (sesion !== sesionCamara) {
    apagar(pedido);
    return;
  }
  stream = pedido;

  try {
    video.srcObject = stream;
    await video.play();
    const leer = await crearLector();
    if (sesion !== sesionCamara) return;
    void bucleEscaneo(video, leer, sesion);
  } catch (err) {
    // Sin lector la cámara no sirve: se apaga en lugar de quedar encendida.
    detenerCamara();
    avisoCamara(err?.message || 'No se pudo iniciar el lector de QR.');
    console.error('[escaner]', err);
  }
}

function detenerCamara() {
  sesionCamara++;
  if (stream) {
    apagar(stream);
    stream = null;
  }
  const video = document.getElementById('video-escaner');
  if (video) video.srcObject = null;
}

function yaVisto(texto) {
  const momento = vistos.get(texto);
  return momento !== undefined && Date.now() - momento < VIGENCIA_QR_MS;
}

function recordarVisto(texto) {
  const ahora = Date.now();
  vistos.set(texto, ahora);
  for (const [t, m] of vistos) if (ahora - m > VIGENCIA_QR_MS) vistos.delete(t);
}

async function bucleEscaneo(video, leer, sesion) {
  while (sesion === sesionCamara) {
    try {
      const texto = await leer(video);
      // El mismo QR se ignora mientras vale: la cámara lo ve muchas veces.
      if (texto && sesion === sesionCamara && !yaVisto(texto)) {
        await validar({ qr: texto }, texto);
      }
    } catch (err) {
      console.error('[escaner] error leyendo', err);
    }

    // Una pausa corta evita saturar el CPU de una tablet modesta.
    await new Promise((r) => setTimeout(r, PAUSA_ENTRE_CUADROS_MS));
  }
}

// ==================================================================
// Validación
// ==================================================================

/**
 * `datos` es `{ qr }` o `{ legajo, codigo }`. `textoQR` se recuerda recién
 * cuando el servidor respondió: si falló la conexión, el mismo QR se puede
 * volver a leer.
 */
async function validar(datos, textoQR) {
  try {
    const r = await api.accesos.escanear({
      ...datos,
      punto: configuracion.punto,
      recorridoId: configuracion.recorridoId,
      dispositivo: navigator.userAgent.slice(0, 80),
    });
    if (textoQR) recordarVisto(textoQR);

    mostrarResultado(r);
    historial.unshift({ ...r, fecha: new Date().toISOString() });
    if (historial.length > 20) historial.pop();
    dibujarHistorial();

    // Un pitido corto ayuda a operar sin mirar la pantalla.
    pitar(r.permitido);
    return r;
  } catch (err) {
    mostrarResultado({
      permitido: false,
      mensaje: 'No se pudo validar',
      detalle: err?.message ?? 'Revisá la conexión con el servidor.',
      alumno: null,
    });
    return null;
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

// Al cambiar de sección se apaga la cámara (campus.js avisa cada cambio). Antes
// sólo se liberaba al cerrar la página, y quedaba encendida de fondo con el
// indicador prendido mientras el operador usaba otra parte del panel.
document.addEventListener('vista-cambiada', (e) => {
  if (e.detail?.id !== 'escaner') detenerCamara();
});

// Tampoco tiene sentido filmar con la pestaña oculta. Al volver, si sigue en
// la pantalla de escaneo, se enciende de nuevo.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    detenerCamara();
  } else if (document.getElementById('video-escaner') && document.getElementById('escaner')?.classList.contains('active')) {
    void iniciarCamara();
  }
});

window.addEventListener('pagehide', detenerCamara);

export default { iniciarEscaner, detenerEscaner };
