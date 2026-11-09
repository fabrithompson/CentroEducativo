/**
 * Validación de formato de los formularios de la app.
 *
 * Sólo formato, para no gastar un pedido en algo que va a fallar: las reglas
 * de negocio (contraseña actual correcta, tope de deportes, permisos) las
 * resuelve el backend y la app muestra su mensaje. Los límites copian los del
 * backend (`auth/politicaPassword.ts`, `moderacion.routes.ts`).
 */

const LARGO_MINIMO_CLAVE = 8;

/** Devuelve el problema, o `null` si se puede mandar. */
export function validarClaveNueva(actual: string, nueva: string, repetida: string): string | null {
  if (!actual) return 'Ingresá tu contraseña actual.';
  if (nueva.length < LARGO_MINIMO_CLAVE) return `La contraseña nueva tiene que tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`;
  if (!/[a-zA-Z]/.test(nueva) || !/\d/.test(nueva)) return 'La contraseña nueva tiene que combinar letras y números.';
  if (nueva !== repetida) return 'Las dos contraseñas nuevas no coinciden.';
  if (nueva === actual) return 'La contraseña nueva tiene que ser distinta de la actual.';
  return null;
}

/**
 * Lee un importe escrito a mano en pesos: "104000", "104.000", "104000,50" o
 * "104.000,50". En Argentina el punto separa miles y la coma, decimales.
 */
export function leerImporte(texto: string): { valor: number } | { error: string } {
  const limpio = texto.replace(/\$|\s/g, '');
  if (!limpio) return { error: 'Ingresá un importe.' };
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(limpio)) {
    return { error: 'Escribí el importe sólo con números, por ejemplo 104.000 o 104000,50.' };
  }
  const valor = Number(limpio.replace(/\./g, '').replace(',', '.'));
  if (!(valor > 0)) return { error: 'El importe tiene que ser mayor que cero.' };
  return { valor };
}

export interface DatosSolicitudCursado {
  nombreTutor: string;
  emailTutor: string;
  telefonoTutor: string;
  nombreEstudiante: string;
  nivel: string;
  curso: string;
}

export function validarSolicitudCursado(d: DatosSolicitudCursado): string | null {
  if (d.nombreTutor.trim().length < 2) return 'Completá tu nombre.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.emailTutor.trim())) return 'Revisá el correo: no parece válido.';
  if (d.telefonoTutor.replace(/\D/g, '').length < 6) return 'Completá un teléfono de contacto.';
  if (d.nombreEstudiante.trim().length < 2) return 'Completá el nombre y apellido del estudiante.';
  if (!d.nivel) return 'Elegí el nivel.';
  if (!d.curso.trim()) return 'Indicá el curso, grado o sala.';
  return null;
}
