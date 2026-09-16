/**
 * Código de acceso rotativo (TOTP, RFC 6238) en JavaScript puro.
 *
 * ── Por qué está implementado a mano ────────────────────────────────────────
 * React Native no expone `crypto.subtle`, y `expo-crypto` sólo ofrece digest de
 * SHA-256 sobre strings: no alcanza para HMAC, que necesita operar sobre bytes.
 * Sumar una librería de criptografía por 200 líneas de código estándar no se
 * justifica, y además es código que conviene poder auditar entero.
 *
 * La contracara es que hay que demostrar que esta implementación es correcta.
 * `totp.test.ts` compara cada paso contra `node:crypto`: si difieren en un solo
 * byte, la suite falla. Es la única forma honesta de sostener que el código que
 * genera el teléfono va a coincidir con el que valida el servidor.
 * ────────────────────────────────────────────────────────────────────────────
 *
 * El teléfono genera el código **sin conexión**. Es deliberado: un chico
 * esperando el micro en Fontana puede no tener señal, y el carnet igual tiene
 * que funcionar. El que necesita red es el escáner, que está en el colegio o en
 * el micro con el celular del chofer.
 */

// ==================================================================
// SHA-256
// ==================================================================

/** Constantes del algoritmo: raíces cúbicas de los primeros 64 primos. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number): number => ((x >>> n) | (x << (32 - n))) >>> 0;

/** SHA-256 de un arreglo de bytes. Devuelve 32 bytes. */
export function sha256(mensaje: Uint8Array): Uint8Array {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  // Relleno: bit 1, ceros, y la longitud en bits como entero de 64 bits.
  const largoBits = mensaje.length * 8;
  const largoConRelleno = Math.ceil((mensaje.length + 9) / 64) * 64;
  const bloque = new Uint8Array(largoConRelleno);
  bloque.set(mensaje);
  bloque[mensaje.length] = 0x80;

  // La longitud va en los últimos 8 bytes, big-endian. Con mensajes de este
  // tamaño los 4 bytes altos son siempre cero.
  const vista = new DataView(bloque.buffer);
  vista.setUint32(largoConRelleno - 4, largoBits >>> 0, false);
  vista.setUint32(largoConRelleno - 8, Math.floor(largoBits / 0x100000000), false);

  const w = new Uint32Array(64);

  for (let inicio = 0; inicio < largoConRelleno; inicio += 64) {
    for (let i = 0; i < 16; i++) w[i] = vista.getUint32(inicio + i * 4, false);

    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15]!, 7) ^ rotr(w[i - 15]!, 18) ^ (w[i - 15]! >>> 3);
      const s1 = rotr(w[i - 2]!, 17) ^ rotr(w[i - 2]!, 19) ^ (w[i - 2]! >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }

  const salida = new Uint8Array(32);
  const vistaSalida = new DataView(salida.buffer);
  for (let i = 0; i < 8; i++) vistaSalida.setUint32(i * 4, h[i]!, false);
  return salida;
}

// ==================================================================
// HMAC-SHA256
// ==================================================================

const TAMANO_BLOQUE = 64;

export function hmacSha256(clave: Uint8Array, mensaje: Uint8Array): Uint8Array {
  // Una clave más larga que el bloque se reduce con un hash; una más corta se
  // completa con ceros.
  let claveNormalizada = clave.length > TAMANO_BLOQUE ? sha256(clave) : clave;

  const claveRellena = new Uint8Array(TAMANO_BLOQUE);
  claveRellena.set(claveNormalizada);

  const interno = new Uint8Array(TAMANO_BLOQUE + mensaje.length);
  const externo = new Uint8Array(TAMANO_BLOQUE + 32);

  for (let i = 0; i < TAMANO_BLOQUE; i++) {
    interno[i] = claveRellena[i]! ^ 0x36;
    externo[i] = claveRellena[i]! ^ 0x5c;
  }

  interno.set(mensaje, TAMANO_BLOQUE);
  externo.set(sha256(interno), TAMANO_BLOQUE);

  return sha256(externo);
}

// ==================================================================
// Utilidades de bytes
// ==================================================================

