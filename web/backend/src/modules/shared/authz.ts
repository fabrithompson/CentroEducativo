/**
 * Autorización de acceso a datos de alumnos.
 *
 * La regla de negocio dice: "Los padres SOLO pueden ver y gestionar información
 * de sus propios hijos". Toda consulta que devuelva datos de un alumno tiene que
 * pasar por acá — no por un `if` suelto repetido en cada router, que es como se
 * escapan estas cosas.
 *
 * El criterio es de lista blanca: se parte de "no puede" y sólo se habilita lo
 * que está explícitamente permitido para el rol.
 */

import { Role, type PrismaClient } from '@prisma/client';

import { HttpError } from '../../utils/httpError';

export interface AuthUser {
  id: number;
  usuario: string;
  role: Role;
}

/**
 * Ids de los alumnos a los que un tutor está vinculado.
 * Devuelve `[]` si no tiene ninguno: nunca `null`, para que quien llame no pueda
 * confundir "sin hijos" con "sin filtro".
 */
export async function alumnosDelTutor(prisma: PrismaClient, tutorId: number): Promise<number[]> {
  const vinculos = await prisma.tutorAlumno.findMany({
    where: { tutorId },
    select: { alumnoId: true },
  });
  return vinculos.map((v) => v.alumnoId);
}

/** Id del alumno correspondiente a un usuario con rol ESTUDIANTE, si lo tiene. */
export async function alumnoDelUsuario(prisma: PrismaClient, userId: number): Promise<number | null> {
  const alumno = await prisma.alumno.findUnique({ where: { userId }, select: { id: true } });
  return alumno?.id ?? null;
}

/**
 * Verifica que `user` pueda acceder a los datos de `alumnoId`. Lanza si no.
 *
 * - ADMIN y DOCENTE: acceden a cualquier alumno (el docente los tiene en clase).
 * - PADRE: sólo a los alumnos vinculados por `TutorAlumno`.
 * - ESTUDIANTE: sólo a sí mismo.
 *
 * Devuelve 404 y no 403 cuando un padre pide un alumno ajeno: un 403 confirmaría
 * que ese alumno existe, que ya es información que no le corresponde.
 */
export async function assertPuedeVerAlumno(
  prisma: PrismaClient,
  user: AuthUser,
  alumnoId: number,
): Promise<void> {
  if (user.role === Role.ADMIN || user.role === Role.DOCENTE) return;

  if (user.role === Role.PADRE) {
    const vinculo = await prisma.tutorAlumno.findUnique({
      where: { tutorId_alumnoId: { tutorId: user.id, alumnoId } },
      select: { id: true },
    });
    if (!vinculo) {
      throw HttpError.notFound('No se encontró el alumno entre tus hijos vinculados.');
    }
    return;
  }

  if (user.role === Role.ESTUDIANTE) {
    const propio = await alumnoDelUsuario(prisma, user.id);
    if (propio !== alumnoId) {
      throw HttpError.forbidden('Sólo podés consultar tu propia información.');
    }
    return;
  }

  throw HttpError.forbidden('Tu rol no tiene permiso para consultar alumnos.');
}

/**
 * Filtro de alumnos que el usuario puede ver, para usar como `where` de Prisma.
 *
 * Un ADMIN o DOCENTE recibe `{}` (sin restricción). Un PADRE recibe
 * `{ id: { in: [...] } }` con sus hijos; si no tiene ninguno, `{ id: { in: [] } }`,
 * que no devuelve filas — nunca un filtro vacío que las devolvería todas.
 */
export async function filtroAlumnosVisibles(
  prisma: PrismaClient,
  user: AuthUser,
): Promise<{ id?: { in: number[] } }> {
  if (user.role === Role.ADMIN || user.role === Role.DOCENTE) return {};

  if (user.role === Role.PADRE) {
    return { id: { in: await alumnosDelTutor(prisma, user.id) } };
  }

  if (user.role === Role.ESTUDIANTE) {
    const propio = await alumnoDelUsuario(prisma, user.id);
    return { id: { in: propio === null ? [] : [propio] } };
  }

  return { id: { in: [] } };
}

/**
 * Resuelve el alumno sobre el que opera una request de tutor, validando el
 * vínculo. Es el punto de entrada de todo `/api/padres/mis-hijos/:alumnoId/...`.
 */
export async function resolverHijo(prisma: PrismaClient, user: AuthUser, alumnoId: number) {
  await assertPuedeVerAlumno(prisma, user, alumnoId);

  const alumno = await prisma.alumno.findUnique({
    where: { id: alumnoId },
    include: {
      curso: { include: { nivel: true } },
      user: { select: { id: true, usuario: true, email: true } },
    },
  });

  if (!alumno) throw HttpError.notFound('El alumno no existe.');
  return alumno;
}
