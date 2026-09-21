/**
 * Endpoints de recuperación y cambio de contraseña.
 * Se montan bajo `/api/auth`, junto al resto del flujo de autenticación.
 */

import { Router } from 'express';
import { z } from 'zod';

import { prisma } from '../../db/prisma';
import { requireAuth } from '../../middleware/auth';
import { rateLimit } from '../shared/rateLimit';
import { cambiarPassword, confirmarReset, solicitarReset, RESET_TTL_MINUTOS } from './password.service';
import { passwordSchema } from './politicaPassword';

const router = Router();

/**
 * Política de contraseñas. Mínimo 8 caracteres con letras y números: más
 * exigente que los 6 sueltos que pide hoy el registro, sin volverse impracticable
 * para los tutores.
 */
// ------------------------------------------------------------------
// POST /api/auth/forgot-password
// ------------------------------------------------------------------

const forgotSchema = z.object({ email: z.string().email() });

router.post(
  '/forgot-password',
  rateLimit({
    max: 5,
    ventanaMs: 15 * 60 * 1000,
    mensaje: 'Demasiados pedidos de recuperación. Esperá unos minutos antes de reintentar.',
  }),
  async (req, res, next) => {
    try {
      const { email } = forgotSchema.parse(req.body);

      await solicitarReset(prisma, {
        email,
        origen: req.ip,
        baseUrl: `${req.protocol}://${req.get('host') ?? ''}`,
      });

      // Respuesta idéntica exista o no la cuenta: no se filtra qué mails están
      // registrados en el colegio.
      res.json({
        exito: true,
        mensaje:
          'Si el correo corresponde a una cuenta activa, te enviamos un enlace para restablecer la contraseña. ' +
          `El enlace vence en ${RESET_TTL_MINUTOS} minutos.`,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------
// POST /api/auth/reset-password
// ------------------------------------------------------------------

const resetSchema = z.object({
  token: z.string().length(64, 'Token inválido.'),
  password: passwordSchema,
});

router.post(
  '/reset-password',
  rateLimit({
    max: 10,
    ventanaMs: 15 * 60 * 1000,
    mensaje: 'Demasiados intentos. Esperá unos minutos antes de reintentar.',
  }),
  async (req, res, next) => {
    try {
      const { token, password } = resetSchema.parse(req.body);
      const { usuario } = await confirmarReset(prisma, { token, nuevaPassword: password });

      res.json({
        exito: true,
        mensaje: 'Contraseña actualizada. Ya podés iniciar sesión.',
        usuario,
      });
    } catch (err) {
      next(err);
    }
  },
);

// ------------------------------------------------------------------
// POST /api/auth/change-password  (con sesión iniciada)
// ------------------------------------------------------------------

const changeSchema = z.object({
  actual: z.string().min(1, 'Ingresá tu contraseña actual.'),
  nueva: passwordSchema,
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { actual, nueva } = changeSchema.parse(req.body);
    await cambiarPassword(prisma, req.authUser!.id, actual, nueva);

    res.json({ exito: true, mensaje: 'Contraseña actualizada correctamente.' });
  } catch (err) {
    next(err);
  }
});

export { router as passwordRouter };
