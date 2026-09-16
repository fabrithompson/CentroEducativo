import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';

import { prisma } from '../db/prisma';
import { HttpError } from '../utils/httpError';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.get('/hijos', requireAuth, requireRole(Role.PADRE), async (req, res, next) => {
  try {
    const links = await prisma.parentStudentLink.findMany({
      where: { padreId: req.authUser!.id },
      include: {
        estudiante: { select: { id: true, nombre: true, dni: true, curso: true } },
      },
      orderBy: { id: 'asc' },
    });
    res.json({ exito: true, hijos: links.map((l) => l.estudiante) });
  } catch (err) {
    next(err);
  }
});

const linkSchema = z.object({ dni: z.string().min(6).max(15) });

router.post('/vincular', requireAuth, requireRole(Role.PADRE), async (req, res, next) => {
  try {
    const { dni } = linkSchema.parse(req.body);

    const student = await prisma.user.findUnique({ where: { dni } });
    if (!student || student.role !== Role.ESTUDIANTE) {
      throw HttpError.notFound('No existe ningún estudiante con ese DNI.');
    }

    await prisma.parentStudentLink.upsert({
      where: {
        padreId_estudianteId: { padreId: req.authUser!.id, estudianteId: student.id },
      },
      update: {},
      create: { padreId: req.authUser!.id, estudianteId: student.id },
    });

    res.json({
      exito: true,
      mensaje: 'Hijo vinculado a tu cuenta.',
      hijo: { id: student.id, nombre: student.nombre, dni: student.dni, curso: student.curso },
    });
  } catch (err) {
    next(err);
  }
});

export { router as parentRouter };
