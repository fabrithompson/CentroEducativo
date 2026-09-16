/**
 * Tests de los proveedores de mensajería (RF-07 / HU7).
 *
 * El foco está en la normalización de teléfonos, que es donde se pierde la
 * mitad de los envíos: en la base los números están cargados como los tipeó el
 * personal administrativo, y un proveedor de SMS rechaza todo lo que no sea
 * E.164.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ProveedorConsola,
  leerBandejaSalida,
  limpiarBandejaSalida,
  normalizarTelefono,
} from './proveedores.ts';

// ==================================================================
// Normalización de teléfonos
// ==================================================================

test('normaliza un número del Chaco en formato local', () => {
  // Es el formato con el que están cargados los datos del seed.
  assert.equal(normalizarTelefono('362-4215880'), '+5493624215880');
});

test('normaliza las variantes que usa el personal administrativo', () => {
  const equivalentes = [
    '362-4215880',
    '3624215880',
    '362 421 5880',
    '(362) 4215880',
    '0362 15 4215880',
    '+54 9 362 421 5880',
    '+5493624215880',
    '54 362 4215880',
  ];

  for (const crudo of equivalentes) {
    assert.equal(normalizarTelefono(crudo), '+5493624215880', `falló con "${crudo}"`);
  }
});

test('quita el 0 de larga distancia y el 15 de móvil', () => {
  assert.equal(normalizarTelefono('03624215880'), '+5493624215880');
  assert.equal(normalizarTelefono('362154215880'), '+5493624215880');
});

test('normaliza números de otras provincias', () => {
  assert.equal(normalizarTelefono('11-4567-8900'), '+5491145678900');
  assert.equal(normalizarTelefono('351 456 7890'), '+5493514567890');
});

test('REGLA: devuelve null cuando el número no sirve', () => {
  // Es información, no un error: el plan exige avisar por correo a esas familias.
  const invalidos = [null, undefined, '', '   ', 'no tiene', '123', '4215880', 'abc-def'];

  for (const crudo of invalidos) {
    assert.equal(normalizarTelefono(crudo), null, `debería rechazar ${JSON.stringify(crudo)}`);
  }
});

test('rechaza un número con demasiados dígitos', () => {
  assert.equal(normalizarTelefono('3624215880123456'), null);
});

test('la normalización es idempotente', () => {
  const una = normalizarTelefono('362-4215880')!;
  assert.equal(normalizarTelefono(una), una);
});

// ==================================================================
// Proveedor de consola
// ==================================================================

test('el proveedor de consola registra el mensaje y no falla', async () => {
  limpiarBandejaSalida();
  const proveedor = new ProveedorConsola();

  const r = await proveedor.enviar({
    telefono: '+5493624215880',
    texto: 'Cambio de horario: Educación Física pasa a las 15:00.',
    canal: 'SMS',
  });

  assert.equal(r.exito, true);
  assert.ok(r.referenciaExterna, 'debería devolver una referencia para conciliar');

  const bandeja = leerBandejaSalida();
  assert.equal(bandeja.length, 1);
  assert.equal(bandeja[0]!.telefono, '+5493624215880');
  assert.match(bandeja[0]!.texto, /Cambio de horario/);
});

test('el proveedor de consola soporta SMS y WhatsApp', () => {
  const proveedor = new ProveedorConsola();
  assert.ok(proveedor.canales.includes('SMS'));
  assert.ok(proveedor.canales.includes('WHATSAPP'));
});

test('la bandeja acumula los envíos de una tanda', async () => {
  limpiarBandejaSalida();
  const proveedor = new ProveedorConsola();

  for (let i = 0; i < 5; i++) {
    await proveedor.enviar({ telefono: `+54936242158${i}0`, texto: `Aviso ${i}`, canal: 'SMS' });
  }

  assert.equal(leerBandejaSalida().length, 5);

  limpiarBandejaSalida();
  assert.equal(leerBandejaSalida().length, 0);
});
