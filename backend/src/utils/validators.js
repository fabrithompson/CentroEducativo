// Validaciones reutilizables del lado del servidor.
// Devuelven un array de mensajes de error (vacío = todo OK).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const ROLES = ['estudiante', 'padre', 'docente', 'autoridad', 'personal'];

export function esEmailValido(email) {
  return typeof email === 'string' && EMAIL_RE.test(email.trim());
}

export function validarRegistro(data) {
  const errores = [];
  const { rol, nombre, email, usuario, password } = data;

  if (!nombre || !nombre.trim()) errores.push('El nombre es obligatorio.');
  if (!usuario || !usuario.trim()) errores.push('El usuario es obligatorio.');
  if (!ROLES.includes(rol)) errores.push('El rol seleccionado no es válido.');
  if (!esEmailValido(email)) errores.push('El email no tiene un formato válido.');
  if (!password || password.length < 8)
    errores.push('La contraseña debe tener al menos 8 caracteres.');

  return errores;
}

export function validarOpinion(data) {
  const errores = [];
  const { nombre, comentario, valoracion } = data;

  if (!nombre || !nombre.trim()) errores.push('El nombre es obligatorio.');
  if (!comentario || !comentario.trim()) errores.push('El comentario es obligatorio.');
  const v = Number(valoracion);
  if (!Number.isInteger(v) || v < 1 || v > 5)
    errores.push('La valoración debe ser un número entre 1 y 5.');

  return errores;
}

export function validarInscripcion(data) {
  const errores = [];
  const { nombre_tutor, email, telefono, nombre_alumno, nivel } = data;

  if (!nombre_tutor || !nombre_tutor.trim()) errores.push('El nombre del tutor es obligatorio.');
  if (!esEmailValido(email)) errores.push('El email no tiene un formato válido.');
  if (!telefono || !telefono.trim()) errores.push('El teléfono es obligatorio.');
  if (!nombre_alumno || !nombre_alumno.trim()) errores.push('El nombre del alumno es obligatorio.');
  if (!nivel || !nivel.trim()) errores.push('El nivel educativo es obligatorio.');

  return errores;
}

export function validarContacto(data) {
  const errores = [];
  const { nombre, email, mensaje } = data;

  if (!nombre || !nombre.trim()) errores.push('El nombre es obligatorio.');
  if (!esEmailValido(email)) errores.push('El email no tiene un formato válido.');
  if (!mensaje || !mensaje.trim()) errores.push('El mensaje es obligatorio.');

  return errores;
}

export function validarPostulacion(data) {
  const errores = [];
  const { nombre, email, puesto } = data;

  if (!nombre || !nombre.trim()) errores.push('El nombre es obligatorio.');
  if (!esEmailValido(email)) errores.push('El email no tiene un formato válido.');
  if (!puesto || !puesto.trim()) errores.push('El puesto es obligatorio.');

  return errores;
}
