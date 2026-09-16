/**
 * Controlador REST del portal de tutores: `/api/padres/...`
 *
 * Toda ruta de este router cumple dos condiciones, sin excepción:
 *   1. Exige rol PADRE (`requireRole` a nivel de router).
 *   2. Si recibe un `:alumnoId`, lo pasa por `assertPuedeVerAlumno`, que
 *      verifica el vínculo en `TutorAlumno` antes de devolver un solo dato.
 *
 * El middleware `cargarHijo` centraliza esa verificación: ningún handler de
 * abajo consulta la base con un `alumnoId` que no haya pasado por él. Es
 * deliberado — la regla "los padres SOLO ven a sus hijos" no puede depender de
 * que cada endpoint nuevo se acuerde de chequearla.
 */

import { Router, type RequestHandler } from 'express';
import { EstadoInscripcion, Role } from '@prisma/client';
import { z } from 'zod';

import { prisma } from '../../db/prisma';
import { HttpError } from '../../utils/httpError';
import { requireAuth, requireRole } from '../../middleware/auth';
import { assertPuedeVerAlumno } from '../shared/authz';
import { aNumero, filtroFecha, rangoFechasSchema } from '../shared/pagination';
import { minutosAHora } from '../deportes/horarios';
import { serviciosDeAlumno } from '../servicios/servicios.service';

const router = Router();

// Todo el router es exclusivo de tutores autenticados.
router.use(requireAuth, requireRole(Role.PADRE));

const alumnoParam = z.object({ alumnoId: z.coerce.number().int().positive() });

const ahora = new Date();
const periodoSchema = z.object({
  anio: z.coerce.number().int().min(2025).max(2100).default(ahora.getFullYear()),
  mes: z.coerce.number().int().min(1).max(12).default(ahora.getMonth() + 1),
});

/**
 * Resuelve `:alumnoId` verificando el vínculo tutor-alumno y lo deja en
 * `res.locals.alumnoId`. Si el alumno no es hijo del tutor, corta acá con 404.
 */
const cargarHijo: RequestHandler = async (req, res, next) => {
  try {
    const { alumnoId } = alumnoParam.parse(req.params);
    await assertPuedeVerAlumno(prisma, req.authUser!, alumnoId);

    res.locals.alumnoId = alumnoId;
    next();
  } catch (err) {
    next(err);
  }
};

const hijoId = (res: { locals: Record<string, unknown> }): number => res.locals.alumnoId as number;

// ------------------------------------------------------------------
// GET /api/padres/mis-hijos
// ------------------------------------------------------------------

