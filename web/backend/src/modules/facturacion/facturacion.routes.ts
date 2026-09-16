/**
 * Controlador REST de facturación, comprobantes y tareas programadas.
 *
 *   GET    /api/facturacion/facturas                 ADMIN
 *   GET    /api/facturacion/facturas/:id             ADMIN, PADRE (vinculado)
 *   GET    /api/facturacion/facturas/:id/comprobante ADMIN, PADRE (vinculado) — factura simulada en HTML
 *   POST   /api/facturacion/facturas/:id/anular      ADMIN
 *   GET    /api/facturacion/previsualizar            ADMIN
 *   POST   /api/facturacion/generar                  ADMIN
 *   POST   /api/facturacion/comprobantes             PADRE (vinculado), ADMIN — multipart
 *   GET    /api/facturacion/comprobantes/pendientes  ADMIN
 *   POST   /api/facturacion/comprobantes/:id/validar ADMIN
 *   GET    /api/facturacion/tareas                   ADMIN
 *   POST   /api/facturacion/tareas/:tarea/ejecutar   ADMIN
 *   GET    /api/facturacion/emails                   ADMIN
 */

import { Router } from 'express';
import { EstadoFactura, Role, TipoTareaProgramada } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../db/prisma';
import { HttpError } from '../../utils/httpError';
import { requireAuth, requireRole } from '../../middleware/auth';
import { upload, publicUrlFor } from '../../middleware/upload';
import { assertPuedeVerAlumno } from '../shared/authz';
import { aNumero, paginacionSchema, redondear, toSkipTake, armarPagina } from '../shared/pagination';
import {
  anularFactura,
  generarFacturasDelPeriodo,
  obtenerFacturaCompleta,
  previsualizarFacturacion,
} from './facturacion.service';
import { comprobantesPendientes, subirComprobante, validarComprobante } from './comprobantes.service';
import { historialEnvios } from './mailer.facturacion';
import { facturaHtml } from './plantillas';
import { periodoDe } from './periodos';
import {
  ejecutarFacturacionMensual,
  ejecutarRecordatorioDeuda,
  estadoScheduler,
  marcarFacturasVencidas,
} from '../scheduler';

const router = Router();

const idParam = z.object({ id: z.coerce.number().int().positive() });

const ahora = new Date();
const periodoSchema = z.object({
  anio: z.coerce.number().int().min(2025).max(2100).default(ahora.getFullYear()),
  mes: z.coerce.number().int().min(1).max(12).default(ahora.getMonth() + 1),
});

// ==================================================================
// Facturas
// ==================================================================

const listarQuerySchema = paginacionSchema.extend({
  anio: z.coerce.number().int().min(2025).max(2100).optional(),
  mes: z.coerce.number().int().min(1).max(12).optional(),
  estado: z.nativeEnum(EstadoFactura).optional(),
  alumnoId: z.coerce.number().int().positive().optional(),
});

router.get('/facturas', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const { page, pageSize, ...filtros } = listarQuerySchema.parse(req.query);
    const where = {
      ...(filtros.anio ? { anio: filtros.anio } : {}),
      ...(filtros.mes ? { mes: filtros.mes } : {}),
      ...(filtros.estado ? { estado: filtros.estado } : {}),
      ...(filtros.alumnoId ? { alumnoId: filtros.alumnoId } : {}),
    };
    const { skip, take } = toSkipTake({ page, pageSize });

    const [facturas, total] = await Promise.all([
      prisma.factura.findMany({
        where,
        include: {
          alumno: { select: { id: true, legajo: true, apellido: true, nombres: true } },
          tutor: { select: { id: true, nombre: true, email: true } },
          _count: { select: { comprobantes: true } },
        },
        orderBy: [{ anio: 'desc' }, { mes: 'desc' }, { numero: 'asc' }],
        skip,
        take,
      }),
      prisma.factura.count({ where }),
    ]);

    const items = facturas.map((f) => ({
      ...f,
      subtotal: aNumero(f.subtotal),
      recargo: aNumero(f.recargo),
      total: aNumero(f.total),
      montoPagado: aNumero(f.montoPagado),
      saldo: redondear(aNumero(f.total) - aNumero(f.montoPagado)),
    }));

    res.json({ exito: true, ...armarPagina(items, total, { page, pageSize }) });
  } catch (err) {
    next(err);
  }
});

