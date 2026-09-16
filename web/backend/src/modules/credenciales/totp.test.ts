/**
 * Tests de la verificación del código rotativo.
 *
 * Cubren la parte que decide si un chico sube al micro o no. Un error acá deja
 * a alguien en la vereda, o peor, deja entrar un código vencido.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIGITOS,
  PERIODO_SEGUNDOS,
  PREFIJO_QR,
  TOLERANCIA_VENTANAS,
  compararCodigos,
  contadorPara,
  generarCodigo,
  generarSecreto,
  leerContenidoQR,
  verificarCodigo,
} from './totp.ts';

const SECRETO = generarSecreto();

// ==================================================================
// Secreto
// ==================================================================

test('el secreto tiene 256 bits', () => {
  const s = generarSecreto();
  assert.equal(s.length, 64, '32 bytes en hexadecimal');
  assert.match(s, /^[0-9a-f]{64}$/);
});

test('dos secretos nunca se repiten', () => {
  const secretos = new Set(Array.from({ length: 500 }, () => generarSecreto()));
  assert.equal(secretos.size, 500);
});

// ==================================================================
// Generación
// ==================================================================

test('el código tiene 8 dígitos', () => {
  for (let c = 58_000_000; c < 58_000_100; c++) {
    assert.match(generarCodigo(SECRETO, c), /^\d{8}$/);
  }
});

test('el código cambia en cada ventana', () => {
  assert.notEqual(generarCodigo(SECRETO, 58_000_000), generarCodigo(SECRETO, 58_000_001));
});

test('dos alumnos con distinto secreto tienen distinto código', () => {
  assert.notEqual(
    generarCodigo(generarSecreto(), 58_000_000),
    generarCodigo(generarSecreto(), 58_000_000),
  );
});

// ==================================================================
// Verificación
// ==================================================================

/** Instante arbitrario, alineado al comienzo de una ventana. */
const AHORA = 58_000_000 * PERIODO_SEGUNDOS * 1000;
const CONTADOR = contadorPara(AHORA);

test('un código de la ventana actual se acepta', () => {
  const codigo = generarCodigo(SECRETO, CONTADOR);
  const r = verificarCodigo(SECRETO, codigo, CONTADOR, AHORA);

  assert.equal(r.valido, true);
  assert.equal(r.contadorUsado, CONTADOR);
  assert.equal(r.desfasaje, 0);
});

test('se tolera una ventana de atraso', () => {
  // El QR se mostró hace 40 segundos y recién ahora lo escanean.
  const codigo = generarCodigo(SECRETO, CONTADOR - 1);
  const r = verificarCodigo(SECRETO, codigo, CONTADOR - 1, AHORA);

  assert.equal(r.valido, true);
  assert.equal(r.desfasaje, -1);
});

test('se tolera una ventana de adelanto', () => {
  // El reloj del teléfono está unos segundos adelantado.
  const codigo = generarCodigo(SECRETO, CONTADOR + 1);
  const r = verificarCodigo(SECRETO, codigo, CONTADOR + 1, AHORA);

  assert.equal(r.valido, true);
  assert.equal(r.desfasaje, 1);
});

test('REGLA: un código de dos ventanas atrás se rechaza', () => {
  // Acá está el valor de que el QR rote: una captura de pantalla de hace un
  // minuto ya no sirve para entrar.
  const codigo = generarCodigo(SECRETO, CONTADOR - 2);
  assert.equal(verificarCodigo(SECRETO, codigo, CONTADOR - 2, AHORA).valido, false);
});

test('un código de mucho antes se rechaza', () => {
  const codigo = generarCodigo(SECRETO, CONTADOR - 1000);
  assert.equal(verificarCodigo(SECRETO, codigo, CONTADOR - 1000, AHORA).valido, false);
});

test('REGLA: no alcanza con declarar un contador nuevo', () => {
  // Alguien captura un código viejo y lo reenvía diciendo que es de la ventana
  // actual. El código no coincide con esa ventana, así que se rechaza.
  const codigoViejo = generarCodigo(SECRETO, CONTADOR - 5);
  assert.equal(verificarCodigo(SECRETO, codigoViejo, CONTADOR, AHORA).valido, false);
});

