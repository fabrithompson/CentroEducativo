import fs from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import { ModerationStatus, Role } from '@prisma/client';

import { prisma } from '../../db/prisma';
import { HttpError } from '../../utils/httpError';
import { requireAuth, requireRole } from '../../middleware/auth';
import { upload, publicUrlFor } from '../../middleware/upload';
import { rateLimit } from '../shared/rateLimit';

const publicRouter = Router();
const adminRouter = Router();

/**
 * Los cuatro formularios públicos no piden cuenta: sin un tope, cualquiera
 * podía llenar la base de inscripciones o de consultas con un script. Diez
 * envíos por hora y por formulario alcanzan para una familia con varios hijos.
 */
const limitePublico = () =>
  rateLimit({
    max: 10,
    ventanaMs: 60 * 60 * 1000,
    mensaje: 'Recibimos muchos envíos desde tu conexión. Probá de nuevo en un rato.',
  });

// ============================================================
// INSCRIPCIONES
// ============================================================
const inscriptionSchema = z.object({
  nombreTutor: z.string().min(2).max(120),
  emailTutor: z.string().email(),
  telefonoTutor: z.string().min(6).max(30),
  nombreEstudiante: z.string().min(2).max(120),
  nivel: z.string().min(2).max(40),
  curso: z.string().min(1).max(60),
  mensaje: z.string().max(2000).optional().nullable(),
});

publicRouter.post('/inscriptions', limitePublico(), async (req, res, next) => {
  try {
    const data = inscriptionSchema.parse(req.body);
    const created = await prisma.inscription.create({ data: { ...data, mensaje: data.mensaje ?? null } });
    res.json({
      exito: true,
      mensaje: 'Recibimos tu solicitud de inscripción. Un administrador la revisará y nos pondremos en contacto.',
      id: created.id,
    });
  } catch (err) { next(err); }
});

adminRouter.get('/inscriptions', async (req, res, next) => {
  try {
    const status = (req.query.status as string | undefined)?.toUpperCase();
    const where = status && ['PENDIENTE', 'APROBADO', 'RECHAZADO'].includes(status)
      ? { status: status as ModerationStatus }
      : {};
    const items = await prisma.inscription.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ exito: true, inscripciones: items });
  } catch (err) { next(err); }
});

const resolveSchema = z.object({ notaAdmin: z.string().max(500).optional() });

adminRouter.post('/inscriptions/:id/approve', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { notaAdmin } = resolveSchema.parse(req.body ?? {});
    const updated = await prisma.inscription.update({
      where: { id },
      data: { status: ModerationStatus.APROBADO, notaAdmin: notaAdmin ?? null, resolvedAt: new Date() },
    });
    res.json({ exito: true, inscripcion: updated });
  } catch (err) { next(err); }
});

adminRouter.post('/inscriptions/:id/reject', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { notaAdmin } = resolveSchema.parse(req.body ?? {});
    const updated = await prisma.inscription.update({
      where: { id },
      data: { status: ModerationStatus.RECHAZADO, notaAdmin: notaAdmin ?? null, resolvedAt: new Date() },
    });
    res.json({ exito: true, inscripcion: updated });
  } catch (err) { next(err); }
});

adminRouter.delete('/inscriptions/:id', async (req, res, next) => {
  try {
    await prisma.inscription.delete({ where: { id: Number(req.params.id) } });
    res.json({ exito: true });
  } catch (err) { next(err); }
});

// ============================================================
// OPINIONES
// ============================================================
const opinionSchema = z.object({
  nombre: z.string().max(80).optional().nullable(),
  rol: z.string().min(1).max(40),
  texto: z.string().min(3).max(2000),
  rating: z.coerce.number().int().min(1).max(5),
});

