/**
 * Abre el comprobante de una cuota en una pestaña nueva.
 *
 * Lo usan el panel del tutor y el del estudiante. La ruta
 * `/api/facturacion/facturas/:id/comprobante` exige el token en el header
 * `Authorization`, y un enlace común no lo manda: por eso el HTML se pide con el
 * cliente de la API —que agrega el token y lo renueva si venció— y se escribe
 * en la pestaña nueva, que se abrió en blanco.
 *
 * La pestaña se abre antes del pedido, dentro del clic: abierta después del
 * `await`, el navegador la tomaría por una ventana emergente y la bloquearía.
 * Si igual la bloquea (un bloqueador estricto, o un navegador embebido), el
 * comprobante se descarga como archivo: la familia no se queda sin él.
 */

import api from './api.js';
import { avisar } from './ui.js';

export async function verComprobante(facturaId, numero) {
  const ventana = window.open('', '_blank');
  if (ventana) {
    ventana.opener = null;
    ventana.document.title = 'Comprobante';
    ventana.document.body.textContent = 'Cargando el comprobante…';
  }

  try {
    const html = await api.facturacion.comprobanteHtml(facturaId);

    if (ventana) {
      // Se escribe el documento en la pestaña en blanco en vez de navegarla a
      // un `blob:`: funciona igual en todos los navegadores y no depende de
      // que dejen abrir esas URL en primer plano.
      ventana.document.open();
      ventana.document.write(html);
      ventana.document.close();
      return;
    }

    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `comprobante-${numero}.html`;
    document.body.append(enlace);
    enlace.click();
    enlace.remove();
    // La descarga ya arrancó: el Blob se puede soltar.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    avisar('El navegador no dejó abrir una pestaña nueva, así que descargamos el comprobante. Abrilo para verlo o imprimirlo.');
  } catch (err) {
    ventana?.close();
    avisar(err?.message ?? 'No se pudo abrir el comprobante.', 'error');
  }
}

export default { verComprobante };
