/**
 * Elección de la cookie de refresco cuando hay varias cuentas abiertas en el
 * mismo navegador.
 *
 * Es la regla que impide que una pestaña pase a ser otra cuenta en silencio:
 * con una cookie por cuenta, cada pestaña renueva la suya.
 *
 *   node --import tsx --test src/modules/auth/cookiesRefresco.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { COOKIE_VIEJA, cookieDeCuenta, elegirCookieRefresco } from './cookiesRefresco.ts';

const dos = { [cookieDeCuenta(1)]: 'token-admin', [cookieDeCuenta(7)]: 'token-docente', otra: 'x' };

test('con el id de la pestaña se usa la cookie de esa cuenta', () => {
  assert.deepEqual(elegirCookieRefresco(dos, 1), { nombre: 'et_refresh_1', token: 'token-admin' });
  assert.deepEqual(elegirCookieRefresco(dos, 7), { nombre: 'et_refresh_7', token: 'token-docente' });
});

test('REGLA: sin la cookie de esa cuenta no se usa la de otra', () => {
  assert.equal(elegirCookieRefresco({ [cookieDeCuenta(7)]: 'token-docente' }, 1), null);
});

test('una sesión de antes (cookie única) se acepta para migrarla', () => {
  assert.deepEqual(elegirCookieRefresco({ [COOKIE_VIEJA]: 'token-viejo' }, 1), { nombre: 'et_refresh', token: 'token-viejo' });
});

test('sin id (la app móvil) se usa la única cookie por cuenta', () => {
  assert.deepEqual(elegirCookieRefresco({ [cookieDeCuenta(3)]: 'token-tutor', otra: 'x' }), { nombre: 'et_refresh_3', token: 'token-tutor' });
});

test('sin id y sin cookies por cuenta, la vieja', () => {
  assert.deepEqual(elegirCookieRefresco({ [COOKIE_VIEJA]: 'token-viejo' }), { nombre: 'et_refresh', token: 'token-viejo' });
});

test('REGLA: sin id y con varias cuentas abiertas no se adivina', () => {
  assert.equal(elegirCookieRefresco(dos), null);
});

test('sin cookies, o vacías, no hay nada que renovar', () => {
  assert.equal(elegirCookieRefresco({}), null);
  assert.equal(elegirCookieRefresco({}, 1), null);
  assert.equal(elegirCookieRefresco({ [cookieDeCuenta(1)]: '' }, 1), null);
});
