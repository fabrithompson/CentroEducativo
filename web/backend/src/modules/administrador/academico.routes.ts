/**
 * Controlador REST del ABM académico: niveles, cursos y materias.
 *
 * Permisos:
 *   GET    /api/academico/...      cualquier sesión — son datos de catálogo que
 *                                  necesitan todos los paneles para armar sus
 *                                  desplegables (a qué curso inscribir, qué
 *                                  materia asignar).
 *   POST   /api/academico/...      ADMIN
 *   PATCH  /api/academico/...      ADMIN
 *   DELETE /api/academico/...      ADMIN (baja lógica)
 *
 * El catálogo se lee sin paginar: son decenas de filas, no miles, y los
 * desplegables las necesitan completas. Si la institución creciera al punto de
 * que eso deje de ser cierto, el corte natural es por `anioLectivo`, que ya es
 * un filtro de `GET /cursos`.
 */

import { Router } from 'express';
import { Role, Turno } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../db/prisma';
import { requireAuth, requireRole } from '../../middleware/auth';
import {
  actualizarCurso,
  actualizarMateria,
  actualizarNivel,
  crearCurso,
  crearMateria,
  crearNivel,
  darDeBajaCurso,
  darDeBajaMateria,
  darDeBajaNivel,
  listarCursos,
  listarMaterias,
  listarNiveles,
} from './academico.service';

const router = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** `?activo=false` tiene que llegar como booleano, no como la cadena "false". */
const booleanoQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

// Leer el catálogo lo puede hacer cualquier sesión; escribirlo, sólo un ADMIN.
// `requireAuth` ya se aplica a todo el router, así que acá sólo falta el rol.
router.use(requireAuth);

const soloAdmin = [requireRole(Role.ADMIN)] as const;

// ==================================================================
// Niveles
// ==================================================================

router.get('/niveles', async (req, res, next) => {
  try {
    const { activo } = z.object({ activo: booleanoQuery }).parse(req.query);
    res.json({ exito: true, niveles: await listarNiveles(prisma, { activo }) });
  } catch (err) {
    next(err);
  }
});

const nivelSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres.').max(60),
  orden: z.coerce.number().int().min(1, 'El orden arranca en 1.').max(99),
  descripcion: z.string().trim().max(300).nullable().optional(),
  cuotaMensual: z.coerce.number().min(0, 'La cuota no puede ser negativa.').optional(),
});

router.post('/niveles', ...soloAdmin, async (req, res, next) => {
  try {
    const nivel = await crearNivel(prisma, nivelSchema.parse(req.body));
    res.status(201).json({ exito: true, mensaje: 'Nivel creado.', nivel });
  } catch (err) {
    next(err);
  }
});

router.patch('/niveles/:id', ...soloAdmin, async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const nivel = await actualizarNivel(prisma, id, nivelSchema.partial().parse(req.body));
    res.json({ exito: true, mensaje: 'Nivel actualizado.', nivel });
  } catch (err) {
    next(err);
  }
});

router.delete('/niveles/:id', ...soloAdmin, async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const nivel = await darDeBajaNivel(prisma, id);
    res.json({ exito: true, mensaje: 'Nivel dado de baja.', nivel });
  } catch (err) {
    next(err);
  }
});

// ==================================================================
// Cursos
// ==================================================================

router.get('/cursos', async (req, res, next) => {
  try {
    const filtros = z
      .object({
        nivelId: z.coerce.number().int().positive().optional(),
        anioLectivo: z.coerce.number().int().min(2000).max(2100).optional(),
        turno: z.nativeEnum(Turno).optional(),
        activo: booleanoQuery,
      })
      .parse(req.query);

    res.json({ exito: true, cursos: await listarCursos(prisma, filtros) });
  } catch (err) {
    next(err);
  }
});

const cursoSchema = z.object({
  nivelId: z.coerce.number().int().positive(),
  nombre: z.string().trim().min(1, 'Indicá el nombre del curso.').max(60),
  division: z.string().trim().min(1).max(10).optional(),
  turno: z.nativeEnum(Turno).optional(),
  anioLectivo: z.coerce.number().int().min(2000).max(2100),
  cupoMaximo: z.coerce.number().int().min(1, 'El cupo mínimo es 1.').max(100).optional(),
});

router.post('/cursos', ...soloAdmin, async (req, res, next) => {
  try {
    const curso = await crearCurso(prisma, cursoSchema.parse(req.body));
    res.status(201).json({ exito: true, mensaje: 'Curso creado.', curso });
  } catch (err) {
    next(err);
  }
});

router.patch('/cursos/:id', ...soloAdmin, async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const curso = await actualizarCurso(prisma, id, cursoSchema.partial().parse(req.body));
    res.json({ exito: true, mensaje: 'Curso actualizado.', curso });
  } catch (err) {
    next(err);
  }
});

router.delete('/cursos/:id', ...soloAdmin, async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const curso = await darDeBajaCurso(prisma, id);
    res.json({ exito: true, mensaje: 'Curso dado de baja.', curso });
  } catch (err) {
    next(err);
  }
});

// ==================================================================
// Materias
// ==================================================================

router.get('/materias', async (req, res, next) => {
  try {
    const filtros = z
      .object({
        cursoId: z.coerce.number().int().positive().optional(),
        nivelId: z.coerce.number().int().positive().optional(),
        profesorId: z.coerce.number().int().positive().optional(),
        sinProfesor: booleanoQuery,
        activo: booleanoQuery,
      })
      .parse(req.query);

    res.json({ exito: true, materias: await listarMaterias(prisma, filtros) });
  } catch (err) {
    next(err);
  }
});

const materiaSchema = z.object({
  nombre: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres.').max(80),
  cursoId: z.coerce.number().int().positive(),
  profesorId: z.coerce.number().int().positive().nullable().optional(),
  cargaHoraria: z.coerce.number().int().min(1).max(20).optional(),
});

router.post('/materias', ...soloAdmin, async (req, res, next) => {
  try {
    const materia = await crearMateria(prisma, materiaSchema.parse(req.body));
    res.status(201).json({ exito: true, mensaje: 'Materia creada.', materia });
  } catch (err) {
    next(err);
  }
});

router.patch('/materias/:id', ...soloAdmin, async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const materia = await actualizarMateria(prisma, id, materiaSchema.partial().parse(req.body));
    res.json({ exito: true, mensaje: 'Materia actualizada.', materia });
  } catch (err) {
    next(err);
  }
});

router.delete('/materias/:id', ...soloAdmin, async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const materia = await darDeBajaMateria(prisma, id);
    res.json({ exito: true, mensaje: 'Materia dada de baja.', materia });
  } catch (err) {
    next(err);
  }
});

export { router as academicoRouter };
