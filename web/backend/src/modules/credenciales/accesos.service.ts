/**
 * Validación de acceso al transporte y al comedor por carnet digital.
 *
 * El escaneo pasa por seis controles, en este orden:
 *   1. El QR tiene el formato de una credencial del colegio.
 *   2. La credencial existe y está activa.
 *   3. El alumno está activo.
 *   4. El código corresponde a la ventana declarada (TOTP ±1).
 *   5. Ese código no se usó antes en este punto de control.
 *   6. El alumno tiene el servicio contratado este mes — y, en transporte, en
 *      **ese** recorrido.
 *
 * Todo intento queda registrado, permitido o no. Un registro que sólo guarda
 * los éxitos no sirve para auditar: si alguien intenta subir a un micro que no
 * le corresponde, Administración tiene que poder verlo.
 */

import { PuntoControl, ResultadoAcceso, type Prisma, type PrismaClient } from '@prisma/client';

import { HttpError } from '../../utils/httpError';
import { logger } from '../../utils/logger';
import { registrarEnvio } from '../facturacion/mailer.facturacion';
import { leerContenidoQR, verificarCodigo } from './totp';

export interface EntradaEscaneo {
  /** Contenido crudo del QR. */
  qr: string;
  punto: PuntoControl;
  /** Obligatorio en TRANSPORTE: en qué recorrido está el lector. */
  recorridoId?: number;
  operadorId: number;
  dispositivo?: string;
}

export interface SalidaEscaneo {
  permitido: boolean;
  resultado: ResultadoAcceso;
  mensaje: string;
  alumno: {
    id: number;
    legajo: string;
    nombre: string;
    curso: string;
    foto?: string | null;
  } | null;
  detalle?: string;
  registroId: number | null;
}

/** Mensajes para el operador. Cortos: los lee de reojo mientras sube gente. */
const MENSAJE: Record<ResultadoAcceso, string> = {
  PERMITIDO: 'Acceso autorizado',
  DENEGADO_CODIGO_INVALIDO: 'Código inválido o vencido',
  DENEGADO_CODIGO_REUTILIZADO: 'Este código ya fue usado',
  DENEGADO_CREDENCIAL_REVOCADA: 'Credencial dada de baja',
  DENEGADO_ALUMNO_INACTIVO: 'El alumno no está activo',
  DENEGADO_SIN_SERVICIO: 'No tiene el servicio contratado',
  DENEGADO_OTRO_RECORRIDO: 'Corresponde a otro recorrido',
};

/** Registra el intento y arma la respuesta. Siempre se deja rastro. */
async function registrar(
  prisma: PrismaClient,
  datos: Prisma.RegistroAccesoUncheckedCreateInput,
  alumno: SalidaEscaneo['alumno'],
  detalle?: string,
): Promise<SalidaEscaneo> {
  let registroId: number | null = null;

  try {
    const registro = await prisma.registroAcceso.create({ data: datos, select: { id: true } });
    registroId = registro.id;
  } catch (err) {
    // La restricción única (credencial, punto, contador) puede saltar si dos
    // lectores escanean el mismo código a la vez. Es exactamente lo que se
    // quiere impedir, así que el error se traduce a un rechazo.
    if (
      typeof err === 'object' &&
      err !== null &&
      (err as { code?: string }).code === 'P2002'
    ) {
      return {
        permitido: false,
        resultado: ResultadoAcceso.DENEGADO_CODIGO_REUTILIZADO,
        mensaje: MENSAJE.DENEGADO_CODIGO_REUTILIZADO,
        alumno,
        detalle: 'El código ya había sido registrado en este punto de control.',
        registroId: null,
      };
    }
    logger.error('[accesos] no se pudo registrar el escaneo', err);
  }

  return {
    permitido: datos.resultado === ResultadoAcceso.PERMITIDO,
    resultado: datos.resultado,
    mensaje: MENSAJE[datos.resultado],
    alumno,
    detalle,
    registroId,
  };
}

export async function validarEscaneo(
  prisma: PrismaClient,
  entrada: EntradaEscaneo,
): Promise<SalidaEscaneo> {
  const base = {
    punto: entrada.punto,
    operadorId: entrada.operadorId,
    dispositivo: entrada.dispositivo ?? null,
    recorridoId: entrada.recorridoId ?? null,
  };

  // --- 1. Formato ---
  const contenido = leerContenidoQR(entrada.qr);
  if (!contenido) {
    return registrar(
      prisma,
      { ...base, resultado: ResultadoAcceso.DENEGADO_CODIGO_INVALIDO, motivo: 'QR con formato desconocido' },
      null,
      'El código escaneado no es una credencial del colegio.',
    );
  }

  // --- 2. Credencial ---
  const credencial = await prisma.credencialDigital.findUnique({
    where: { id: contenido.credencialId },
    include: {
      alumno: {
        include: {
          curso: { include: { nivel: true } },
          tutores: { include: { tutor: { select: { id: true, nombre: true, email: true } } } },
        },
      },
    },
  });

  if (!credencial) {
    return registrar(
      prisma,
      { ...base, resultado: ResultadoAcceso.DENEGADO_CODIGO_INVALIDO, motivo: 'Credencial inexistente' },
      null,
    );
  }

  const a = credencial.alumno;
  const alumnoResumen = {
    id: a.id,
    legajo: a.legajo,
    nombre: `${a.apellido}, ${a.nombres}`,
    curso: `${a.curso.nivel.nombre} · ${a.curso.nombre} "${a.curso.division}"`,
  };

  if (!credencial.activa) {
    return registrar(
      prisma,
      {
        ...base,
        credencialId: credencial.id,
        alumnoId: a.id,
        resultado: ResultadoAcceso.DENEGADO_CREDENCIAL_REVOCADA,
        motivo: credencial.motivoRevocacion ?? 'Credencial revocada',
      },
      alumnoResumen,
      'La credencial fue dada de baja. El alumno tiene que reemitirla desde la app.',
    );
  }

  // --- 3. Alumno activo ---
  if (a.estado !== 'ACTIVO') {
    return registrar(
      prisma,
      {
        ...base,
        credencialId: credencial.id,
        alumnoId: a.id,
        resultado: ResultadoAcceso.DENEGADO_ALUMNO_INACTIVO,
        motivo: `Estado del alumno: ${a.estado}`,
      },
      alumnoResumen,
    );
  }

  // --- 4. Código ---
  const verificacion = verificarCodigo(credencial.secreto, contenido.codigo, contenido.contador);
  if (!verificacion.valido) {
    return registrar(
      prisma,
      {
        ...base,
        credencialId: credencial.id,
        alumnoId: a.id,
        resultado: ResultadoAcceso.DENEGADO_CODIGO_INVALIDO,
        motivo: 'El código no corresponde a la ventana declarada',
      },
      alumnoResumen,
      'El código venció. Pedile al alumno que muestre el carnet de nuevo.',
    );
  }

  // --- 5 y 6. Servicio contratado ---
  const hoy = new Date();
  const periodo = { anio: hoy.getFullYear(), mes: hoy.getMonth() + 1 };

  if (entrada.punto === PuntoControl.TRANSPORTE) {
    if (!entrada.recorridoId) {
      throw HttpError.badRequest('Indicá en qué recorrido está el lector.');
    }

    const inscripcion = await prisma.inscripcionTransporte.findUnique({
      where: { alumnoId_anio_mes: { alumnoId: a.id, anio: periodo.anio, mes: periodo.mes } },
      include: { recorrido: true },
    });

    if (!inscripcion || inscripcion.estado !== 'ACTIVA') {
      return registrar(
        prisma,
        {
          ...base,
          credencialId: credencial.id,
          alumnoId: a.id,
          contador: verificacion.contadorUsado,
          resultado: ResultadoAcceso.DENEGADO_SIN_SERVICIO,
          motivo: `Sin transporte contratado en ${periodo.mes}/${periodo.anio}`,
        },
        alumnoResumen,
        'El alumno no tiene transporte contratado este mes.',
      );
    }

    // La regla que pide la consigna: el recorrido tiene que ser el contratado.
    if (inscripcion.recorridoId !== entrada.recorridoId) {
      return registrar(
        prisma,
        {
          ...base,
          credencialId: credencial.id,
          alumnoId: a.id,
          contador: verificacion.contadorUsado,
          resultado: ResultadoAcceso.DENEGADO_OTRO_RECORRIDO,
          motivo: `Contratado: ${inscripcion.recorrido.codigo}`,
        },
        alumnoResumen,
        `Le corresponde el ${inscripcion.recorrido.codigo} — ${inscripcion.recorrido.nombre}.`,
      );
    }

    const salida = await registrar(
      prisma,
      {
        ...base,
        credencialId: credencial.id,
        alumnoId: a.id,
        contador: verificacion.contadorUsado,
        recorridoId: entrada.recorridoId,
        resultado: ResultadoAcceso.PERMITIDO,
      },
      alumnoResumen,
      `${inscripcion.recorrido.codigo} — ${inscripcion.recorrido.nombre}`,
    );

    if (salida.permitido) {
      void notificarTutores(prisma, {
        alumno: a,
        punto: PuntoControl.TRANSPORTE,
        detalle: `${inscripcion.recorrido.codigo} — ${inscripcion.recorrido.nombre}`,
        registroId: salida.registroId,
      });
    }

    return salida;
  }

  // --- Comedor ---
  const inscripcion = await prisma.inscripcionComedor.findUnique({
    where: { alumnoId_anio_mes: { alumnoId: a.id, anio: periodo.anio, mes: periodo.mes } },
    include: { comedor: true },
  });

  if (!inscripcion || inscripcion.estado !== 'ACTIVA') {
    return registrar(
      prisma,
      {
        ...base,
        credencialId: credencial.id,
        alumnoId: a.id,
        contador: verificacion.contadorUsado,
        resultado: ResultadoAcceso.DENEGADO_SIN_SERVICIO,
        motivo: `Sin comedor contratado en ${periodo.mes}/${periodo.anio}`,
      },
      alumnoResumen,
      'El alumno no tiene comedor contratado este mes.',
    );
  }

  const salida = await registrar(
    prisma,
    {
      ...base,
      credencialId: credencial.id,
      alumnoId: a.id,
      contador: verificacion.contadorUsado,
      comedorId: inscripcion.comedorId,
      resultado: ResultadoAcceso.PERMITIDO,
    },
    alumnoResumen,
    inscripcion.comedor.nombre,
  );

  if (salida.permitido) {
    void notificarTutores(prisma, {
      alumno: a,
      punto: PuntoControl.COMEDOR,
      detalle: inscripcion.comedor.nombre,
      registroId: salida.registroId,
    });
  }

  return salida;
}

