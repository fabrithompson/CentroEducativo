import { Router } from 'express';
import { z } from 'zod';
import { AnnouncementTarget, Prisma, Role } from '@prisma/client';

import { prisma } from '../../db/prisma';
import { requireAuth, requireRole } from '../../middleware/auth';
import { HttpError } from '../../utils/httpError';

const router = Router();

const ROLE_TO_TARGET: Record<Role, AnnouncementTarget> = {
  ESTUDIANTE: AnnouncementTarget.ESTUDIANTE,
  DOCENTE: AnnouncementTarget.DOCENTE,
  PADRE: AnnouncementTarget.PADRE,
  ADMIN: AnnouncementTarget.ALL,
};

/** Sección del panel de cada rol a la que lleva el aviso de un anuncio nuevo. */
const ENLACE_POR_ROL: Record<Role, string> = {
  ESTUDIANTE: '/panel_estudiante.html#anuncios',
  DOCENTE: '/panel_docente.html#comunicados',
  PADRE: '/panel_padre.html#anuncios',
  ADMIN: '/panel_admin.html#anuncios',
};

/** Sólo quien lo publicó o un administrador lo edita o lo borra. */
function puedeModificar(autorId: number, me: { id: number; role: Role }) {
  return autorId === me.id || me.role === Role.ADMIN;
}

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const me = req.authUser!;
    // El administrador ve todos: con el filtro por rol sólo veía los dirigidos
    // a toda la comunidad, y no podía editar ni borrar uno dirigido a un rol.
    // Quien lo publicó lo ve siempre: un docente que avisa a las familias
    // tiene que poder corregirlo o borrarlo, aunque no vaya dirigido a él.
    const where: Prisma.AnnouncementWhereInput =
      me.role === Role.ADMIN
        ? {}
        : {
            OR: [
              { targetRole: AnnouncementTarget.ALL },
              { targetRole: ROLE_TO_TARGET[me.role] },
              { authorId: me.id },
            ],
          };
    const rows = await prisma.announcement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 30,
      include: { author: { select: { nombre: true, role: true } } },
    });
    res.json({
      exito: true,
      anuncios: rows.map((a) => ({
        id: a.id,
        titulo: a.titulo,
        contenido: a.contenido,
        targetRole: a.targetRole,
        autor: a.author.nombre,
        autorRol: a.author.role,
        createdAt: a.createdAt.toISOString(),
        // El panel muestra Editar y Borrar sólo si el servidor los va a aceptar.
        puedeEditar: puedeModificar(a.authorId, me),
      })),
    });
  } catch (err) {
    next(err);
  }
});

const campos = {
  titulo: z.string().trim().min(3, 'El título debe tener al menos 3 caracteres.').max(150, 'El título no puede superar los 150 caracteres.'),
  contenido: z.string().trim().min(3, 'El contenido debe tener al menos 3 caracteres.').max(5000, 'El contenido no puede superar los 5000 caracteres.'),
  targetRole: z.enum(['ALL', 'ESTUDIANTE', 'DOCENTE', 'PADRE']),
};

const createSchema = z.object({ ...campos, targetRole: campos.targetRole.default('ALL') });

const editSchema = z
  .object({
    titulo: campos.titulo.optional(),
    contenido: campos.contenido.optional(),
    targetRole: campos.targetRole.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'No se envió ningún cambio.' });

router.post('/', requireAuth, requireRole(Role.DOCENTE, Role.ADMIN), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const created = await prisma.announcement.create({
      data: {
        authorId: req.authUser!.id,
        titulo: data.titulo,
        contenido: data.contenido,
        targetRole: data.targetRole as AnnouncementTarget,
      },
    });

    // Notificación en bloque para los destinatarios
    const targetRoles =
      data.targetRole === 'ALL'
        ? [Role.ESTUDIANTE, Role.DOCENTE, Role.PADRE]
        : [data.targetRole as Role];
    const users = await prisma.user.findMany({
      where: { role: { in: targetRoles }, isActive: true },
      select: { id: true, role: true },
    });
    if (users.length > 0) {
      await prisma.notification.createMany({
        data: users.map((u) => ({
          userId: u.id,
          titulo: 'Nuevo anuncio: ' + data.titulo,
          contenido: data.contenido.slice(0, 120),
          link: ENLACE_POR_ROL[u.role],
        })),
      });
    }

    res.json({ exito: true, anuncio: created });
  } catch (err) {
    next(err);
  }
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

async function anuncioModificable(id: number, me: { id: number; role: Role }, accion: string) {
  const a = await prisma.announcement.findUnique({ where: { id } });
  if (!a) throw HttpError.notFound('El anuncio no existe.');
  if (!puedeModificar(a.authorId, me)) {
    throw HttpError.forbidden(`Sólo quien lo publicó o un administrador puede ${accion}lo.`);
  }
  return a;
}

/**
 * Edición de un anuncio ya publicado. No vuelve a notificar: un aviso por
 * cada corrección de una coma sería ruido para toda la comunidad.
 */
router.patch('/:id', requireAuth, requireRole(Role.DOCENTE, Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const data = editSchema.parse(req.body);
    await anuncioModificable(id, req.authUser!, 'editar');
    const anuncio = await prisma.announcement.update({
      where: { id },
      data: { ...data, targetRole: data.targetRole as AnnouncementTarget | undefined },
    });
    res.json({ exito: true, mensaje: 'Anuncio actualizado.', anuncio });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', requireAuth, requireRole(Role.DOCENTE, Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    await anuncioModificable(id, req.authUser!, 'borrar');
    await prisma.announcement.delete({ where: { id } });
    res.json({ exito: true, mensaje: 'Anuncio borrado.' });
  } catch (err) {
    next(err);
  }
});

export { router as comunicadosRouter };
