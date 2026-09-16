/**
 * Verificación de accesibilidad y diseño responsive del frontend.
 *
 * El pedido incluía "verificá que el diseño sea responsive, limpio y accesible".
 * Sin un navegador no se puede medir contraste real ni probar un lector de
 * pantalla, pero sí se puede auditar el marcado, que es donde se rompe la
 * mayoría de estas cosas: imágenes sin `alt`, controles sin `<label>`, páginas
 * sin `lang`, tablas sin encabezados, y CSS sin puntos de quiebre.
 *
 * Es un chequeo estático sobre los archivos reales, no sobre una copia.
 * Si alguien agrega una imagen sin `alt`, esta suite falla.
 *
 *   pnpm --filter backend test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const FRONTEND = path.resolve(import.meta.dirname ?? __dirname, '..', '..', 'frontend');

const PAGINAS = [
  'index.html',
  'panel_admin.html',
  'panel_docente.html',
  'panel_padre.html',
  'panel_estudiante.html',
];

const leer = (archivo: string) => readFileSync(path.join(FRONTEND, archivo), 'utf8');

/** Quita comentarios HTML: lo que está comentado no llega al navegador. */
const sinComentarios = (html: string) => html.replace(/<!--[\s\S]*?-->/g, '');

// ==================================================================
// Estructura del documento
// ==================================================================

test('todas las páginas declaran el idioma', () => {
  for (const pagina of PAGINAS) {
    const html = leer(pagina);
    assert.match(html, /<html[^>]+lang="es"/, `${pagina} debería declarar lang="es"`);
  }
});

test('todas las páginas declaran el viewport', () => {
  // Sin esto el navegador móvil renderiza a 980px y escala: el sitio se ve
  // diminuto por más media queries que haya.
  for (const pagina of PAGINAS) {
    assert.match(
      leer(pagina),
      /<meta[^>]+name="viewport"[^>]+width=device-width/,
      `${pagina} necesita el meta viewport`,
    );
  }
});

test('todas las páginas tienen un título descriptivo', () => {
  for (const pagina of PAGINAS) {
    const titulo = /<title>([^<]*)<\/title>/.exec(leer(pagina))?.[1]?.trim();
    assert.ok(titulo && titulo.length > 5, `${pagina} necesita un <title> descriptivo`);
  }
});

test('todas las páginas tienen enlace para saltar al contenido', () => {
  for (const pagina of PAGINAS) {
    const html = leer(pagina);
    assert.match(html, /class="skip-link"/, `${pagina} necesita un skip link`);
    assert.match(
      html,
      /id="contenido-principal"/,
      `${pagina}: el skip link apunta a un destino que no existe`,
    );
  }
});

test('el destino del skip link coincide con el href', () => {
  for (const pagina of PAGINAS) {
    const html = leer(pagina);
    const href = /class="skip-link"[^>]*href="#([^"]+)"/.exec(html)?.[1];
    assert.ok(href, `${pagina}: skip link sin href`);
    assert.match(html, new RegExp(`id="${href}"`), `${pagina}: no existe #${href}`);
  }
});

test('existe un único <main> por página', () => {
  for (const pagina of PAGINAS) {
    const html = sinComentarios(leer(pagina));
    const aperturas = (html.match(/<main[\s>]/g) ?? []).length;
    const cierres = (html.match(/<\/main>/g) ?? []).length;

    assert.equal(aperturas, 1, `${pagina} debería tener exactamente un <main>`);
    assert.equal(cierres, 1, `${pagina}: el <main> no está cerrado`);
  }
});

// ==================================================================
// Imágenes
// ==================================================================

test('ninguna imagen queda sin atributo alt', () => {
  for (const pagina of PAGINAS) {
    const html = sinComentarios(leer(pagina));
    const imgs = html.match(/<img\b[^>]*>/g) ?? [];

    const sinAlt = imgs.filter((img) => !/\balt\s*=/.test(img));
    assert.deepEqual(sinAlt, [], `${pagina}: hay ${sinAlt.length} imágenes sin alt`);
  }
});

