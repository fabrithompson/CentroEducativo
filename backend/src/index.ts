import http from 'node:http';
import { Server as SocketIOServer } from 'socket.io';

import { env } from './config/env';
import { createApp } from './app';
import { logger } from './utils/logger';

async function bootstrap() {
  const app = createApp();
  const server = http.createServer(app);

  const io = new SocketIOServer(server, {
    cors: {
      origin: env.CORS_ORIGIN,
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    logger.debug(`Socket conectado: ${socket.id}`);
    socket.on('disconnect', () => logger.debug(`Socket desconectado: ${socket.id}`));
  });

  server.listen(env.PORT, () => {
    logger.info(
      `🚀 API lista en http://localhost:${env.PORT} (${env.NODE_ENV})`,
    );
    logger.info(`   Health check: http://localhost:${env.PORT}/health`);
    logger.info(`   API base:     http://localhost:${env.PORT}/api`);
  });

  const shutdown = (signal: string) => {
    logger.info(`Recibido ${signal}, cerrando servidor...`);
    io.close();
    server.close((err) => {
      if (err) {
        logger.error('Error cerrando el servidor', err);
        process.exit(1);
      }
      logger.info('Servidor cerrado limpiamente');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error('Error fatal durante el arranque', err);
  process.exit(1);
});
