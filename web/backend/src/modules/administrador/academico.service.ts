/**
 * Servicio académico del módulo Administrador: niveles, cursos y materias.
 *
 * Es la estructura sobre la que se apoya todo lo demás —un alumno pertenece a
 * un curso, un curso a un nivel, una materia a un curso— y hasta ahora existía
 * en la base pero no en la API: el alta de alumnos pedía un `cursoId` que no
 * había forma de averiguar, y `POST /api/profesores/:id/materias` pedía un
 * `materiaId` igual de inalcanzable.
 *
 * Las bajas son lógicas (`activo = false`). Un borrado real arrastraría el
 * historial: las materias cuelgan del curso en cascada, y un curso con alumnos
 * ni siquiera se puede borrar porque la clave foránea es `Restrict`. Además la
 * baja se niega cuando todavía hay algo colgando, así que un nivel con cursos
 * activos o un curso con alumnos activos no se desactivan por descuido.
 */

import { EstadoAlumno, EstadoProfesor, Prisma, Turno, type PrismaClient } from '@prisma/client';

import { HttpError } from '../../utils/httpError';

// ==================================================================
// Niveles
// ==================================================================

const seleccionNivel = {
  id: true,
  nombre: true,
  orden: true,
  descripcion: true,
  cuotaMensual: true,
  activo: true,
  _count: { select: { cursos: true } },
} satisfies Prisma.NivelEducativoSelect;

export async function listarNiveles(prisma: PrismaClient, filtros: { activo?: boolean } = {}) {
  return prisma.nivelEducativo.findMany({
    where: filtros.activo === undefined ? {} : { activo: filtros.activo },
    orderBy: { orden: 'asc' },
    select: seleccionNivel,
  });
}

export interface AltaNivel {
  nombre: string;
  orden: number;
  descripcion?: string | null;
  cuotaMensual?: number;
}

export async function crearNivel(prisma: PrismaClient, input: AltaNivel) {
  return prisma.$transaction(async (tx) => {
    // `nombre` y `orden` son únicos por separado, así que se informa cuál de
    // los dos choca: un "ya existe" a secas obliga a adivinar.
    const porNombre = await tx.nivelEducativo.findUnique({ where: { nombre: input.nombre } });
    if (porNombre) throw HttpError.conflict(`Ya existe un nivel llamado "${input.nombre}".`);

    const porOrden = await tx.nivelEducativo.findUnique({ where: { orden: input.orden } });
    if (porOrden) {
      throw HttpError.conflict(`El orden ${input.orden} ya lo ocupa el nivel "${porOrden.nombre}".`);
    }

    return tx.nivelEducativo.create({
      data: {
        nombre: input.nombre,
        orden: input.orden,
        descripcion: input.descripcion ?? null,
        cuotaMensual: input.cuotaMensual ?? 0,
      },
      select: seleccionNivel,
    });
  });
}

export async function actualizarNivel(prisma: PrismaClient, id: number, input: Partial<AltaNivel>) {
  return prisma.$transaction(async (tx) => {
    const nivel = await tx.nivelEducativo.findUnique({ where: { id } });
    if (!nivel) throw HttpError.notFound('No se encontró el nivel.');

    if (input.nombre && input.nombre !== nivel.nombre) {
      const otro = await tx.nivelEducativo.findUnique({ where: { nombre: input.nombre } });
      if (otro) throw HttpError.conflict(`Ya existe un nivel llamado "${input.nombre}".`);
    }
    if (input.orden !== undefined && input.orden !== nivel.orden) {
      const otro = await tx.nivelEducativo.findUnique({ where: { orden: input.orden } });
      if (otro) {
        throw HttpError.conflict(`El orden ${input.orden} ya lo ocupa el nivel "${otro.nombre}".`);
      }
    }

    return tx.nivelEducativo.update({ where: { id }, data: input, select: seleccionNivel });
  });
}

export async function darDeBajaNivel(prisma: PrismaClient, id: number) {
  return prisma.$transaction(async (tx) => {
    const nivel = await tx.nivelEducativo.findUnique({ where: { id } });
    if (!nivel) throw HttpError.notFound('No se encontró el nivel.');

    const cursosActivos = await tx.curso.count({ where: { nivelId: id, activo: true } });
    if (cursosActivos > 0) {
      throw HttpError.conflict(
        `El nivel todavía tiene ${cursosActivos} curso(s) activo(s). Dalos de baja primero.`,
      );
    }

    return tx.nivelEducativo.update({
      where: { id },
      data: { activo: false },
      select: seleccionNivel,
    });
  });
}

// ==================================================================
// Cursos
// ==================================================================

const seleccionCurso = {
  id: true,
  nombre: true,
  division: true,
  turno: true,
  anioLectivo: true,
  cupoMaximo: true,
  activo: true,
  nivel: { select: { id: true, nombre: true, orden: true } },
  _count: { select: { alumnos: true, materias: true } },
} satisfies Prisma.CursoSelect;

export interface FiltrosCurso {
  nivelId?: number;
  anioLectivo?: number;
  turno?: Turno;
  activo?: boolean;
}

export async function listarCursos(prisma: PrismaClient, f: FiltrosCurso = {}) {
  const where: Prisma.CursoWhereInput = {};
  if (f.nivelId) where.nivelId = f.nivelId;
  if (f.anioLectivo) where.anioLectivo = f.anioLectivo;
  if (f.turno) where.turno = f.turno;
  if (f.activo !== undefined) where.activo = f.activo;

  return prisma.curso.findMany({
    where,
    orderBy: [{ nivel: { orden: 'asc' } }, { nombre: 'asc' }, { division: 'asc' }],
    select: seleccionCurso,
  });
}

export interface AltaCurso {
  nivelId: number;
  nombre: string;
  division?: string;
  turno?: Turno;
  anioLectivo: number;
  cupoMaximo?: number;
}

export async function crearCurso(prisma: PrismaClient, input: AltaCurso) {
  return prisma.$transaction(async (tx) => {
    const nivel = await tx.nivelEducativo.findUnique({ where: { id: input.nivelId } });
    if (!nivel) throw HttpError.badRequest('El nivel indicado no existe.');
    if (!nivel.activo) throw HttpError.conflict('El nivel indicado no está activo.');

    const division = input.division ?? 'A';
    const repetido = await tx.curso.findUnique({
      where: {
        nivelId_nombre_division_anioLectivo: {
          nivelId: input.nivelId,
          nombre: input.nombre,
          division,
          anioLectivo: input.anioLectivo,
        },
      },
    });
    if (repetido) {
      throw HttpError.conflict(
        `Ya existe ${input.nombre} "${division}" de ${nivel.nombre} para el ciclo ${input.anioLectivo}.`,
      );
    }

    return tx.curso.create({
      data: {
        nivelId: input.nivelId,
        nombre: input.nombre,
        division,
        turno: input.turno ?? Turno.MANANA,
        anioLectivo: input.anioLectivo,
        cupoMaximo: input.cupoMaximo ?? 30,
      },
      select: seleccionCurso,
    });
  });
}

export async function actualizarCurso(prisma: PrismaClient, id: number, input: Partial<AltaCurso>) {
  return prisma.$transaction(async (tx) => {
    const curso = await tx.curso.findUnique({ where: { id } });
    if (!curso) throw HttpError.notFound('No se encontró el curso.');

    // Bajar el cupo por debajo de la matrícula ya inscripta dejaría al curso en
    // un estado que el propio alta de alumnos considera inválido.
    if (input.cupoMaximo !== undefined) {
      const inscriptos = await tx.alumno.count({
        where: { cursoId: id, estado: EstadoAlumno.ACTIVO },
      });
      if (input.cupoMaximo < inscriptos) {
        throw HttpError.conflict(
          `El curso ya tiene ${inscriptos} alumno(s) activo(s): el cupo no puede ser menor.`,
        );
      }
    }

    return tx.curso.update({ where: { id }, data: input, select: seleccionCurso });
  });
}

export async function darDeBajaCurso(prisma: PrismaClient, id: number) {
  return prisma.$transaction(async (tx) => {
    const curso = await tx.curso.findUnique({ where: { id } });
    if (!curso) throw HttpError.notFound('No se encontró el curso.');

    const alumnosActivos = await tx.alumno.count({
      where: { cursoId: id, estado: EstadoAlumno.ACTIVO },
    });
    if (alumnosActivos > 0) {
      throw HttpError.conflict(
        `El curso todavía tiene ${alumnosActivos} alumno(s) activo(s). Reubicalos o dalos de baja primero.`,
      );
    }

    return tx.curso.update({ where: { id }, data: { activo: false }, select: seleccionCurso });
  });
}

// ==================================================================
// Materias
// ==================================================================

const seleccionMateria = {
  id: true,
  nombre: true,
  cargaHoraria: true,
  activo: true,
  curso: {
    select: {
      id: true,
      nombre: true,
      division: true,
      anioLectivo: true,
      nivel: { select: { id: true, nombre: true } },
    },
  },
  profesor: { select: { id: true, apellido: true, nombres: true, especialidad: true } },
} satisfies Prisma.MateriaSelect;

export interface FiltrosMateria {
  cursoId?: number;
  nivelId?: number;
  profesorId?: number;
  sinProfesor?: boolean;
  activo?: boolean;
}

export async function listarMaterias(prisma: PrismaClient, f: FiltrosMateria = {}) {
  const where: Prisma.MateriaWhereInput = {};
  if (f.cursoId) where.cursoId = f.cursoId;
  if (f.nivelId) where.curso = { nivelId: f.nivelId };
  if (f.profesorId) where.profesorId = f.profesorId;
  if (f.sinProfesor) where.profesorId = null;
  if (f.activo !== undefined) where.activo = f.activo;

  return prisma.materia.findMany({
    where,
    orderBy: [
      { curso: { nivel: { orden: 'asc' } } },
      { curso: { nombre: 'asc' } },
      { nombre: 'asc' },
    ],
    select: seleccionMateria,
  });
}

export interface AltaMateria {
  nombre: string;
  cursoId: number;
  profesorId?: number | null;
  cargaHoraria?: number;
}

async function validarProfesor(tx: Prisma.TransactionClient, profesorId: number) {
  const profesor = await tx.profesor.findUnique({ where: { id: profesorId } });
  if (!profesor) throw HttpError.badRequest('El profesor indicado no existe.');
  if (profesor.estado !== EstadoProfesor.ACTIVO) {
    throw HttpError.conflict(
      `${profesor.apellido}, ${profesor.nombres} no está activo (${profesor.estado.toLowerCase()}).`,
    );
  }
}

export async function crearMateria(prisma: PrismaClient, input: AltaMateria) {
  return prisma.$transaction(async (tx) => {
    const curso = await tx.curso.findUnique({
      where: { id: input.cursoId },
      include: { nivel: { select: { nombre: true } } },
    });
    if (!curso) throw HttpError.badRequest('El curso indicado no existe.');
    if (!curso.activo) throw HttpError.conflict('El curso indicado no está activo.');

    const repetida = await tx.materia.findUnique({
      where: { cursoId_nombre: { cursoId: input.cursoId, nombre: input.nombre } },
    });
    if (repetida) {
      throw HttpError.conflict(
        `${curso.nombre} "${curso.division}" ya tiene una materia llamada "${input.nombre}".`,
      );
    }

    if (input.profesorId) await validarProfesor(tx, input.profesorId);

    return tx.materia.create({
      data: {
        nombre: input.nombre,
        cursoId: input.cursoId,
        profesorId: input.profesorId ?? null,
        cargaHoraria: input.cargaHoraria ?? 4,
      },
      select: seleccionMateria,
    });
  });
}

export async function actualizarMateria(
  prisma: PrismaClient,
  id: number,
  input: Partial<AltaMateria>,
) {
  return prisma.$transaction(async (tx) => {
    const materia = await tx.materia.findUnique({ where: { id } });
    if (!materia) throw HttpError.notFound('No se encontró la materia.');

    if (input.nombre && input.nombre !== materia.nombre) {
      const otra = await tx.materia.findUnique({
        where: { cursoId_nombre: { cursoId: materia.cursoId, nombre: input.nombre } },
      });
      if (otra) throw HttpError.conflict(`El curso ya tiene una materia llamada "${input.nombre}".`);
    }

    if (input.profesorId) await validarProfesor(tx, input.profesorId);

    return tx.materia.update({ where: { id }, data: input, select: seleccionMateria });
  });
}

export async function darDeBajaMateria(prisma: PrismaClient, id: number) {
  const materia = await prisma.materia.findUnique({ where: { id } });
  if (!materia) throw HttpError.notFound('No se encontró la materia.');

  return prisma.materia.update({
    where: { id },
    data: { activo: false },
    select: seleccionMateria,
  });
}
