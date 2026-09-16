/**
 * Carnet digital y control de acceso.
 *
 *   GET  /api/credenciales/alumno/:alumnoId   PADRE (vinculado), ADMIN — entrega el secreto
 *   POST /api/credenciales/alumno/:alumnoId/reemitir  PADRE (vinculado), ADMIN
 *   POST /api/credenciales/alumno/:alumnoId/revocar   ADMIN
 *   POST /api/accesos/escanear                DOCENTE, ADMIN
 *   GET  /api/accesos                          DOCENTE, ADMIN
 *   GET  /api/accesos/alumno/:alumnoId         validando vínculo
 */

import { Router } from 'express';
import { PuntoControl, Role } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../db/prisma';
import { HttpError } from '../../utils/httpError';
import { requireAuth, requireRole } from '../../middleware/auth';
import { assertPuedeVerAlumno } from '../shared/authz';
import { rateLimit } from '../shared/rateLimit';
import { historialAccesos, validarEscaneo } from './accesos.service';
import { DIGITOS, PERIODO_SEGUNDOS, generarSecreto } from './totp';

const credenciales = Router();
const accesos = Router();

const alumnoParam = z.object({ alumnoId: z.coerce.number().int().positive() });

// ==================================================================
// Credencial del alumno
// ==================================================================

/**
 * Entrega la credencial, creándola si es la primera vez.
 *
 * **Devuelve el secreto**: la app lo guarda en el almacenamiento seguro del
 * teléfono y con él genera los códigos sin conexión. Por eso el endpoint exige
 * sesión y verifica el vínculo tutor–alumno antes de responder: quien obtiene
 * este secreto puede generar credenciales válidas hasta que se revoque.
 */
