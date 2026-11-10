/**
 * Panel del estudiante — Carnet digital.
 *
 * El mismo carnet de la app: un QR que cambia cada 30 segundos y que el
 * docente o la administración leen con el escáner al subir al micro o al
 * entrar al comedor. Así la web queda igual que la app para el estudiante.
 *
 * El código es un TOTP sobre HMAC-SHA256 (RFC 6238 con truncado dinámico de RFC
 * 4226), con el mismo contenido que arma la app (`mobile/src/dominio/totp.ts`):
 * `ETQ1|<credencial>|<contador>|<código>`. Acá se calcula con Web Crypto en vez
 * de la implementación propia de la app. El backend verifica el código y que no
 * se use dos veces; la página sólo lo muestra.
 *
 * El dibujo del QR lo hace `qrcode-generator`, cargado del CDN con hash de
 * integridad, igual que `jsQR` en el escáner.
 */

import api from '../api.js';
import { avisar, esc, estadoVacio, render } from '../ui.js';

const PREFIJO_QR = 'ETQ1';

const QRGEN = {
  url: 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js',
  // Si el archivo del CDN cambiara, el navegador se niega a ejecutarlo.
  integridad: 'sha384-8FWZA6BGMXhsfO+BLtrJK0We6gg5o1JyO8xQm6peWDEUs17ACA5ziE/NIAkl9z2k',
};
let cargaQrgen = null;
let reloj = null;
/** La credencial vigente: la trae `contenido()` y la usa el reloj. */
let credencial = null;

function cargarQrgen() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (!cargaQrgen) {
    cargaQrgen = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = QRGEN.url;
      s.integrity = QRGEN.integridad;
      s.crossOrigin = 'anonymous';
      s.onload = () => (window.qrcode ? resolve(window.qrcode) : reject(new Error('El generador de QR no quedó disponible.')));
      s.onerror = () => {
        cargaQrgen = null;
        reject(new Error('No se pudo descargar el generador de QR.'));
      };
      document.head.appendChild(s);
    });
  }
  return cargaQrgen;
}

function hexABytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/** Código de una ventana: HMAC-SHA256 del contador (64 bits big-endian) y truncado dinámico. */
async function generarCodigo(clave, contador, digitos) {
  const mensaje = new Uint8Array(8);
  const vista = new DataView(mensaje.buffer);
  vista.setUint32(0, Math.floor(contador / 0x100000000), false);
  vista.setUint32(4, contador >>> 0, false);

  const hash = new Uint8Array(await crypto.subtle.sign('HMAC', clave, mensaje));
  const desplazamiento = hash[hash.length - 1] & 0x0f;
  const binario =
    ((hash[desplazamiento] & 0x7f) << 24) |
    (hash[desplazamiento + 1] << 16) |
    (hash[desplazamiento + 2] << 8) |
    hash[desplazamiento + 3];

  return String(binario % 10 ** digitos).padStart(digitos, '0');
}

function detener() {
  if (reloj) clearInterval(reloj);
  reloj = null;
}

async function contenido() {
  const { hijos } = await api.padres.misHijos();
  const yo = hijos[0];
  if (!yo) return estadoVacio('Tu usuario no está asociado a un legajo de alumno. Pedilo en secretaría.', 'fa-id-card');

  const r = await api.credenciales.obtener(yo.alumno.id);
  credencial = {
    id: r.credencial.id,
    secreto: r.credencial.secreto,
    periodo: r.credencial.periodoSegundos,
    digitos: r.credencial.digitos,
  };
  const a = r.alumno ?? yo.alumno;
  return `
    <div class="ficha" style="max-width:420px;margin:0 auto;text-align:center">
      <h3 class="ficha__titulo" style="justify-content:center">
        <i class="fas fa-id-card" aria-hidden="true"></i> ${esc(a.apellido)}, ${esc(a.nombres)}
      </h3>
      <p>Legajo <strong>${esc(a.legajo)}</strong>${r.alumno ? ` · ${esc(r.alumno.nivel)} · ${esc(r.alumno.curso)}` : ''}</p>
      <div id="carnet-qr" role="img" aria-label="Código QR del carnet" style="display:flex;justify-content:center;margin:12px 0"></div>
      <p style="font-size:1.6rem;letter-spacing:4px;font-weight:700" id="carnet-codigo" aria-live="off"></p>
      <p id="carnet-resto" aria-live="polite"></p>
      <p><small>El código cambia cada ${esc(r.credencial.periodoSegundos)} segundos y sirve una sola vez por punto de control.
        Si el escáner no lo lee, el control puede cargar a mano tu legajo y este código.</small></p>
    </div>`;
}

async function arrancarReloj() {
  const datos = credencial;
  if (!datos) return;

  const [qrcode, clave] = await Promise.all([
    cargarQrgen(),
    crypto.subtle.importKey('raw', hexABytes(datos.secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
  ]);

  let ultimoContador = null;
  const tic = async () => {
    const ahora = Date.now();
    const contador = Math.floor(ahora / 1000 / datos.periodo);
    const resto = datos.periodo - (Math.floor(ahora / 1000) % datos.periodo);
    const restoNodo = document.getElementById('carnet-resto');
    if (!restoNodo) return detener();
    restoNodo.textContent = `Se renueva en ${resto} s`;
    if (contador === ultimoContador) return;
    ultimoContador = contador;

    const codigo = await generarCodigo(clave, contador, datos.digitos);
    const qr = qrcode(0, 'M');
    qr.addData(`${PREFIJO_QR}|${datos.id}|${contador}|${codigo}`);
    qr.make();
    document.getElementById('carnet-qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: false });
    document.getElementById('carnet-codigo').textContent = codigo;
  };

  detener();
  await tic();
  reloj = setInterval(() => void tic(), 1000);
}

export async function iniciarCarnetEstudiante(idContenedor = 'vista-carnet') {
  const contenedor = document.getElementById(idContenedor);
  if (!contenedor) return;
  detener();
  credencial = null;
  await render(contenedor, contenido, { mensajeCarga: 'Cargando tu carnet…' });
  try {
    await arrancarReloj();
  } catch (err) {
    avisar(err?.message ?? 'No se pudo mostrar el carnet.', 'error');
  }
}

export default { iniciarCarnetEstudiante };
