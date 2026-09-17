/**
 * Tests de la matriz de autorización.
 *
 * `authz.ts` recibe el cliente Prisma como parámetro, así que se puede ejercitar
 * con un doble de prueba y sin base de datos. Esto es lo que verifica la regla
 * "los padres SOLO pueden ver información de sus propios hijos" — la más
 * sensible de la consigna y la que tenía el agujero 5.2 de la auditoría.
 *
 *   node --test src/modules/shared/authz.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  alumnosDelTutor,
  assertPuedeVerAlumno,
  filtroAlumnosVisibles,
  type AuthUser,
} from './authz.ts';

// ------------------------------------------------------------------
// Doble de prueba
// ------------------------------------------------------------------

/**
 * Escenario:
 *   - tutor 10 -> alumnos 100 y 101
 *   - tutor 11 -> alumno 102
 *   - tutor 12 -> sin hijos
 *   - usuario 50 (ESTUDIANTE) es el alumno 100
 */
const VINCULOS = [
  { tutorId: 10, alumnoId: 100 },
  { tutorId: 10, alumnoId: 101 },
  { tutorId: 11, alumnoId: 102 },
];

const ALUMNO_POR_USER: Record<number, number> = { 50: 100, 51: 101 };

function fakePrisma() {
  return {
    tutorAlumno: {
      findMany: async ({ where }: { where: { tutorId: number } }) =>
        VINCULOS.filter((v) => v.tutorId === where.tutorId).map((v) => ({ alumnoId: v.alumnoId })),
      findUnique: async ({
        where,
      }: {
        where: { tutorId_alumnoId: { tutorId: number; alumnoId: number } };
      }) => {
        const { tutorId, alumnoId } = where.tutorId_alumnoId;
        const hit = VINCULOS.find((v) => v.tutorId === tutorId && v.alumnoId === alumnoId);
        return hit ? { id: 1 } : null;
      },
    },
    alumno: {
      findUnique: async ({ where }: { where: { userId: number } }) => {
        const id = ALUMNO_POR_USER[where.userId];
        return id === undefined ? null : { id };
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

const admin: AuthUser = { id: 1, usuario: 'fabriynahuel', role: 'ADMIN' };
const docente: AuthUser = { id: 2, usuario: 'mlopez', role: 'DOCENTE' };
const tutor10: AuthUser = { id: 10, usuario: 'pmedina', role: 'PADRE' };
const tutor11: AuthUser = { id: 11, usuario: 'rperez', role: 'PADRE' };
const tutorSinHijos: AuthUser = { id: 12, usuario: 'nuevo', role: 'PADRE' };
const estudiante: AuthUser = { id: 50, usuario: 'mmedina', role: 'ESTUDIANTE' };

// ------------------------------------------------------------------
// alumnosDelTutor
// ------------------------------------------------------------------

test('alumnosDelTutor devuelve los hijos vinculados', async () => {
  assert.deepEqual(await alumnosDelTutor(fakePrisma(), 10), [100, 101]);
  assert.deepEqual(await alumnosDelTutor(fakePrisma(), 11), [102]);
});

test('alumnosDelTutor devuelve lista vacía, nunca null, si no tiene hijos', async () => {
  const r = await alumnosDelTutor(fakePrisma(), 12);
  assert.ok(Array.isArray(r));
  assert.equal(r.length, 0);
});

// ------------------------------------------------------------------
// assertPuedeVerAlumno — la regla crítica
// ------------------------------------------------------------------

test('ADMIN accede a cualquier alumno', async () => {
  await assertPuedeVerAlumno(fakePrisma(), admin, 100);
  await assertPuedeVerAlumno(fakePrisma(), admin, 102);
  await assertPuedeVerAlumno(fakePrisma(), admin, 999);
});

test('DOCENTE accede a cualquier alumno', async () => {
  await assertPuedeVerAlumno(fakePrisma(), docente, 100);
  await assertPuedeVerAlumno(fakePrisma(), docente, 102);
});

test('PADRE accede a sus propios hijos', async () => {
  await assertPuedeVerAlumno(fakePrisma(), tutor10, 100);
  await assertPuedeVerAlumno(fakePrisma(), tutor10, 101);
  await assertPuedeVerAlumno(fakePrisma(), tutor11, 102);
});

test('REGLA: un PADRE NO accede al hijo de otra familia', async () => {
  await assert.rejects(
    () => assertPuedeVerAlumno(fakePrisma(), tutor10, 102),
    (err: Error & { status?: number }) => {
      assert.equal(err.status, 404, 'debe responder 404, no 403');
      return true;
    },
  );
});

test('REGLA: un PADRE sin hijos vinculados no accede a ningún alumno', async () => {
  for (const alumnoId of [100, 101, 102]) {
    await assert.rejects(() => assertPuedeVerAlumno(fakePrisma(), tutorSinHijos, alumnoId));
  }
});

test('el 404 no revela si el alumno ajeno existe', async () => {
  // Un alumno que existe pero es de otra familia, y uno que no existe: mismo error.
  const ajeno = await assertPuedeVerAlumno(fakePrisma(), tutor10, 102).catch((e: Error) => e.message);
  const inexistente = await assertPuedeVerAlumno(fakePrisma(), tutor10, 999).catch((e: Error) => e.message);

  assert.equal(ajeno, inexistente);
});

test('ESTUDIANTE accede sólo a su propio legajo', async () => {
  await assertPuedeVerAlumno(fakePrisma(), estudiante, 100);

  await assert.rejects(
    () => assertPuedeVerAlumno(fakePrisma(), estudiante, 101),
    (err: Error & { status?: number }) => {
      assert.equal(err.status, 403);
      return true;
    },
  );
});

test('un ESTUDIANTE sin ficha de alumno no accede a nada', async () => {
  const huerfano: AuthUser = { id: 99, usuario: 'sinficha', role: 'ESTUDIANTE' };
  await assert.rejects(() => assertPuedeVerAlumno(fakePrisma(), huerfano, 100));
});

// ------------------------------------------------------------------
// filtroAlumnosVisibles — el que se usa en los listados
// ------------------------------------------------------------------

test('ADMIN y DOCENTE reciben un filtro sin restricción', async () => {
  assert.deepEqual(await filtroAlumnosVisibles(fakePrisma(), admin), {});
  assert.deepEqual(await filtroAlumnosVisibles(fakePrisma(), docente), {});
});

test('PADRE recibe un filtro acotado a sus hijos', async () => {
  assert.deepEqual(await filtroAlumnosVisibles(fakePrisma(), tutor10), { id: { in: [100, 101] } });
  assert.deepEqual(await filtroAlumnosVisibles(fakePrisma(), tutor11), { id: { in: [102] } });
});

test('REGLA: un PADRE sin hijos recibe in:[] y no un filtro vacío', async () => {
  // Esto importa: `{}` devolvería TODOS los alumnos del colegio.
  const filtro = await filtroAlumnosVisibles(fakePrisma(), tutorSinHijos);

  assert.deepEqual(filtro, { id: { in: [] } });
  assert.notDeepEqual(filtro, {}, 'un filtro vacío expondría el padrón completo');
});

test('ESTUDIANTE recibe un filtro acotado a sí mismo', async () => {
  assert.deepEqual(await filtroAlumnosVisibles(fakePrisma(), estudiante), { id: { in: [100] } });
});

test('un rol desconocido no ve nada (lista blanca, no lista negra)', async () => {
  const raro = { id: 77, usuario: 'raro', role: 'OTRO' } as unknown as AuthUser;
  assert.deepEqual(await filtroAlumnosVisibles(fakePrisma(), raro), { id: { in: [] } });
  await assert.rejects(() => assertPuedeVerAlumno(fakePrisma(), raro, 100));
});
