/**
 * Política de contraseñas, en un solo lugar.
 *
 * Estaba escrita dos veces y con reglas distintas: el registro público pedía 6
 * caracteres y nada más, mientras el cambio y el restablecimiento pedían 8 y
 * que combinaran letras y números. El resultado era que alguien podía crearse
 * una cuenta con una contraseña que el propio sistema le iba a rechazar
 * después si intentaba volver a ponerla. La regla más laxa es la que manda,
 * porque es la que se usa para entrar.
 *
 * El máximo de 72 no es arbitrario: bcrypt ignora en silencio todo lo que
 * pase de 72 bytes. Sin este tope, dos contraseñas largas que difieran
 * después del carácter 72 serían la misma para el sistema.
 */

import { z } from 'zod';

export const LARGO_MINIMO = 8;
export const LARGO_MAXIMO = 72;

export const passwordSchema = z
  .string()
  .min(LARGO_MINIMO, `La contraseña debe tener al menos ${LARGO_MINIMO} caracteres.`)
  .max(LARGO_MAXIMO, `La contraseña no puede superar los ${LARGO_MAXIMO} caracteres.`)
  .refine((v) => /[a-zA-Z]/.test(v) && /\d/.test(v), {
    message: 'La contraseña debe combinar letras y números.',
  });
