/**
 * Política de retención de datos (RNF-09, Ley 25.326).
 *
 * La ley pide que los datos se conserven **mientras sean necesarios para la
 * finalidad que justificó recolectarlos**. Hasta acá el sistema no borraba
 * nada: un CV rechazado hace tres años, el historial de a qué hora entró un
 * alumno al colegio en 2026 y la posición de cada micro cada pocos segundos se
 * acumulaban para siempre.
 *
 * DOS DECISIONES QUE CONVIENE ENTENDER ANTES DE TOCAR ESTO
 *
 * 1. **Arranca en modo informe.** Sin `RETENCION_ACTIVA=true` la tarea no
 *    borra: cuenta qué borraría y lo registra. Los plazos de abajo son una
 *    propuesta razonada, no una decisión de la institución, y activar el
 *    borrado antes de que alguien los confirme sería decidir por la escuela
 *    algo que después no se puede deshacer. Primero se mira el informe unos
 *    días, se ajustan los plazos, y recién ahí se activa.
 *
 * 2. **Sólo se purga lo que ya terminó su ciclo.** Una postulación pendiente,
 *    una inscripción sin resolver o una opinión sin moderar no se tocan por
 *    más vieja que sea: que lleven un año sin resolverse es un problema de
 *    gestión, no una autorización para borrarlas.
 *
 * Lo que NO entra acá, a propósito: alumnos, calificaciones, asistencias y
 * facturas. Tienen obligación de conservación documental y sus bajas son
 * lógicas. Borrarlos requiere una decisión caso por caso, no una tarea
 * automática.
 */

import type { PrismaClient } from '@prisma/client';

import { logger } from '../../utils/logger';

const DIA = 24 * 60 * 60 * 1000;

/**
 * Plazos propuestos, en días. Cada uno con el motivo por el que es ese número
 * y no otro: un plazo sin justificación es imposible de discutir con la
 * institución, que es quien tiene que confirmarlos.
 */
export const PLAZOS = {
  /**
   * Telemetría pura. El rastreo en vivo sólo mira los últimos minutos —el
   * propio código da la señal por perdida a los 5 minutos—, así que una
   * posición de hace tres meses no cumple ninguna función. Es además lo que
   * más volumen acumula: una fila cada pocos segundos por micro y por día.
   */
  posicionesTransporte: 90,

  /**
   * Un ciclo lectivo más margen. Es el historial de movimientos de un menor
   * —a qué hora entró, si subió al micro, si comió en el comedor— y es el dato
   * más sensible del sistema. Se conserva lo suficiente para resolver un
   * reclamo del año en curso y no más.
   */
  registrosDeAcceso: 400,

  /**
   * Evidencia de que se notificó una deuda. Un año cubre el ciclo lectivo y el
   * reclamo posterior, que es para lo que sirve.
   */
  registrosDeCorreo: 365,

  /** Igual que los correos: constancia de que el aviso salió. */
  mensajesEnviados: 365,

  /**
   * CV y datos de contacto de alguien que no entró a la institución. Se cuenta
   * desde que la postulación se resolvió, no desde que se cargó.
   */
  postulacionesResueltas: 365,

  /** Solicitud que no prosperó. Mismo criterio que las postulaciones. */
  inscripcionesResueltas: 365,

  /**
   * Opiniones que la moderación descartó. No se publican ni se van a publicar,
   * así que sólo queda el dato personal sin finalidad que lo sostenga.
   */
  opinionesRechazadas: 180,
} as const;

export type Plazos = typeof PLAZOS;

export interface LineaRetencion {
  concepto: string;
  modelo: string;
  plazoDias: number;
  alcanzados: number;
  borrados: number;
}

export interface ResultadoRetencion {
  activa: boolean;
  ejecutadaEn: Date;
  lineas: LineaRetencion[];
  totalAlcanzados: number;
  totalBorrados: number;
}

const corte = (dias: number, ahora: Date) => new Date(ahora.getTime() - dias * DIA);

/**
 * Recorre la política. Con `activa: false` sólo cuenta; con `true` borra.
 *
 * Cada entrada declara cómo contar y cómo borrar por separado en vez de
 * compartir un `where`, porque así el informe y el borrado no pueden
 * divergir por descuido: los dos salen de la misma constante.
 */
export async function aplicarRetencion(
  prisma: PrismaClient,
  opciones: { activa: boolean; ahora?: Date; plazos?: Plazos } = { activa: false },
): Promise<ResultadoRetencion> {
  const ahora = opciones.ahora ?? new Date();
  const plazos = opciones.plazos ?? PLAZOS;

  const entradas: {
    concepto: string;
    modelo: string;
    plazoDias: number;
    contar: () => Promise<number>;
    borrar: () => Promise<{ count: number }>;
  }[] = [
    {
      concepto: 'Posiciones del transporte',
      modelo: 'PosicionTransporte',
      plazoDias: plazos.posicionesTransporte,
      contar: () =>
        prisma.posicionTransporte.count({
          where: { registradoEn: { lt: corte(plazos.posicionesTransporte, ahora) } },
        }),
      borrar: () =>
        prisma.posicionTransporte.deleteMany({
          where: { registradoEn: { lt: corte(plazos.posicionesTransporte, ahora) } },
        }),
    },
    {
      concepto: 'Registros de acceso (carnet, comedor, transporte)',
      modelo: 'RegistroAcceso',
      plazoDias: plazos.registrosDeAcceso,
      contar: () =>
        prisma.registroAcceso.count({
          where: { createdAt: { lt: corte(plazos.registrosDeAcceso, ahora) } },
        }),
      borrar: () =>
        prisma.registroAcceso.deleteMany({
          where: { createdAt: { lt: corte(plazos.registrosDeAcceso, ahora) } },
        }),
    },
    {
      concepto: 'Registro de correos enviados',
      modelo: 'EmailLog',
      plazoDias: plazos.registrosDeCorreo,
      contar: () =>
        prisma.emailLog.count({
          where: { createdAt: { lt: corte(plazos.registrosDeCorreo, ahora) } },
        }),
      borrar: () =>
        prisma.emailLog.deleteMany({
          where: { createdAt: { lt: corte(plazos.registrosDeCorreo, ahora) } },
        }),
    },
    {
      concepto: 'Avisos por mensajería',
      modelo: 'MensajeEnviado',
      plazoDias: plazos.mensajesEnviados,
      contar: () =>
        prisma.mensajeEnviado.count({
          where: { createdAt: { lt: corte(plazos.mensajesEnviados, ahora) } },
        }),
      borrar: () =>
        prisma.mensajeEnviado.deleteMany({
          where: { createdAt: { lt: corte(plazos.mensajesEnviados, ahora) } },
        }),
    },
    {
      // `resolvedAt: { not: null }` es la parte importante: una postulación sin
      // resolver no se borra por vieja que sea.
      concepto: 'Postulaciones de empleo ya resueltas (incluye el CV)',
      modelo: 'EmploymentApplication',
      plazoDias: plazos.postulacionesResueltas,
      contar: () =>
        prisma.employmentApplication.count({
          where: { resolvedAt: { not: null, lt: corte(plazos.postulacionesResueltas, ahora) } },
        }),
      borrar: () =>
        prisma.employmentApplication.deleteMany({
          where: { resolvedAt: { not: null, lt: corte(plazos.postulacionesResueltas, ahora) } },
        }),
    },
    {
      concepto: 'Solicitudes de inscripción ya resueltas',
      modelo: 'Inscription',
      plazoDias: plazos.inscripcionesResueltas,
      contar: () =>
        prisma.inscription.count({
          where: { resolvedAt: { not: null, lt: corte(plazos.inscripcionesResueltas, ahora) } },
        }),
      borrar: () =>
        prisma.inscription.deleteMany({
          where: { resolvedAt: { not: null, lt: corte(plazos.inscripcionesResueltas, ahora) } },
        }),
    },
    {
      concepto: 'Opiniones rechazadas por moderación',
      modelo: 'OpinionPublica',
      plazoDias: plazos.opinionesRechazadas,
      contar: () =>
        prisma.opinionPublica.count({
          where: {
            status: 'RECHAZADO',
            resolvedAt: { not: null, lt: corte(plazos.opinionesRechazadas, ahora) },
          },
        }),
      borrar: () =>
        prisma.opinionPublica.deleteMany({
          where: {
            status: 'RECHAZADO',
            resolvedAt: { not: null, lt: corte(plazos.opinionesRechazadas, ahora) },
          },
        }),
    },
  ];

  const lineas: LineaRetencion[] = [];

  for (const e of entradas) {
    const alcanzados = await e.contar();
    // Se cuenta siempre, aunque esté activa: el informe tiene que decir lo
    // mismo que se borró, y un `deleteMany` sin filas devuelve 0 sin distinguir
    // "no había nada" de "no se ejecutó".
    const borrados = opciones.activa && alcanzados > 0 ? (await e.borrar()).count : 0;

    lineas.push({
      concepto: e.concepto,
      modelo: e.modelo,
      plazoDias: e.plazoDias,
      alcanzados,
      borrados,
    });
  }

  const totalAlcanzados = lineas.reduce((s, l) => s + l.alcanzados, 0);
  const totalBorrados = lineas.reduce((s, l) => s + l.borrados, 0);

  return { activa: opciones.activa, ejecutadaEn: ahora, lineas, totalAlcanzados, totalBorrados };
}

/** Deja el resultado en el log, que es donde se lo mira mientras esté en modo informe. */
export function registrarResultado(r: ResultadoRetencion): void {
  const detalle = r.lineas
    .filter((l) => l.alcanzados > 0)
    .map((l) => `${l.modelo}=${l.alcanzados}`)
    .join(' · ');

  if (r.totalAlcanzados === 0) {
    logger.info('[retencion] nada alcanzó su plazo.');
    return;
  }

  if (r.activa) {
    logger.info(`[retencion] borrados ${r.totalBorrados} registros — ${detalle}`);
  } else {
    logger.info(
      `[retencion] MODO INFORME: se borrarían ${r.totalAlcanzados} registros — ${detalle}. ` +
        'Activar con RETENCION_ACTIVA=true cuando la institución confirme los plazos.',
    );
  }
}
