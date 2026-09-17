import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'node:path';

import { env } from './config/env';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  // Antes que nada, para que alcance también a los estáticos y a las respuestas
  // JSON. El portal se servía sin comprimir: styles.css viajaba con sus 43 KB
  // completos e index.html con 33 KB, en cada visita nueva. Con gzip bajan a
  // menos de la cuarta parte, que es lo que más pesa en el tiempo de carga
  // sobre una conexión lenta.
  app.use(compression());

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  // En test se silencia: el log de cada request tapa la salida del runner.
  if (env.NODE_ENV !== 'test') {
    app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  }

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'transformar-para-educar-api',
      env: env.NODE_ENV,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  const uploadsAbsPath = path.resolve(process.cwd(), env.UPLOAD_DIR);
  app.use('/uploads', express.static(uploadsAbsPath));

  app.use('/api', apiRouter);

  const frontendDir = path.resolve(process.cwd(), '..', 'frontend');
  // `maxAge` evita que el navegador revalide cada archivo en cada visita: sin
  // esto, cada recarga pedía los 5 estáticos y recibía cinco 304, con su ida y
  // vuelta de red cada uno. Una hora es corto para no servir una versión vieja
  // tras un despliegue, y suficiente para cubrir la sesión de navegación.
  app.use(express.static(frontendDir, { maxAge: '1h' }));
  app.get('/', (_req, res) => res.sendFile(path.join(frontendDir, 'index.html')));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
