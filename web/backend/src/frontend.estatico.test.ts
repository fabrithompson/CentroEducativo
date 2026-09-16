/**
 * Verifica que el servidor sirva efectivamente el frontend.
 *
 * `app.ts` publica `frontend/` como estáticos. Un módulo ES que no se sirve con
 * el content-type correcto, o una ruta mal escrita en un `<script type="module">`,
 * rompe el panel entero sin dar error en el typecheck. Esto lo atrapa.
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.JWT_ACCESS_SECRET ??= 'a'.repeat(48);
process.env.JWT_REFRESH_SECRET ??= 'b'.repeat(48);

let server: Server;
let base: string;

before(async () => {
  const { createApp } = await import('./app.ts');
  server = createApp().listen(0);

  const dir = server.address();
  if (!dir || typeof dir === 'string') throw new Error('no se pudo abrir el puerto');
  base = `http://127.0.0.1:${dir.port}`;
});

after(() => {
  server?.close();
});

const ARCHIVOS = [
  { ruta: '/index.html', tipo: 'text/html' },
  { ruta: '/panel_admin.html', tipo: 'text/html' },
  { ruta: '/panel_docente.html', tipo: 'text/html' },
  { ruta: '/panel_padre.html', tipo: 'text/html' },
  { ruta: '/panel_estudiante.html', tipo: 'text/html' },
  { ruta: '/styles.css', tipo: 'text/css' },
  { ruta: '/css/componentes.css', tipo: 'text/css' },
  { ruta: '/js/api.js', tipo: 'javascript' },
  { ruta: '/js/ui.js', tipo: 'javascript' },
  { ruta: '/js/vistas/reportes.js', tipo: 'javascript' },
  { ruta: '/js/vistas/docente-cursos.js', tipo: 'javascript' },
  { ruta: '/js/vistas/padre-hijos.js', tipo: 'javascript' },
  { ruta: '/js/vistas/escaner.js', tipo: 'javascript' },
];

test('el servidor entrega todos los archivos del frontend', async () => {
  const faltantes: string[] = [];

  for (const { ruta } of ARCHIVOS) {
    const res = await fetch(base + ruta);
    if (res.status !== 200) faltantes.push(`${ruta} -> ${res.status}`);
  }

  assert.deepEqual(faltantes, [], 'estos archivos no se sirven');
});

test('los módulos ES se sirven con content-type de JavaScript', async () => {
  // Con el content-type equivocado el navegador rechaza el módulo y el panel
  // queda en blanco, sin error visible en el servidor.
  const malServidos: string[] = [];

  for (const { ruta, tipo } of ARCHIVOS) {
    const res = await fetch(base + ruta);
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes(tipo)) malServidos.push(`${ruta} -> ${ct}`);
  }

  assert.deepEqual(malServidos, [], 'content-type incorrecto');
});

test('la raíz sirve el landing', async () => {
  const res = await fetch(base + '/');
  assert.equal(res.status, 200);

  const html = await res.text();
  assert.match(html, /Transformar para educar|TRANSFORMAR PARA EDUCAR/i);
});

test('los imports de los paneles apuntan a archivos que existen', async () => {
  // Se extraen las rutas de los `import` de cada panel y se pide cada una.
  const paneles = ['/panel_admin.html', '/panel_docente.html', '/panel_padre.html'];
  const rotos: string[] = [];

  for (const panel of paneles) {
    const html = await (await fetch(base + panel)).text();
    const imports = [...html.matchAll(/from\s+'(\.\/[^']+)'/g)].map((m) => m[1]);

    assert.ok(imports.length > 0, `${panel} debería importar al menos un módulo`);

    for (const importado of imports) {
      const url = base + importado.replace(/^\./, '');
      const res = await fetch(url);
      if (res.status !== 200) rotos.push(`${panel} importa ${importado} -> ${res.status}`);
    }
  }

  assert.deepEqual(rotos, [], 'imports rotos en los paneles');
});

test('las hojas de estilo referenciadas existen', async () => {
  const paginas = ['/index.html', '/panel_admin.html', '/panel_docente.html', '/panel_padre.html'];
  const rotas: string[] = [];

  for (const pagina of paginas) {
    const html = await (await fetch(base + pagina)).text();
    const hrefs = [...html.matchAll(/<link[^>]+href="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((h) => !h.startsWith('http'));

    for (const href of hrefs) {
      const res = await fetch(`${base}/${href.replace(/^\//, '')}`);
      if (res.status !== 200) rotas.push(`${pagina} -> ${href} (${res.status})`);
    }
  }

  assert.deepEqual(rotas, [], 'hojas de estilo que no se sirven');
});
