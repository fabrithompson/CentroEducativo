/**
 * RF-07 — Avisos automáticos a los padres por mensajería.
 *
 * Historia de usuario HU7: *«Enviar alertas automáticas de cambios de horario»*,
 * con estos criterios de aceptación:
 *
 *   - Sólo se envía a los padres con teléfono registrado y activo.
 *   - El envío queda registrado en la base de datos.
 *   - Si no hay teléfono, se genera una alerta para contacto por correo.
 *
 * Los tres están implementados y cubiertos por pruebas.
 *
 * El destinatario **no se elige a mano**: se deriva del alcance del aviso —un
 * curso, una materia o un deporte—. Así un cambio de horario llega exactamente
 * a las familias involucradas y a ninguna más, que es lo que evita que los
 * padres terminen ignorando los avisos por exceso de ruido.
 */

import {
  CanalMensaje,
  EstadoMensaje,
  TipoAviso,
  type PrismaClient,
  type Prisma,
} from '@prisma/client';

import { HttpError } from '../../utils/httpError';
import { logger } from '../../utils/logger';
import { registrarEnvio } from '../facturacion/mailer.facturacion';
import { normalizarTelefono, obtenerProveedor } from './proveedores';

export interface CrearAvisoInput {
  tipo: TipoAviso;
  titulo: string;
  cuerpo: string;
  /** Alcance: al menos uno es obligatorio. */
  cursoId?: number;
  materiaId?: number;
  deporteId?: number;
  canal?: CanalMensaje;
  creadoPorId: number;
}

export interface ResultadoAviso {
  avisoId: number;
  alcance: string;
  destinatarios: number;
  enviados: number;
  fallidos: number;
  sinTelefono: number;
  correosDeRespaldo: number;
}

interface Destinatario {
  tutorId: number;
  tutorNombre: string;
  tutorEmail: string;
  telefonoCrudo: string | null;
  alumnoId: number;
  alumnoNombre: string;
}

/**
 * Resuelve a quién hay que avisar, a partir del alcance.
 *
 * Se devuelve un destinatario por par (tutor, alumno). Un tutor con dos hijos
 * en el curso afectado recibe dos mensajes: son dos situaciones distintas y el
 * texto nombra a cada chico.
 */
async function resolverDestinatarios(
  prisma: PrismaClient,
  alcance: { cursoId?: number; materiaId?: number; deporteId?: number },
): Promise<{ destinatarios: Destinatario[]; descripcion: string }> {
  let where: Prisma.AlumnoWhereInput;
  let descripcion: string;

  if (alcance.cursoId) {
    const curso = await prisma.curso.findUnique({
      where: { id: alcance.cursoId },
      include: { nivel: true },
    });
    if (!curso) throw HttpError.notFound('El curso indicado no existe.');

    where = { cursoId: alcance.cursoId, estado: 'ACTIVO' };
    descripcion = `${curso.nivel.nombre} · ${curso.nombre} "${curso.division}"`;
  } else if (alcance.materiaId) {
    const materia = await prisma.materia.findUnique({
      where: { id: alcance.materiaId },
      include: { curso: { include: { nivel: true } } },
    });
    if (!materia) throw HttpError.notFound('La materia indicada no existe.');

    // Una materia pertenece a un curso: los afectados son los alumnos de ese curso.
    where = { cursoId: materia.cursoId, estado: 'ACTIVO' };
    descripcion = `${materia.nombre} — ${materia.curso.nombre} "${materia.curso.division}"`;
  } else if (alcance.deporteId) {
    const deporte = await prisma.deporte.findUnique({ where: { id: alcance.deporteId } });
    if (!deporte) throw HttpError.notFound('El deporte indicado no existe.');

    where = {
      estado: 'ACTIVO',
      inscripcionesDeporte: { some: { deporteId: alcance.deporteId, estado: 'ACTIVA' } },
    };
    descripcion = `Deporte: ${deporte.nombre}`;
  } else {
    throw HttpError.badRequest('Indicá el alcance del aviso: un curso, una materia o un deporte.');
  }

  const alumnos = await prisma.alumno.findMany({
    where,
    include: {
      tutores: {
        include: {
          tutor: { select: { id: true, nombre: true, email: true, telefono: true, isActive: true } },
        },
      },
    },
  });

  const destinatarios: Destinatario[] = [];

  for (const alumno of alumnos) {
    for (const vinculo of alumno.tutores) {
      // "Teléfono registrado y activo": el criterio cubre las dos cosas.
      if (!vinculo.tutor.isActive) continue;

      destinatarios.push({
        tutorId: vinculo.tutor.id,
        tutorNombre: vinculo.tutor.nombre,
        tutorEmail: vinculo.tutor.email,
        telefonoCrudo: vinculo.tutor.telefono,
        alumnoId: alumno.id,
        alumnoNombre: `${alumno.nombres} ${alumno.apellido}`,
      });
    }
  }

  return { destinatarios, descripcion };
}

