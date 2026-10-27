/**
 * Los mensajes de validación salen en español y dicen de qué campo se trata.
 *
 *   pnpm --filter backend test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { errorMapEs } from './zodEs';

const mensajes = (schema: z.ZodTypeAny, datos: unknown) => {
  const r = schema.safeParse(datos, { errorMap: errorMapEs });
  assert.equal(r.success, false);
  return r.error!.issues.map((i) => i.message);
};

test('un texto corto nombra el campo y el mínimo', () => {
  const schema = z.object({ nombreTutor: z.string().min(2) });
  assert.deepEqual(mensajes(schema, { nombreTutor: 'A' }), [
    'Nombre del tutor: tiene que tener al menos 2 caracteres.',
  ]);
});

test('un campo que falta se informa como obligatorio', () => {
  const schema = z.object({ email: z.string().email() });
  assert.deepEqual(mensajes(schema, {}), ['Email: es obligatorio.']);
});

test('un email mal escrito explica el formato esperado', () => {
  const schema = z.object({ email: z.string().email() });
  assert.match(mensajes(schema, { email: 'x' })[0], /^Email: no tiene un formato de email válido/);
});

test('un número fuera de rango dice el límite', () => {
  const schema = z.object({ rating: z.number().int().min(1).max(5) });
  assert.deepEqual(mensajes(schema, { rating: 9 }), ['Valoración: tiene que ser menor o igual a 5.']);
});

test('un campo sin etiqueta se humaniza a partir de su clave', () => {
  const schema = z.object({ bancoDestino: z.string().min(3) });
  assert.match(mensajes(schema, { bancoDestino: 'a' })[0], /^Banco destino: /);
});

test('un mensaje propio del esquema no se pisa', () => {
  const schema = z.object({ password: z.string().min(8, 'La contraseña necesita 8 caracteres.') });
  assert.deepEqual(mensajes(schema, { password: '1' }), ['La contraseña necesita 8 caracteres.']);
});

test('ningún mensaje queda en inglés', () => {
  const schema = z.object({
    nombre: z.string().min(2).max(5),
    email: z.string().email(),
    monto: z.number().positive(),
    estado: z.enum(['ACTIVO', 'BAJA']),
    fecha: z.coerce.date(),
  });
  const todos = mensajes(schema, { nombre: 'muy largo', email: 'no', monto: -1, estado: 'X', fecha: 'nada' });
  for (const m of todos) {
    assert.doesNotMatch(m, /must|Expected|Invalid|Required|character/i, m);
  }
});
