/**
 * RF-07 y RF-08 — Avisos por mensajería y rastreo del transporte.
 *
 *   POST /api/avisos                        ADMIN, DOCENTE
 *   GET  /api/avisos                        ADMIN, DOCENTE
 *   POST /api/avisos/:id/reintentar         ADMIN
 *   POST /api/transporte/posicion           DOCENTE, ADMIN (dispositivo a bordo)
 *   GET  /api/transporte/:recorridoId/posicion   ADMIN, DOCENTE
 *   GET  /api/transporte/seguimiento/:alumnoId   validando vínculo
 */

import { Router } from 'express';
import { CanalMensaje, Role, TipoAviso } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../db/prisma';
import { HttpError } from '../../utils/httpError';
import { requireAuth, requireRole } from '../../middleware/auth';
import { assertPuedeVerAlumno } from '../shared/authz';
import { rateLimit } from '../shared/rateLimit';
import { emitirAviso, historialAvisos, reintentarFallidos } from '../avisos/avisos.service';
import {
  distanciaEnMetros,
  esCoordenadaValida,
  estaEnZonaDeCobertura,
  estadoRastreo,
  estimarMinutos,
  formatearDistancia,
  type Posicion,
} from './geolocalizacion';

/**
 * Coordenadas de la sede, sobre Av. 9 de Julio, Resistencia.
 * Sirven de referencia para informar a qué distancia viene el micro.
 */
const SEDE_COLEGIO = { latitud: -27.4512, longitud: -58.9866 };

const avisos = Router();
const transporte = Router();

// ==================================================================
// RF-07 — Avisos
// ==================================================================

const crearAvisoSchema = z
  .object({
    tipo: z.nativeEnum(TipoAviso),
    titulo: z.string().trim().min(4).max(120),
    cuerpo: z.string().trim().min(4).max(500),
    cursoId: z.coerce.number().int().positive().optional(),
    materiaId: z.coerce.number().int().positive().optional(),
    deporteId: z.coerce.number().int().positive().optional(),
    canal: z.nativeEnum(CanalMensaje).optional(),
  })
  .refine((v) => v.cursoId || v.materiaId || v.deporteId, {
    message: 'Indicá el alcance: un curso, una materia o un deporte.',
    path: ['cursoId'],
  });

avisos.post(
  '/',
  requireAuth,
  requireRole(Role.ADMIN, Role.DOCENTE),
  // Un aviso masivo cuesta dinero y molesta a las familias: no se manda a repetición.
  rateLimit({ max: 20, ventanaMs: 60 * 60 * 1000, mensaje: 'Demasiados avisos en la última hora.' }),
  async (req, res, next) => {
    try {
      const body = crearAvisoSchema.parse(req.body);

      const resultado = await emitirAviso(prisma, { ...body, creadoPorId: req.authUser!.id });

      res.status(201).json({
        exito: true,
        mensaje:
          `Aviso enviado a ${resultado.enviados} de ${resultado.destinatarios} destinatarios.` +
          (resultado.sinTelefono > 0
            ? ` ${resultado.sinTelefono} sin teléfono: se les envió correo.`
            : ''),
        ...resultado,
      });
    } catch (err) {
      next(err);
    }
  },
);

avisos.get('/', requireAuth, requireRole(Role.ADMIN, Role.DOCENTE), async (req, res, next) => {
  try {
    const limite = Number(req.query.limite ?? 50);
    const historial = await historialAvisos(prisma, Number.isFinite(limite) ? limite : 50);

    res.json({ exito: true, cantidad: historial.length, avisos: historial });
  } catch (err) {
    next(err);
  }
});

avisos.post('/:id/reintentar', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const r = await reintentarFallidos(prisma, id);

    res.json({
      exito: true,
      mensaje: `Se reintentaron ${r.reintentados} mensajes; ${r.enviados} salieron correctamente.`,
      ...r,
    });
  } catch (err) {
    next(err);
  }
});

// ==================================================================
// RF-08 — Posición del transporte
// ==================================================================

const posicionSchema = z.object({
  recorridoId: z.coerce.number().int().positive(),
  latitud: z.coerce.number().min(-90).max(90),
  longitud: z.coerce.number().min(-180).max(180),
  velocidad: z.coerce.number().min(0).max(200).optional(),
  precision: z.coerce.number().min(0).optional(),
  registradoEn: z.string().datetime().optional(),
  dispositivo: z.string().trim().max(80).optional(),
});

/**
 * Recibe la posición del dispositivo a bordo.
 *
 * Lo usa el teléfono del chofer. Se admite un `registradoEn` propio porque en
 * zonas sin cobertura el dispositivo encola las posiciones y las envía todas
 * juntas al recuperar señal: sin ese campo, todas quedarían con la hora de
 * recepción y el recorrido reconstruido sería falso.
 */