const ENCABEZADO: Record<TipoAviso, string> = {
  CAMBIO_HORARIO: 'Cambio de horario',
  AUSENCIA_PROFESOR: 'Ausencia de profesor',
  GENERAL: 'Aviso del colegio',
};

/** Texto del mensaje. Se mantiene corto: un SMS se corta a los 160 caracteres. */
function armarTexto(tipo: TipoAviso, titulo: string, cuerpo: string, alumno: string): string {
  return `[${ENCABEZADO[tipo]}] ${titulo}\n${alumno}: ${cuerpo}\nCentro Educativo Transformar para educar`;
}

/**
 * Crea el aviso y lo envía.
 *
 * Cada destinatario se procesa por separado y su resultado se registra, falle o
 * no. Si el proveedor se cae a mitad de camino, quedan asentados los que sí
 * salieron y los que no: sin eso no habría forma de reintentar sólo los
 * faltantes.
 */
export async function emitirAviso(
  prisma: PrismaClient,
  input: CrearAvisoInput,
): Promise<ResultadoAviso> {
  const { destinatarios, descripcion } = await resolverDestinatarios(prisma, input);

  const aviso = await prisma.avisoMasivo.create({
    data: {
      tipo: input.tipo,
      titulo: input.titulo,
      cuerpo: input.cuerpo,
      cursoId: input.cursoId ?? null,
      materiaId: input.materiaId ?? null,
      deporteId: input.deporteId ?? null,
      creadoPorId: input.creadoPorId,
    },
  });

  const canal = input.canal ?? CanalMensaje.SMS;
  const proveedor = obtenerProveedor();

  const resultado: ResultadoAviso = {
    avisoId: aviso.id,
    alcance: descripcion,
    destinatarios: destinatarios.length,
    enviados: 0,
    fallidos: 0,
    sinTelefono: 0,
    correosDeRespaldo: 0,
  };

  for (const d of destinatarios) {
    const telefono = normalizarTelefono(d.telefonoCrudo);
    const texto = armarTexto(input.tipo, input.titulo, input.cuerpo, d.alumnoNombre);

    // --- Sin teléfono utilizable: correo de respaldo ---
    if (!telefono) {
      await prisma.mensajeEnviado.create({
        data: {
          avisoId: aviso.id,
          destinatarioId: d.tutorId,
          alumnoId: d.alumnoId,
          telefono: d.telefonoCrudo,
          canal,
          estado: EstadoMensaje.SIN_TELEFONO,
          error: d.telefonoCrudo
            ? 'El teléfono registrado no tiene un formato utilizable.'
            : 'El tutor no tiene teléfono registrado.',
        },
      });

      const ok = await registrarEnvio(prisma, {
        to: d.tutorEmail,
        subject: `${ENCABEZADO[input.tipo]} — ${input.titulo}`,
        text: [
          `Hola ${d.tutorNombre},`,
          '',
          texto,
          '',
          'Te enviamos este aviso por correo porque no tenemos un teléfono válido',
          'registrado en el sistema. Podés actualizarlo en secretaría.',
          '',
          'Centro Educativo "Transformar para educar"',
        ].join('\n'),
        tipo: `AVISO_${input.tipo}`,
        alumnoId: d.alumnoId,
      });

      resultado.sinTelefono += 1;
      if (ok) resultado.correosDeRespaldo += 1;

      await notificarEnCampus(prisma, d, input, texto);
      continue;
    }

    // --- Envío por el proveedor ---
    const envio = await proveedor.enviar({ telefono, texto, canal });

    await prisma.mensajeEnviado.create({
      data: {
        avisoId: aviso.id,
        destinatarioId: d.tutorId,
        alumnoId: d.alumnoId,
        telefono,
        canal,
        estado: envio.exito ? EstadoMensaje.ENVIADO : EstadoMensaje.FALLIDO,
        referenciaExterna: envio.referenciaExterna ?? null,
        error: envio.error ?? null,
        enviadoEn: envio.exito ? new Date() : null,
      },
    });

    if (envio.exito) resultado.enviados += 1;
    else resultado.fallidos += 1;

    await notificarEnCampus(prisma, d, input, texto);
  }

  logger.info(
    `[avisos] #${aviso.id} (${descripcion}): ${resultado.enviados} enviados, ` +
      `${resultado.fallidos} fallidos, ${resultado.sinTelefono} sin teléfono`,
  );

  return resultado;
}