publicRouter.post('/opinions', limitePublico(), async (req, res, next) => {
  try {
    const data = opinionSchema.parse(req.body);
    const created = await prisma.opinionPublica.create({
      data: {
        nombre: data.nombre || null,
        rol: data.rol,
        texto: data.texto,
        rating: data.rating,
      },
    });
    res.json({
      exito: true,
      mensaje: 'Gracias por tu opinión. Será publicada después de la moderación.',
      id: created.id,
    });
  } catch (err) { next(err); }
});

publicRouter.get('/opinions', async (_req, res, next) => {
  try {
    const items = await prisma.opinionPublica.findMany({
      where: { status: ModerationStatus.APROBADO },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: { id: true, nombre: true, rol: true, texto: true, rating: true, createdAt: true },
    });
    res.json({ exito: true, opiniones: items });
  } catch (err) { next(err); }
});

adminRouter.get('/opinions', async (req, res, next) => {
  try {
    const status = (req.query.status as string | undefined)?.toUpperCase();
    const where = status && ['PENDIENTE', 'APROBADO', 'RECHAZADO'].includes(status)
      ? { status: status as ModerationStatus }
      : {};
    const items = await prisma.opinionPublica.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ exito: true, opiniones: items });
  } catch (err) { next(err); }
});

adminRouter.post('/opinions/:id/approve', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const updated = await prisma.opinionPublica.update({
      where: { id },
      data: { status: ModerationStatus.APROBADO, resolvedAt: new Date() },
    });
    res.json({ exito: true, opinion: updated });
  } catch (err) { next(err); }
});

adminRouter.post('/opinions/:id/reject', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const updated = await prisma.opinionPublica.update({
      where: { id },
      data: { status: ModerationStatus.RECHAZADO, resolvedAt: new Date() },
    });
    res.json({ exito: true, opinion: updated });
  } catch (err) { next(err); }
});

adminRouter.delete('/opinions/:id', async (req, res, next) => {
  try {
    await prisma.opinionPublica.delete({ where: { id: Number(req.params.id) } });
    res.json({ exito: true });
  } catch (err) { next(err); }
});

// ============================================================
// EMPLEO (postulaciones con CV opcional en PDF)
// ============================================================
const employmentSchema = z.object({
  nombre: z.string().min(2).max(120),
  email: z.string().email(),
  puesto: z.string().min(2).max(60),
});

/** El portal anuncia "PDF, hasta 10 MB": se controla acá también. */
const CV_MAX_BYTES = 10 * 1024 * 1024;

publicRouter.post('/employment', limitePublico(), upload.single('cv'), async (req, res, next) => {
  try {
    if (req.file) {
      const esPdf = req.file.mimetype === 'application/pdf' || /.pdf$/i.test(req.file.originalname);
      if (!esPdf || req.file.size > CV_MAX_BYTES) {
        fs.unlink(req.file.path, () => { /* si no se pudo borrar, lo limpia la retención */ });
        throw new HttpError(400, !esPdf ? 'El CV tiene que ser un archivo PDF.' : 'El CV supera el máximo de 10 MB.');
      }
    }
    const data = employmentSchema.parse(req.body);
    const cvUrl = req.file ? publicUrlFor(req.file.filename) : null;
    const created = await prisma.employmentApplication.create({
      data: { ...data, cvUrl },
    });
    res.json({
      exito: true,
      mensaje: 'Recibimos tu postulación. La revisaremos y te contactaremos por mail.',
      id: created.id,
    });
  } catch (err) { next(err); }
});

adminRouter.get('/employment', async (req, res, next) => {
  try {
    const status = (req.query.status as string | undefined)?.toUpperCase();
    const where = status && ['PENDIENTE', 'APROBADO', 'RECHAZADO'].includes(status)
      ? { status: status as ModerationStatus }
      : {};
    const items = await prisma.employmentApplication.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ exito: true, postulaciones: items });
  } catch (err) { next(err); }
});

adminRouter.post('/employment/:id/approve', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { notaAdmin } = resolveSchema.parse(req.body ?? {});
    const updated = await prisma.employmentApplication.update({
      where: { id },
      data: { status: ModerationStatus.APROBADO, notaAdmin: notaAdmin ?? null, resolvedAt: new Date() },
    });
    res.json({ exito: true, postulacion: updated });
  } catch (err) { next(err); }
});

