import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { PaymentStatus, Role } from '@prisma/client';

import { prisma } from '../../db/prisma';
import { HttpError } from '../../utils/httpError';
import { requireAuth, requireRole } from '../../middleware/auth';
import { vincularTutor, desvincularTutor } from '../alumnos/alumnos.service';
import { passwordSchema } from '../auth/politicaPassword';
import { aplicarRetencion } from '../shared/retencion';
import { env } from '../../config/env';

const router = Router();

router.use(requireAuth, requireRole(Role.ADMIN));

/**
 * Informe de retención (RNF-09).
 *
 * Siempre en seco: cuenta qué superó su plazo y nunca borra, sin importar cómo
 * esté `RETENCION_ACTIVA`. El borrado lo hace la tarea programada de la 01:00;
 * esto es para mirar el estado desde el backoffice y poder discutir los plazos
 * con números antes de encenderla.
 */
router.get('/retencion', async (_req, res, next) => {
  try {
    const informe = await aplicarRetencion(prisma, { activa: false });

    res.json({
      exito: true,
      purgaActiva: env.RETENCION_ACTIVA,
      ...informe,
    });
  } catch (err) { next(err); }
});

router.get('/stats', async (_req, res, next) => {
  try {
    const [users, byRole, students, teachers, parents, grades, payments, announcements, activities, forumPosts, messages] = await Promise.all([
      prisma.user.count(),
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      prisma.user.count({ where: { role: Role.ESTUDIANTE, isActive: true } }),
      prisma.user.count({ where: { role: Role.DOCENTE, isActive: true } }),
      prisma.user.count({ where: { role: Role.PADRE, isActive: true } }),
      prisma.grade.count(),
      prisma.payment.aggregate({ _sum: { monto: true }, where: { status: 'PAGADO' } }),
      prisma.announcement.count(),
      prisma.activity.count(),
      prisma.forumPost.count(),
      prisma.message.count(),
    ]);
    res.json({
      exito: true,
      stats: {
        totalUsuarios: users,
        estudiantesActivos: students,
        docentesActivos: teachers,
        padresActivos: parents,
        notasRegistradas: grades,
        totalRecaudado: Number(payments._sum.monto || 0),
        anuncios: announcements,
        actividades: activities,
        temasForo: forumPosts,
        mensajesIntercambiados: messages,
        porRol: byRole.map((r) => ({ role: r.role, count: r._count._all })),
      },
    });
  } catch (err) { next(err); }
});

const userListSchema = z.object({
  role: z.enum(['ESTUDIANTE', 'DOCENTE', 'PADRE', 'ADMIN']).optional(),
  q: z.string().optional(),
});

router.get('/users', async (req, res, next) => {
  try {
    const { role, q } = userListSchema.parse(req.query);
    const users = await prisma.user.findMany({
      where: {
        ...(role ? { role: role as Role } : {}),
        ...(q ? {
          OR: [
            { nombre: { contains: q, mode: 'insensitive' } },
            { usuario: { contains: q, mode: 'insensitive' } },
            { dni: { contains: q } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        } : {}),
      },
      orderBy: [{ role: 'asc' }, { nombre: 'asc' }],
      select: {
        id: true, usuario: true, email: true, dni: true, nombre: true,
        role: true, curso: true, isActive: true, pendienteAprobacion: true, createdAt: true,
      },
    });
    res.json({ exito: true, usuarios: users });
  } catch (err) { next(err); }
});

const createUserSchema = z.object({
  usuario: z.string().min(3).max(40),
  email: z.string().email(),
  dni: z.string().min(6).max(15),
  nombre: z.string().min(2),
  role: z.enum(['ESTUDIANTE', 'DOCENTE', 'PADRE', 'ADMIN']),
  curso: z.string().optional().nullable(),
  password: passwordSchema,
});

router.post('/users', async (req, res, next) => {
  try {
    const data = createUserSchema.parse(req.body);
    const exists = await prisma.user.findFirst({
      where: { OR: [{ usuario: data.usuario }, { email: data.email }, { dni: data.dni }] },
      select: { id: true },
    });
    if (exists) throw HttpError.conflict('Usuario, email o DNI ya existen.');
    const hash = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        usuario: data.usuario,
        email: data.email,
        dni: data.dni,
        nombre: data.nombre,
        role: data.role as Role,
        curso: data.role === 'ESTUDIANTE' ? (data.curso ?? null) : null,
        password: hash,
      },
      select: { id: true, usuario: true, nombre: true, role: true, dni: true, email: true, curso: true, isActive: true },
    });
    res.json({ exito: true, usuario: user });
  } catch (err) { next(err); }
});

