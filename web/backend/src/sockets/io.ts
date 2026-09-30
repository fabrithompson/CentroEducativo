import type { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { alCambiar, type Cambio } from '../modules/shared/eventos';

interface SocketUser {
  id: number;
  usuario: string;
  role: string;
}

let cached: SocketIOServer | null = null;
let desuscribir: (() => void) | null = null;

export function attachSockets(io: SocketIOServer): void {
  cached = io;

  io.use((socket, next) => {
    const token = (socket.handshake.auth?.token as string | undefined)
      || (typeof socket.handshake.query.token === 'string' ? socket.handshake.query.token : undefined);
    if (!token) return next(new Error('Sin token'));
    try {
      const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as SocketUser;
      (socket.data as { user: SocketUser }).user = payload;
      next();
    } catch {
      next(new Error('Token inválido'));
    }
  });

  io.on('connection', (socket) => {
    const user = (socket.data as { user?: SocketUser }).user;
    if (!user) return socket.disconnect();
    socket.join('user:' + user.id);
    // Una sala por rol: lo que le importa a todo un rol —un anuncio, una
    // nota— se publica una vez y no una por usuario.
    socket.join('rol:' + user.role);
    logger.debug(`socket connect user=${user.usuario} id=${user.id}`);
    socket.on('disconnect', () => logger.debug(`socket disconnect user=${user.usuario}`));
  });

  // El oyente del bus de eventos: cada cambio publicado se reenvía.
  desuscribir?.();
  desuscribir = alCambiar((c) => reenviarCambio(io, c));
}

/**
 * Reenvía un cambio a las salas de su audiencia. Viaja sin datos —"cambió
 * X"—: cada cliente vuelve a pedir lo que le toca, con su propia autorización.
 * A las pestañas de quien hizo el cambio les llega marcado como propio, para
 * que la que lo hizo no se recargue dos veces.
 */
export function reenviarCambio(io: SocketIOServer, c: Cambio): void {
  const salas = [
    ...(c.roles ?? []).map((r) => 'rol:' + r),
    ...(c.usuarios ?? []).map((id) => 'user:' + id),
  ];
  if (salas.length === 0) return;

  const evento = { recurso: c.recurso, accion: c.accion };
  if (c.autorId) {
    io.to(salas).except('user:' + c.autorId).emit('cambio', evento);
    io.to('user:' + c.autorId).emit('cambio', { ...evento, propio: true });
  } else {
    io.to(salas).emit('cambio', evento);
  }
}

export function emitToUser(userId: number, event: string, payload: unknown): void {
  if (!cached) return;
  cached.to('user:' + userId).emit(event, payload);
}
