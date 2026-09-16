/**
 * Controlador REST de transporte escolar y comedor.
 *
 * Permisos:
 *   GET    /api/servicios/transporte/recorridos   autenticado
 *   POST   /api/servicios/transporte              ADMIN, PADRE (vinculado)
 *   DELETE /api/servicios/transporte/:id          ADMIN, PADRE (vinculado)
 *   GET    /api/servicios/comedor/planes          autenticado
 *   POST   /api/servicios/comedor                 ADMIN, PADRE (vinculado)
 *   DELETE /api/servicios/comedor/:id             ADMIN, PADRE (vinculado)
 *   GET    /api/servicios/alumno/:alumnoId        ADMIN, DOCENTE, PADRE (vinculado), el propio alumno
 */

import { Router } from 'express';
import { CodigoRecorrido, Role, TurnoTransporte } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../db/prisma';
import { HttpError } from '../../utils/httpError';
import { requireAuth, requireRole } from '../../middleware/auth';
import { assertPuedeVerAlumno } from '../shared/authz';
import { minutosAHora } from '../deportes/horarios';
import {
  darDeBajaComedor,
  darDeBajaTransporte,
  inscribirEnComedor,
  inscribirEnTransporte,
  listarPlanesComedor,
  listarRecorridos,
  serviciosDeAlumno,
} from './servicios.service';

const router = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });
const alumnoParam = z.object({ alumnoId: z.coerce.number().int().positive() });

const ahora = new Date();

const periodoSchema = z.object({
  anio: z.coerce.number().int().min(2025).max(2100).default(ahora.getFullYear()),
  mes: z.coerce.number().int().min(1).max(12).default(ahora.getMonth() + 1),
});

// ==================================================================
// TRANSPORTE
// ==================================================================

router.get('/transporte/recorridos', requireAuth, async (req, res, next) => {
  try {
    const { anio, mes } = periodoSchema.parse(req.query);
    const recorridos = await listarRecorridos(prisma, anio, mes);

    res.json({
      exito: true,
      periodo: { anio, mes },
      recorridos: recorridos.map((r) => ({
        ...r,
        horaSalidaTexto: minutosAHora(r.horaSalida),
        horaRegresoTexto: minutosAHora(r.horaRegreso),
      })),
    });
  } catch (err) {
    next(err);
  }
});

const inscribirTransporteSchema = z
  .object({
    alumnoId: z.coerce.number().int().positive(),
    recorridoId: z.coerce.number().int().positive().optional(),
    codigo: z.nativeEnum(CodigoRecorrido).optional(),
    turno: z.nativeEnum(TurnoTransporte).optional(),
  })
  .merge(periodoSchema)
  .refine((v) => v.recorridoId !== undefined || v.codigo !== undefined, {
    message: 'Indicá el recorrido por "recorridoId" o por "codigo" (R1 a R4).',
    path: ['recorridoId'],
  });

router.post('/transporte', requireAuth, requireRole(Role.ADMIN, Role.PADRE), async (req, res, next) => {
  try {
    const body = inscribirTransporteSchema.parse(req.body);
    await assertPuedeVerAlumno(prisma, req.authUser!, body.alumnoId);

    const inscripcion = await inscribirEnTransporte(prisma, body);

    res.status(201).json({
      exito: true,
      mensaje: `Transporte contratado: ${inscripcion.recorrido.nombre} para ${body.mes}/${body.anio}.`,
      inscripcion,
    });
  } catch (err) {
    next(err);
  }
});

router.delete(
  '/transporte/:id',
  requireAuth,
  requireRole(Role.ADMIN, Role.PADRE),
  async (req, res, next) => {
    try {
      const { id } = idParam.parse(req.params);

      const inscripcion = await prisma.inscripcionTransporte.findUnique({
        where: { id },
        select: { alumnoId: true },
      });
      if (!inscripcion) throw HttpError.notFound('La inscripción no existe.');

      await assertPuedeVerAlumno(prisma, req.authUser!, inscripcion.alumnoId);
      await darDeBajaTransporte(prisma, id);

      res.json({ exito: true, mensaje: 'Transporte dado de baja.' });
    } catch (err) {
      next(err);
    }
  },
);

// ==================================================================
// COMEDOR
// ==================================================================

router.get('/comedor/planes', requireAuth, async (req, res, next) => {
  try {
    const { anio, mes } = periodoSchema.parse(req.query);
    const planes = await listarPlanesComedor(prisma, anio, mes);

    res.json({
      exito: true,
      periodo: { anio, mes },
      planes: planes.map((p) => ({ ...p, horaServicioTexto: minutosAHora(p.horaServicio) })),
    });
  } catch (err) {
    next(err);
  }
});

const inscribirComedorSchema = z
  .object({
    alumnoId: z.coerce.number().int().positive(),
    comedorId: z.coerce.number().int().positive(),
  })
  .merge(periodoSchema);

router.post('/comedor', requireAuth, requireRole(Role.ADMIN, Role.PADRE), async (req, res, next) => {
  try {
    const body = inscribirComedorSchema.parse(req.body);
    await assertPuedeVerAlumno(prisma, req.authUser!, body.alumnoId);

    const inscripcion = await inscribirEnComedor(prisma, body);

    res.status(201).json({
      exito: true,
      mensaje: `Comedor contratado: ${inscripcion.comedor.nombre} para ${body.mes}/${body.anio}.`,
      inscripcion,
    });
  } catch (err) {
    next(err);
  }
});

router.delete(
  '/comedor/:id',
  requireAuth,
  requireRole(Role.ADMIN, Role.PADRE),
  async (req, res, next) => {
    try {
      const { id } = idParam.parse(req.params);

      const inscripcion = await prisma.inscripcionComedor.findUnique({
        where: { id },
        select: { alumnoId: true },
      });
      if (!inscripcion) throw HttpError.notFound('La inscripción no existe.');

      await assertPuedeVerAlumno(prisma, req.authUser!, inscripcion.alumnoId);
      await darDeBajaComedor(prisma, id);

      res.json({ exito: true, mensaje: 'Comedor dado de baja.' });
    } catch (err) {
      next(err);
    }
  },
);

// ==================================================================
// Vista consolidada
// ==================================================================

router.get('/alumno/:alumnoId', requireAuth, async (req, res, next) => {
  try {
    const { alumnoId } = alumnoParam.parse(req.params);
    const { anio, mes } = periodoSchema.parse(req.query);

    await assertPuedeVerAlumno(prisma, req.authUser!, alumnoId);

    res.json({ exito: true, ...(await serviciosDeAlumno(prisma, alumnoId, anio, mes)) });
  } catch (err) {
    next(err);
  }
});

export { router as serviciosRouter };