test('los alt de la galería describen la instalación, no son genéricos', () => {
  const html = leer('index.html');
  const galeria = /<section id="galeria"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';

  const alts = [...galeria.matchAll(/alt="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(alts.length >= 6, 'la galería debería tener al menos 6 imágenes');

  for (const alt of alts) {
    // "Instalaciones" o "Foto" no le dicen nada a quien no ve la imagen.
    assert.ok(alt.length > 25, `alt demasiado genérico: "${alt}"`);
    assert.ok(
      !/^(foto|imagen|instalaciones|aula|deportes)$/i.test(alt.trim()),
      `alt genérico: "${alt}"`,
    );
  }
});

test('las imágenes de la galería declaran dimensiones y carga diferida', () => {
  const galeria = /<section id="galeria"[\s\S]*?<\/section>/.exec(leer('index.html'))?.[0] ?? '';
  const imgs = galeria.match(/<img\b[^>]*>/g) ?? [];

  for (const img of imgs) {
    // width/height evitan que la página salte mientras cargan las fotos.
    assert.match(img, /\bwidth="\d+"/, `imagen sin width: ${img.slice(0, 70)}`);
    assert.match(img, /\bheight="\d+"/, `imagen sin height: ${img.slice(0, 70)}`);
    assert.match(img, /loading="lazy"/, `imagen sin loading lazy: ${img.slice(0, 70)}`);
  }
});

// ==================================================================
// La galería cubre las instalaciones que pide la consigna
// ==================================================================

test('la galería muestra las instalaciones de la consigna', () => {
  const galeria = /<section id="galeria"[\s\S]*?<\/section>/.exec(leer('index.html'))?.[0] ?? '';

  const exigidas = [
    { nombre: 'pileta', patron: /natatorio|pileta/i },
    { nombre: 'pista de atletismo', patron: /pista de atletismo/i },
    { nombre: 'canchas', patron: /cancha/i },
    { nombre: 'comedor', patron: /comedor/i },
    { nombre: 'laboratorios', patron: /laboratorio/i },
  ];

  for (const { nombre, patron } of exigidas) {
    assert.match(galeria, patron, `la galería no incluye ${nombre}`);
  }
});

test('cada figura de la galería tiene su leyenda', () => {
  const galeria = /<section id="galeria"[\s\S]*?<\/section>/.exec(leer('index.html'))?.[0] ?? '';

  const figuras = (galeria.match(/<figure>/g) ?? []).length;
  const leyendas = (galeria.match(/<figcaption>/g) ?? []).length;

  assert.ok(figuras > 0, 'la galería debería usar <figure>');
  assert.equal(leyendas, figuras, 'cada <figure> necesita su <figcaption>');
});

// ==================================================================
// Secciones del portal público
// ==================================================================

test('el landing tiene las secciones que pide la consigna', () => {
  const html = leer('index.html');

  for (const id of ['nosotros', 'niveles', 'bienestar', 'noticias', 'inscripcion', 'empleo', 'opiniones', 'galeria']) {
    assert.match(html, new RegExp(`id="${id}"`), `falta la sección #${id}`);
  }
});

test('el muro de opiniones no exige autenticación', () => {
  // La consigna es explícita: se puede opinar sin login.
  const html = leer('index.html');
  const opiniones = /<section id="opiniones"[\s\S]*?<\/section>/.exec(html)?.[0] ?? '';

  assert.ok(opiniones.length > 0, 'no se encontró la sección de opiniones');
  assert.doesNotMatch(
    opiniones,
    /iniciar sesión para|deb[ée]s? iniciar sesión|requiere login/i,
    'la sección de opiniones no debería exigir login',
  );
});

// ==================================================================
// Formularios
// ==================================================================

test('todo input de formulario tiene label, aria-label o placeholder accesible', () => {
  for (const pagina of PAGINAS) {
    const html = sinComentarios(leer(pagina));

    const inputs = (html.match(/<(input|select|textarea)\b[^>]*>/g) ?? []).filter(
      (c) => !/type="(hidden|submit|button|reset)"/.test(c),
    );

    const idsConLabel = new Set([...html.matchAll(/<label[^>]+for="([^"]+)"/g)].map((m) => m[1]));

    const huerfanos = inputs.filter((control) => {
      if (/aria-label(?:ledby)?\s*=/.test(control)) return false;
      const id = /\bid="([^"]+)"/.exec(control)?.[1];
      if (id && idsConLabel.has(id)) return false;
      // Un placeholder no reemplaza a un label, pero al menos anuncia algo.
      return !/placeholder\s*=/.test(control);
    });

    assert.deepEqual(
      huerfanos.map((h) => h.slice(0, 80)),
      [],
      `${pagina}: controles sin etiqueta accesible`,
    );
  }
});

// ==================================================================
// CSS responsive
// ==================================================================

test('componentes.css define puntos de quiebre para móvil', () => {
  const css = readFileSync(path.join(FRONTEND, 'css', 'componentes.css'), 'utf8');
  const breakpoints = [...css.matchAll(/@media \(max-width:\s*(\d+)px\)/g)].map((m) => Number(m[1]));

  assert.ok(breakpoints.length >= 3, 'deberían existir al menos 3 puntos de quiebre');
  assert.ok(breakpoints.some((b) => b <= 480), 'falta un punto de quiebre para teléfonos chicos');
  assert.ok(breakpoints.some((b) => b >= 700 && b <= 1024), 'falta un punto de quiebre para tablets');
});

test('los paneles resuelven la sidebar en pantalla angosta', () => {
  // Antes de este trabajo los tres paneles no tenían una sola media query:
  // la sidebar era un flex fijo de 260px con el body en overflow hidden.
  const css = readFileSync(path.join(FRONTEND, 'css', 'componentes.css'), 'utf8');
  const bloque = /@media \(max-width:\s*900px\)\s*\{[\s\S]*?\n\}/.exec(css)?.[0] ?? '';

  assert.ok(bloque.includes('.sidebar'), 'la media query debería reacomodar la sidebar');
  assert.ok(bloque.includes('flex-direction: row'), 'la sidebar debería pasar a horizontal');
});

test('las tablas se reordenan como tarjetas en pantalla angosta', () => {
  const css = readFileSync(path.join(FRONTEND, 'css', 'componentes.css'), 'utf8');

  assert.match(css, /\.tabla td::before\s*\{[\s\S]*?content:\s*attr\(data-label\)/,
    'las celdas deberían reinyectar el encabezado con data-label');
});

test('los paneles cargan la hoja de componentes', () => {
  for (const pagina of PAGINAS) {
    assert.match(leer(pagina), /css\/componentes\.css/, `${pagina} no carga componentes.css`);
  }
});

test('existen estilos de foco visible', () => {
  // Sin esto, quien navega con teclado no sabe dónde está parado.
  const css = readFileSync(path.join(FRONTEND, 'css', 'componentes.css'), 'utf8');
  assert.match(css, /:focus-visible/);
  assert.match(css, /outline:\s*3px/);
});

test('se respeta prefers-reduced-motion', () => {
  const css = readFileSync(path.join(FRONTEND, 'css', 'componentes.css'), 'utf8');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('los objetivos táctiles llegan a 44px', () => {
  const css = readFileSync(path.join(FRONTEND, 'css', 'componentes.css'), 'utf8');
  const botones = /\.btn\s*\{[\s\S]*?\n\}/.exec(css)?.[0] ?? '';

  const minHeight = /min-height:\s*(\d+)px/.exec(botones)?.[1];
  assert.ok(minHeight && Number(minHeight) >= 44, 'los botones deberían medir al menos 44px de alto');
});

// ==================================================================
// Módulos ES del frontend
// ==================================================================

test('los módulos de vistas existen y son ES modules', () => {
  const dir = path.join(FRONTEND, 'js', 'vistas');
  const archivos = readdirSync(dir).filter((f) => f.endsWith('.js'));

  assert.ok(archivos.length >= 3, 'deberían existir al menos 3 módulos de vista');

  for (const archivo of archivos) {
    const js = readFileSync(path.join(dir, archivo), 'utf8');
    assert.match(js, /^import /m, `${archivo} debería importar como módulo ES`);
    assert.match(js, /export /, `${archivo} debería exportar su punto de entrada`);
  }
});

test('los paneles importan sus vistas como type="module"', () => {
  const esperado: Record<string, string> = {
    'panel_admin.html': 'reportes.js',
    'panel_docente.html': 'docente-cursos.js',
    'panel_padre.html': 'padre-hijos.js',
  };

  for (const [pagina, modulo] of Object.entries(esperado)) {
    const html = leer(pagina);
    assert.match(html, /<script type="module">/, `${pagina} debería usar type="module"`);
    assert.match(html, new RegExp(modulo.replace('.', '\\.')), `${pagina} no importa ${modulo}`);
  }
});

test('el cliente de API escapa y centraliza la autorización', () => {
  const js = readFileSync(path.join(FRONTEND, 'js', 'api.js'), 'utf8');

  assert.match(js, /Authorization/, 'el cliente debería mandar el header de autorización');
  assert.match(js, /auth\/refresh/, 'el cliente debería reintentar con refresh token');
});

test('ui.js escapa todo el texto que viene del servidor', () => {
  const js = readFileSync(path.join(FRONTEND, 'js', 'ui.js'), 'utf8');

  assert.match(js, /export function esc\(/, 'debería existir un helper de escape');
  assert.match(js, /replace\(\/</, 'el escape debería cubrir <');
  assert.match(js, /&amp;/, 'el escape debería cubrir &');
});

test('las tablas que genera ui.js son accesibles', () => {
  const js = readFileSync(path.join(FRONTEND, 'js', 'ui.js'), 'utf8');

  assert.match(js, /<caption/, 'las tablas deberían tener caption');
  assert.match(js, /scope="col"/, 'los encabezados deberían declarar scope');
  assert.match(js, /data-label=/, 'las celdas necesitan data-label para el modo tarjeta');
});
