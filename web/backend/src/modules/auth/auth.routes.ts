import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { Role } from '@prisma/client';

import { prisma } from '../../db/prisma';
import { HttpError } from '../../utils/httpError';
import { requireAuth, signAccessToken, signRefreshToken, verifyRefreshToken } from '../../middleware/auth';
import { rateLimit } from '../shared/rateLimit';
import { env } from '../../config/env';

const REFRESH_COOKIE = 'et_refresh';
const refreshCookieOpts = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/api/auth',
  maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
};

const router = Router();

const tipoToRole: Record<string, Role> = {
  estudiante: Role.ESTUDIANTE,
  docente: Role.DOCENTE,
  padre: Role.PADRE,
  admin: Role.ADMIN,
};

const roleToTipo: Record<Role, string> = {
  ESTUDIANTE: 'estudiante',
  DOCENTE: 'docente',
  PADRE: 'padre',
  ADMIN: 'admin',
};

/**
 * Los mensajes van explícitos y en castellano porque el errorHandler responde
 * siempre "Datos inválidos" y manda el motivo campo por campo en `details`.
 * Con los textos por defecto de Zod ese detalle llegaba en inglés ("String
 * must contain at least 3 character(s)") y el formulario no tenía nada legible
 * que mostrarle a la persona.
 */
