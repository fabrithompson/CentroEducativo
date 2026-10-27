/**
 * El texto que se le muestra a la persona cuando la API responde un error.
 *
 * Un error de validación llega con el texto genérico "Datos inválidos" y el
 * motivo real campo por campo en `details` ("Número de operación: tiene que
 * tener al menos 3 caracteres."). La app mostraba sólo lo genérico: quien
 * cargaba un comprobante no sabía qué campo corregir.
 */
export function mensajeDeError(data: Record<string, unknown> | null | undefined): string {
  const detalles =
    data?.details && typeof data.details === 'object'
      ? Object.values(data.details as Record<string, unknown>)
          .flat()
          .filter((d): d is string => typeof d === 'string' && d.length > 0)
      : [];
  if (detalles.length > 0) return detalles.join(' ');

  const mensaje = data?.message ?? data?.mensaje;
  return typeof mensaje === 'string' && mensaje.length > 0 ? mensaje : 'No se pudo completar la operación.';
}