test('REGLA: no alcanza con declarar el contador correcto', () => {
  // Al revés: contador válido pero código inventado.
  assert.equal(verificarCodigo(SECRETO, '00000000', CONTADOR, AHORA).valido, false);
  assert.equal(verificarCodigo(SECRETO, '99999999', CONTADOR, AHORA).valido, false);
});

test('el código de un alumno no sirve para otro', () => {
  const otroSecreto = generarSecreto();
  const codigo = generarCodigo(otroSecreto, CONTADOR);

  assert.equal(verificarCodigo(SECRETO, codigo, CONTADOR, AHORA).valido, false);
});

test('la ventana efectiva es de 90 segundos', () => {
  // ±1 ventana de 30 segundos, más la actual.
  const codigo = generarCodigo(SECRETO, CONTADOR);

  // Sigue siendo válido 29 segundos después.
  assert.equal(verificarCodigo(SECRETO, codigo, CONTADOR, AHORA + 29_000).valido, true);
  // Y hasta una ventana después.
  assert.equal(verificarCodigo(SECRETO, codigo, CONTADOR, AHORA + 59_000).valido, true);
  // Pero no dos ventanas después.
  assert.equal(verificarCodigo(SECRETO, codigo, CONTADOR, AHORA + 95_000).valido, false);
});

test('un código de longitud distinta no rompe la comparación', () => {
  assert.doesNotThrow(() => verificarCodigo(SECRETO, '123', CONTADOR, AHORA));
  assert.equal(verificarCodigo(SECRETO, '123', CONTADOR, AHORA).valido, false);
});

test('compararCodigos es seguro ante longitudes distintas', () => {
  assert.equal(compararCodigos('12345678', '123'), false);
  assert.equal(compararCodigos('12345678', '12345678'), true);
  assert.equal(compararCodigos('12345678', '87654321'), false);
});

// ==================================================================
// Parámetros
// ==================================================================

test('los parámetros coinciden con los de la app móvil', () => {
  // Si estos números se separan de `mobile/src/dominio/totp.ts`, el teléfono
  // genera códigos que el servidor rechaza y el carnet deja de funcionar.
  assert.equal(PERIODO_SEGUNDOS, 30);
  assert.equal(DIGITOS, 8);
  assert.equal(TOLERANCIA_VENTANAS, 1);
  assert.equal(PREFIJO_QR, 'ETQ1');
});

// ==================================================================
// Lectura del QR
// ==================================================================

test('se interpreta un QR bien formado', () => {
  assert.deepEqual(leerContenidoQR('ETQ1|42|58000123|01234567'), {
    credencialId: 42,
    contador: 58_000_123,
    codigo: '01234567',
  });
});

test('el lector ignora cualquier otro QR', () => {
  // La cámara captura lo que le pase por delante: el QR de una gaseosa, un
  // cartel, un enlace. Todo eso tiene que rechazarse sin hacer ruido.
  const ajenos = [
    'https://www.google.com',
    'BEGIN:VCARD\nFN:Juan\nEND:VCARD',
    '00020126580014BR.GOV.BCB.PIX',
    'ETQ1|1|2',
    'ETQ1|1|2|3|4',
    'ETQ0|1|2|00000003',
    '',
    '   ',
  ];

  for (const texto of ajenos) {
    assert.equal(leerContenidoQR(texto), null, `debería rechazar "${texto.slice(0, 30)}"`);
  }
});

test('el lector rechaza identificadores no positivos', () => {
  assert.equal(leerContenidoQR('ETQ1|0|58000000|00000001'), null);
  assert.equal(leerContenidoQR('ETQ1|-3|58000000|00000001'), null);
  assert.equal(leerContenidoQR('ETQ1|1|0|00000001'), null);
});

test('el lector tolera espacios alrededor', () => {
  assert.deepEqual(leerContenidoQR('  ETQ1|7|58000000|00000042\n'), {
    credencialId: 7,
    contador: 58_000_000,
    codigo: '00000042',
  });
});
