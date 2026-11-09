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

/**
 * `true` si el error de `expo-print` es sólo que la persona cerró el diálogo.
 *
 * En iOS, cerrar la hoja de impresión sin imprimir rechaza la promesa con
 * `PrintIncompleteException` ("Printing did not complete", código
 * `ERR_PRINT_INCOMPLETE`). Mostrarlo como error haría creer que el comprobante
 * no se pudo generar, cuando la persona sólo quería verlo.
 */
export function esImpresionCancelada(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (code === 'ERR_PRINT_INCOMPLETE') return true;
  return typeof message === 'string' && /printing did not complete/i.test(message);
}
