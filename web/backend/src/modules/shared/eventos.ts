/**
 * Bus de eventos del servidor: el sujeto del patrón Observer.
 *
 * Cada escritura que termina bien publica "cambió X" con su audiencia. Quien
 * escucha —hoy, Socket.IO, en `sockets/io.ts`— lo reenvía a los clientes
 * conectados, y cada cliente vuelve a pedir lo que cambió por los endpoints de
 * siempre. **El evento no lleva datos**: así no puede filtrar nada que la
 * autorización de cada endpoint no deje ver.
 *
 * Antes había un único evento, el de mensajes nuevos: un anuncio, una nota o
 * una cuota nueva no se veían hasta recargar la página.
 */

import { EventEmitter } from 'node:events';
import { Role } from '@prisma/client';

export type Recurso =
  | 'anuncios'
  | 'calificaciones'
  | 'asistencia'
  | 'cuotas'
  | 'comprobantes'
  | 'facturas'
  | 'usuarios'
  | 'docentes'
  | 'moderacion'
  | 'vinculos'
  | 'academico'
  | 'alumnos'
  | 'profesores'
  | 'actividades'
  | 'planes'
  | 'foro'
  | 'deportes'
  | 'servicios'
  | 'credenciales'
  | 'avisos'
  | 'transporte'
  | 'accesos';

export type Accion = 'crear' | 'editar' | 'borrar';

export interface Cambio {
  recurso: Recurso;
  accion: Accion;
  /** Roles que tienen que enterarse. */
  roles?: readonly Role[];
  /** Usuarios puntuales, además de los roles. */
  usuarios?: readonly number[];
  /** Quien hizo el cambio: a sus pestañas les llega marcado como propio. */
  autorId?: number;
}

const bus = new EventEmitter();

export function publicarCambio(cambio: Cambio): void {
  bus.emit('cambio', cambio);
}

/** Suscribe un oyente. Devuelve la función para darlo de baja. */
export function alCambiar(oyente: (cambio: Cambio) => void): () => void {
  bus.on('cambio', oyente);
  return () => bus.off('cambio', oyente);
}

// ==================================================================
// Qué cambió y quién tiene que enterarse, según la ruta
// ==================================================================

const TODOS: readonly Role[] = [Role.ESTUDIANTE, Role.DOCENTE, Role.PADRE, Role.ADMIN];
const CURSADA: readonly Role[] = [Role.ESTUDIANTE, Role.PADRE, Role.DOCENTE, Role.ADMIN];
const FAMILIAS: readonly Role[] = [Role.PADRE, Role.ADMIN];
const AULA: readonly Role[] = [Role.ESTUDIANTE, Role.DOCENTE, Role.ADMIN];
const PERSONAL: readonly Role[] = [Role.ADMIN, Role.DOCENTE];
const ADMIN: readonly Role[] = [Role.ADMIN];

/**
 * Prefijo de ruta (relativo a `/api`) → recurso y audiencia. Los más
 * específicos van primero: `/admin/payments` es una cuota, no moderación.
 */
const TABLA: ReadonlyArray<{ prefijo: string; recurso: Recurso; roles: readonly Role[] }> = [
  { prefijo: '/admin/payments', recurso: 'cuotas', roles: FAMILIAS },
  { prefijo: '/admin/users', recurso: 'usuarios', roles: ADMIN },
  { prefijo: '/admin/teachers', recurso: 'docentes', roles: ADMIN },
  { prefijo: '/admin/links', recurso: 'vinculos', roles: FAMILIAS },
  { prefijo: '/admin', recurso: 'moderacion', roles: ADMIN },
  // Las solicitudes del portal (inscripción, opiniones, empleo) llegan sin
  // sesión y son lo que el administrador modera.
  { prefijo: '/public', recurso: 'moderacion', roles: ADMIN },
  // Un registro nuevo puede ser un docente esperando aprobación.
  { prefijo: '/auth/register', recurso: 'usuarios', roles: ADMIN },
  { prefijo: '/announcements', recurso: 'anuncios', roles: TODOS },
  { prefijo: '/grades', recurso: 'calificaciones', roles: CURSADA },
  { prefijo: '/attendance', recurso: 'asistencia', roles: CURSADA },
  { prefijo: '/payments', recurso: 'cuotas', roles: FAMILIAS },
  { prefijo: '/facturacion/comprobantes', recurso: 'comprobantes', roles: FAMILIAS },
  { prefijo: '/facturacion', recurso: 'facturas', roles: FAMILIAS },
  { prefijo: '/academico', recurso: 'academico', roles: PERSONAL },
  { prefijo: '/alumnos', recurso: 'alumnos', roles: [Role.ADMIN, Role.DOCENTE, Role.PADRE] },
  { prefijo: '/profesores', recurso: 'profesores', roles: PERSONAL },
  { prefijo: '/activities', recurso: 'actividades', roles: AULA },
  { prefijo: '/study-plans', recurso: 'planes', roles: AULA },
  { prefijo: '/forum', recurso: 'foro', roles: AULA },
  { prefijo: '/deportes', recurso: 'deportes', roles: FAMILIAS },
  { prefijo: '/servicios', recurso: 'servicios', roles: FAMILIAS },
  { prefijo: '/credenciales', recurso: 'credenciales', roles: FAMILIAS },
  { prefijo: '/avisos', recurso: 'avisos', roles: PERSONAL },
  { prefijo: '/transporte', recurso: 'transporte', roles: PERSONAL },
];

/**
 * Escrituras que no se publican aunque caigan bajo un prefijo de la tabla:
 * tienen su propio aviso o son de alta frecuencia. Las rutas de sesión
 * (`/auth/login`, `/auth/refresh`…) no están en la tabla, así que tampoco.
 */
const EXCLUIDAS: readonly string[] = [
  '/messages', //             ya emite 'new-message' al destinatario
  '/notifications', //        marcar como leída es de cada uno
  '/accesos/escanear', //     uno por alumno en la fila; avisa a sus tutores por su lado
  '/transporte/posicion', //  una cada pocos segundos por micro
];

const ESCRITURAS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function bajo(ruta: string, prefijo: string): boolean {
  return ruta === prefijo || ruta.startsWith(prefijo + '/');
}

/** El cambio que publica una escritura, o `null` si no corresponde avisar. */
export function cambioDeRuta(metodo: string, ruta: string): Omit<Cambio, 'autorId'> | null {
  if (!ESCRITURAS.has(metodo.toUpperCase())) return null;
  if (EXCLUIDAS.some((p) => bajo(ruta, p))) return null;
  const fila = TABLA.find((f) => bajo(ruta, f.prefijo));
  if (!fila) return null;
  const m = metodo.toUpperCase();
  return {
    recurso: fila.recurso,
    accion: m === 'POST' ? 'crear' : m === 'DELETE' ? 'borrar' : 'editar',
    roles: fila.roles,
  };
}
