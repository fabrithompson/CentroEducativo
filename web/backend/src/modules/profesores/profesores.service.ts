/**
 * Servicio del módulo Profesores.
 *
 * Igual que con los alumnos, el legajo lo asigna el sistema (`P-0001`).
 */

import { EstadoProfesor, Prisma, type PrismaClient } from '@prisma/client';

import { HttpError } from '../../utils/httpError';
import { armarPagina, toSkipTake, type Paginacion } from '../shared/pagination';

export interface FiltrosProfesor {
  busqueda?: string;
  especialidad?: string;
  estado?: EstadoProfesor;
  /** Sólo los que tienen al menos una materia en este curso. */
  cursoId?: number;
}

function armarWhere(f: FiltrosProfesor): Prisma.ProfesorWhereInput {
  const where: Prisma.ProfesorWhereInput = {};

  if (f.estado) where.estado = f.estado;
  if (f.especialidad) where.especialidad = { contains: f.especialidad, mode: 'insensitive' };
  if (f.cursoId) where.materias = { some: { cursoId: f.cursoId } };

  if (f.busqueda) {
    const q = f.busqueda.trim();
    where.OR = [
      { apellido: { contains: q, mode: 'insensitive' } },
      { nombres: { contains: q, mode: 'insensitive' } },
      { dni: { contains: q } },
      { legajo: { contains: q, mode: 'insensitive' } },
      { especialidad: { contains: q, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function listarProfesores(
  prisma: PrismaClient,
  filtros: FiltrosProfesor,
  paginacion: Paginacion,
) {
  const where = armarWhere(filtros);
  const { skip, take } = toSkipTake(paginacion);

  const [items, total] = await Promise.all([
    prisma.profesor.findMany({
      where,
      include: {
        materias: {
          where: { activo: true },
          select: {
            id: true,
            nombre: true,
            cargaHoraria: true,
            curso: {
              select: {
                id: true,
                nombre: true,
                division: true,
                nivel: { select: { id: true, nombre: true } },
              },
            },
          },
        },
        _count: { select: { deportesACargo: true } },
      },
      orderBy: [{ apellido: 'asc' }, { nombres: 'asc' }],
      skip,
      take,
    }),
    prisma.profesor.count({ where }),
  ]);

  return armarPagina(items, total, paginacion);
}

export async function obtenerProfesor(prisma: PrismaClient, id: number) {
  const profesor = await prisma.profesor.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, usuario: true, email: true, isActive: true } },
      materias: {
        include: { curso: { include: { nivel: true } } },
        orderBy: { nombre: 'asc' },
      },
      deportesACargo: {
        include: { horarios: { include: { nivel: { select: { id: true, nombre: true } } } } },
      },
      horariosDeporte: {
        include: {
          deporte: { select: { id: true, nombre: true } },
          nivel: { select: { id: true, nombre: true } },
        },
        orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
      },
    },
  });

  if (!profesor) throw HttpError.notFound('El profesor no existe.');
  return profesor;
}

async function proximoLegajo(tx: Prisma.TransactionClient): Promise<string> {
  const ultimo = await tx.profesor.findFirst({
    where: { legajo: { startsWith: 'P-' } },
    orderBy: { legajo: 'desc' },
    select: { legajo: true },
  });

  const numero = ultimo ? Number(ultimo.legajo.slice(2)) + 1 : 1;
  return `P-${String(numero).padStart(4, '0')}`;
}

export interface CrearProfesorInput {
  dni: string;
  apellido: string;
  nombres: string;
  especialidad: string;
  email: string;
  telefono?: string | null;
  domicilio?: string | null;
  fechaIngreso?: Date;
  userId?: number | null;
}

