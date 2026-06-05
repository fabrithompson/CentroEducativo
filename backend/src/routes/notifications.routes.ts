import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { prisma } from '../db/prisma';

const router = Router();

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const me = req.authUser!;
    const rows = await prisma.notification.findMany({
      where: { userId: me.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    const unread = rows.filter((r) => !r.isRead).length;
    res.json({
      exito: true,
      total: rows.length,
      noLeidas: unread,
      notificaciones: rows.map((r) => ({
        id: r.id,
        titulo: r.titulo,
        contenido: r.contenido,
        link: r.link,
        isRead: r.isRead,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    await prisma.notification.updateMany({
      where: { id, userId: req.authUser!.id },
      data: { isRead: true },
    });
    res.json({ exito: true });
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', requireAuth, async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.authUser!.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ exito: true });
  } catch (err) {
    next(err);
  }
});

const createSchema = z.object({
  userId: z.coerce.number().int().positive(),
  titulo: z.string().min(2),
  contenido: z.string().min(2),
  link: z.string().optional().nullable(),
});

// Auxiliar — uso interno desde otros routers (no por la API pública)
export async function notify(input: z.infer<typeof createSchema>) {
  const data = createSchema.parse(input);
  return prisma.notification.create({
    data: {
      userId: data.userId,
      titulo: data.titulo,
      contenido: data.contenido,
      link: data.link ?? null,
    },
  });
}

export { router as notificationsRouter };
