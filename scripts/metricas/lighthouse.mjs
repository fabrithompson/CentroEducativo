/**
 * Rendimiento del portal con Lighthouse: corre N veces sobre la misma URL y
 * informa la mediana, porque una corrida sola varía varios puntos según la red.
 *
 *   node scripts/metricas/lighthouse.mjs --url=https://transformar-para-educar.up.railway.app/ --corridas=3
 *
 * Perfil móvil por omisión (el de Lighthouse: 4G lenta y CPU limitada), que es
 * como entra la mayoría de las familias. `--escritorio` cambia al perfil de
 * escritorio. Usa Chrome o Edge instalados: en Windows, apuntar CHROME_PATH a
 * msedge.exe si no hay Chrome.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const url = args.url ?? 'https://transformar-para-educar.up.railway.app/';
const corridas = Number(args.corridas ?? 3);
const dir = mkdtempSync(path.join(tmpdir(), 'lighthouse-'));

const resultados = [];
for (let i = 1; i <= corridas; i++) {
  const salida = path.join(dir, `corrida-${i}.json`);
  const banderas = [
    'dlx', 'lighthouse@12.8.2', url, '--quiet', '--output=json', `--output-path=${salida}`,
    '--chrome-flags=--headless=new',
    ...(args.escritorio ? ['--preset=desktop'] : []),
  ];
  execFileSync('pnpm', banderas, { stdio: 'ignore', shell: process.platform === 'win32' });
  const r = JSON.parse(readFileSync(salida, 'utf8'));
  const a = r.audits;
  resultados.push({
    rendimiento: r.categories.performance.score * 100,
    accesibilidad: r.categories.accessibility.score * 100,
    practicas: r.categories['best-practices'].score * 100,
    seo: r.categories.seo.score * 100,
    fcp: a['first-contentful-paint'].numericValue / 1000,
    lcp: a['largest-contentful-paint'].numericValue / 1000,
    tbt: a['total-blocking-time'].numericValue,
    cls: a['cumulative-layout-shift'].numericValue,
    si: a['speed-index'].numericValue / 1000,
    pesoKiB: a['total-byte-weight'].numericValue / 1024,
  });
  process.stderr.write(`corrida ${i}/${corridas}: rendimiento ${resultados.at(-1).rendimiento}, LCP ${resultados.at(-1).lcp.toFixed(1)} s\n`);
}

const mediana = (k) => {
  const s = resultados.map((r) => r[k]).sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
};

const ahora = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hourCycle: 'h23' });
console.log(`Lighthouse 12.8.2 · ${args.escritorio ? 'escritorio' : 'móvil'} · ${url} · mediana de ${corridas} corridas · ${ahora}\n`);
console.log('| Métrica | Mediana |');
console.log('| --- | --- |');
console.log(`| Rendimiento | ${mediana('rendimiento').toFixed(0)} |`);
console.log(`| Accesibilidad | ${mediana('accesibilidad').toFixed(0)} |`);
console.log(`| Buenas prácticas | ${mediana('practicas').toFixed(0)} |`);
console.log(`| SEO | ${mediana('seo').toFixed(0)} |`);
console.log(`| First Contentful Paint | ${mediana('fcp').toFixed(1)} s |`);
console.log(`| Largest Contentful Paint | ${mediana('lcp').toFixed(1)} s |`);
console.log(`| Speed Index | ${mediana('si').toFixed(1)} s |`);
console.log(`| Total Blocking Time | ${mediana('tbt').toFixed(0)} ms |`);
console.log(`| Cumulative Layout Shift | ${mediana('cls').toFixed(3)} |`);
console.log(`| Peso total de la página | ${mediana('pesoKiB').toFixed(0)} KiB |`);