export async function crearProfesor(prisma: PrismaClient, input: CrearProfesorInput) {
  return prisma.$transaction(
    async (tx) => {
      const duplicado = await tx.profesor.findUnique({ where: { dni: input.dni } });
      if (duplicado) {
        throw HttpError.conflict(
          `Ya existe un profesor con DNI ${input.dni} (legajo ${duplicado.legajo}).`,
        );
      }

      if (input.userId) {
        const user = await tx.user.findUnique({ where: { id: input.userId } });
        if (!user) throw HttpError.notFound('El usuario a vincular no existe.');
        if (user.role !== 'DOCENTE' && user.role !== 'ADMIN') {
          throw HttpError.badRequest(`El usuario "${user.usuario}" no tiene rol DOCENTE.`);
        }

        const yaVinculado = await tx.profesor.findUnique({ where: { userId: input.userId } });
        if (yaVinculado) throw HttpError.conflict('Ese usuario ya está vinculado a otro profesor.');
      }

      return tx.profesor.create({
        data: {
          legajo: await proximoLegajo(tx),
          dni: input.dni,
          apellido: input.apellido,
          nombres: input.nombres,
          especialidad: input.especialidad,
          email: input.email,
          telefono: input.telefono ?? null,
          domicilio: input.domicilio ?? null,
          fechaIngreso: input.fechaIngreso ?? new Date(),
          userId: input.userId ?? null,
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export type ActualizarProfesorInput = Partial<Omit<CrearProfesorInput, 'dni'>> & {
  estado?: EstadoProfesor;
};

export async function actualizarProfesor(
  prisma: PrismaClient,
  id: number,
  input: ActualizarProfesorInput,
) {
  const profesor = await prisma.profesor.findUnique({ where: { id } });
  if (!profesor) throw HttpError.notFound('El profesor no existe.');

  if (input.userId) {
    const yaVinculado = await prisma.profesor.findUnique({ where: { userId: input.userId } });
    if (yaVinculado && yaVinculado.id !== id) {
      throw HttpError.conflict('Ese usuario ya está vinculado a otro profesor.');
    }
  }

  return prisma.profesor.update({ where: { id }, data: input });
}

/**
 * Baja lógica de un profesor.
 *
 * Se niega si tiene deportes a cargo: la regla de negocio exige que cada deporte
 * tenga profesor responsable, y la FK es `ON DELETE RESTRICT`. Primero hay que
 * reasignar esos deportes.
 */
export async function darDeBajaProfesor(
  prisma: PrismaClient,
  id: number,
  estado: EstadoProfesor = EstadoProfesor.INACTIVO,
) {
  const profesor = await prisma.profesor.findUnique({
    where: { id },
    include: {
      deportesACargo: { where: { activo: true }, select: { nombre: true } },
      _count: { select: { materias: true } },
    },
  });
  if (!profesor) throw HttpError.notFound('El profesor no existe.');

  if (estado === EstadoProfesor.INACTIVO && profesor.deportesACargo.length > 0) {
    const nombres = profesor.deportesACargo.map((d) => d.nombre).join(', ');
    throw HttpError.conflict(
      `No se puede dar de baja: es responsable de ${nombres}. Reasigná esos deportes primero.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    // Las materias quedan sin docente asignado, no se borran: el curso las sigue
    // teniendo en su plan.
    if (estado === EstadoProfesor.INACTIVO) {
      await tx.materia.updateMany({ where: { profesorId: id }, data: { profesorId: null } });
    }

    return tx.profesor.update({ where: { id }, data: { estado } });
  });
}

// ------------------------------------------------------------------
// Materias a cargo
// ------------------------------------------------------------------

export async function asignarMateria(
  prisma: PrismaClient,
  profesorId: number,
  materiaId: number,
) {
  const [profesor, materia] = await Promise.all([
    prisma.profesor.findUnique({ where: { id: profesorId } }),
    prisma.materia.findUnique({ where: { id: materiaId } }),
  ]);

  if (!profesor) throw HttpError.notFound('El profesor no existe.');
  if (profesor.estado !== EstadoProfesor.ACTIVO) {
    throw HttpError.conflict('El profesor no está activo.');
  }
  if (!materia) throw HttpError.notFound('La materia no existe.');

  return prisma.materia.update({
    where: { id: materiaId },
    data: { profesorId },
    include: { curso: { include: { nivel: true } } },
  });
}

export async function quitarMateria(prisma: PrismaClient, materiaId: number) {
  const materia = await prisma.materia.findUnique({ where: { id: materiaId } });
  if (!materia) throw HttpError.notFound('La materia no existe.');

  return prisma.materia.update({ where: { id: materiaId }, data: { profesorId: null } });
}