transporte.post(
  '/posicion',
  requireAuth,
  requireRole(Role.DOCENTE, Role.ADMIN),
  rateLimit({ max: 240, ventanaMs: 60 * 1000, mensaje: 'Demasiadas posiciones por minuto.' }),
  async (req, res, next) => {
    try {
      const body = posicionSchema.parse(req.body);

      if (!esCoordenadaValida(body)) {
        throw HttpError.badRequest('La coordenada informada no es válida.');
      }

      const recorrido = await prisma.recorridoTransporte.findUnique({
        where: { id: body.recorridoId },
      });
      if (!recorrido) throw HttpError.notFound('El recorrido no existe.');

      const fueraDeZona = !estaEnZonaDeCobertura(body);

      const posicion = await prisma.posicionTransporte.create({
        data: {
          recorridoId: body.recorridoId,
          latitud: body.latitud,
          longitud: body.longitud,
          velocidad: body.velocidad ?? null,
          precision: body.precision ?? null,
          registradoEn: body.registradoEn ? new Date(body.registradoEn) : new Date(),
          dispositivo: body.dispositivo ?? null,
        },
      });

      res.status(201).json({
        exito: true,
        posicionId: posicion.id,
        // Se acepta igual pero se avisa: puede ser un GPS con lectura errática.
        advertencia: fueraDeZona
          ? 'La coordenada cae fuera del Gran Resistencia. Revisá el dispositivo.'
          : null,
      });
    } catch (err) {
      next(err);
    }
  },
);

/** Última posición de un recorrido. Para el backoffice. */
transporte.get(
  '/:recorridoId/posicion',
  requireAuth,
  requireRole(Role.ADMIN, Role.DOCENTE),
  async (req, res, next) => {
    try {
      const recorridoId = z.coerce.number().int().positive().parse(req.params.recorridoId);

      const recorrido = await prisma.recorridoTransporte.findUnique({ where: { id: recorridoId } });
      if (!recorrido) throw HttpError.notFound('El recorrido no existe.');

      const ultima = await prisma.posicionTransporte.findFirst({
        where: { recorridoId },
        orderBy: { registradoEn: 'desc' },
      });

      const estado = estadoRastreo(recorrido.horaSalida, recorrido.horaRegreso, ultima);

      res.json({
        exito: true,
        recorrido: { id: recorrido.id, codigo: recorrido.codigo, nombre: recorrido.nombre },
        ...estado,
        posicion: ultima,
      });
    } catch (err) {
      next(err);
    }
  },
);

/**
 * Seguimiento para la familia.
 *
 * HU8 exige dos validaciones antes de mostrar nada: que el alumno sea hijo de
 * quien consulta, y que el recorrido sea **el que tiene contratado**. Un padre
 * no puede rastrear un micro que no es el de su hijo.
 */
transporte.get('/seguimiento/:alumnoId', requireAuth, async (req, res, next) => {
  try {
    const alumnoId = z.coerce.number().int().positive().parse(req.params.alumnoId);
    await assertPuedeVerAlumno(prisma, req.authUser!, alumnoId);

    const hoy = new Date();
    const inscripcion = await prisma.inscripcionTransporte.findUnique({
      where: {
        alumnoId_anio_mes: {
          alumnoId,
          anio: hoy.getFullYear(),
          mes: hoy.getMonth() + 1,
        },
      },
      include: { recorrido: true },
    });

    if (!inscripcion || inscripcion.estado !== 'ACTIVA') {
      res.json({
        exito: true,
        habilitado: false,
        estado: 'SIN_SERVICIO',
        mensaje: 'El alumno no tiene transporte contratado este mes.',
        recorrido: null,
        posicion: null,
      });
      return;
    }

    const { recorrido } = inscripcion;

    const ultima = await prisma.posicionTransporte.findFirst({
      where: { recorridoId: recorrido.id },
      orderBy: { registradoEn: 'desc' },
    });

    const posicion: Posicion | null = ultima
      ? {
          latitud: ultima.latitud,
          longitud: ultima.longitud,
          registradoEn: ultima.registradoEn,
          velocidad: ultima.velocidad,
        }
      : null;

    const { estado, mensaje } = estadoRastreo(recorrido.horaSalida, recorrido.horaRegreso, posicion);
    const habilitado = estado === 'EN_RECORRIDO';

    const alumno = await prisma.alumno.findUnique({
      where: { id: alumnoId },
      select: { domicilio: true, localidad: true },
    });

    // Distancia del micro al colegio. No se calcula contra el domicilio del
    // alumno porque el sistema guarda la dirección como texto y no sus
    // coordenadas: geocodificarla exigiría otra API y otro permiso. La
    // referencia al colegio ya le dice a la familia si el micro viene o vuelve.
    const distancia =
      habilitado && posicion
        ? (() => {
            const metros = distanciaEnMetros(posicion, SEDE_COLEGIO);
            return {
              metros,
              texto: formatearDistancia(metros),
              referencia: 'colegio',
              minutosEstimados: estimarMinutos(metros, posicion.velocidad),
            };
          })()
        : null;

    res.json({
      exito: true,
      habilitado,
      estado,
      mensaje,
      recorrido: {
        id: recorrido.id,
        codigo: recorrido.codigo,
        nombre: recorrido.nombre,
        zonas: recorrido.zonas,
        horaSalida: recorrido.horaSalida,
        horaRegreso: recorrido.horaRegreso,
        chofer: recorrido.choferNombre,
        patente: recorrido.patente,
      },
      // La posición sólo viaja si el rastreo está habilitado: fuera de la franja
      // no corresponde exponer dónde está el micro.
      posicion: habilitado && ultima
        ? {
            latitud: ultima.latitud,
            longitud: ultima.longitud,
            velocidad: ultima.velocidad,
            registradoEn: ultima.registradoEn,
          }
        : null,
      domicilio: alumno ? `${alumno.domicilio}, ${alumno.localidad}` : null,
      distancia,
    });
  } catch (err) {
    next(err);
  }
});

export { avisos as avisosRouter, transporte as transporteRouter };
