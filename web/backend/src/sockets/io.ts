import type { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { logger } from '../utils/logger';

interface SocketUser {
  id: number;
  usuario: string;
  role: string;
}

let cached: SocketIOServer | null = null;

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
    logger.debug(`socket connect user=${user.usuario} id=${user.id}`);
    socket.on('disconnect', () => logger.debug(`socket disconnect user=${user.usuario}`));
  });
}

export function emitToUser(userId: number, event: string, payload: unknown): void {
  if (!cached) return;
  cached.to('user:' + userId).emit(event, payload);
}