const updateUserSchema = z.object({
  nombre: z.string().min(2).optional(),
  email: z.string().email().optional(),
  usuario: z.string().min(3).max(40).optional(),
  dni: z.string().min(6).max(15).optional(),
  role: z.enum(['ESTUDIANTE', 'DOCENTE', 'PADRE', 'ADMIN']).optional(),
  curso: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  password: passwordSchema.optional(),
});

router.patch('/users/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = updateUserSchema.parse(req.body);
    if (id === req.authUser!.id && data.isActive === false) {
      throw HttpError.badRequest('No podés desactivar tu propia cuenta.');
    }

    // Verificar colisiones en campos únicos
    if (data.usuario || data.email || data.dni) {
      const conflicting = await prisma.user.findFirst({
        where: {
          NOT: { id },
          OR: [
            ...(data.usuario ? [{ usuario: data.usuario }] : []),
            ...(data.email ? [{ email: data.email }] : []),
            ...(data.dni ? [{ dni: data.dni }] : []),
          ],
        },
        select: { id: true, usuario: true, email: true, dni: true },
      });
      if (conflicting) {
        if (conflicting.usuario === data.usuario) throw HttpError.conflict('Ese nombre de usuario ya está tomado.');
        if (conflicting.email === data.email) throw HttpError.conflict('Ese email ya está registrado.');
        if (conflicting.dni === data.dni) throw HttpError.conflict('Ese DNI ya está registrado.');
        throw HttpError.conflict('Conflicto con otro usuario.');
      }
    }

    const patch: Record<string, unknown> = {};
    if (data.nombre !== undefined) patch.nombre = data.nombre;
    if (data.email !== undefined) patch.email = data.email;
    if (data.usuario !== undefined) patch.usuario = data.usuario;
    if (data.dni !== undefined) patch.dni = data.dni;
    if (data.role !== undefined) patch.role = data.role as Role;
    if (data.curso !== undefined) patch.curso = data.curso;
    if (data.isActive !== undefined) patch.isActive = data.isActive;
    // Reactivar a un docente que esperaba aprobación equivale a aprobarlo.
    if (data.isActive === true) patch.pendienteAprobacion = false;
    if (data.password !== undefined) patch.password = await bcrypt.hash(data.password, 10);
    // Desactivar o cambiar la contraseña cierra las sesiones abiertas: el
    // refresh token que ya tenían deja de validar (ver `tokenVersion`).
    if (data.isActive === false || data.password !== undefined) {
      patch.tokenVersion = { increment: 1 };
    }

    // Si dejó de ser estudiante, limpiar curso
    if (data.role && data.role !== 'ESTUDIANTE' && patch.curso === undefined) {
      patch.curso = null;
    }

    const user = await prisma.user.update({
      where: { id },
      data: patch,
      select: {
        id: true, usuario: true, nombre: true, role: true, dni: true, email: true, curso: true,
        isActive: true, pendienteAprobacion: true,
      },
    });
    res.json({ exito: true, usuario: user });
  } catch (err) { next(err); }
});

router.delete('/users/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (id === req.authUser!.id) throw HttpError.badRequest('No podés borrar tu propia cuenta.');
    // Sin subir `tokenVersion`, la sesión abierta seguía renovándose una
    // semana más con su refresh token.
    await prisma.user.update({ where: { id }, data: { isActive: false, tokenVersion: { increment: 1 } } });
    res.json({ exito: true, mensaje: 'Usuario desactivado.' });
  } catch (err) { next(err); }
});

