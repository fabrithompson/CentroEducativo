/**
 * Controlador REST de deportes e inscripciones deportivas.
 *
 * Toda la lógica de las reglas (tope de 2, sin choques de horario) vive en
 * `deportes.service.ts`; acá sólo se valida la entrada y se resuelven permisos.
 *
 * Permisos:
 *   GET  /api/deportes                       autenticado
 *   GET  /api/deportes/:id                   autenticado
 *   POST /api/deportes                       ADMIN
 *   POST /api/deportes/:id/horarios          ADMIN
 *   GET  /api/deportes/alumno/:alumnoId               ADMIN, DOCENTE, PADRE (vinculado), el propio alumno
 *   GET  /api/deportes/alumno/:alumnoId/disponibles   idem
 *   POST /api/deportes/inscripciones                  ADMIN, PADRE (vinculado)
 *   DELETE /api/deportes/inscripciones/:id            ADMIN, PADRE (vinculado)
 */

import { Router } from 'express';
import { DiaSemana, Role } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../db/prisma';
import { HttpError } from '../../utils/httpError';
import { requireAuth, requireRole } from '../../middleware/auth';
import { assertPuedeVerAlumno } from '../shared/authz';
import { aNumero } from '../shared/pagination';
import {
  darDeBajaDeporte,
  inscribirEnDeporte,
  listarDeportesDeAlumno,
  listarDeportesDisponibles,
} from './deportes.service';
import { horaAMinutos, minutosAHora } from './horarios';

const router = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });
const alumnoParam = z.object({ alumnoId: z.coerce.number().int().positive() });

/** Acepta "17:00" o 1020 y normaliza a minutos desde medianoche. */
const horaSchema = z.union([
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).transform(horaAMinutos),
  z.coerce.number().int().min(0).max(1440),
]);

// ------------------------------------------------------------------
// Catálogo
// ------------------------------------------------------------------