const registerSchema = z.object({
  tipo: z.enum(['estudiante', 'docente', 'padre'], {
    errorMap: () => ({ message: 'Elegí un tipo de usuario de la lista.' }),
  }),
  nombre: z.string().min(2, 'El nombre debe tener al menos 2 caracteres.'),
  email: z.string().email('El correo no tiene un formato válido.'),
  usuario: z
    .string()
    .min(3, 'El usuario debe tener al menos 3 caracteres.')
    .max(40, 'El usuario no puede superar los 40 caracteres.'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres.'),
  dni: z
    .string()
    .min(6, 'El DNI debe tener al menos 6 dígitos.')
    .max(15, 'El DNI no puede superar los 15 dígitos.'),
  curso: z.string().optional().nullable(),
});

/**
 * El registro responde con el campo que ya está tomado ("Ya existe una cuenta
 * con ese DNI"), decisión deliberada: con el mensaje genérico anterior la
 * persona no sabía qué dato cambiar y reintentaba con el mismo valor. La
 * contrapartida es que ese mensaje permite sondear si un DNI o un correo están
 * registrados, y sin límite de intentos ese sondeo es gratis e ilimitado: el
 * padrón entero de una escuela son unos pocos miles de DNI.
 *
 * Diez por hora y por IP no molesta a nadie —una familia se registra una vez—
 * y convierte el sondeo en 240 pruebas por día, que no sirve para recorrer un
 * padrón. Cierra el canal lo suficiente sin tener que sacar el mensaje útil.
 */
router.post(
  '/register',
  rateLimit({
    max: 10,
    ventanaMs: 60 * 60 * 1000,
    mensaje: 'Demasiados intentos de registro. Probá de nuevo en un rato.',
  }),
  async (req, res, next) => {
    try {
      const data = registerSchema.parse(req.body);

      // usuario, email y dni son @unique por separado. Se informa cuál de los
      // tres choca: con el mensaje genérico anterior la persona no sabía qué
      // dato cambiar y reintentaba con el mismo valor.
      const enUso = await prisma.user.findMany({
        where: {
          OR: [
            { usuario: data.usuario },
            { email: data.email },
            { dni: data.dni },
          ],
        },
        select: { usuario: true, email: true, dni: true },
      });
      if (enUso.length > 0) {
        const campos: string[] = [];
        if (enUso.some((u) => u.usuario === data.usuario)) campos.push('usuario');
        if (enUso.some((u) => u.email === data.email)) campos.push('email');
        if (enUso.some((u) => u.dni === data.dni)) campos.push('dni');

        const etiquetas: Record<string, string> = {
          usuario: 'ese nombre de usuario',
          email: 'ese correo',
          dni: 'ese DNI',
        };
        const lista = campos.map((c) => etiquetas[c]);
        const detalle =
          lista.length === 1
            ? lista[0]
            : `${lista.slice(0, -1).join(', ')} y ${lista[lista.length - 1]}`;

        throw HttpError.conflict(`Ya existe una cuenta con ${detalle}.`, { campos });
      }

      const hash = await bcrypt.hash(data.password, 10);
      const role = tipoToRole[data.tipo];
      // Los docentes quedan inactivos hasta que un ADMIN los apruebe.
      const pendingApproval = role === Role.DOCENTE;
      await prisma.user.create({
        data: {
          usuario: data.usuario,
          email: data.email,
          dni: data.dni,
          password: hash,
          role,
          nombre: data.nombre,
          curso: data.tipo === 'estudiante' ? data.curso ?? null : null,
          isActive: !pendingApproval,
        },
      });

      res.json({
        exito: true,
        mensaje: pendingApproval
          ? 'Registro recibido. Tu cuenta de docente está pendiente de aprobación por un administrador.'
          : '¡Registro exitoso!',
        pendingApproval,
      });
    } catch (err) {
      next(err);
    }
  },
);

const loginSchema = z.object({
  usuario: z.string().min(1, 'Ingresá tu usuario.'),
  password: z.string().min(1, 'Ingresá tu contraseña.'),
});

/**
 * El login tampoco tenía límite de intentos, pese a que el encabezado de
 * `shared/rateLimit` lo da por cubierto: el middleware se escribió para login y
 * recuperación de contraseña, pero sólo llegó a cablearse en el segundo. Probar
 * contraseñas contra una cuenta conocida era gratis, y el seed reparte `123456`.
 *
 * La clave combina IP y usuario en lugar de usar sólo una de las dos. Sólo la
 * IP castigaría a una escuela entera, que sale a internet por una única salida:
 * un chico que se equivoca cinco veces dejaría afuera al resto del turno. Sólo
 * el usuario permitiría bloquear la cuenta de otro a propósito con intentos
 * fallidos desde cualquier lado. Combinadas, el atacante queda limitado por
 * cuenta y por origen, y el vecino de al lado no paga sus intentos.
 */
router.post(
  '/login',
  rateLimit({
    max: 10,
    ventanaMs: 15 * 60 * 1000,
    clave: (req) => `${req.ip ?? 'desconocida'}|${String((req.body as { usuario?: unknown })?.usuario ?? '')}`,
    mensaje: 'Demasiados intentos fallidos. Esperá unos minutos antes de reintentar.',
  }),
  async (req, res, next) => {
    try {
      const { usuario, password } = loginSchema.parse(req.body);

      const user = await prisma.user.findUnique({ where: { usuario } });
      if (!user) {
        throw HttpError.unauthorized('El usuario no existe.');
      }
      if (!user.isActive) {
        if (user.role === Role.DOCENTE) {
          throw HttpError.unauthorized('Tu cuenta de docente está pendiente de aprobación por un administrador.');
        }
        throw HttpError.unauthorized('La cuenta está deshabilitada.');
      }

      const ok = await bcrypt.compare(password, user.password);
      if (!ok) {
        throw HttpError.unauthorized('Contraseña incorrecta.');
      }

      const token = signAccessToken({
        id: user.id,
        usuario: user.usuario,
        role: user.role,
      });
      const refresh = signRefreshToken({ id: user.id, v: 1 });
      res.cookie(REFRESH_COOKIE, refresh, refreshCookieOpts);

      res.json({
        exito: true,
        mensaje: 'Bienvenido',
        usuario: {
          id: user.id,
          nombre: user.nombre,
          tipo: roleToTipo[user.role],
          token,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw HttpError.unauthorized('No hay refresh token.');
    let payload;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw HttpError.unauthorized('Refresh token inválido o expirado.');
    }
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user || !user.isActive) throw HttpError.unauthorized('Cuenta deshabilitada.');

    const access = signAccessToken({ id: user.id, usuario: user.usuario, role: user.role });
    const newRefresh = signRefreshToken({ id: user.id, v: payload.v + 1 });
    res.cookie(REFRESH_COOKIE, newRefresh, refreshCookieOpts);

    res.json({
      exito: true,
      usuario: {
        id: user.id,
        nombre: user.nombre,
        tipo: roleToTipo[user.role],
        token: access,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
  res.json({ exito: true });
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const me = await prisma.user.findUnique({
      where: { id: req.authUser!.id },
      select: {
        id: true,
        usuario: true,
        email: true,
        dni: true,
        nombre: true,
        role: true,
        curso: true,
      },
    });
    if (!me) throw HttpError.unauthorized('Sesión inválida.');
    res.json({
      exito: true,
      usuario: { ...me, tipo: roleToTipo[me.role] },
    });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };
