/**
 * Grilla horaria de las materias: alta, baja y consulta.
 *
 * Que dos materias del mismo curso o del mismo docente no se superpongan lo
 * decide `grilla.ts` (puro y testeado); acá se leen las franjas que compiten y
 * se escribe dentro de una transacción serializable, para que dos altas
 * simultáneas no pasen las dos la validación contra una grilla vieja.
 */

import { Prisma, type DiaSemana, type PrismaClient } from '@prisma/client';

import { HttpError } from '../../utils/httpError';
import { esFranjaValida } from '../deportes/horarios';
import { buscarChoque, describirChoque, type FranjaDeMateria } from './grilla';

type Tx = Prisma.TransactionClient;

export const seleccionHorarioMateria = {
  id: true,
  diaSemana: true,
  horaInicio: true,
  horaFin: true,
  aula: true,
} as const;

export interface AltaHorarioMateria {
  diaSemana: DiaSemana;
  horaInicio: number;
  horaFin: number;
  aula?: string | null;
}

export async function listarHorariosMateria(prisma: PrismaClient, materiaId: number) {
  const materia = await prisma.materia.findUnique({ where: { id: materiaId }, select: { id: true } });
  if (!materia) throw HttpError.notFound('No se encontró la materia.');

  return prisma.horarioMateria.findMany({
    where: { materiaId },
    orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
    select: seleccionHorarioMateria,
  });
}

/**
 * Franjas de las materias activas que comparten curso o docente con la que se
 * está editando. Las de otros cursos con otro docente no pueden chocar, así
 * que no se traen.
 */
async function franjasQueCompiten(tx: Tx, cursoId: number, profesorId: number | null): Promise<FranjaDeMateria[]> {
  const filas = await tx.horarioMateria.findMany({
    where: {
      materia: {
        activo: true,
        OR: [{ cursoId }, ...(profesorId === null ? [] : [{ profesorId }])],
      },
    },
    select: {
      diaSemana: true,
      horaInicio: true,
      horaFin: true,
      materia: {
        select: {
          id: true,
          nombre: true,
          cursoId: true,
          profesorId: true,
          curso: { select: { nombre: true, division: true } },
        },
      },
    },
  });

  return filas.map((f) => ({
    diaSemana: f.diaSemana,
    horaInicio: f.horaInicio,
    horaFin: f.horaFin,
    materiaId: f.materia.id,
    materiaNombre: f.materia.nombre,
    cursoId: f.materia.cursoId,
    cursoNombre: `${f.materia.curso.nombre} "${f.materia.curso.division}"`,
    profesorId: f.materia.profesorId,
  }));
}

async function materiaParaGrilla(tx: Tx, materiaId: number) {
  const materia = await tx.materia.findUnique({
    where: { id: materiaId },
    select: {
      id: true,
      nombre: true,
      activo: true,
      cursoId: true,
      profesorId: true,
      curso: { select: { nombre: true, division: true } },
    },
  });
  if (!materia) throw HttpError.notFound('No se encontró la materia.');
  if (!materia.activo) throw HttpError.conflict('La materia está dada de baja: reactivala antes de cargarle horarios.');
  return materia;
}

export async function agregarHorarioMateria(prisma: PrismaClient, materiaId: number, input: AltaHorarioMateria) {
  if (!esFranjaValida(input)) {
    throw HttpError.badRequest('El horario tiene que terminar después de empezar, dentro del mismo día.');
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        const materia = await materiaParaGrilla(tx, materiaId);
        const nueva: FranjaDeMateria = {
          diaSemana: input.diaSemana,
          horaInicio: input.horaInicio,
          horaFin: input.horaFin,
          materiaId: materia.id,
          materiaNombre: materia.nombre,
          cursoId: materia.cursoId,
          cursoNombre: `${materia.curso.nombre} "${materia.curso.division}"`,
          profesorId: materia.profesorId,
        };

        const choque = buscarChoque(nueva, await franjasQueCompiten(tx, materia.cursoId, materia.profesorId));
        if (choque) throw HttpError.conflict(describirChoque(nueva, choque));

        return tx.horarioMateria.create({
          data: {
            materiaId,
            diaSemana: input.diaSemana,
            horaInicio: input.horaInicio,
            horaFin: input.horaFin,
            aula: input.aula?.trim() || null,
          },
          select: seleccionHorarioMateria,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw HttpError.conflict('La materia ya tiene un horario que empieza ese día a esa hora.');
    }
    throw err;
  }
}

export async function eliminarHorarioMateria(prisma: PrismaClient, materiaId: number, horarioId: number) {
  const horario = await prisma.horarioMateria.findFirst({ where: { id: horarioId, materiaId }, select: { id: true } });
  if (!horario) throw HttpError.notFound('No se encontró ese horario en la materia.');
  await prisma.horarioMateria.delete({ where: { id: horarioId } });
}

/**
 * Antes de cambiar el docente de una materia: su grilla no puede chocar con la
 * del docente nuevo. Si no, el cambio dejaría a una persona en dos aulas a la
 * vez sin que nadie lo advierta.
 */
export async function verificarGrillaConDocente(tx: Tx, materiaId: number, profesorId: number): Promise<void> {
  const materia = await tx.materia.findUnique({
    where: { id: materiaId },
    select: { id: true, nombre: true, cursoId: true, curso: { select: { nombre: true, division: true } } },
  });
  if (!materia) return;

  const propias = await tx.horarioMateria.findMany({
    where: { materiaId },
    select: { diaSemana: true, horaInicio: true, horaFin: true },
  });
  if (propias.length === 0) return;

  const delDocente = (await franjasQueCompiten(tx, -1, profesorId)).filter((f) => f.materiaId !== materiaId);
  for (const p of propias) {
    const nueva: FranjaDeMateria = {
      ...p,
      materiaId: materia.id,
      materiaNombre: materia.nombre,
      cursoId: materia.cursoId,
      cursoNombre: `${materia.curso.nombre} "${materia.curso.division}"`,
      profesorId,
    };
    const choque = buscarChoque(nueva, delDocente);
    if (choque) throw HttpError.conflict(`No se puede asignar ese docente: ${describirChoque(nueva, choque)}`);
  }
}