/**
 * Notificación dentro del campus, además del mensaje.
 *
 * Es deliberado que sea redundante: un SMS se borra, una notificación queda.
 */
async function notificarEnCampus(
  prisma: PrismaClient,
  d: Destinatario,
  input: CrearAvisoInput,
  texto: string,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: d.tutorId,
        titulo: `${ENCABEZADO[input.tipo]}: ${input.titulo}`,
        contenido: texto,
        link: '/panel_padre.html#anuncios',
      },
    });
  } catch (err) {
    logger.error('[avisos] no se pudo crear la notificación en el campus', err);
  }
}

/**
 * Reintenta los mensajes que fallaron.
 *
 * Sólo toca los `FALLIDO`: los `SIN_TELEFONO` no se reintentan porque el
 * problema no es el proveedor sino el dato, y ya se avisó por correo.
 */
export async function reintentarFallidos(
  prisma: PrismaClient,
  avisoId: number,
): Promise<{ reintentados: number; enviados: number }> {
  const aviso = await prisma.avisoMasivo.findUnique({
    where: { id: avisoId },
    include: {
      mensajes: {
        where: { estado: EstadoMensaje.FALLIDO },
        include: { alumno: { select: { apellido: true, nombres: true } } },
      },
    },
  });

  if (!aviso) throw HttpError.notFound('El aviso no existe.');

  const proveedor = obtenerProveedor();
  let enviados = 0;

  for (const mensaje of aviso.mensajes) {
    if (!mensaje.telefono) continue;

    const alumno = mensaje.alumno
      ? `${mensaje.alumno.nombres} ${mensaje.alumno.apellido}`
      : 'tu hijo/a';

    const envio = await proveedor.enviar({
      telefono: mensaje.telefono,
      texto: armarTexto(aviso.tipo, aviso.titulo, aviso.cuerpo, alumno),
      canal: mensaje.canal,
    });

    await prisma.mensajeEnviado.update({
      where: { id: mensaje.id },
      data: {
        estado: envio.exito ? EstadoMensaje.ENVIADO : EstadoMensaje.FALLIDO,
        referenciaExterna: envio.referenciaExterna ?? null,
        error: envio.error ?? null,
        enviadoEn: envio.exito ? new Date() : null,
      },
    });

    if (envio.exito) enviados += 1;
  }

  return { reintentados: aviso.mensajes.length, enviados };
}

/** Historial de avisos con el detalle de entrega. */
export async function historialAvisos(prisma: PrismaClient, limite = 50) {
  const avisos = await prisma.avisoMasivo.findMany({
    include: {
      curso: { select: { nombre: true, division: true } },
      materia: { select: { nombre: true } },
      deporte: { select: { nombre: true } },
      creadoPor: { select: { nombre: true } },
      mensajes: { select: { estado: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limite, 200),
  });

  return avisos.map((a) => {
    const contar = (estado: EstadoMensaje) =>
      a.mensajes.filter((m) => m.estado === estado).length;

    return {
      id: a.id,
      tipo: a.tipo,
      titulo: a.titulo,
      cuerpo: a.cuerpo,
      createdAt: a.createdAt,
      creadoPor: a.creadoPor?.nombre ?? null,
      alcance: a.curso
        ? `${a.curso.nombre} "${a.curso.division}"`
        : (a.materia?.nombre ?? a.deporte?.nombre ?? '—'),
      total: a.mensajes.length,
      enviados: contar(EstadoMensaje.ENVIADO),
      fallidos: contar(EstadoMensaje.FALLIDO),
      sinTelefono: contar(EstadoMensaje.SIN_TELEFONO),
    };
  });
}