/**
 * Vínculos tutor–alumno.
 *
 * Operaban sobre `ParentStudentLink`, que vinculaba dos cuentas de usuario y
 * era una segunda fuente de verdad en paralelo a `TutorAlumno`. El problema no
 * era la duplicación en sí: era que las notas, la asistencia y las cuotas
 * resolvían el vínculo contra una tabla y el resto del sistema contra la otra,
 * así que un vínculo cargado acá no servía para el portal del tutor y al revés.
 *
 * Ahora esto delega en el mismo servicio que `POST /api/alumnos/:id/tutores`,
 * con lo que el alta queda auditada —queda registrado quién la hizo—, el motor
 * verifica que el tutor tenga rol PADRE y se respeta el único responsable de
 * facturación por alumno. El alumno se identifica por su id de dominio, no por
 * su cuenta: hay alumnos sin cuenta de usuario y también necesitan tutor.
 */
const linkSchema = z.object({
  tutorId: z.coerce.number().int().positive(),
  alumnoId: z.coerce.number().int().positive(),
  parentesco: z.string().trim().max(40).nullable().optional(),
  esResponsableFacturacion: z.coerce.boolean().optional(),
});

router.get('/links', async (_req, res, next) => {
  try {
    const vinculos = await prisma.tutorAlumno.findMany({
      include: {
        tutor: { select: { id: true, nombre: true, dni: true, email: true } },
        alumno: {
          select: {
            id: true,
            legajo: true,
            apellido: true,
            nombres: true,
            dni: true,
            curso: { select: { nombre: true, division: true } },
          },
        },
      },
      orderBy: { id: 'desc' },
    });

    res.json({
      exito: true,
      links: vinculos.map((v) => ({
        id: v.id,
        parentesco: v.parentesco,
        esResponsableFacturacion: v.esResponsableFacturacion,
        tutor: v.tutor,
        alumno: {
          id: v.alumno.id,
          legajo: v.alumno.legajo,
          nombre: `${v.alumno.apellido}, ${v.alumno.nombres}`,
          dni: v.alumno.dni,
          curso: v.alumno.curso
            ? `${v.alumno.curso.nombre} "${v.alumno.curso.division}"`
            : null,
        },
      })),
    });
  } catch (err) { next(err); }
});

router.post('/links', async (req, res, next) => {
  try {
    const data = linkSchema.parse(req.body);
    const vinculo = await vincularTutor(prisma, { ...data, creadoPorId: req.authUser!.id });
    res.status(201).json({ exito: true, mensaje: 'Tutor vinculado al alumno.', link: vinculo });
  } catch (err) { next(err); }
});

router.delete('/links/:id', async (req, res, next) => {
  try {
    await desvincularTutor(prisma, Number(req.params.id));
    res.json({ exito: true, mensaje: 'Vínculo eliminado.' });
  } catch (err) { next(err); }
});

const createPaymentSchema = z.object({
  estudianteId: z.coerce.number().int().positive(),
  concepto: z.string().trim().min(2, 'Indicá el concepto de la cuota.').max(120),
  monto: z.coerce.number().positive('El monto tiene que ser mayor a cero.'),
  vencimiento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha de vencimiento no es válida.'),
});

const listaCuotasSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Últimas cuotas cargadas, para el historial debajo del formulario. Sin esto,
 * después de "Cargar cuota" no quedaba rastro visible de lo cargado.
 */
router.get('/payments', async (req, res, next) => {
  try {
    const { limit } = listaCuotasSchema.parse(req.query);
    const rows = await prisma.payment.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        estudiante: { select: { id: true, nombre: true, curso: true } },
        padre: { select: { id: true, nombre: true } },
      },
    });

    // Igual que en el estado de cuenta del padre: una cuota pendiente con el
    // vencimiento cumplido se informa como vencida.
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);

    res.json({
      exito: true,
      cuotas: rows.map((p) => ({
        id: p.id,
        concepto: p.concepto,
        monto: Number(p.monto),
        vencimiento: p.vencimiento.toISOString().slice(0, 10),
        status: p.status === PaymentStatus.PENDIENTE && p.vencimiento < hoy ? PaymentStatus.VENCIDO : p.status,
        pagadoEn: p.pagadoEn ? p.pagadoEn.toISOString().slice(0, 10) : null,
        cargadaEn: p.createdAt.toISOString(),
        estudiante: p.estudiante,
        responsable: p.padre,
      })),
    });
  } catch (err) { next(err); }
});