// ==================================================================
// Notificación a los tutores
// ==================================================================

type AlumnoConTutores = {
  id: number;
  apellido: string;
  nombres: string;
  tutores: { tutor: { id: number; nombre: string; email: string } }[];
};

/**
 * Avisa a los tutores, en el momento.
 *
 * Se dispara sin `await` desde el flujo del escaneo a propósito: **el operador
 * no puede quedarse esperando a que salga un mail con quince chicos haciendo
 * fila para subir al micro.** El acceso ya quedó registrado; el aviso viaja
 * detrás. Si falla, se loguea y el registro queda con `notificado = false`.
 */
async function notificarTutores(
  prisma: PrismaClient,
  datos: {
    alumno: AlumnoConTutores;
    punto: PuntoControl;
    detalle: string;
    registroId: number | null;
  },
): Promise<void> {
  const { alumno, punto, detalle, registroId } = datos;

  const nombre = `${alumno.nombres} ${alumno.apellido}`;
  const hora = new Date().toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  });

  const titulo = punto === PuntoControl.TRANSPORTE ? 'Subió al micro' : 'Ingresó al comedor';
  const contenido =
    punto === PuntoControl.TRANSPORTE
      ? `${nombre} subió al transporte escolar a las ${hora}. Recorrido: ${detalle}.`
      : `${nombre} ingresó al comedor a las ${hora}. Servicio: ${detalle}.`;

  try {
    for (const { tutor } of alumno.tutores) {
      await prisma.notification.create({
        data: { userId: tutor.id, titulo, contenido, link: '/panel_padre.html#mis-hijos' },
      });

      await registrarEnvio(prisma, {
        to: tutor.email,
        subject: `${titulo} — ${nombre}`,
        text: [
          `Hola ${tutor.nombre},`,
          '',
          contenido,
          '',
          'Este aviso es automático y se genera al escanear el carnet digital.',
          '',
          'Centro Educativo "Transformar para educar" — Resistencia, Chaco',
        ].join('\n'),
        tipo: punto === PuntoControl.TRANSPORTE ? 'ACCESO_TRANSPORTE' : 'ACCESO_COMEDOR',
        alumnoId: alumno.id,
      });
    }

    if (registroId !== null) {
      await prisma.registroAcceso.update({
        where: { id: registroId },
        data: { notificado: true },
      });
    }
  } catch (err) {
    // Que falle el aviso no invalida el acceso: el chico ya subió al micro.
    logger.error('[accesos] no se pudo notificar a los tutores', err);
  }
}

// ==================================================================
// Consulta
// ==================================================================

export async function historialAccesos(
  prisma: PrismaClient,
  filtros: {
    alumnoId?: number;
    punto?: PuntoControl;
    desde?: Date;
    hasta?: Date;
    soloRechazados?: boolean;
    limite?: number;
  },
) {
  const registros = await prisma.registroAcceso.findMany({
    where: {
      ...(filtros.alumnoId ? { alumnoId: filtros.alumnoId } : {}),
      ...(filtros.punto ? { punto: filtros.punto } : {}),
      ...(filtros.soloRechazados ? { resultado: { not: ResultadoAcceso.PERMITIDO } } : {}),
      ...(filtros.desde || filtros.hasta
        ? {
            createdAt: {
              ...(filtros.desde ? { gte: filtros.desde } : {}),
              ...(filtros.hasta ? { lte: filtros.hasta } : {}),
            },
          }
        : {}),
    },
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
      recorrido: { select: { codigo: true, nombre: true } },
      comedor: { select: { nombre: true } },
      operador: { select: { id: true, nombre: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(filtros.limite ?? 100, 500),
  });

  return registros.map((r) => ({
    id: r.id,
    fecha: r.createdAt,
    punto: r.punto,
    resultado: r.resultado,
    motivo: r.motivo,
    notificado: r.notificado,
    alumno: r.alumno
      ? {
          id: r.alumno.id,
          legajo: r.alumno.legajo,
          nombre: `${r.alumno.apellido}, ${r.alumno.nombres}`,
          curso: `${r.alumno.curso.nombre} "${r.alumno.curso.division}"`,
        }
      : null,
    recorrido: r.recorrido,
    comedor: r.comedor,
    operador: r.operador,
  }));
}
