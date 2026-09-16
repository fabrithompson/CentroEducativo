/**
 * Verificación del código rotativo del carnet digital (TOTP, RFC 6238).
 *
 * En el servidor se usa `node:crypto`, que es rápido y auditado. La app móvil
 * tiene una implementación propia en JavaScript puro, porque React Native no
 * expone HMAC; `mobile/src/dominio/totp.test.ts` demuestra que ambas producen
 * exactamente el mismo resultado.
 *
 * **Si se cambia algún parámetro de acá —período, dígitos, formato del QR— hay
 * que cambiarlo igual en `mobile/src/dominio/totp.ts`.** Son dos
 * implementaciones del mismo protocolo y tienen que seguir coincidiendo.
 */

import crypto from 'node:crypto';

export const PERIODO_SEGUNDOS = 30;
export const DIGITOS = 8;

/**
 * Ventanas de tolerancia hacia atrás y hacia adelante.
 *
 * El reloj del teléfono y el del servidor nunca están perfectamente
 * sincronizados, y entre que se muestra el QR y el lector lo captura pasan
 * segundos. Con ±1 la ventana efectiva es de 90 segundos: alcanza para el uso
 * real sin regalarle tiempo a quien intente reutilizar una captura de pantalla.
 */
export const TOLERANCIA_VENTANAS = 1;

export const PREFIJO_QR = 'ETQ1';

/** Secreto de 32 bytes: 256 bits, el tamaño de bloque de SHA-256. */
export function generarSecreto(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function contadorPara(momentoMs: number, periodoSegundos = PERIODO_SEGUNDOS): number {
  return Math.floor(momentoMs / 1000 / periodoSegundos);
}

/** Genera el código de una ventana. Truncado dinámico de RFC 4226. */
export function generarCodigo(secretoHex: string, contador: number, digitos = DIGITOS): string {
  const mensaje = Buffer.alloc(8);
  mensaje.writeBigUInt64BE(BigInt(contador));

  const hash = crypto.createHmac('sha256', Buffer.from(secretoHex, 'hex')).update(mensaje).digest();

  const desplazamiento = hash[hash.length - 1]! & 0x0f;
  const binario =
    ((hash[desplazamiento]! & 0x7f) << 24) |
    (hash[desplazamiento + 1]! << 16) |
    (hash[desplazamiento + 2]! << 8) |
    hash[desplazamiento + 3]!;

  return String(binario % 10 ** digitos).padStart(digitos, '0');
}

/** Comparación en tiempo constante: con `===` el tiempo de respuesta filtra información. */
export function compararCodigos(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface ResultadoVerificacion {
  valido: boolean;
  /** Ventana con la que coincidió. Es lo que se guarda para impedir repeticiones. */
  contadorUsado: number | null;
  /** Desfasaje en ventanas respecto del reloj del servidor. */
  desfasaje: number | null;
}

/**
 * Verifica un código contra la ventana actual y las de tolerancia.
 *
 * Se verifica el código **y** el contador declarado: si el teléfono dice estar
 * en una ventana y el código es de otra, se rechaza. Sin ese cruce, alguien
 * podría reenviar un código viejo declarando un contador nuevo y esquivar la
 * protección contra repeticiones.
 */
export function verificarCodigo(
  secretoHex: string,
  codigo: string,
  contadorDeclarado: number,
  momentoMs: number = Date.now(),
): ResultadoVerificacion {
  const actual = contadorPara(momentoMs);

  for (let desfasaje = -TOLERANCIA_VENTANAS; desfasaje <= TOLERANCIA_VENTANAS; desfasaje++) {
    const contador = actual + desfasaje;

    if (contador !== contadorDeclarado) continue;
    if (!compararCodigos(generarCodigo(secretoHex, contador), codigo)) continue;

    return { valido: true, contadorUsado: contador, desfasaje };
  }

  return { valido: false, contadorUsado: null, desfasaje: null };
}

export interface ContenidoQR {
  credencialId: number;
  contador: number;
  codigo: string;
}

/**
 * Interpreta el contenido del QR. Devuelve `null` si no tiene el formato.
 *
 * El lector puede capturar cualquier QR que pase por la cámara —el de una
 * gaseosa, el de un cartel—, así que esta función tiene que rechazar todo lo
 * que no sea una credencial sin hacer ruido.
 */
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
