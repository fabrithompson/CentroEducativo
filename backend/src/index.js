import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRoutes from './routes/auth.js';
import publicRoutes from './routes/public.js';
import panelRoutes from './routes/panel.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 4000;

// --- Middlewares base ---
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir los CV subidos (solo lectura) para descarga desde el panel admin.
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// --- Rutas de la API ---
app.get('/api/health', (_req, res) => res.json({ ok: true, servicio: 'centro-educativo-api' }));
app.use('/api/auth', authRoutes);
app.use('/api', publicRoutes);
app.use('/api/panel', panelRoutes);

// --- 404 y manejador de errores ---
app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));
app.use((err, _req, res, _next) => {
  console.error('Error no controlado:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

app.listen(PORT, () => {
  console.log(`API del Centro Educativo escuchando en http://localhost:${PORT}`);
});
