/**
 * Tests de las primitivas de recuperación de contraseña.
 *
 * Cubren la parte criptográfica, que es donde un error pasa desapercibido hasta
 * que alguien lo explota. El flujo completo contra la base se prueba una vez que
 * haya PostgreSQL disponible.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { compararHashes, generarToken, hashearToken, RESET_TTL_MINUTOS } from './tokens.ts';

test('generarToken produce 64 caracteres hexadecimales (256 bits)', () => {
  const token = generarToken();
  assert.equal(token.length, 64);
  assert.match(token, /^[0-9a-f]{64}$/);
});

test('generarToken no repite valores', () => {
  const tokens = new Set(Array.from({ length: 500 }, () => generarToken()));
  assert.equal(tokens.size, 500, 'no debería haber colisiones');
});

test('hashearToken es determinístico', () => {
  const token = generarToken();
  assert.equal(hashearToken(token), hashearToken(token));
});

test('hashearToken produce un SHA-256 en hexadecimal', () => {
  assert.match(hashearToken('lo-que-sea'), /^[0-9a-f]{64}$/);
});

test('el hash no permite recuperar el token original', () => {
  const token = generarToken();
  const hash = hashearToken(token);
  assert.notEqual(hash, token, 'el hash no puede coincidir con el token en claro');
});

test('tokens distintos producen hashes distintos', () => {
  assert.notEqual(hashearToken(generarToken()), hashearToken(generarToken()));
});

test('un cambio de un solo carácter cambia el hash por completo', () => {
  const a = hashearToken('token-de-prueba-1');
  const b = hashearToken('token-de-prueba-2');

  let iguales = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) iguales++;

  // Con SHA-256 la coincidencia esperada es ~1/16 de los caracteres.
  assert.ok(iguales < a.length / 2, 'los hashes deberían diferir en casi todos los caracteres');
});

test('compararHashes acepta valores idénticos', () => {
  const hash = hashearToken(generarToken());
  assert.equal(compararHashes(hash, hash), true);
});

test('compararHashes rechaza valores distintos', () => {
  assert.equal(compararHashes(hashearToken('a'), hashearToken('b')), false);
});

test('compararHashes rechaza longitudes distintas sin romper', () => {
  // timingSafeEqual lanza si los buffers difieren en longitud: hay que atajarlo.
  assert.doesNotThrow(() => compararHashes('corto', hashearToken('largo')));
  assert.equal(compararHashes('corto', hashearToken('largo')), false);
});

test('la ventana de validez del token es corta', () => {
  assert.ok(RESET_TTL_MINUTOS > 0);
  assert.ok(RESET_TTL_MINUTOS <= 60, 'un token de recuperación no debería durar más de una hora');
});
