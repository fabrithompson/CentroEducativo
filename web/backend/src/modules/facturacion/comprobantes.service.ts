/**
 * Circuito de comprobantes de transferencia.
 *
 * Regla de negocio: NO se acepta efectivo. Todo pago es una transferencia con
 * comprobante adjunto que Administración valida. Una factura puede liquidarse
 * con varias transferencias (relación 1:N).
 *
 * El estado de la factura **no se escribe desde acá**: lo recalcula el trigger
 * `fn_recalcular_estado_factura` a partir de los comprobantes aprobados. Este
 * servicio sólo da de alta, aprueba o rechaza comprobantes; que la factura pase
 * a PARCIAL o PAGADA es consecuencia, no decisión de la aplicación.
 */

import { EstadoComprobante, EstadoFactura, Role, type PrismaClient } from '@prisma/client';

import { HttpError } from '../../utils/httpError';
import { logger } from '../../utils/logger';
import { aNumero, redondear } from '../shared/pagination';
import { registrarEnvio } from './mailer.facturacion';
import { comprobanteAprobadoTexto, comprobanteRechazadoTexto } from './plantillas';

export interface SubirComprobanteInput {
  facturaId: number;
  subidoPorId: number;
  monto: number;
  fechaTransferencia: Date;
  bancoOrigen: string;
  numeroOperacion: string;
  archivoUrl: string;
}

/**
 * Registra un comprobante cargado por el tutor. Queda en PENDIENTE hasta que
 * Administración lo valide: subir el papel no acredita el pago.
 */
export async function subirComprobante(prisma: PrismaClient, input: SubirComprobanteInput) {
  const factura = await prisma.factura.findUnique({
    where: { id: input.facturaId },
    include: { comprobantes: true },
  });

  if (!factura) throw HttpError.notFound('La factura no existe.');

  if (factura.estado === EstadoFactura.ANULADA) {
    throw HttpError.conflict('La factura está anulada: no admite pagos.');
  }
  if (factura.estado === EstadoFactura.PAGADA) {
    throw HttpError.conflict('La factura ya está saldada.');
  }

  if (input.monto <= 0) {
    throw HttpError.badRequest('El importe de la transferencia debe ser mayor a cero.');
  }

  // Una transferencia no puede ser futura.
  const hoy = new Date();
  hoy.setUTCHours(23, 59, 59, 999);
  if (input.fechaTransferencia > hoy) {
    throw HttpError.badRequest('La fecha de transferencia no puede ser futura.');
  }

  const duplicado = factura.comprobantes.find(
    (c) => c.numeroOperacion === input.numeroOperacion && c.estado !== EstadoComprobante.RECHAZADO,
  );
  if (duplicado) {
    throw HttpError.conflict(
      `Ya cargaste un comprobante con el número de operación ${input.numeroOperacion}.`,
    );
  }

  // Aviso, no bloqueo: pagar de más puede ser legítimo (un adelanto, un error
  // de la familia que Administración después concilia). Se registra y se avisa.
  const acreditado = aNumero(factura.montoPagado);
  const pendiente = factura.comprobantes
    .filter((c) => c.estado === EstadoComprobante.PENDIENTE)
    .reduce((s, c) => s + aNumero(c.monto), 0);
  const saldo = redondear(aNumero(factura.total) - acreditado);
  const excede = redondear(acreditado + pendiente + input.monto) > aNumero(factura.total);

  const comprobante = await prisma.comprobantePago.create({
    data: {
      facturaId: input.facturaId,
      subidoPorId: input.subidoPorId,
      monto: input.monto,
      fechaTransferencia: input.fechaTransferencia,
      bancoOrigen: input.bancoOrigen,
      numeroOperacion: input.numeroOperacion,
      archivoUrl: input.archivoUrl,
      estado: EstadoComprobante.PENDIENTE,
    },
    include: { factura: { select: { numero: true, total: true, montoPagado: true, estado: true } } },
  });

  // Se avisa a los administradores para que no quede esperando.
  const admins = await prisma.user.findMany({
    where: { role: Role.ADMIN, isActive: true },
    select: { id: true },
  });

  if (admins.length > 0) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({
        userId: a.id,
        titulo: 'Comprobante pendiente de validación',
        contenido: `Se cargó una transferencia de $${input.monto} para el comprobante ${factura.numero}.`,
        link: `/panel_admin.html#comprobantes`,
      })),
    });
  }

  logger.info(
    `[comprobantes] alta id=${comprobante.id} factura=${factura.numero} monto=${input.monto}`,
  );

  return {
    comprobante,
    saldoAnterior: saldo,
    advertencia: excede
      ? 'El importe cargado supera el saldo de la factura. Administración lo va a revisar.'
      : null,
  };
}

export interface ValidarComprobanteInput {
  comprobanteId: number;
  validadoPorId: number;
  aprobar: boolean;
  motivoRechazo?: string;
}

/**
 * Aprobación o rechazo por parte de Administración.
 *
 * Al aprobar, el trigger recalcula `montoPagado` y el estado de la factura. Por
 * eso se relee la factura después de actualizar: el valor que tenía antes ya no
 * sirve.
 */
