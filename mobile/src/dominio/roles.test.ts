/**
 * Tests de qué ve cada rol. Es la regla del Módulo 1 de la consigna: cada
 * usuario accede únicamente a las funcionalidades de su rol.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { esFamilia, pestaniasDe, puedePagar, rolDe, tituloDeVista, vistaInicial, type Rol } from './roles.ts';

const ROLES: Rol[] = ['padre', 'estudiante', 'docente', 'admin'];
const claves = (rol: Rol) => pestaniasDe(rol).map((p) => p.clave);

test('rolDe reconoce los cuatro roles que devuelve el login', () => {
  assert.equal(rolDe('padre'), 'padre');
  assert.equal(rolDe('estudiante'), 'estudiante');
  assert.equal(rolDe('docente'), 'docente');
  assert.equal(rolDe('admin'), 'admin');
  assert.equal(rolDe('ADMIN'), 'admin');
});

test('rolDe no inventa un rol para lo que no conoce', () => {
  assert.equal(rolDe('invitado'), null);
  assert.equal(rolDe(''), null);
  assert.equal(rolDe(undefined), null);
});

test('todos los roles tienen su cuenta, para cambiar la contraseña y salir', () => {
  for (const rol of ROLES) assert.ok(claves(rol).includes('cuenta'), rol);
});

test('sólo el padre inscribe y paga', () => {
  assert.ok(claves('padre').includes('inscripciones'));
  assert.equal(puedePagar('padre'), true);
  for (const rol of ['estudiante', 'docente', 'admin'] as const) {
    assert.ok(!claves(rol).includes('inscripciones'), rol);
    assert.equal(puedePagar(rol), false, rol);
  }
});

test('el estudiante ve lo suyo y su carnet, pero no paga', () => {
  assert.deepEqual(claves('estudiante'), ['inicio', 'carnet', 'finanzas', 'cuenta']);
});

test('el docente controla el acceso y ve sus cursos; no ve finanzas ni aranceles', () => {
  assert.ok(claves('docente').includes('escanear'));
  assert.ok(claves('docente').includes('cursos'));
  for (const prohibida of ['finanzas', 'aranceles', 'comprobantes', 'inscripciones'] as const) {
    assert.ok(!claves('docente').includes(prohibida), prohibida);
  }
});

test('sólo el administrador fija aranceles y valida comprobantes', () => {
  for (const rol of ROLES) {
    const esAdmin = rol === 'admin';
    assert.equal(claves(rol).includes('aranceles'), esAdmin, rol);
    assert.equal(claves(rol).includes('comprobantes'), esAdmin, rol);
  }
});

test('las familias tienen selector de alumno; el personal no', () => {
  assert.equal(esFamilia('padre'), true);
  assert.equal(esFamilia('estudiante'), true);
  assert.equal(esFamilia('docente'), false);
  assert.equal(esFamilia('admin'), false);
});

test('cada rol arranca en su primera pestaña y toda vista tiene título', () => {
  for (const rol of ROLES) {
    assert.equal(vistaInicial(rol), claves(rol)[0]);
    for (const clave of claves(rol)) assert.ok(tituloDeVista(clave).length > 0);
  }
});