router.get('/facturas/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const factura = await obtenerFacturaCompleta(prisma, id);

    // Un tutor sólo ve las facturas de sus hijos.
    await assertPuedeVerAlumno(prisma, req.authUser!, factura.alumnoId);

    res.json({
      exito: true,
      factura: {
        ...factura,
        subtotal: aNumero(factura.subtotal),
        recargo: aNumero(factura.recargo),
        total: aNumero(factura.total),
        montoPagado: aNumero(factura.montoPagado),
        saldo: redondear(aNumero(factura.total) - aNumero(factura.montoPagado)),
        items: factura.items.map((i) => ({
          ...i,
          precioUnitario: aNumero(i.precioUnitario),
          subtotal: aNumero(i.subtotal),
        })),
        comprobantes: factura.comprobantes.map((c) => ({ ...c, monto: aNumero(c.monto) })),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Factura electrónica simulada, lista para imprimir o guardar como PDF. */
router.get('/facturas/:id/comprobante', requireAuth, async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const f = await obtenerFacturaCompleta(prisma, id);
    await assertPuedeVerAlumno(prisma, req.authUser!, f.alumnoId);

    const tutor = f.tutor ?? f.alumno.tutores[0]?.tutor ?? null;

    const html = facturaHtml({
      numero: f.numero,
      periodo: { anio: f.anio, mes: f.mes },
      fechaEmision: f.fechaEmision,
      fechaVencimiento: f.fechaVencimiento,
      alumno: `${f.alumno.apellido}, ${f.alumno.nombres}`,
      legajo: f.alumno.legajo,
      curso: `${f.alumno.curso.nombre} "${f.alumno.curso.division}"`,
      nivel: f.alumno.curso.nivel.nombre,
      tutor: tutor?.nombre ?? null,
      items: f.items.map((i) => ({
        tipo: i.tipo,
        descripcion: i.descripcion,
        cantidad: i.cantidad,
        precioUnitario: aNumero(i.precioUnitario),
        subtotal: aNumero(i.subtotal),
      })),
      subtotal: aNumero(f.subtotal),
      recargo: aNumero(f.recargo),
      total: aNumero(f.total),
      montoPagado: aNumero(f.montoPagado),
      estado: f.estado,
    });

    res.type('html').send(html);
  } catch (err) {
    next(err);
  }
});

const anularSchema = z.object({ motivo: z.string().trim().min(5).max(500) });

router.post('/facturas/:id/anular', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = idParam.parse(req.params);
    const { motivo } = anularSchema.parse(req.body);

    const factura = await anularFactura(prisma, id, motivo);

    res.json({ exito: true, mensaje: `Factura ${factura.numero} anulada.`, factura });
  } catch (err) {
    next(err);
  }
});

// ==================================================================
// Generación
// ==================================================================

router.get('/previsualizar', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const periodo = periodoSchema.parse(req.query);
    res.json({ exito: true, ...(await previsualizarFacturacion(prisma, periodo)) });
  } catch (err) {
    next(err);
  }
});

const generarSchema = periodoSchema.extend({
  alumnoIds: z.array(z.coerce.number().int().positive()).optional(),
});

router.post('/generar', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const { anio, mes, alumnoIds } = generarSchema.parse(req.body ?? {});

    const resultado = await generarFacturasDelPeriodo(prisma, { anio, mes }, { alumnoIds });

    res.status(201).json({
      exito: true,
      mensaje:
        `${resultado.generadas} facturas generadas. ` +
        `${resultado.omitidas} ya existían y ${resultado.sinCargos} alumnos no tenían cargos.`,
      ...resultado,
    });
  } catch (err) {
    next(err);
  }
});

// ==================================================================
// Comprobantes de transferencia
// ==================================================================

const subirSchema = z.object({
  facturaId: z.coerce.number().int().positive(),
  monto: z.coerce.number().positive('El importe debe ser mayor a cero.'),
  fechaTransferencia: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado YYYY-MM-DD')
    .transform((v) => new Date(`${v}T00:00:00.000Z`)),
  bancoOrigen: z.string().trim().min(2).max(80),
  numeroOperacion: z.string().trim().min(3).max(60),
});

