/**
 * Contraste de color según WCAG 2.1, medido sobre los tokens reales del CSS.
 *
 * El proyecto hizo accesibilidad —etiquetas, foco visible, skip links— pero el
 * contraste nunca se había medido: se eligieron colores que "se veían bien".
 * Esto lo convierte en un número verificable y en una regresión que se atrapa
 * sola si alguien retoca la paleta.
 *
 * No reemplaza a Lighthouse, que además mide el contraste efectivo de cada
 * elemento pintado. Cubre lo que sí se puede decidir sin navegador: que cada
 * par texto/fondo declarado en la paleta cumpla el mínimo AA.
 *
 * Umbrales de la norma (§1.4.3): 4.5:1 para texto normal, 3:1 para texto
 * grande y para componentes de interfaz y bordes (§1.4.11).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const CSS = fs.readFileSync(
  path.resolve(import.meta.dirname ?? __dirname, '..', '..', 'frontend', 'css', 'componentes.css'),
  'utf8',
);

const AA_TEXTO = 4.5;
const AA_COMPONENTE = 3;

// ------------------------------------------------------------------
// Cálculo
// ------------------------------------------------------------------

function canales(hex: string): [number, number, number] {
  const limpio = hex.replace('#', '').trim();
  const completo =
    limpio.length === 3 ? limpio.split('').map((c) => c + c).join('') : limpio;

  assert.equal(completo.length, 6, `color no reconocido: ${hex}`);

  return [0, 2, 4].map((i) => parseInt(completo.slice(i, i + 2), 16)) as [number, number, number];
}

/** Luminancia relativa, WCAG 2.1 §relative luminance. */
function luminancia(hex: string): number {
  const [r, g, b] = canales(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(frente: string, fondo: string): number {
  const a = luminancia(frente);
  const b = luminancia(fondo);
  const [claro, oscuro] = a > b ? [a, b] : [b, a];
  return (claro + 0.05) / (oscuro + 0.05);
}

// ------------------------------------------------------------------
// Lectura de la paleta desde el CSS
// ------------------------------------------------------------------

function bloque(selector: string): Record<string, string> {
  const i = CSS.indexOf(selector);
  assert.ok(i >= 0, `no se encontró el bloque ${selector} en componentes.css`);

  const cuerpo = CSS.slice(CSS.indexOf('{', i) + 1, CSS.indexOf('}', i));
  const tokens: Record<string, string> = {};

  for (const [, nombre, valor] of cuerpo.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
    tokens[nombre] = valor;
  }
  return tokens;
}

const claro = bloque(':root {');
const oscuroBase = bloque("html[data-theme='dark'] {");
// El tema oscuro sólo redefine los fondos: los tokens que no toca siguen
// valiendo lo del tema claro, que es como los resuelve el navegador.
const oscuro = { ...claro, ...oscuroBase };

/** Colores de badge que el tema oscuro pisa por clase y no por token. */
function colorBadgeOscuro(tono: string): string {
  const marca = `html[data-theme='dark'] .badge--${tono}`;
  const i = CSS.indexOf(marca);
  assert.ok(i >= 0, `no se encontró la regla oscura de .badge--${tono}`);

  const m = /color:\s*(#[0-9a-fA-F]{3,6})/.exec(CSS.slice(i, CSS.indexOf('}', i)));
  assert.ok(m, `la regla oscura de .badge--${tono} no declara un color literal`);
  return m[1];
}

function verificar(etiqueta: string, frente: string, fondo: string, minimo: number): void {
  const ratio = contraste(frente, fondo);
  assert.ok(
    ratio >= minimo,
    `${etiqueta}: ${frente} sobre ${fondo} da ${ratio.toFixed(2)}:1, por debajo de ${minimo}:1`,
  );
}

// ------------------------------------------------------------------
// Tema claro
// ------------------------------------------------------------------

test('el texto principal cumple AA sobre las dos superficies', () => {
  verificar('texto/superficie', claro['--c-texto'], claro['--c-superficie'], AA_TEXTO);
  verificar('texto/superficie-2', claro['--c-texto'], claro['--c-superficie-2'], AA_TEXTO);
});

test('el texto secundario cumple AA sobre las dos superficies', () => {
  // `--c-texto-suave` es el que más riesgo corre: es gris sobre casi blanco y
  // se usa en leyendas y ayudas, que son texto normal y no decoración.
  verificar('texto-suave/superficie', claro['--c-texto-suave'], claro['--c-superficie'], AA_TEXTO);
  verificar('texto-suave/superficie-2', claro['--c-texto-suave'], claro['--c-superficie-2'], AA_TEXTO);
});

test('los cuatro badges cumplen AA en tema claro', () => {
  for (const tono of ['ok', 'espera', 'alerta', 'neutro']) {
    verificar(`badge ${tono}`, claro[`--c-${tono}`], claro[`--c-${tono}-bg`], AA_TEXTO);
  }
});

test('los estados se distinguen de la superficie como componentes de interfaz', () => {
  // El borde izquierdo del indicador es lo único que diferencia un estado de
  // otro cuando el texto es idéntico: si no contrasta, el estado no se ve.
  for (const tono of ['ok', 'espera', 'alerta']) {
    verificar(`indicador ${tono}`, claro[`--c-${tono}`], claro['--c-superficie'], AA_COMPONENTE);
  }
});

// ------------------------------------------------------------------
// Tema oscuro
// ------------------------------------------------------------------

test('el texto principal cumple AA sobre las dos superficies oscuras', () => {
  verificar('texto/superficie', oscuro['--c-texto'], oscuro['--c-superficie'], AA_TEXTO);
  verificar('texto/superficie-2', oscuro['--c-texto'], oscuro['--c-superficie-2'], AA_TEXTO);
});

test('el texto secundario cumple AA sobre las dos superficies oscuras', () => {
  verificar('texto-suave/superficie', oscuro['--c-texto-suave'], oscuro['--c-superficie'], AA_TEXTO);
  verificar('texto-suave/superficie-2', oscuro['--c-texto-suave'], oscuro['--c-superficie-2'], AA_TEXTO);
});

test('los cuatro badges cumplen AA en tema oscuro', () => {
  for (const tono of ['ok', 'espera', 'alerta', 'neutro']) {
    verificar(`badge ${tono}`, colorBadgeOscuro(tono), oscuro[`--c-${tono}-bg`], AA_TEXTO);
  }
});

// ==================================================================
// Portal público — `styles.css`
// ==================================================================
//
// Este bloque existe porque la primera versión de esta prueba medía sólo
// `componentes.css`, que es la hoja del backoffice. El portal público usa otra
// paleta, en `styles.css`, y nadie la había medido: Lighthouse sobre el sitio
// desplegado encontró 17 elementos por debajo del mínimo AA, con casos de
// 1.98:1 y 2.22:1. Ninguna prueba los atrapaba porque ninguna prueba miraba
// ese archivo.
//
// Los pares que se verifican acá son exactamente los que Lighthouse reportó.

const PORTAL = fs.readFileSync(
  path.resolve(import.meta.dirname ?? __dirname, '..', '..', 'frontend', 'styles.css'),
  'utf8',
);

/** Lee los tokens de `:root` de una hoja cualquiera. */
function paleta(css: string, selector: string, archivo: string): Record<string, string> {
  const i = css.indexOf(selector);
  assert.ok(i >= 0, `no se encontró el bloque ${selector} en ${archivo}`);

  const cuerpo = css.slice(css.indexOf('{', i) + 1, css.indexOf('}', i));
  const tokens: Record<string, string> = {};

  for (const [, nombre, valor] of cuerpo.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)) {
    tokens[nombre] = valor;
  }
  return tokens;
}

/**
 * Busca el color literal de una propiedad dentro de una regla del portal.
 * Se usa para los dos colores que no están en `:root` y viven sueltos en su
 * regla: el verde de WhatsApp y el gris de las opiniones.
 */
function propiedadDeRegla(selector: string, propiedad: string): string {
  const i = PORTAL.indexOf(selector);
  assert.ok(i >= 0, `no se encontró la regla ${selector} en styles.css`);

  const cuerpo = PORTAL.slice(i, PORTAL.indexOf('}', i));
  const m = new RegExp(`${propiedad}:\\s*(#[0-9a-fA-F]{3,6})`).exec(cuerpo);
  assert.ok(m, `${selector} no declara un ${propiedad} literal`);
  return m[1];
}

const portal = paleta(PORTAL, ':root {', 'styles.css');

test('el azul del portal cumple AA como texto y como fondo', () => {
  // `--secondary` se usa de las dos formas: como color de texto sobre blanco
  // (fechas de noticias, "leer más") y como fondo de los botones primarios con
  // texto blanco encima. Las dos situaciones se reducen al mismo par.
  verificar('secondary/blanco', portal['--secondary'], portal['--white'], AA_TEXTO);
});

test('el gris del portal cumple AA sobre las dos superficies', () => {
  // Es el color de los copetes y de los textos de apoyo. Sobre el gris claro de
  // las secciones es donde peor le va, y es el caso que Lighthouse marcó en
  // 2.22:1.
  verificar('gray/blanco', portal['--gray'], portal['--white'], AA_TEXTO);
  verificar('gray/light', portal['--gray'], portal['--light'], AA_TEXTO);
});

test('el botón de WhatsApp cumple AA con su texto blanco', () => {
  // El verde de marca de WhatsApp (#25d366) da 1.98:1 contra blanco, que es de
  // los peores valores posibles. Se conserva el tono y se baja la luminosidad
  // hasta cumplir: la marca se sigue reconociendo y el texto se lee.
  verificar(
    'btn-whatsapp',
    portal['--white'],
    propiedadDeRegla('.btn-whatsapp', 'background'),
    AA_TEXTO,
  );
});

test('el texto de las opiniones cumple AA sobre el fondo de su sección', () => {
  verificar(
    'opiniones',
    propiedadDeRegla('.opiniones-vacio', 'color'),
    portal['--light'],
    AA_TEXTO,
  );
});
