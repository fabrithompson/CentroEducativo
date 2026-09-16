/**
 * Tests del código rotativo.
 *
 * El objetivo principal es demostrar que la implementación de SHA-256 y HMAC
 * escrita a mano para React Native produce **exactamente** lo mismo que
 * `node:crypto`. Si difirieran en un byte, el teléfono mostraría códigos que el
 * servidor rechazaría, y el carnet no serviría para nada.
 *
 * `node:crypto` sólo se usa acá, en el test. La implementación no lo importa.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

import {
  DIGITOS,
  PERIODO_SEGUNDOS,
  PREFIJO_QR,
  TOLERANCIA_VENTANAS,
  armarContenidoQR,
  bytesAHex,
  contadorPara,
  generarCodigo,
  hexABytes,
  hmacSha256,
  leerContenidoQR,
  segundosRestantes,
  sha256,
} from './totp.ts';

const texto = (s: string) => new Uint8Array(Buffer.from(s, 'utf8'));

// ==================================================================
// SHA-256 contra node:crypto
// ==================================================================

test('SHA-256 coincide con node:crypto en los vectores clásicos', () => {
  for (const entrada of ['', 'abc', 'hola', 'Transformar para educar']) {
    const propio = bytesAHex(sha256(texto(entrada)));
    const nodejs = crypto.createHash('sha256').update(entrada, 'utf8').digest('hex');
    assert.equal(propio, nodejs, `difieren para "${entrada}"`);
  }
});

test('SHA-256 del vacío da el valor conocido', () => {
  assert.equal(
    bytesAHex(sha256(new Uint8Array(0))),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
});

test('SHA-256 coincide en los bordes del bloque de 64 bytes', () => {
  // El relleno es donde se rompen las implementaciones caseras: 55, 56 y 64
  // bytes son los casos que fuerzan un bloque extra.
  for (const largo of [0, 1, 54, 55, 56, 57, 63, 64, 65, 119, 120, 128, 200]) {
    const entrada = 'a'.repeat(largo);
    const propio = bytesAHex(sha256(texto(entrada)));
    const nodejs = crypto.createHash('sha256').update(entrada, 'utf8').digest('hex');
    assert.equal(propio, nodejs, `difieren con ${largo} bytes`);
  }
});

test('SHA-256 coincide sobre 200 entradas aleatorias', () => {
  for (let i = 0; i < 200; i++) {
    const bytes = crypto.randomBytes(1 + (i % 300));
    const propio = bytesAHex(sha256(new Uint8Array(bytes)));
    const nodejs = crypto.createHash('sha256').update(bytes).digest('hex');
    assert.equal(propio, nodejs, `difieren en la iteración ${i}`);
  }
});

// ==================================================================
// HMAC-SHA256 contra node:crypto
// ==================================================================

test('HMAC-SHA256 coincide con node:crypto', () => {
  const casos: [string, string][] = [
    ['clave', 'mensaje'],
    ['', ''],
    ['secreto-del-colegio', 'ETQ1|1|58000000|12345678'],
  ];

  for (const [clave, mensaje] of casos) {
    const propio = bytesAHex(hmacSha256(texto(clave), texto(mensaje)));
    const nodejs = crypto.createHmac('sha256', clave).update(mensaje, 'utf8').digest('hex');
    assert.equal(propio, nodejs, `difieren para clave="${clave}"`);
  }
});

test('HMAC-SHA256 coincide con una clave más larga que el bloque', () => {
  // Una clave de más de 64 bytes se reduce con un hash previo: es un camino
  // distinto del código y hay que probarlo.
  const clave = 'x'.repeat(100);
  const propio = bytesAHex(hmacSha256(texto(clave), texto('mensaje')));
  const nodejs = crypto.createHmac('sha256', clave).update('mensaje', 'utf8').digest('hex');
  assert.equal(propio, nodejs);
});

test('HMAC-SHA256 coincide sobre 100 pares aleatorios', () => {
  for (let i = 0; i < 100; i++) {
    const clave = crypto.randomBytes(1 + (i % 90));
    const mensaje = crypto.randomBytes(1 + (i % 200));

    const propio = bytesAHex(hmacSha256(new Uint8Array(clave), new Uint8Array(mensaje)));
    const nodejs = crypto.createHmac('sha256', clave).update(mensaje).digest('hex');

    assert.equal(propio, nodejs, `difieren en la iteración ${i}`);
  }
});

// ==================================================================
// Conversión hexadecimal
// ==================================================================

test('hexABytes y bytesAHex son inversas', () => {
  for (let i = 0; i < 50; i++) {
    const hex = crypto.randomBytes(32).toString('hex');
    assert.equal(bytesAHex(hexABytes(hex)), hex);
  }
});

test('hexABytes rechaza cadenas inválidas', () => {
  for (const malo of ['abc', 'zz', 'ab cd', '0x1234']) {
    assert.throws(() => hexABytes(malo), RangeError, `debería rechazar "${malo}"`);
  }
});

// ==================================================================
// Generación del código
// ==================================================================

const SECRETO = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';

/** El mismo algoritmo, resuelto con node:crypto. Es el "control" del test. */
function codigoConNode(secretoHex: string, contador: number, digitos = DIGITOS): string {
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

test('el código generado coincide con el que calcularía el servidor', () => {
  // Esta es la prueba que importa: si falla, el carnet no sirve.
  for (let contador = 58_000_000; contador < 58_000_200; contador++) {
    assert.equal(
      generarCodigo(SECRETO, contador),
      codigoConNode(SECRETO, contador),
      `difieren en el contador ${contador}`,
    );
  }
});

test('el código coincide con secretos aleatorios', () => {
  for (let i = 0; i < 50; i++) {
    const secreto = crypto.randomBytes(32).toString('hex');
    const contador = 58_000_000 + i;
    assert.equal(generarCodigo(secreto, contador), codigoConNode(secreto, contador));
  }
});

test('el código tiene siempre 8 dígitos', () => {
  for (let contador = 58_000_000; contador < 58_000_500; contador++) {
    const codigo = generarCodigo(SECRETO, contador);
    assert.equal(codigo.length, DIGITOS, `el contador ${contador} produjo "${codigo}"`);
    assert.match(codigo, /^\d{8}$/);
  }
});

test('el código cambia en cada ventana', () => {
  const a = generarCodigo(SECRETO, 58_000_000);
  const b = generarCodigo(SECRETO, 58_000_001);
  assert.notEqual(a, b, 'dos ventanas seguidas no pueden dar el mismo código');
});

test('el código es determinístico: misma ventana, mismo código', () => {
  assert.equal(generarCodigo(SECRETO, 58_000_000), generarCodigo(SECRETO, 58_000_000));
});

test('dos alumnos con distinto secreto tienen distinto código', () => {
  const otro = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
  assert.notEqual(generarCodigo(SECRETO, 58_000_000), generarCodigo(otro, 58_000_000));
});

// ==================================================================
// Ventanas de tiempo
// ==================================================================

test('el contador avanza una vez por período', () => {
  const base = 1_800_000_000_000; // instante arbitrario en milisegundos
  const c0 = contadorPara(base);

  assert.equal(contadorPara(base + (PERIODO_SEGUNDOS - 1) * 1000), c0, 'dentro del período no cambia');
  assert.equal(contadorPara(base + PERIODO_SEGUNDOS * 1000), c0 + 1, 'al cumplirse el período avanza');
});

test('el período de rotación es de 30 segundos', () => {
  assert.equal(PERIODO_SEGUNDOS, 30);
});

test('segundosRestantes va de 30 a 1 dentro de la ventana', () => {
  const inicio = 58_000_000 * PERIODO_SEGUNDOS * 1000;

  assert.equal(segundosRestantes(inicio), 30);
  assert.equal(segundosRestantes(inicio + 1000), 29);
  assert.equal(segundosRestantes(inicio + 29_000), 1);
  assert.equal(segundosRestantes(inicio + 30_000), 30, 'arranca la ventana siguiente');
});

test('la tolerancia es de una ventana hacia cada lado', () => {
  // 90 segundos en total: cubre el desfasaje de reloj y el tiempo de escaneo
  // sin ampliar de más la ventana de un atacante.
  assert.equal(TOLERANCIA_VENTANAS, 1);
});

// ==================================================================
// Contenido del QR
// ==================================================================

test('armar y leer el contenido del QR son inversas', () => {
  const contenido = { credencialId: 42, contador: 58_000_123, codigo: '01234567' };
  assert.deepEqual(leerContenidoQR(armarContenidoQR(contenido)), contenido);
});

test('el contenido del QR es corto: se lee más rápido y desde más lejos', () => {
  const texto = armarContenidoQR({ credencialId: 9999, contador: 99_999_999, codigo: '12345678' });
  assert.ok(texto.length < 40, `el contenido mide ${texto.length} caracteres`);
});

test('el contenido lleva prefijo de versión', () => {
  assert.ok(armarContenidoQR({ credencialId: 1, contador: 2, codigo: '00000003' }).startsWith(PREFIJO_QR));
});

test('leerContenidoQR rechaza cualquier otro código', () => {
  const invalidos = [
    '',
    'hola',
    'https://ejemplo.com',            // un QR de otra cosa
    'ETQ1|1|2',                        // partes de menos
    'ETQ1|1|2|3|4',                    // partes de más
    'OTRO|1|2|00000003',               // prefijo ajeno
    'ETQ1|abc|2|00000003',             // id no numérico
    'ETQ1|1|abc|00000003',             // contador no numérico
    'ETQ1|1|2|abcdefgh',               // código no numérico
    'ETQ1|0|2|00000003',               // id cero
    'ETQ1|-1|2|00000003',              // id negativo
  ];

  for (const entrada of invalidos) {
    assert.equal(leerContenidoQR(entrada), null, `debería rechazar "${entrada}"`);
  }
});

test('leerContenidoQR tolera espacios alrededor', () => {
  const contenido = { credencialId: 7, contador: 58_000_000, codigo: '00000042' };
  assert.deepEqual(leerContenidoQR(`  ${armarContenidoQR(contenido)}\n`), contenido);
});