export function hexABytes(hex: string): Uint8Array {
  const limpio = hex.trim().toLowerCase();
  if (limpio.length % 2 !== 0 || !/^[0-9a-f]*$/.test(limpio)) {
    throw new RangeError('La cadena no es hexadecimal válida.');
  }

  const bytes = new Uint8Array(limpio.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(limpio.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

export function bytesAHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

// ==================================================================
// TOTP
// ==================================================================

/**
 * Cada cuántos segundos rota el código.
 *
 * 30 segundos es el estándar de RFC 6238 y el punto de equilibrio: una captura
 * de pantalla queda inservible casi de inmediato, pero la ventana alcanza para
 * que alguien saque el teléfono y lo acerque al lector. Bajarlo a 10 haría que
 * el código venza mientras el chico sube al micro.
 */
export const PERIODO_SEGUNDOS = 30;

/** Dígitos del código. Ocho hacen que adivinar sea 1 en 100 millones. */
export const DIGITOS = 8;

/**
 * Ventanas de tolerancia hacia atrás y hacia adelante.
 *
 * El reloj del teléfono y el del servidor no están perfectamente sincronizados,
 * y entre que se muestra el QR y se lo escanea pasan segundos. Una ventana de
 * ±1 (90 segundos en total) cubre eso sin ampliar de más la superficie de
 * ataque. Lo valida el servidor, no el teléfono.
 */
export const TOLERANCIA_VENTANAS = 1;

/** Número de ventana correspondiente a un instante. */
export function contadorPara(momentoMs: number, periodoSegundos = PERIODO_SEGUNDOS): number {
  return Math.floor(momentoMs / 1000 / periodoSegundos);
}

/** Segundos que le quedan de vida al código actual. */
export function segundosRestantes(momentoMs: number, periodoSegundos = PERIODO_SEGUNDOS): number {
  const transcurridos = Math.floor(momentoMs / 1000) % periodoSegundos;
  return periodoSegundos - transcurridos;
}

/**
 * Genera el código de una ventana.
 *
 * Usa el truncado dinámico de RFC 4226: se toma el nibble bajo del último byte
 * como desplazamiento y se leen 4 bytes desde ahí. Eso evita que el código
 * dependa siempre de la misma porción del hash.
 */
export function generarCodigo(
  secretoHex: string,
  contador: number,
  digitos = DIGITOS,
): string {
  const clave = hexABytes(secretoHex);

  // El contador va como entero de 64 bits big-endian.
  const mensaje = new Uint8Array(8);
  const vista = new DataView(mensaje.buffer);
  vista.setUint32(0, Math.floor(contador / 0x100000000), false);
  vista.setUint32(4, contador >>> 0, false);

  const hash = hmacSha256(clave, mensaje);

  const desplazamiento = hash[hash.length - 1]! & 0x0f;
  const binario =
    ((hash[desplazamiento]! & 0x7f) << 24) |
    (hash[desplazamiento + 1]! << 16) |
    (hash[desplazamiento + 2]! << 8) |
    hash[desplazamiento + 3]!;

  return String(binario % 10 ** digitos).padStart(digitos, '0');
}

// ==================================================================
// Contenido del QR
// ==================================================================

/** Prefijo y versión del formato, para poder cambiarlo sin romper lectores viejos. */
export const PREFIJO_QR = 'ETQ1';

export interface ContenidoQR {
  credencialId: number;
  contador: number;
  codigo: string;
}

/**
 * Arma el texto que va dentro del QR.
 *
 * Se mantiene corto a propósito: un QR con poco contenido tiene módulos más
 * grandes y se lee más rápido y desde más lejos, que es justo lo que hace falta
 * en la puerta de un micro.
 */
export function armarContenidoQR(c: ContenidoQR): string {
  return `${PREFIJO_QR}|${c.credencialId}|${c.contador}|${c.codigo}`;
}

/** Interpreta el texto leído. Devuelve `null` si no tiene el formato esperado. */
export function leerContenidoQR(texto: string): ContenidoQR | null {
  const partes = texto.trim().split('|');
  if (partes.length !== 4) return null;
  if (partes[0] !== PREFIJO_QR) return null;

  const credencialId = Number(partes[1]);
  const contador = Number(partes[2]);
  const codigo = partes[3]!;

  if (!Number.isInteger(credencialId) || credencialId <= 0) return null;
  if (!Number.isInteger(contador) || contador <= 0) return null;
  if (!/^\d+$/.test(codigo)) return null;

  return { credencialId, contador, codigo };
}