const catalogoQuerySchema = z.object({
  nivelId: z.coerce.number().int().positive().optional(),
  activo: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { nivelId, activo } = catalogoQuerySchema.parse(req.query);

    const deportes = await prisma.deporte.findMany({
      where: {
        activo: activo ?? true,
        ...(nivelId ? { horarios: { some: { nivelId, activo: true } } } : {}),
      },
      include: {
        profesorResponsable: { select: { id: true, apellido: true, nombres: true, especialidad: true } },
        horarios: {
          where: { activo: true, ...(nivelId ? { nivelId } : {}) },
          include: { nivel: { select: { id: true, nombre: true } } },
          orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
        },
        _count: { select: { inscripciones: { where: { estado: 'ACTIVA' } } } },
      },
      orderBy: { nombre: 'asc' },
    });

    res.json({
      exito: true,
      deportes: deportes.map((d) => ({
        ...d,
        arancelMensual: aNumero(d.arancelMensual),
        inscriptos: d._count.inscripciones,
        cupoDisponible: Math.max(0, d.cupoMaximo - d._count.inscripciones),
        horarios: d.horarios.map((h) => ({
          ...h,
          horaInicioTexto: minutosAHora(h.horaInicio),
          horaFinTexto: minutosAHora(h.horaFin),
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);

    const deporte = await prisma.deporte.findUnique({
      where: { id },
      include: {
        profesorResponsable: { select: { id: true, apellido: true, nombres: true, especialidad: true } },
        horarios: {
          include: {
            nivel: { select: { id: true, nombre: true } },
            profesor: { select: { id: true, apellido: true, nombres: true } },
          },
          orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
        },
      },
    });
    if (!deporte) throw HttpError.notFound('El deporte no existe.');

    res.json({
      exito: true,
      deporte: {
        ...deporte,
        arancelMensual: aNumero(deporte.arancelMensual),
        horarios: deporte.horarios.map((h) => ({
          ...h,
          horaInicioTexto: minutosAHora(h.horaInicio),
          horaFinTexto: minutosAHora(h.horaFin),
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// ABM del catálogo (ADMIN)
// ------------------------------------------------------------------

const crearDeporteSchema = z.object({
  nombre: z.string().trim().min(2).max(80),
  descripcion: z.string().trim().max(500).nullable().optional(),
  profesorResponsableId: z.coerce.number().int().positive(),
  arancelMensual: z.coerce.number().nonnegative(),
  cupoMaximo: z.coerce.number().int().positive().max(200).default(25),
});

router.post('/', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const body = crearDeporteSchema.parse(req.body);

    const profesor = await prisma.profesor.findUnique({ where: { id: body.profesorResponsableId } });
    if (!profesor) throw HttpError.notFound('El profesor responsable no existe.');
    if (profesor.estado !== 'ACTIVO') {
      throw HttpError.conflict('El profesor responsable no está activo.');
    }

    const duplicado = await prisma.deporte.findUnique({ where: { nombre: body.nombre } });
    if (duplicado) throw HttpError.conflict(`Ya existe un deporte llamado "${body.nombre}".`);

    const deporte = await prisma.deporte.create({ data: body });

    res.status(201).json({ exito: true, mensaje: 'Deporte creado.', deporte });
  } catch (err) {
    next(err);
  }
});

const crearHorarioSchema = z
  .object({
    nivelId: z.coerce.number().int().positive(),
    diaSemana: z.nativeEnum(DiaSemana),
    horaInicio: horaSchema,
    horaFin: horaSchema,
    lugar: z.string().trim().max(120).optional(),
    profesorId: z.coerce.number().int().positive().nullable().optional(),
    cupoMaximo: z.coerce.number().int().positive().max(200).optional(),
  })
  .refine((v) => v.horaFin > v.horaInicio, {
    message: 'La hora de fin debe ser posterior a la de inicio.',
    path: ['horaFin'],
  });

router.post('/:id/horarios', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const body = crearHorarioSchema.parse(req.body);

    const deporte = await prisma.deporte.findUnique({ where: { id } });
    if (!deporte) throw HttpError.notFound('El deporte no existe.');

    const nivel = await prisma.nivelEducativo.findUnique({ where: { id: body.nivelId } });
    if (!nivel) throw HttpError.notFound('El nivel educativo no existe.');

    const horario = await prisma.horarioDeporte.create({
      data: { ...body, deporteId: id, cupoMaximo: body.cupoMaximo ?? deporte.cupoMaximo },
      include: { nivel: { select: { id: true, nombre: true } } },
    });

    res.status(201).json({
      exito: true,
      mensaje: `Grupo de ${deporte.nombre} para ${nivel.nombre} creado.`,
      horario: {
        ...horario,
        horaInicioTexto: minutosAHora(horario.horaInicio),
        horaFinTexto: minutosAHora(horario.horaFin),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// Consulta por alumno
// ------------------------------------------------------------------

router.get('/alumno/:alumnoId', requireAuth, async (req, res, next) => {
  try {
    const { alumnoId } = alumnoParam.parse(req.params);
    await assertPuedeVerAlumno(prisma, req.authUser!, alumnoId);

    const resultado = await listarDeportesDeAlumno(prisma, alumnoId);

    res.json({
      exito: true,
      cupo: resultado.cupo,
      inscripciones: resultado.inscripciones.map((i) => ({
        ...i,
        deporte: {
          ...i.deporte,
          arancelMensual: aNumero(i.deporte.arancelMensual),
          horarios: i.deporte.horarios.map((h) => ({
            ...h,
            horaInicioTexto: minutosAHora(h.horaInicio),
            horaFinTexto: minutosAHora(h.horaFin),
          })),
        },
      })),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Catálogo anotado con el motivo por el que cada deporte no se puede tomar.
 * Permite que la UI muestre la opción deshabilitada con la explicación, en vez
 * de dejar que el tutor descubra el rechazo recién al enviar el formulario.
 */
router.get('/alumno/:alumnoId/disponibles', requireAuth, async (req, res, next) => {
  try {
    const { alumnoId } = alumnoParam.parse(req.params);
    await assertPuedeVerAlumno(prisma, req.authUser!, alumnoId);

    const deportes = await listarDeportesDisponibles(prisma, alumnoId);

    res.json({
      exito: true,
      deportes: deportes.map((d) => ({
        ...d,
        arancelMensual: aNumero(d.arancelMensual),
        horarios: d.horarios.map((h) => ({
          ...h,
          horaInicioTexto: minutosAHora(h.horaInicio),
          horaFinTexto: minutosAHora(h.horaFin),
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// Inscripción y baja
// ------------------------------------------------------------------

const inscribirSchema = z.object({
  alumnoId: z.coerce.number().int().positive(),
  deporteId: z.coerce.number().int().positive(),
  observacion: z.string().trim().max(500).nullable().optional(),
});

router.post(
  '/inscripciones',
  requireAuth,
  requireRole(Role.ADMIN, Role.PADRE),
  async (req, res, next) => {
    try {
      const body = inscribirSchema.parse(req.body);
      await assertPuedeVerAlumno(prisma, req.authUser!, body.alumnoId);

      const inscripcion = await inscribirEnDeporte(prisma, body);

      res.status(201).json({
        exito: true,
        mensaje: `Inscripción a ${inscripcion.deporte.nombre} confirmada.`,
        inscripcion: {
          ...inscripcion,
          deporte: { ...inscripcion.deporte, arancelMensual: aNumero(inscripcion.deporte.arancelMensual) },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/inscripciones/:id',
  requireAuth,
  requireRole(Role.ADMIN, Role.PADRE),
  async (req, res, next) => {
    try {
      const { id } = idParam.parse(req.params);

      const inscripcion = await prisma.inscripcionDeporte.findUnique({
        where: { id },
        select: { alumnoId: true },
      });
      if (!inscripcion) throw HttpError.notFound('La inscripción no existe.');

      await assertPuedeVerAlumno(prisma, req.authUser!, inscripcion.alumnoId);
      await darDeBajaDeporte(prisma, id);

      res.json({ exito: true, mensaje: 'Inscripción dada de baja. El cupo quedó liberado.' });
    } catch (err) {
      next(err);
    }
  },
);

export { router as deportesRouter };