router.post(
  '/comprobantes',
  requireAuth,
  requireRole(Role.PADRE, Role.ADMIN),
  upload.single('comprobante'),
  async (req, res, next) => {
    try {
      // Regla de negocio: no se acepta efectivo. Sin archivo adjunto no hay pago.
      if (!req.file) {
        throw HttpError.badRequest(
          'Adjuntá el comprobante de la transferencia. No se aceptan pagos sin respaldo.',
        );
      }

      const body = subirSchema.parse(req.body);

      const factura = await prisma.factura.findUnique({
        where: { id: body.facturaId },
        select: { alumnoId: true },
      });
      if (!factura) throw HttpError.notFound('La factura no existe.');

      await assertPuedeVerAlumno(prisma, req.authUser!, factura.alumnoId);

      const resultado = await subirComprobante(prisma, {
        ...body,
        subidoPorId: req.authUser!.id,
        archivoUrl: publicUrlFor(req.file.filename),
      });

      res.status(201).json({
        exito: true,
        mensaje:
          'Comprobante recibido. Administración lo va a validar y vas a recibir la confirmación.',
        comprobante: { ...resultado.comprobante, monto: aNumero(resultado.comprobante.monto) },
        advertencia: resultado.advertencia,
      });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/comprobantes/pendientes',
  requireAuth,
  requireRole(Role.ADMIN),
  async (_req, res, next) => {
    try {
      const pendientes = await comprobantesPendientes(prisma);

      res.json({
        exito: true,
        cantidad: pendientes.length,
        montoTotal: redondear(pendientes.reduce((s, c) => s + c.monto, 0)),
        comprobantes: pendientes,
      });
    } catch (err) {
      next(err);
    }
  },
);

const validarSchema = z
  .object({
    aprobar: z.coerce.boolean(),
    motivoRechazo: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.aprobar || Boolean(v.motivoRechazo?.trim()), {
    message: 'Para rechazar un comprobante hay que indicar el motivo.',
    path: ['motivoRechazo'],
  });

router.post(
  '/comprobantes/:id/validar',
  requireAuth,
  requireRole(Role.ADMIN),
  async (req, res, next) => {
    try {
      const { id } = idParam.parse(req.params);
      const body = validarSchema.parse(req.body);

      const resultado = await validarComprobante(prisma, {
        comprobanteId: id,
        validadoPorId: req.authUser!.id,
        aprobar: body.aprobar,
        motivoRechazo: body.motivoRechazo,
      });

      res.json({
        exito: true,
        mensaje: body.aprobar
          ? `Pago acreditado. La factura quedó en estado ${resultado.factura?.estado}.`
          : 'Comprobante rechazado. Se notificó a la familia.',
        ...resultado,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ==================================================================
// Tareas programadas
// ==================================================================

router.get('/tareas', requireAuth, requireRole(Role.ADMIN), async (_req, res, next) => {
  try {
    const ejecuciones = await prisma.ejecucionTarea.findMany({
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
      take: 24,
    });

    res.json({ exito: true, scheduler: estadoScheduler(), ejecuciones });
  } catch (err) {
    next(err);
  }
});

const tareaParam = z.object({ tarea: z.nativeEnum(TipoTareaProgramada) });
const ejecutarSchema = periodoSchema.partial().extend({ forzar: z.coerce.boolean().optional() });

/**
 * Disparo manual de una tarea desde el backoffice.
 *
 * Existe por dos motivos: permitir demostrarlas en la defensa sin esperar al
 * último día hábil, y poder reintentar una corrida que falló. La idempotencia
 * sigue vigente: sin `forzar`, una tarea ya completada no se repite.
 */
router.post('/tareas/:tarea/ejecutar', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const { tarea } = tareaParam.parse(req.params);
    const body = ejecutarSchema.parse(req.body ?? {});

    const periodo =
      body.anio && body.mes ? { anio: body.anio, mes: body.mes } : periodoDe(new Date());

    const opciones = {
      periodo,
      forzar: body.forzar ?? false,
      manual: true,
      ejecutadaPorId: req.authUser!.id,
    };

    const resultado =
      tarea === TipoTareaProgramada.FACTURACION_MENSUAL
        ? await ejecutarFacturacionMensual(prisma, opciones)
        : await ejecutarRecordatorioDeuda(prisma, opciones);

    if (resultado === null) {
      res.json({
        exito: true,
        omitida: true,
        mensaje:
          `La tarea ${tarea} ya se ejecutó para ese período. ` +
          'Usá "forzar" si necesitás repetirla.',
      });
      return;
    }

    res.json({ exito: true, omitida: false, tarea, resultado });
  } catch (err) {
    next(err);
  }
});

router.post('/tareas/marcar-vencidas', requireAuth, requireRole(Role.ADMIN), async (_req, res, next) => {
  try {
    const actualizadas = await marcarFacturasVencidas(prisma);
    res.json({ exito: true, mensaje: `${actualizadas} facturas pasaron a VENCIDA.`, actualizadas });
  } catch (err) {
    next(err);
  }
});

// ==================================================================
// Auditoría de correos
// ==================================================================

const emailsQuerySchema = z.object({
  tipo: z.string().trim().max(60).optional(),
  destino: z.string().trim().max(120).optional(),
  ejecucionId: z.coerce.number().int().positive().optional(),
  limite: z.coerce.number().int().positive().max(500).optional(),
});

router.get('/emails', requireAuth, requireRole(Role.ADMIN), async (req, res, next) => {
  try {
    const filtros = emailsQuerySchema.parse(req.query);
    const envios = await historialEnvios(prisma, filtros);

    res.json({ exito: true, cantidad: envios.length, envios });
  } catch (err) {
    next(err);
  }
});

export { router as facturacionRouter };