router.get('/mis-hijos', async (req, res, next) => {
  try {
    const vinculos = await prisma.tutorAlumno.findMany({
      where: { tutorId: req.authUser!.id },
      include: {
        alumno: {
          include: {
            curso: { include: { nivel: { select: { id: true, nombre: true } } } },
            user: { select: { id: true, usuario: true } },
          },
        },
      },
      orderBy: { alumno: { apellido: 'asc' } },
    });

    res.json({
      exito: true,
      hijos: vinculos.map((v) => ({
        vinculoId: v.id,
        parentesco: v.parentesco,
        esResponsableFacturacion: v.esResponsableFacturacion,
        alumno: v.alumno,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// GET /api/padres/mis-hijos/:alumnoId
// ------------------------------------------------------------------

router.get('/mis-hijos/:alumnoId', cargarHijo, async (_req, res, next) => {
  try {
    const alumno = await prisma.alumno.findUnique({
      where: { id: hijoId(res) },
      include: {
        curso: { include: { nivel: true, materias: { include: { profesor: true } } } },
        user: { select: { id: true, usuario: true, email: true } },
      },
    });

    res.json({ exito: true, alumno });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// GET /api/padres/mis-hijos/:alumnoId/deportes
// ------------------------------------------------------------------

router.get('/mis-hijos/:alumnoId/deportes', cargarHijo, async (_req, res, next) => {
  try {
    const inscripciones = await prisma.inscripcionDeporte.findMany({
      where: { alumnoId: hijoId(res), estado: EstadoInscripcion.ACTIVA },
      include: {
        deporte: {
          include: {
            profesorResponsable: { select: { apellido: true, nombres: true } },
            horarios: { where: { activo: true }, include: { nivel: { select: { nombre: true } } } },
          },
        },
      },
      orderBy: { slot: 'asc' },
    });

    res.json({
      exito: true,
      cupo: { usado: inscripciones.length, maximo: 2 },
      deportes: inscripciones.map((i) => ({
        inscripcionId: i.id,
        slot: i.slot,
        fechaAlta: i.fechaAlta,
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

// ------------------------------------------------------------------
// GET /api/padres/mis-hijos/:alumnoId/servicios
// ------------------------------------------------------------------

router.get('/mis-hijos/:alumnoId/servicios', cargarHijo, async (req, res, next) => {
  try {
    const { anio, mes } = periodoSchema.parse(req.query);
    res.json({ exito: true, ...(await serviciosDeAlumno(prisma, hijoId(res), anio, mes)) });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// GET /api/padres/mis-hijos/:alumnoId/facturas
// ------------------------------------------------------------------

const facturasQuerySchema = z
  .object({
    estado: z.string().trim().optional(),
    anio: z.coerce.number().int().min(2025).max(2100).optional(),
  })
  .merge(rangoFechasSchema.innerType());

router.get('/mis-hijos/:alumnoId/facturas', cargarHijo, async (req, res, next) => {
  try {
    const q = facturasQuerySchema.parse(req.query);
    const fecha = filtroFecha(q);

    const facturas = await prisma.factura.findMany({
      where: {
        alumnoId: hijoId(res),
        ...(q.anio ? { anio: q.anio } : {}),
        ...(fecha ? { fechaEmision: fecha } : {}),
      },
      include: {
        items: { orderBy: { tipo: 'asc' } },
        comprobantes: {
          select: {
            id: true,
            monto: true,
            fechaTransferencia: true,
            bancoOrigen: true,
            numeroOperacion: true,
            estado: true,
            motivoRechazo: true,
            archivoUrl: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: [{ anio: 'desc' }, { mes: 'desc' }],
    });

    const conNumeros = facturas.map((f) => ({
      ...f,
      subtotal: aNumero(f.subtotal),
      recargo: aNumero(f.recargo),
      total: aNumero(f.total),
      montoPagado: aNumero(f.montoPagado),
      saldo: aNumero(f.total) - aNumero(f.montoPagado),
      items: f.items.map((i) => ({
        ...i,
        precioUnitario: aNumero(i.precioUnitario),
        subtotal: aNumero(i.subtotal),
      })),
      comprobantes: f.comprobantes.map((c) => ({ ...c, monto: aNumero(c.monto) })),
    }));

    const deudaTotal = conNumeros
      .filter((f) => f.estado !== 'PAGADA' && f.estado !== 'ANULADA')
      .reduce((s, f) => s + f.saldo, 0);

    res.json({
      exito: true,
      facturas: conNumeros,
      resumen: {
        cantidad: conNumeros.length,
        deudaTotal,
        vencidas: conNumeros.filter((f) => f.estado === 'VENCIDA').length,
        enRevision: conNumeros.filter((f) => f.estado === 'EN_REVISION').length,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// GET /api/padres/mis-hijos/:alumnoId/deuda
// Historial de deuda discriminado por ítem, como pide la consigna.
// ------------------------------------------------------------------

router.get('/mis-hijos/:alumnoId/deuda', cargarHijo, async (_req, res, next) => {
  try {
    const facturas = await prisma.factura.findMany({
      where: { alumnoId: hijoId(res), estado: { notIn: ['PAGADA', 'ANULADA'] } },
      include: { items: true },
      orderBy: [{ anio: 'asc' }, { mes: 'asc' }],
    });

    // Se prorratea el saldo impago de cada factura entre sus ítems, en
    // proporción al peso de cada uno sobre el total. Es la única forma honesta
    // de decir "de esta deuda, tanto es comedor": un pago parcial no se imputa
    // a un ítem puntual, se aplica a la factura entera.
    const porTipo = new Map<string, { facturado: number; adeudado: number }>();

    for (const f of facturas) {
      const total = aNumero(f.total);
      const saldo = total - aNumero(f.montoPagado);
      if (total <= 0) continue;

      for (const item of f.items) {
        const sub = aNumero(item.subtotal);
        const actual = porTipo.get(item.tipo) ?? { facturado: 0, adeudado: 0 };
        actual.facturado += sub;
        actual.adeudado += saldo * (sub / total);
        porTipo.set(item.tipo, actual);
      }
    }

    const detalle = [...porTipo.entries()]
      .map(([tipo, v]) => ({
        tipo,
        facturado: Math.round(v.facturado * 100) / 100,
        adeudado: Math.round(v.adeudado * 100) / 100,
      }))
      .sort((a, b) => b.adeudado - a.adeudado);

    res.json({
      exito: true,
      deudaPorItem: detalle,
      deudaTotal: Math.round(detalle.reduce((s, d) => s + d.adeudado, 0) * 100) / 100,
      facturasImpagas: facturas.length,
      nota: 'El importe adeudado por ítem se prorratea sobre el saldo de cada factura.',
    });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// GET /api/padres/mis-hijos/:alumnoId/calificaciones
// GET /api/padres/mis-hijos/:alumnoId/asistencia
// ------------------------------------------------------------------

/**
 * Las notas y la asistencia siguen colgando de `User` (modelo del bloque 1).
 * Si el alumno no tiene cuenta de campus, no hay registros que mostrar todavía.
 */
async function userIdDelHijo(alumnoId: number): Promise<number | null> {
  const alumno = await prisma.alumno.findUnique({ where: { id: alumnoId }, select: { userId: true } });
  return alumno?.userId ?? null;
}

router.get('/mis-hijos/:alumnoId/calificaciones', cargarHijo, async (_req, res, next) => {
  try {
    const userId = await userIdDelHijo(hijoId(res));
    if (userId === null) {
      res.json({ exito: true, calificaciones: [], nota: 'El alumno todavía no tiene cuenta de campus.' });
      return;
    }

    const calificaciones = await prisma.grade.findMany({
      where: { estudianteId: userId },
      include: { docente: { select: { nombre: true } } },
      orderBy: [{ materia: 'asc' }, { fecha: 'desc' }],
    });

    res.json({ exito: true, calificaciones });
  } catch (err) {
    next(err);
  }
});

const asistenciaQuerySchema = rangoFechasSchema;

router.get('/mis-hijos/:alumnoId/asistencia', cargarHijo, async (req, res, next) => {
  try {
    const userId = await userIdDelHijo(hijoId(res));
    if (userId === null) {
      res.json({ exito: true, asistencias: [], resumen: null });
      return;
    }

    const rango = asistenciaQuerySchema.parse(req.query);
    const fecha = filtroFecha(rango);

    const asistencias = await prisma.attendance.findMany({
      where: { estudianteId: userId, ...(fecha ? { fecha } : {}) },
      orderBy: { fecha: 'desc' },
    });

    const total = asistencias.length;
    const presentes = asistencias.filter((a) => a.status === 'PRESENTE').length;

    res.json({
      exito: true,
      asistencias,
      resumen: {
        total,
        presentes,
        ausentes: asistencias.filter((a) => a.status === 'AUSENTE').length,
        tardes: asistencias.filter((a) => a.status === 'TARDE').length,
        justificados: asistencias.filter((a) => a.status === 'JUSTIFICADO').length,
        porcentajeAsistencia: total === 0 ? null : Math.round((presentes / total) * 1000) / 10,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// Guarda explícita: cualquier ruta /mis-hijos/* no contemplada arriba
// ------------------------------------------------------------------

/**
 * Si alguien agrega una ruta bajo `/mis-hijos/` y olvida `cargarHijo`, esta
 * guarda la corta antes de que llegue a un handler sin verificar. Es preferible
 * romper la funcionalidad nueva a filtrar datos de otra familia.
 */
router.all('/mis-hijos/*', (_req, _res, next) => {
  next(HttpError.notFound('Recurso no disponible en el portal de tutores.'));
});

export { router as padresRouter };
