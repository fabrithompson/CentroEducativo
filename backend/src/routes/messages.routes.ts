import { Router } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';

import { prisma } from '../db/prisma';
import { HttpError } from '../utils/httpError';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/contacts', requireAuth, async (req, res, next) => {
  try {
    const me = req.authUser!;
    let allowedRoles: Role[];

    switch (me.role) {
      case Role.ESTUDIANTE:
        allowedRoles = [Role.DOCENTE, Role.ADMIN];
        break;
      case Role.PADRE:
        allowedRoles = [Role.DOCENTE, Role.ADMIN];
        break;
      case Role.DOCENTE:
        allowedRoles = [Role.ESTUDIANTE, Role.PADRE, Role.DOCENTE, Role.ADMIN];
        break;
      case Role.ADMIN:
        allowedRoles = [Role.ESTUDIANTE, Role.DOCENTE, Role.PADRE];
        break;
      default:
        allowedRoles = [];
    }

    const users = await prisma.user.findMany({
      where: {
        role: { in: allowedRoles },
        isActive: true,
        id: { not: me.id },
      },
      orderBy: { nombre: 'asc' },
      select: { id: true, nombre: true, role: true, curso: true },
    });

    res.json({ exito: true, contactos: users });
  } catch (err) {
    next(err);
  }
});

router.get('/threads', requireAuth, async (req, res, next) => {
  try {
    const me = req.authUser!;
    const rows = await prisma.message.findMany({
      where: { OR: [{ senderId: me.id }, { receiverId: me.id }] },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        sender: { select: { id: true, nombre: true, role: true } },
        receiver: { select: { id: true, nombre: true, role: true } },
      },
    });

    const byContact = new Map<number, {
      contactId: number;
      contactNombre: string;
      contactRol: Role;
      ultimoMensaje: string;
      ultimoEnviado: string;
      noLeidos: number;
    }>();

    for (const m of rows) {
      const isMine = m.senderId === me.id;
      const other = isMine ? m.receiver : m.sender;
      const existing = byContact.get(other.id);
      if (!existing) {
        byContact.set(other.id, {
          contactId: other.id,
          contactNombre: other.nombre,
          contactRol: other.role,
          ultimoMensaje: m.contenido,
          ultimoEnviado: m.createdAt.toISOString(),
          noLeidos: !isMine && !m.isRead ? 1 : 0,
        });
      } else if (!isMine && !m.isRead) {
        existing.noLeidos += 1;
      }
    }

    res.json({ exito: true, hilos: Array.from(byContact.values()) });
  } catch (err) {
    next(err);
  }
});

const threadSchema = z.object({ contactId: z.coerce.number().int().positive() });

router.get('/thread/:contactId', requireAuth, async (req, res, next) => {
  try {
    const { contactId } = threadSchema.parse(req.params);
    const me = req.authUser!;

    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: me.id, receiverId: contactId },
          { senderId: contactId, receiverId: me.id },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    await prisma.message.updateMany({
      where: { senderId: contactId, receiverId: me.id, isRead: false },
      data: { isRead: true },
    });

    const contact = await prisma.user.findUnique({
      where: { id: contactId },
      select: { id: true, nombre: true, role: true },
    });

    res.json({
      exito: true,
      contacto: contact,
      mensajes: messages.map((m) => ({
        id: m.id,
        deMi: m.senderId === me.id,
        contenido: m.contenido,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

const sendSchema = z.object({
  receiverId: z.coerce.number().int().positive(),
  contenido: z.string().min(1).max(2000),
});

router.post('/', requireAuth, async (req, res, next) => {
  try {
    const data = sendSchema.parse(req.body);
    const me = req.authUser!;

    const receiver = await prisma.user.findUnique({ where: { id: data.receiverId } });
    if (!receiver || !receiver.isActive) throw HttpError.notFound('Destinatario no encontrado.');

    const created = await prisma.message.create({
      data: {
        senderId: me.id,
        receiverId: data.receiverId,
        contenido: data.contenido,
      },
    });

    await prisma.notification.create({
      data: {
        userId: data.receiverId,
        titulo: 'Nuevo mensaje de ' + (me.usuario),
        contenido: data.contenido.slice(0, 120),
      },
    });

    res.json({ exito: true, mensaje: { id: created.id, createdAt: created.createdAt.toISOString() } });
  } catch (err) {
    next(err);
  }
});

export { router as messagesRouter };
