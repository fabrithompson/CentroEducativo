/**
 * Controlador REST del módulo Alumnos.
 *
 * Permisos:
 *   GET    /api/alumnos          ADMIN, DOCENTE — PADRE y ESTUDIANTE ven sólo lo suyo
 *   GET    /api/alumnos/:id      idem, validando vínculo
 *   POST   /api/alumnos          ADMIN
 *   PATCH  /api/alumnos/:id      ADMIN
 *   DELETE /api/alumnos/:id      ADMIN (baja lógica)
 *   POST   /api/alumnos/:id/tutores      ADMIN
 *   DELETE /api/alumnos/tutores/:id      ADMIN
 */

import { Router } from 'express';
import { EstadoAlumno, Role } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../db/prisma';
import { requireAuth, requireRole } from '../../middleware/auth';
import { assertPuedeVerAlumno, filtroAlumnosVisibles } from '../shared/authz';
import { paginacionSchema } from '../shared/pagination';
import {
  actualizarAlumno,
  crearAlumno,
  darDeBajaAlumno,
  desvincularTutor,
  listarAlumnos,
  obtenerAlumno,
  vincularTutor,
} from './alumnos.service';

const router = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });

const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado YYYY-MM-DD')
  .transform((v) => new Date(`${v}T00:00:00.000Z`));

// ------------------------------------------------------------------
// GET /api/alumnos
// ------------------------------------------------------------------

const listarQuerySchema = paginacionSchema.extend({
  busqueda: z.string().trim().min(1).max(80).optional(),
  cursoId: z.coerce.number().int().positive().optional(),
  nivelId: z.coerce.number().int().positive().optional(),
  estado: z.nativeEnum(EstadoAlumno).optional(),
});

router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { page, pageSize, ...filtros } = listarQuerySchema.parse(req.query);

    // El filtro de visibilidad se arma desde el rol, nunca desde la query:
    // un padre no puede ampliarlo mandando parámetros.
    const visibles = await filtroAlumnosVisibles(prisma, req.authUser!);

    const pagina = await listarAlumnos(prisma, { ...filtros, visibles }, { page, pageSize });

    res.json({ exito: true, ...pagina });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// GET /api/alumnos/:id
// ------------------------------------------------------------------

router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    await assertPuedeVerAlumno(prisma, req.authUser!, id);

    res.json({ exito: true, alumno: await obtenerAlumno(prisma, id) });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// POST /api/alumnos
// ------------------------------------------------------------------

const crearSchema = z.object({
  dni: z.string().trim().min(6).max(15),
  apellido: z.string().trim().min(2).max(80),
  nombres: z.string().trim().min(2).max(80),
  fechaNacimiento: fechaSchema,
  domicilio: z.string().trim().min(4).max(200),
  localidad: z.string().trim().max(80).optional(),
  provincia: z.string().trim().max(80).optional(),
  telefono: z.string().trim().max(30).nullable().optional(),
  email: z.string().email().nullable().optional(),
  cursoId: z.coerce.number().int().positive(),
  fechaIngreso: fechaSchema.optional(),
  observaciones: z.string().trim().max(1000).nullable().optional(),
  userId: z.coerce.number().int().positive().nullable().optional(),
});

router.post('/', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const alumno = await crearAlumno(prisma, crearSchema.parse(req.body));

    res.status(201).json({
      exito: true,
      mensaje: `Alumno dado de alta con legajo ${alumno.legajo}.`,
      alumno,
    });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// PATCH /api/alumnos/:id
// ------------------------------------------------------------------

const actualizarSchema = crearSchema
  .omit({ dni: true })
  .partial()
  .extend({ estado: z.nativeEnum(EstadoAlumno).optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'No se envió ningún campo para actualizar.' });

router.patch('/:id', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const alumno = await actualizarAlumno(prisma, id, actualizarSchema.parse(req.body));

    res.json({ exito: true, mensaje: 'Alumno actualizado.', alumno });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// DELETE /api/alumnos/:id  — baja lógica
// ------------------------------------------------------------------

const bajaSchema = z.object({
  estado: z.enum([EstadoAlumno.INACTIVO, EstadoAlumno.EGRESADO, EstadoAlumno.SUSPENDIDO]).optional(),
});

router.delete('/:id', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const { estado } = bajaSchema.parse(req.body ?? {});

    const alumno = await darDeBajaAlumno(prisma, id, estado ?? EstadoAlumno.INACTIVO);

    res.json({
      exito: true,
      mensaje: `El alumno pasó a estado ${alumno.estado}. Se dieron de baja sus inscripciones activas.`,
      alumno,
    });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// Vínculos tutor — alumno (sólo ADMIN)
// ------------------------------------------------------------------

const vincularSchema = z.object({
  tutorId: z.coerce.number().int().positive(),
  parentesco: z.string().trim().max(40).nullable().optional(),
  esResponsableFacturacion: z.coerce.boolean().optional(),
});

router.post('/:id/tutores', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const body = vincularSchema.parse(req.body);

    const vinculo = await vincularTutor(prisma, {
      ...body,
      alumnoId: id,
      creadoPorId: req.authUser!.id,
    });

    res.status(201).json({ exito: true, mensaje: 'Tutor vinculado al alumno.', vinculo });
  } catch (err) {
    next(err);
  }
});

router.delete('/tutores/:id', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    await desvincularTutor(prisma, id);

    res.json({ exito: true, mensaje: 'Vínculo eliminado.' });
  } catch (err) {
    next(err);
  }
});

export { router as alumnosRouter };
