/**
 * Tiempo real: qué escrituras se publican, como qué recurso y para quién.
 *
 *   node --import tsx --test src/modules/shared/eventos.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { Role } from '@prisma/client';

import { alCambiar, cambioDeRuta, publicarCambio, type Cambio } from './eventos.ts';

test('un anuncio nuevo le llega a toda la comunidad', () => {
  const c = cambioDeRuta('POST', '/announcements');
  assert.equal(c?.recurso, 'anuncios');
  assert.equal(c?.accion, 'crear');
  assert.deepEqual([...c!.roles!].sort(), [Role.ADMIN, Role.DOCENTE, Role.ESTUDIANTE, Role.PADRE].sort());
});

test('editar y borrar se distinguen de crear', () => {
  assert.equal(cambioDeRuta('PATCH', '/announcements/3')?.accion, 'editar');
  assert.equal(cambioDeRuta('PUT', '/announcements/3')?.accion, 'editar');
  assert.equal(cambioDeRuta('DELETE', '/grades/7')?.accion, 'borrar');
});

test('las notas y la asistencia les llegan a estudiantes, familias y docentes', () => {
  for (const ruta of ['/grades', '/attendance/firmar']) {
    const roles = cambioDeRuta('POST', ruta)!.roles!;
    for (const r of [Role.ESTUDIANTE, Role.PADRE, Role.DOCENTE]) assert.ok(roles.includes(r), `${ruta} -> ${r}`);
  }
});

test('la ruta más específica gana: una cuota del admin no es moderación', () => {
  assert.equal(cambioDeRuta('POST', '/admin/payments')?.recurso, 'cuotas');
  assert.equal(cambioDeRuta('PATCH', '/admin/users/5')?.recurso, 'usuarios');
  assert.equal(cambioDeRuta('POST', '/admin/teachers/5/approve')?.recurso, 'docentes');
  assert.equal(cambioDeRuta('PATCH', '/admin/inscriptions/2')?.recurso, 'moderacion');
  assert.equal(cambioDeRuta('POST', '/facturacion/comprobantes/1/validar')?.recurso, 'comprobantes');
  assert.equal(cambioDeRuta('POST', '/facturacion/generar')?.recurso, 'facturas');
});

test('lo administrativo le llega sólo al administrador', () => {
  assert.deepEqual(cambioDeRuta('DELETE', '/admin/users/5')?.roles, [Role.ADMIN]);
  assert.deepEqual(cambioDeRuta('POST', '/public/opinions')?.roles, [Role.ADMIN]);
});

test('las lecturas no se publican', () => {
  assert.equal(cambioDeRuta('GET', '/announcements'), null);
  assert.equal(cambioDeRuta('HEAD', '/grades'), null);
});

test('REGLA: no se publican la sesión, los mensajes ni lo de alta frecuencia', () => {
  for (const ruta of ['/auth/login', '/auth/refresh', '/auth/logout', '/messages', '/notifications/4/read', '/accesos/escanear', '/transporte/posicion']) {
    assert.equal(cambioDeRuta('POST', ruta), null, ruta);
  }
});

test('el registro de una cuenta nueva le avisa al administrador', () => {
  assert.equal(cambioDeRuta('POST', '/auth/register')?.recurso, 'usuarios');
});

test('un prefijo no coincide con otra ruta que empieza igual', () => {
  assert.equal(cambioDeRuta('POST', '/announcementsX'), null);
  assert.equal(cambioDeRuta('POST', '/gradesy/1'), null);
});

test('una ruta desconocida no publica nada', () => {
  assert.equal(cambioDeRuta('POST', '/otra-cosa'), null);
});

test('el bus entrega el cambio a quien escucha, y deja de hacerlo al darse de baja', () => {
  const recibidos: Cambio[] = [];
  const baja = alCambiar((c) => recibidos.push(c));
  publicarCambio({ recurso: 'anuncios', accion: 'crear', roles: [Role.ADMIN] });
  baja();
  publicarCambio({ recurso: 'anuncios', accion: 'borrar', roles: [Role.ADMIN] });
  assert.equal(recibidos.length, 1);
  assert.equal(recibidos[0]!.accion, 'crear');
});