adminRouter.post('/employment/:id/reject', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { notaAdmin } = resolveSchema.parse(req.body ?? {});
    const updated = await prisma.employmentApplication.update({
      where: { id },
      data: { status: ModerationStatus.RECHAZADO, notaAdmin: notaAdmin ?? null, resolvedAt: new Date() },
    });
    res.json({ exito: true, postulacion: updated });
  } catch (err) { next(err); }
});

adminRouter.delete('/employment/:id', async (req, res, next) => {
  try {
    await prisma.employmentApplication.delete({ where: { id: Number(req.params.id) } });
    res.json({ exito: true });
  } catch (err) { next(err); }
});

// ============================================================
// CONSULTAS DEL FORMULARIO DE CONTACTO
// ============================================================
const contactoSchema = z.object({
  nombre: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(120),
  mensaje: z.string().trim().min(10).max(2000),
});

publicRouter.post('/contact', limitePublico(), async (req, res, next) => {
  try {
    const data = contactoSchema.parse(req.body);
    const creada = await prisma.consultaContacto.create({ data });
    res.json({
      exito: true,
      mensaje: 'Recibimos tu mensaje. Te vamos a responder por email.',
      id: creada.id,
    });
  } catch (err) { next(err); }
});

adminRouter.get('/contact', async (req, res, next) => {
  try {
    const estado = String(req.query.estado ?? 'pendientes');
    const where = estado === 'atendidas' ? { atendida: true }
      : estado === 'todas' ? {}
      : { atendida: false };
    const consultas = await prisma.consultaContacto.findMany({ where, orderBy: { createdAt: 'desc' } });
    res.json({ exito: true, consultas });
  } catch (err) { next(err); }
});

const atenderSchema = z.object({ atendida: z.boolean().default(true) });

adminRouter.post('/contact/:id/atender', async (req, res, next) => {
  try {
    const { atendida } = atenderSchema.parse(req.body ?? {});
    const consulta = await prisma.consultaContacto.update({
      where: { id: Number(req.params.id) },
      data: { atendida, atendidaAt: atendida ? new Date() : null },
    });
    res.json({ exito: true, consulta });
  } catch (err) { next(err); }
});

adminRouter.delete('/contact/:id', async (req, res, next) => {
  try {
    await prisma.consultaContacto.delete({ where: { id: Number(req.params.id) } });
    res.json({ exito: true });
  } catch (err) { next(err); }
});

// ============================================================
// CONTADORES PARA EL BADGE DEL ADMIN
// ============================================================
adminRouter.get('/moderation/counts', async (_req, res, next) => {
  try {
    const [insc, op, emp, doc, contacto] = await Promise.all([
      prisma.inscription.count({ where: { status: ModerationStatus.PENDIENTE } }),
      prisma.opinionPublica.count({ where: { status: ModerationStatus.PENDIENTE } }),
      prisma.employmentApplication.count({ where: { status: ModerationStatus.PENDIENTE } }),
      prisma.user.count({ where: { role: Role.DOCENTE, pendienteAprobacion: true } }),
      prisma.consultaContacto.count({ where: { atendida: false } }),
    ]);
    res.json({
      exito: true,
      pendientes: {
        inscripciones: insc,
        opiniones: op,
        empleo: emp,
        docentes: doc,
        contacto,
        total: insc + op + emp + doc + contacto,
      },
    });
  } catch (err) { next(err); }
});

// Las rutas de adminRouter exigen ADMIN: el guard se aplica al montarlo en
// routes/index.ts (ver requireAdmin).

export { publicRouter as moderacionPublicaRouter, adminRouter as moderacionAdminRouter };

// Helper opcional: middleware para uso desde routes/index.ts
export function requireAdmin() {
  return [requireAuth, requireRole(Role.ADMIN)];
}
