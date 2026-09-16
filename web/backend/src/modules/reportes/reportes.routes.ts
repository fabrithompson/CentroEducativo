/**
 * Controlador REST de reportes administrativos.
 *
 * Todo el router es exclusivo de ADMIN: estos reportes cruzan información de
 * todas las familias del colegio.
 *
 *   GET /api/reportes/alumnos-por-deporte     ?deporteId&nivelId&diaSemana&profesorId
 *   GET /api/reportes/alumnos-por-transporte  ?recorridoId|codigo&anio&mes
 *   GET /api/reportes/pagos                   ?anio&mes&nivelId&cursoId&alumnoId
 *   GET /api/reportes/ingresos                ?desde&hasta&alumnoId&nivelId
 *   GET /api/reportes/morosidad               ?nivelId&anio
 */

import { Router } from 'express';
import { CodigoRecorrido, DiaSemana, Role } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../db/prisma';
import { requireAuth, requireRole } from '../../middleware/auth';
import { rangoFechasSchema } from '../shared/pagination';
import {
  alumnosPorDeporte,
  alumnosPorMateria,
  alumnosPorRecorrido,
  reporteIngresos,
  reporteMorosidad,
  reportePagos,
} from './reportes.service';

const router = Router();

router.use(requireAuth, requireRole(Role.ADMIN));

const ahora = new Date();
const booleano = z.enum(['true', 'false']).transform((v) => v === 'true').optional();

// ------------------------------------------------------------------
// Alumnos por deporte / nivel / horario / docente
// ------------------------------------------------------------------

const deporteQuerySchema = z.object({
  deporteId: z.coerce.number().int().positive().optional(),
  nivelId: z.coerce.number().int().positive().optional(),
  diaSemana: z.nativeEnum(DiaSemana).optional(),
  profesorId: z.coerce.number().int().positive().optional(),
  incluirBajas: booleano,
});

router.get('/alumnos-por-deporte', async (req, res, next) => {
  try {
    const filtros = deporteQuerySchema.parse(req.query);
    const reporte = await alumnosPorDeporte(prisma, filtros);

    res.json({ exito: true, reporte: 'alumnos-por-deporte', ...reporte });
  } catch (err) {
    next(err);
  }
});


// ------------------------------------------------------------------
// RF-06 — Alumnos por materia
// ------------------------------------------------------------------

const materiaQuerySchema = z.object({
  materiaId: z.coerce.number().int().positive().optional(),
  cursoId: z.coerce.number().int().positive().optional(),
  nivelId: z.coerce.number().int().positive().optional(),
  profesorId: z.coerce.number().int().positive().optional(),
});

router.get('/alumnos-por-materia', async (req, res, next) => {
  try {
    const filtros = materiaQuerySchema.parse(req.query);
    const reporte = await alumnosPorMateria(prisma, filtros);

    res.json({ exito: true, reporte: 'alumnos-por-materia', ...reporte });
  } catch (err) {
    next(err);
  }
});
// ------------------------------------------------------------------
// Alumnos por recorrido de transporte
// ------------------------------------------------------------------

const transporteQuerySchema = z.object({
  recorridoId: z.coerce.number().int().positive().optional(),
  codigo: z.nativeEnum(CodigoRecorrido).optional(),
  anio: z.coerce.number().int().min(2025).max(2100).default(ahora.getFullYear()),
  mes: z.coerce.number().int().min(1).max(12).default(ahora.getMonth() + 1),
  incluirBajas: booleano,
});

router.get('/alumnos-por-transporte', async (req, res, next) => {
  try {
    const filtros = transporteQuerySchema.parse(req.query);
    const reporte = await alumnosPorRecorrido(prisma, filtros);

    res.json({ exito: true, reporte: 'alumnos-por-transporte', ...reporte });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// Pagos completos e incompletos
// ------------------------------------------------------------------

const pagosQuerySchema = z.object({
  anio: z.coerce.number().int().min(2025).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  nivelId: z.coerce.number().int().positive().optional(),
  cursoId: z.coerce.number().int().positive().optional(),
  alumnoId: z.coerce.number().int().positive().optional(),
});

router.get('/pagos', async (req, res, next) => {
  try {
    const filtros = pagosQuerySchema.parse(req.query);
    const reporte = await reportePagos(prisma, filtros);

    res.json({ exito: true, reporte: 'pagos', ...reporte });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// Ingresos por rango de fechas, por año y por alumno
// ------------------------------------------------------------------

const ingresosQuerySchema = rangoFechasSchema.innerType().extend({
  alumnoId: z.coerce.number().int().positive().optional(),
  nivelId: z.coerce.number().int().positive().optional(),
});

router.get('/ingresos', async (req, res, next) => {
  try {
    const parsed = ingresosQuerySchema.parse(req.query);

    // Se revalida el rango con el refinamiento del schema compartido.
    rangoFechasSchema.parse({ desde: parsed.desde, hasta: parsed.hasta });

    const reporte = await reporteIngresos(prisma, parsed);

    res.json({ exito: true, reporte: 'ingresos', ...reporte });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// Morosidad
// ------------------------------------------------------------------

const morosidadQuerySchema = z.object({
  nivelId: z.coerce.number().int().positive().optional(),
  anio: z.coerce.number().int().min(2025).max(2100).optional(),
});

router.get('/morosidad', async (req, res, next) => {
  try {
    const filtros = morosidadQuerySchema.parse(req.query);
    const reporte = await reporteMorosidad(prisma, filtros);

    res.json({ exito: true, reporte: 'morosidad', ...reporte });
  } catch (err) {
    next(err);
  }
});

export { router as reportesRouter };
