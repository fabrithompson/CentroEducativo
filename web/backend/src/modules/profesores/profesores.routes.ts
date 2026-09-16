/**
 * Controlador REST del módulo Profesores.
 *
 * Permisos:
 *   GET    /api/profesores              ADMIN, DOCENTE
 *   GET    /api/profesores/:id          ADMIN, DOCENTE
 *   POST   /api/profesores              ADMIN
 *   PATCH  /api/profesores/:id          ADMIN
 *   DELETE /api/profesores/:id          ADMIN (baja lógica)
 *   POST   /api/profesores/:id/materias ADMIN
 *   DELETE /api/profesores/materias/:id ADMIN
 *
 * Los padres y estudiantes no acceden al legajo docente: no hay motivo para que
 * vean DNI, domicilio ni teléfono del personal.
 */

import { Router } from 'express';
import { EstadoProfesor, Role } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../db/prisma';
import { requireAuth, requireRole } from '../../middleware/auth';
import { paginacionSchema } from '../shared/pagination';
import {
  actualizarProfesor,
  asignarMateria,
  crearProfesor,
  darDeBajaProfesor,
  listarProfesores,
  obtenerProfesor,
  quitarMateria,
} from './profesores.service';

const router = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });

const fechaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado YYYY-MM-DD')
  .transform((v) => new Date(`${v}T00:00:00.000Z`));

const listarQuerySchema = paginacionSchema.extend({
  busqueda: z.string().trim().min(1).max(80).optional(),
  especialidad: z.string().trim().min(1).max(80).optional(),
  estado: z.nativeEnum(EstadoProfesor).optional(),
  cursoId: z.coerce.number().int().positive().optional(),
});

router.get('/', requireAuth, requireRole(Role.ADMIN, Role.DOCENTE), async (req, res, next) => {
  try {
    const { page, pageSize, ...filtros } = listarQuerySchema.parse(req.query);
    const pagina = await listarProfesores(prisma, filtros, { page, pageSize });

    res.json({ exito: true, ...pagina });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', requireAuth, requireRole(Role.ADMIN, Role.DOCENTE), async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    res.json({ exito: true, profesor: await obtenerProfesor(prisma, id) });
  } catch (err) {
    next(err);
  }
});

const crearSchema = z.object({
  dni: z.string().trim().min(6).max(15),
  apellido: z.string().trim().min(2).max(80),
  nombres: z.string().trim().min(2).max(80),
  especialidad: z.string().trim().min(2).max(120),
  email: z.string().email(),
  telefono: z.string().trim().max(30).nullable().optional(),
  domicilio: z.string().trim().max(200).nullable().optional(),
  fechaIngreso: fechaSchema.optional(),
  userId: z.coerce.number().int().positive().nullable().optional(),
});

router.post('/', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const profesor = await crearProfesor(prisma, crearSchema.parse(req.body));

    res.status(201).json({
      exito: true,
      mensaje: `Profesor dado de alta con legajo ${profesor.legajo}.`,
      profesor,
    });
  } catch (err) {
    next(err);
  }
});

const actualizarSchema = crearSchema
  .omit({ dni: true })
  .partial()
  .extend({ estado: z.nativeEnum(EstadoProfesor).optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'No se envió ningún campo para actualizar.' });

router.patch('/:id', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const profesor = await actualizarProfesor(prisma, id, actualizarSchema.parse(req.body));

    res.json({ exito: true, mensaje: 'Profesor actualizado.', profesor });
  } catch (err) {
    next(err);
  }
});

const bajaSchema = z.object({
  estado: z.enum([EstadoProfesor.INACTIVO, EstadoProfesor.LICENCIA]).optional(),
});

router.delete('/:id', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const { estado } = bajaSchema.parse(req.body ?? {});

    const profesor = await darDeBajaProfesor(prisma, id, estado ?? EstadoProfesor.INACTIVO);

    res.json({ exito: true, mensaje: `El profesor pasó a estado ${profesor.estado}.`, profesor });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// Materias a cargo
// ------------------------------------------------------------------

const asignarSchema = z.object({ materiaId: z.coerce.number().int().positive() });

router.post('/:id/materias', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const { materiaId } = asignarSchema.parse(req.body);

    const materia = await asignarMateria(prisma, id, materiaId);

    res.json({ exito: true, mensaje: `"${materia.nombre}" asignada al profesor.`, materia });
  } catch (err) {
    next(err);
  }
});

router.delete('/materias/:id', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const materia = await quitarMateria(prisma, id);

    res.json({ exito: true, mensaje: `"${materia.nombre}" quedó sin docente asignado.`, materia });
  } catch (err) {
    next(err);
  }
});

export { router as profesoresRouter };