export async function validarComprobante(prisma: PrismaClient, input: ValidarComprobanteInput) {
  const comprobante = await prisma.comprobantePago.findUnique({
    where: { id: input.comprobanteId },
    include: {
      factura: {
        include: {
          alumno: { select: { apellido: true, nombres: true } },
          tutor: { select: { id: true, nombre: true, email: true } },
        },
      },
      subidoPor: { select: { id: true, nombre: true, email: true } },
    },
  });

  if (!comprobante) throw HttpError.notFound('El comprobante no existe.');

  if (comprobante.estado !== EstadoComprobante.PENDIENTE) {
    throw HttpError.conflict(
      `El comprobante ya fue ${comprobante.estado === EstadoComprobante.APROBADO ? 'aprobado' : 'rechazado'}.`,
    );
  }

  if (!input.aprobar && !input.motivoRechazo?.trim()) {
    throw HttpError.badRequest('Para rechazar un comprobante hay que indicar el motivo.');
  }

  await prisma.comprobantePago.update({
    where: { id: input.comprobanteId },
    data: {
      estado: input.aprobar ? EstadoComprobante.APROBADO : EstadoComprobante.RECHAZADO,
      validadoPorId: input.validadoPorId,
      validadoEn: new Date(),
      motivoRechazo: input.aprobar ? null : input.motivoRechazo!.trim(),
    },
  });

  // El trigger ya recalculó la factura: hay que releerla para saber cómo quedó.
  const factura = await prisma.factura.findUnique({
    where: { id: comprobante.facturaId },
    select: { id: true, numero: true, total: true, montoPagado: true, estado: true },
  });

  const saldo = factura ? redondear(aNumero(factura.total) - aNumero(factura.montoPagado)) : 0;

  // Se notifica a quien subió el comprobante y, si es otro, al tutor responsable.
  const destinatarios = new Map<number, { nombre: string; email: string }>();
  destinatarios.set(comprobante.subidoPor.id, comprobante.subidoPor);
  if (comprobante.factura.tutor) {
    destinatarios.set(comprobante.factura.tutor.id, comprobante.factura.tutor);
  }

  const alumno = `${comprobante.factura.alumno.apellido}, ${comprobante.factura.alumno.nombres}`;
  const monto = aNumero(comprobante.monto);

  for (const [userId, persona] of destinatarios) {
    await prisma.notification.create({
      data: {
        userId,
        titulo: input.aprobar ? 'Pago acreditado' : 'Comprobante rechazado',
        contenido: input.aprobar
          ? `Se acreditó tu transferencia de $${monto} para el comprobante ${comprobante.factura.numero}.` +
            (saldo > 0 ? ` Queda un saldo de $${saldo}.` : ' La cuota quedó saldada.')
          : `Tu comprobante para ${comprobante.factura.numero} fue rechazado: ${input.motivoRechazo}`,
        link: '/panel_padre.html#finanzas',
      },
    });

    await registrarEnvio(prisma, {
      to: persona.email,
      subject: input.aprobar
        ? `Pago acreditado — comprobante ${comprobante.factura.numero}`
        : `Comprobante rechazado — ${comprobante.factura.numero}`,
      text: input.aprobar
        ? comprobanteAprobadoTexto({
            tutor: persona.nombre,
            numero: comprobante.factura.numero,
            alumno,
            monto,
            saldo,
          })
        : comprobanteRechazadoTexto({
            tutor: persona.nombre,
            numero: comprobante.factura.numero,
            alumno,
            monto,
            motivo: input.motivoRechazo!,
          }),
      tipo: input.aprobar ? 'COMPROBANTE_APROBADO' : 'COMPROBANTE_RECHAZADO',
      facturaId: comprobante.facturaId,
    });
  }

  logger.info(
    `[comprobantes] ${input.aprobar ? 'aprobado' : 'rechazado'} id=${input.comprobanteId} ` +
      `factura=${comprobante.factura.numero} estado=${factura?.estado}`,
  );

  return {
    comprobanteId: input.comprobanteId,
    aprobado: input.aprobar,
    factura: factura
      ? {
          ...factura,
          total: aNumero(factura.total),
          montoPagado: aNumero(factura.montoPagado),
          saldo,
        }
      : null,
  };
}

/** Cola de comprobantes esperando validación, para el backoffice. */
export async function comprobantesPendientes(prisma: PrismaClient) {
  const comprobantes = await prisma.comprobantePago.findMany({
    where: { estado: EstadoComprobante.PENDIENTE },
    include: {
      factura: {
        include: {
          alumno: {
            select: {
              id: true,
              legajo: true,
              apellido: true,
              nombres: true,
              curso: { select: { nombre: true, division: true } },
            },
          },
        },
      },
      subidoPor: { select: { id: true, nombre: true, email: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return comprobantes.map((c) => {
    const total = aNumero(c.factura.total);
    const pagado = aNumero(c.factura.montoPagado);
    const monto = aNumero(c.monto);

    return {
      id: c.id,
      monto,
      fechaTransferencia: c.fechaTransferencia,
      bancoOrigen: c.bancoOrigen,
      numeroOperacion: c.numeroOperacion,
      archivoUrl: c.archivoUrl,
      cargadoEl: c.createdAt,
      subidoPor: c.subidoPor,
      factura: {
        id: c.factura.id,
        numero: c.factura.numero,
        periodo: `${String(c.factura.mes).padStart(2, '0')}/${c.factura.anio}`,
        total,
        montoPagado: pagado,
        saldo: redondear(total - pagado),
        estado: c.factura.estado,
        alumno: `${c.factura.alumno.apellido}, ${c.factura.alumno.nombres}`,
        legajo: c.factura.alumno.legajo,
        curso: `${c.factura.alumno.curso.nombre} "${c.factura.alumno.curso.division}"`,
      },
      // Señal para Administración: el importe no coincide con el saldo.
      coincideConSaldo: redondear(total - pagado) === monto,
    };
  });
}
