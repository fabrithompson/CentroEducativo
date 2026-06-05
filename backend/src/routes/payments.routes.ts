import { Router } from 'express';
import { z } from 'zod';
import { PaymentStatus, Role } from '@prisma/client';

import { prisma } from '../db/prisma';
import { HttpError } from '../utils/httpError';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

router.get('/', requireAuth, requireRole(Role.PADRE, Role.ADMIN), async (req, res, next) => {
  try {
    const me = req.authUser!;
    let estudianteIds: number[] = [];

    if (me.role === Role.PADRE) {
      const links = await prisma.parentStudentLink.findMany({
        where: { padreId: me.id },
        select: { estudianteId: true },
      });
      estudianteIds = links.map((l) => l.estudianteId);
    } else {
      const ids = req.query.estudiante_id ? [Number(req.query.estudiante_id)] : [];
      estudianteIds = ids.filter((n) => Number.isFinite(n));
    }

    if (estudianteIds.length === 0) {
      res.json({ exito: true, pagos: [], totales: { pendiente: 0, pagado: 0, vencido: 0, total: 0 } });
      return;
    }

    const rows = await prisma.payment.findMany({
      where: { estudianteId: { in: estudianteIds } },
      orderBy: { vencimiento: 'desc' },
      include: { estudiante: { select: { nombre: true } } },
    });

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const totales = { pendiente: 0, pagado: 0, vencido: 0, total: 0 };

    const pagos = rows.map((p) => {
      let status = p.status;
      if (status === PaymentStatus.PENDIENTE && p.vencimiento < hoy) status = PaymentStatus.VENCIDO;
      const monto = Number(p.monto);
      totales.total += monto;
      if (status === PaymentStatus.PAGADO) totales.pagado += monto;
      else if (status === PaymentStatus.VENCIDO) totales.vencido += monto;
      else totales.pendiente += monto;
      return {
        id: p.id,
        concepto: p.concepto,
        monto,
        vencimiento: p.vencimiento.toISOString().slice(0, 10),
        pagadoEn: p.pagadoEn ? p.pagadoEn.toISOString().slice(0, 10) : null,
        status,
        estudiante: p.estudiante.nombre,
      };
    });

    res.json({ exito: true, pagos, totales });
  } catch (err) {
    next(err);
  }
});

const paySchema = z.object({ id: z.coerce.number().int().positive() });

router.post('/:id/pay', requireAuth, requireRole(Role.PADRE, Role.ADMIN), async (req, res, next) => {
  try {
    const { id } = paySchema.parse(req.params);
    const me = req.authUser!;

    const payment = await prisma.payment.findUnique({ where: { id } });
    if (!payment) throw HttpError.notFound('Cuota no encontrada.');

    if (me.role === Role.PADRE) {
      const link = await prisma.parentStudentLink.findUnique({
        where: { padreId_estudianteId: { padreId: me.id, estudianteId: payment.estudianteId } },
      });
      if (!link) throw HttpError.forbidden('No podés pagar la cuota de un alumno no vinculado.');
    }

    if (payment.status === PaymentStatus.PAGADO) {
      throw HttpError.conflict('La cuota ya fue pagada.');
    }

    const updated = await prisma.payment.update({
      where: { id },
      data: {
        status: PaymentStatus.PAGADO,
        pagadoEn: new Date(),
        padreId: me.role === Role.PADRE ? me.id : payment.padreId,
      },
    });

    await prisma.notification.create({
      data: {
        userId: payment.estudianteId,
        titulo: 'Cuota pagada',
        contenido: `Se registró el pago de "${payment.concepto}".`,
      },
    });

    res.json({
      exito: true,
      mensaje: 'Pago registrado correctamente.',
      pago: {
        id: updated.id,
        concepto: updated.concepto,
        monto: Number(updated.monto),
        pagadoEn: updated.pagadoEn?.toISOString().slice(0, 10),
        status: updated.status,
      },
    });
  } catch (err) {
    next(err);
  }
});

export { router as paymentsRouter };