router.post('/payments', async (req, res, next) => {
  try {
    const data = createPaymentSchema.parse(req.body);

    const estudiante = await prisma.user.findUnique({
      where: { id: data.estudianteId },
      select: { id: true, nombre: true, role: true },
    });
    if (!estudiante || estudiante.role !== Role.ESTUDIANTE) {
      throw HttpError.badRequest('El alumno indicado no existe.');
    }

    // Los tutores del alumno, con el responsable de facturación primero. Ese
    // queda como padre de la cuota —si no hay responsable marcado, el primero
    // que aparezca—, como hacía la versión anterior. Sin vínculo la cuota
    // queda sin padre asociado.
    const vinculos = await prisma.tutorAlumno.findMany({
      where: { alumno: { userId: data.estudianteId } },
      orderBy: { esResponsableFacturacion: 'desc' },
      select: { tutorId: true, tutor: { select: { isActive: true } } },
    });

    // Todos los tutores ven la cuota en su estado de cuenta, así que a todos
    // los que tienen la cuenta activa se les avisa.
    const avisados = vinculos.filter((v) => v.tutor.isActive).map((v) => v.tutorId);
    const [anio, mes, dia] = data.vencimiento.split('-');
    const monto = data.monto.toLocaleString('es-AR', { maximumFractionDigits: 2 });

    const payment = await prisma.$transaction(async (tx) => {
      const creada = await tx.payment.create({
        data: {
          estudianteId: data.estudianteId,
          padreId: vinculos[0]?.tutorId ?? null,
          concepto: data.concepto,
          monto: data.monto,
          vencimiento: new Date(data.vencimiento),
        },
      });
      if (avisados.length > 0) {
        await tx.notification.createMany({
          data: avisados.map((userId) => ({
            userId,
            titulo: 'Nueva cuota',
            contenido: `Se cargó "${data.concepto}" de ${estudiante.nombre}: $${monto}, vence el ${dia}/${mes}/${anio}.`,
            link: '/panel_padre.html#finanzas',
          })),
        });
      }
      return creada;
    });

    res.json({ exito: true, payment, avisados: avisados.length });
  } catch (err) { next(err); }
});

// Docentes pendientes de aprobación
router.get('/teachers/pending', async (_req, res, next) => {
  try {
    const pendientes = await prisma.user.findMany({
      where: { role: Role.DOCENTE, pendienteAprobacion: true },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, usuario: true, email: true, dni: true, nombre: true,
        createdAt: true,
      },
    });
    res.json({ exito: true, docentes: pendientes });
  } catch (err) { next(err); }
});

router.post('/teachers/:id/approve', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw HttpError.notFound('Docente no encontrado.');
    if (user.role !== Role.DOCENTE) throw HttpError.badRequest('El usuario no es docente.');
    if (!user.pendienteAprobacion) throw HttpError.badRequest('El docente no tiene una solicitud pendiente.');
    const aprobado = await prisma.user.update({
      where: { id },
      data: { isActive: true, pendienteAprobacion: false },
      select: { id: true, usuario: true, nombre: true, email: true, dni: true, isActive: true },
    });
    await prisma.notification.create({
      data: {
        userId: id,
        titulo: 'Cuenta aprobada',
        contenido: 'Un administrador aprobó tu cuenta de docente. Ya podés iniciar sesión.',
      },
    });
    res.json({ exito: true, docente: aprobado });
  } catch (err) { next(err); }
});

router.delete('/teachers/:id/reject', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw HttpError.notFound('Docente no encontrado.');
    if (user.role !== Role.DOCENTE) throw HttpError.badRequest('El usuario no es docente.');
    // Rechazar borra la cuenta, y el borrado arrastra lo que haya publicado:
    // vale sólo para una solicitud que nunca se aprobó. A un docente
    // desactivado se lo reactiva desde Usuarios.
    if (!user.pendienteAprobacion) {
      throw HttpError.badRequest('Sólo se puede rechazar una solicitud pendiente de aprobación.');
    }
    await prisma.user.delete({ where: { id } });
    res.json({ exito: true, mensaje: 'Solicitud de docente rechazada.' });
  } catch (err) { next(err); }
});

export { router as administradorRouter };
