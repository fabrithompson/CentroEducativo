import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';

import { prisma } from '../../db/prisma';
import { HttpError } from '../../utils/httpError';
import { requireAuth, requireRole } from '../../middleware/auth';
import { esHijoDelTutor } from '../shared/authz';

const router = Router();

const notaSchema = z.coerce
  .number()
  .int('La nota tiene que ser un número entero.')
  .min(1, 'La nota va de 1 a 10.')
  .max(10, 'La nota va de 1 a 10.');
const instanciaSchema = z.string().trim().min(1, 'Indicá la instancia de evaluación.').max(60);
const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida.');

const createGradeSchema = z
  .object({
    estudiante_id: z.coerce.number().int().positive(),
    materiaId: z.coerce.number().int().positive().optional(),
    /** Texto libre: sólo lo acepta un administrador, sin `materiaId`. */
    materia: z.string().trim().min(1).max(120).optional(),
    instancia_evaluacion: instanciaSchema,
    nota: notaSchema,
    fecha: fechaSchema,
  })
  .refine((v) => v.materiaId || v.materia, { message: 'Indicá la materia.' });

const editGradeSchema = z
  .object({
    nota: notaSchema.optional(),
    instancia_evaluacion: instanciaSchema.optional(),
    fecha: fechaSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No se envió ningún cambio.' });

const idParam = z.object({ id: z.coerce.number().int().positive() });

type Sesion = { id: number; role: Role };

/**
 * Un docente califica sólo sus materias, y sólo a alumnos del curso de la
 * materia. Devuelve el nombre exacto de la materia, que es lo que se guarda:
 * el boletín del padre agrupa las notas por ese texto, y con la lista escrita
 * a mano que había antes cada docente lo tipeaba distinto.
 */
async function materiaCalificable(me: Sesion, materiaId: number, estudianteUserId: number) {
  const materia = await prisma.materia.findUnique({
    where: { id: materiaId },
    include: { profesor: { select: { userId: true } } },
  });
  if (!materia || !materia.activo) throw HttpError.badRequest('La materia no existe o está dada de baja.');
  if (me.role !== Role.ADMIN && materia.profesor?.userId !== me.id) {
    throw HttpError.forbidden('Sólo podés calificar las materias que tenés a cargo.');
  }
  const alumno = await prisma.alumno.findUnique({
    where: { userId: estudianteUserId },
    select: { cursoId: true },
  });
  if (!alumno || alumno.cursoId !== materia.cursoId) {
    throw HttpError.badRequest('El alumno no pertenece al curso de esa materia.');
  }
  return materia.nombre;
}

/** Una nota la corrige o la borra quien la cargó, o un administrador. */
async function notaModificable(id: number, me: Sesion) {
  const nota = await prisma.grade.findUnique({ where: { id } });
  if (!nota) throw HttpError.notFound('La calificación no existe.');
  if (nota.docenteId !== me.id && me.role !== Role.ADMIN) {
    throw HttpError.forbidden('Sólo el docente que cargó la nota o un administrador pueden modificarla.');
  }
  return nota;
}

router.post('/', requireAuth, requireRole(Role.DOCENTE, Role.ADMIN), async (req, res, next) => {
  try {
    const data = createGradeSchema.parse(req.body);

    const me = req.authUser!;

    const student = await prisma.user.findUnique({ where: { id: data.estudiante_id } });
    if (!student || student.role !== Role.ESTUDIANTE) {
      throw HttpError.badRequest('El estudiante seleccionado no existe.');
    }

    let materia: string;
    if (data.materiaId) {
      materia = await materiaCalificable(me, data.materiaId, data.estudiante_id);
    } else if (me.role === Role.ADMIN && data.materia) {
      materia = data.materia;
    } else {
      throw HttpError.badRequest('Elegí una de las materias que tenés a cargo.');
    }

    const creada = await prisma.grade.create({
      data: {
        estudianteId: data.estudiante_id,
        docenteId: me.id,
        materia,
        instancia: data.instancia_evaluacion,
        nota: data.nota,
        fecha: new Date(data.fecha),
      },
    });

    res.json({ exito: true, mensaje: 'Calificación guardada exitosamente.', id: creada.id });
  } catch (err) {
    next(err);
  }
});

router.get('/mine', requireAuth, requireRole(Role.DOCENTE, Role.ADMIN), async (req, res, next) => {
  try {
    const notas = await prisma.grade.findMany({
      where: { docenteId: req.authUser!.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { estudiante: { select: { nombre: true } } },
    });
    res.json({
      exito: true,
      notas: notas.map((n) => ({
        id: n.id,
        alumno: n.estudiante.nombre,
        materia: n.materia,
        instancia_evaluacion: n.instancia,
        nota: n.nota,
        fecha: n.fecha.toISOString().slice(0, 10),
      })),
    });
  } catch (err) {
    next(err);
  }
});

const listQuerySchema = z.object({
  estudiante_id: z.coerce.number().int().positive(),
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { estudiante_id } = listQuerySchema.parse(req.query);
    const me = req.authUser!;

    if (me.role === Role.ESTUDIANTE && me.id !== estudiante_id) {
      throw HttpError.forbidden('Solo podés ver tus propias calificaciones.');
    }

    if (me.role === Role.PADRE && !(await esHijoDelTutor(prisma, me.id, estudiante_id))) {
      throw HttpError.forbidden('No tenés a ese alumno vinculado a tu cuenta.');
    }

    const notas = await prisma.grade.findMany({
      where: { estudianteId: estudiante_id },
      orderBy: { fecha: 'desc' },
      include: { docente: { select: { nombre: true } } },
    });

    res.json({
      exito: true,
      notas: notas.map((n) => ({
        id: n.id,
        materia: n.materia,
        instancia_evaluacion: n.instancia,
        nota: n.nota,
        fecha: n.fecha.toISOString().slice(0, 10),
        nombre_docente: n.docente.nombre,
      })),
    });
  } catch (err) {
    next(err);
  }
});

/** Corrige nota, instancia o fecha. El alumno y la materia no se cambian: eso es otra nota. */
router.patch('/:id', requireAuth, requireRole(Role.DOCENTE, Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const data = editGradeSchema.parse(req.body);
    await notaModificable(id, req.authUser!);
    const n = await prisma.grade.update({
      where: { id },
      data: {
        nota: data.nota,
        instancia: data.instancia_evaluacion,
        fecha: data.fecha ? new Date(data.fecha) : undefined,
      },
    });
    res.json({
      exito: true,
      mensaje: 'Calificación actualizada.',
      nota: {
        id: n.id,
        materia: n.materia,
        instancia_evaluacion: n.instancia,
        nota: n.nota,
        fecha: n.fecha.toISOString().slice(0, 10),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, requireRole(Role.DOCENTE, Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    await notaModificable(id, req.authUser!);
    await prisma.grade.delete({ where: { id } });
    res.json({ exito: true, mensaje: 'Calificación borrada.' });
  } catch (err) {
    next(err);
  }
});

export { router as calificacionesRouter };
