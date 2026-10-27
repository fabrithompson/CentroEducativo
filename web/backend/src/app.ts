import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'node:path';

import { env, TRUST_PROXY } from './config/env';
import { registrarMensajesEnEspanol } from './config/zodEs';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

/**
 * Política de seguridad de contenido (CSP). Antes estaba apagada: el navegador
 * ejecutaba un script o cargaba una hoja de estilos de cualquier origen que
 * lograra colarse en la página.
 *
 * Los orígenes externos son los que el frontend usa de verdad: cdnjs (iconos y
 * sus fuentes), jsDelivr (jsQR, el lector del escáner, con integridad) y
 * Unsplash (fotos del portal). Los paneles todavía llaman a sus funciones desde
 * atributos `onclick` y tienen <script> en línea, por eso `'unsafe-inline'` en
 * scripts: sacarlo exige mover esos manejadores a archivos, y queda como deuda.
 * No va `upgrade-insecure-requests`: en desarrollo (http://localhost) pasaría
 * todo a https y no cargaría nada; en producción Railway ya sirve sólo https.
 */
const POLITICA_DE_CONTENIDO = {
  defaultSrc: ["'self'"],
  baseUri: ["'self'"],
  objectSrc: ["'none'"],
  frameAncestors: ["'self'"],
  formAction: ["'self'"],
  scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
  scriptSrcAttr: ["'unsafe-inline'"],
  styleSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
  fontSrc: ["'self'", 'https://cdnjs.cloudflare.com', 'data:'],
  imgSrc: ["'self'", 'data:', 'blob:', 'https://images.unsplash.com'],
  // Socket.IO usa el mismo origen, tanto por sondeo como por WebSocket.
  connectSrc: ["'self'"],
};

export function createApp() {
  // Los errores de validación llegan a la pantalla tal cual: en español y
  // diciendo de qué campo se trata (ver config/zodEs.ts).
  registrarMensajesEnEspanol();

  const app = express();

  // De esto depende que `req.ip` sea la IP de quien realmente hace el pedido y
  // no la del edge de Railway. Todo `rateLimit` cuenta por IP, así que sin esto
  // los límites existen pero cuentan a todos los visitantes como si fueran uno.
  // El valor se resuelve en `config/env`, donde está la explicación completa.
  app.set('trust proxy', TRUST_PROXY);

  // Antes que nada, para que alcance también a los estáticos y a las respuestas
  // JSON. El portal se servía sin comprimir: styles.css viajaba con sus 43 KB
  // completos e index.html con 33 KB, en cada visita nueva. Con gzip bajan a
  // menos de la cuarta parte, que es lo que más pesa en el tiempo de carga
  // sobre una conexión lenta.
  app.use(compression());

  app.use(
    helmet({
      contentSecurityPolicy: { useDefaults: false, directives: POLITICA_DE_CONTENIDO },
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