credenciales.get(
  '/alumno/:alumnoId',
  requireAuth,
  requireRole(Role.PADRE, Role.ADMIN),
  async (req, res, next) => {
    try {
      const { alumnoId } = alumnoParam.parse(req.params);
      await assertPuedeVerAlumno(prisma, req.authUser!, alumnoId);

      const alumno = await prisma.alumno.findUnique({
        where: { id: alumnoId },
        include: { curso: { include: { nivel: true } } },
      });
      if (!alumno) throw HttpError.notFound('El alumno no existe.');

      let credencial = await prisma.credencialDigital.findUnique({ where: { alumnoId } });

      if (!credencial) {
        credencial = await prisma.credencialDigital.create({
          data: { alumnoId, secreto: generarSecreto(), emitidaPorId: req.authUser!.id },
        });
      }

      if (!credencial.activa) {
        throw HttpError.conflict(
          'La credencial fue dada de baja. Pedí una nueva desde "Reemitir credencial".',
        );
      }

      res.json({
        exito: true,
        credencial: {
          id: credencial.id,
          secreto: credencial.secreto,
          version: credencial.version,
          emitidaEn: credencial.emitidaEn,
          periodoSegundos: PERIODO_SEGUNDOS,
          digitos: DIGITOS,
        },
        alumno: {
          id: alumno.id,
          legajo: alumno.legajo,
          apellido: alumno.apellido,
          nombres: alumno.nombres,
          dni: alumno.dni,
          curso: `${alumno.curso.nombre} "${alumno.curso.division}"`,
          nivel: alumno.curso.nivel.nombre,
          estado: alumno.estado,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Reemite la credencial con un secreto nuevo.
 *
 * Es la respuesta a un teléfono perdido o robado: los códigos del dispositivo
 * anterior dejan de validar en el acto. Lo puede pedir el propio tutor, que es
 * quien primero se entera de que perdió el teléfono; no tiene sentido obligarlo
 * a esperar a que abra la secretaría.
 */
credenciales.post(
  '/alumno/:alumnoId/reemitir',
  requireAuth,
  requireRole(Role.PADRE, Role.ADMIN),
  rateLimit({ max: 5, ventanaMs: 60 * 60 * 1000, mensaje: 'Demasiadas reemisiones. Probá más tarde.' }),
  async (req, res, next) => {
    try {
      const { alumnoId } = alumnoParam.parse(req.params);
      await assertPuedeVerAlumno(prisma, req.authUser!, alumnoId);

      const credencial = await prisma.credencialDigital.upsert({
        where: { alumnoId },
        update: {
          secreto: generarSecreto(),
          version: { increment: 1 },
          activa: true,
          revocadaEn: null,
          motivoRevocacion: null,
          emitidaEn: new Date(),
          emitidaPorId: req.authUser!.id,
        },
        create: { alumnoId, secreto: generarSecreto(), emitidaPorId: req.authUser!.id },
      });

      res.json({
        exito: true,
        mensaje:
          'Credencial reemitida. Los códigos del dispositivo anterior dejaron de funcionar.',
        credencial: {
          id: credencial.id,
          secreto: credencial.secreto,
          version: credencial.version,
          emitidaEn: credencial.emitidaEn,
          periodoSegundos: PERIODO_SEGUNDOS,
          digitos: DIGITOS,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

const revocarSchema = z.object({ motivo: z.string().trim().min(5).max(300) });

credenciales.post(
  '/alumno/:alumnoId/revocar',
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res, next) => {
    try {
      const { alumnoId } = alumnoParam.parse(req.params);
      const { motivo } = revocarSchema.parse(req.body);

      const credencial = await prisma.credencialDigital.findUnique({ where: { alumnoId } });
      if (!credencial) throw HttpError.notFound('El alumno no tiene credencial emitida.');

      await prisma.credencialDigital.update({
        where: { alumnoId },
        data: { activa: false, revocadaEn: new Date(), motivoRevocacion: motivo },
      });

      res.json({ exito: true, mensaje: 'Credencial revocada.' });
    } catch (err) {
      next(err);
    }
  },
);

// ==================================================================
// Escaneo
// ==================================================================

const escanearSchema = z.object({
  qr: z.string().trim().min(1).max(200),
  punto: z.nativeEnum(PuntoControl),
  recorridoId: z.coerce.number().int().positive().optional(),
  dispositivo: z.string().trim().max(80).optional(),
});

/**
 * Valida un escaneo.
 *
 * Responde siempre 200, incluso cuando deniega: el lector necesita mostrar el
 * motivo en pantalla, y un 4xx lo obligaría a distinguir entre "denegado" y
 * "falló la conexión", que para el operador son situaciones muy distintas.
 * El campo `permitido` es el que manda.
 */
accesos.post(
  '/escanear',
  requireAuth,
  requireRole(Role.DOCENTE, Role.ADMIN),
  rateLimit({ max: 120, ventanaMs: 60 * 1000, mensaje: 'Demasiados escaneos por minuto.' }),
  async (req, res, next) => {
    try {
      const body = escanearSchema.parse(req.body);

      if (body.punto === PuntoControl.TRANSPORTE && !body.recorridoId) {
        throw HttpError.badRequest('Para el control de transporte hay que indicar el recorrido.');
      }

      const resultado = await validarEscaneo(prisma, {
        qr: body.qr,
        punto: body.punto,
        recorridoId: body.recorridoId,
        operadorId: req.authUser!.id,
        dispositivo: body.dispositivo,
      });

      res.json({ exito: true, ...resultado });
    } catch (err) {
      next(err);
    }
  },
);

const historialSchema = z.object({
  alumnoId: z.coerce.number().int().positive().optional(),
  punto: z.nativeEnum(PuntoControl).optional(),
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  hasta: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  soloRechazados: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  limite: z.coerce.number().int().positive().max(500).optional(),
});

accesos.get('/', requireAuth, requireRole(Role.DOCENTE, Role.ADMIN), async (req, res, next) => {
  try {
    const f = historialSchema.parse(req.query);

    const registros = await historialAccesos(prisma, {
      alumnoId: f.alumnoId,
      punto: f.punto,
      desde: f.desde ? new Date(`${f.desde}T00:00:00.000Z`) : undefined,
      hasta: f.hasta ? new Date(`${f.hasta}T23:59:59.999Z`) : undefined,
      soloRechazados: f.soloRechazados,
      limite: f.limite,
    });

    res.json({ exito: true, cantidad: registros.length, registros });
  } catch (err) {
    next(err);
  }
});

/** Historial de un alumno. El tutor ve el de sus hijos. */
accesos.get('/alumno/:alumnoId', requireAuth, async (req, res, next) => {
  try {
    const { alumnoId } = alumnoParam.parse(req.params);
    await assertPuedeVerAlumno(prisma, req.authUser!, alumnoId);

    const registros = await historialAccesos(prisma, { alumnoId, limite: 50 });

    res.json({ exito: true, cantidad: registros.length, registros });
  } catch (err) {
    next(err);
  }
});

export { credenciales as credencialesRouter, accesos as accesosRouter };
