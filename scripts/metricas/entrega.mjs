/**
 * Métricas de entrega: cuánto tarda un cambio en llegar a producción y dónde
 * se pierde el tiempo.
 *
 * Junta en un solo informe lo que hoy está repartido en tres lugares:
 *
 *   - GitHub (pull requests y commits): cuántos cambios entran por PR, cuánto
 *     tarda un PR entre que se abre y se mergea, de qué tamaño son y cuántos
 *     commits llegan a `main` por mes.
 *   - GitHub Actions: cuánto dura cada corrida del CI y cuál es el paso más
 *     lento.
 *   - Railway: cuántos despliegues hubo, cuántos se saltearon o se repitieron
 *     sobre el mismo commit, y cuánto tarda cada uno desde el push hasta que la
 *     aplicación responde, separado en espera del CI, build y arranque.
 *
 *   node scripts/metricas/entrega.mjs --desde=2026-09-01 --hasta=2026-10-26
 *   node scripts/metricas/entrega.mjs --desde=2026-10-26 --etiqueta=despues
 *
 * Necesita `gh` y la CLI de `railway` con sesión iniciada y el proyecto
 * vinculado. Sólo lee: no crea, no modifica ni redespliega nada.
 *
 * Los tiempos de Railway salen de los logs del build y del arranque, no de la
 * API: con el token de la CLI la API de GraphQL responde «Not Authorized» a
 * esas consultas, y los logs traen marca de tiempo por línea.
 */

import { execFileSync, execSync } from 'node:child_process';

const REPO = 'fabrithompson/CentroEducativo';
const [OWNER, NOMBRE] = REPO.split('/');
const WORKFLOW_CI = 'ci.yml';
const SERVICIO = 'backend';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const desde = new Date(`${args.desde ?? '2026-01-01'}T00:00:00-03:00`);
const hasta = new Date(`${args.hasta ?? '2100-01-01'}T23:59:59-03:00`);
const etiqueta = args.etiqueta ?? 'medicion';
const maxCorridas = Number(args.corridas ?? 20);
const maxDespliegues = Number(args.despliegues ?? 10);

const enVentana = (iso) => {
  const t = new Date(iso);
  return t >= desde && t <= hasta;
};

function correr(cmd, argumentos) {
  const opciones = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] };
  // `railway` es un shim de pnpm (.CMD en Windows): sin shell no se encuentra.
  // Los argumentos que recibe son ids y banderas, sin espacios ni comillas.
  if (process.platform === 'win32' && cmd === 'railway') {
    return execSync([cmd, ...argumentos].join(' '), opciones);
  }
  return execFileSync(cmd, argumentos, opciones);
}

const gh = (argumentos) => correr('gh', argumentos);
const git = (argumentos) => correr('git', argumentos);

// Un commit «sólo de documentación» no toca nada que se compile, se pruebe o
// se despliegue. Correr el CI sobre él es tiempo de runner sin información.
function soloDocumentacion(sha) {
  try {
    const padres = git(['rev-list', '--parents', '-n', '1', sha]).trim().split(' ');
    const base = padres[1] ?? `${sha}^`;
    const archivos = git(['diff', '--name-only', base, sha]).trim().split('\n').filter(Boolean);
    return archivos.length > 0 && archivos.every((f) => f.startsWith('docs/') || f.endsWith('.md'));
  } catch {
    return false;
  }
}
const ghJson = (argumentos) => JSON.parse(gh(argumentos));

function graphql(query, variables) {
  const campos = Object.entries(variables).flatMap(([k, v]) =>
    v == null ? [] : ['-F', `${k}=${v}`],
  );
  return JSON.parse(gh(['api', 'graphql', '-f', `query=${query}`, ...campos])).data;
}

// --- estadística mínima -----------------------------------------------------

const promedio = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
function percentil(xs, p) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
const mediana = (xs) => percentil(xs, 50);

function dur(seg) {
  if (!Number.isFinite(seg)) return '—';
  if (seg < 90) return `${seg.toFixed(0)} s`;
  if (seg < 5400) {
    const s = Math.round(seg);
    return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
  }
  if (seg < 172800) return `${(seg / 3600).toFixed(1)} h`;
  return `${(seg / 86400).toFixed(1)} d`;
}
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
const segs = (a, b) => (new Date(b) - new Date(a)) / 1000;

// --- GitHub: pull requests ----------------------------------------------------

function pullRequests() {
  const q = `query($owner:String!,$name:String!,$cursor:String){
    repository(owner:$owner,name:$name){
      pullRequests(first:100, after:$cursor, states:MERGED, orderBy:{field:CREATED_AT,direction:ASC}){
        pageInfo{ hasNextPage endCursor }
        nodes{ number createdAt mergedAt additions deletions changedFiles baseRefName
               author{ login } mergedBy{ login }
               reviews(first:1){ totalCount }
               closingIssuesReferences(first:1){ totalCount } } } } }`;
  const prs = [];
  let cursor = null;
  do {
    const d = graphql(q, { owner: OWNER, name: NOMBRE, cursor });
    prs.push(...d.repository.pullRequests.nodes);
    cursor = d.repository.pullRequests.pageInfo.hasNextPage
      ? d.repository.pullRequests.pageInfo.endCursor
      : null;
  } while (cursor);
  return prs.filter((p) => enVentana(p.mergedAt));
}

// --- GitHub: commits que llegaron a main --------------------------------------

function commitsDeMain() {
  const q = `query($owner:String!,$name:String!,$cursor:String){
    repository(owner:$owner,name:$name){
      ref(qualifiedName:"refs/heads/main"){ target{ ... on Commit {
        history(first:100, after:$cursor){
          pageInfo{ hasNextPage endCursor }
          nodes{ oid committedDate parents{ totalCount }
                 associatedPullRequests(first:5){ nodes{ number baseRefName merged } } } } } } } } }`;
  const commits = [];
  let cursor = null;
  do {
    const h = graphql(q, { owner: OWNER, name: NOMBRE, cursor }).repository.ref.target.history;
    commits.push(...h.nodes);
    cursor = h.pageInfo.hasNextPage ? h.pageInfo.endCursor : null;
  } while (cursor);
  // Un commit «entró por PR» si pertenece a un PR mergeado hacia una de las dos
  // ramas de integración. Los PR de `main` hacia la rama de un integrante no
  // cuentan: ahí el commit ya estaba en main antes de ese PR.
  return commits
    .filter((c) => c.parents.totalCount === 1 && enVentana(c.committedDate))
    .map((c) => ({
      oid: c.oid,
      fecha: c.committedDate,
      porPR: c.associatedPullRequests.nodes.some(
        (p) => p.merged && ['main', 'developer'].includes(p.baseRefName),
      ),
    }));
}

// --- GitHub Actions -----------------------------------------------------------

function corridasCI() {
  const corridas = ghJson([
    'run', 'list', '--repo', REPO, '--workflow', WORKFLOW_CI, '--limit', '200',
    '--json', 'databaseId,conclusion,event,headBranch,headSha,startedAt,updatedAt,status',
  ]).filter((r) => r.status === 'completed' && enVentana(r.startedAt));

  const detalladas = corridas.slice(0, maxCorridas).map((r) => {
    const { jobs } = ghJson(['api', `repos/${REPO}/actions/runs/${r.databaseId}/jobs`]);
    // La duración de la corrida es la del job que termina último, medida desde
    // el que empieza primero: con jobs en paralelo, sumar los jobs mentiría.
    const inicio = Math.min(...jobs.map((j) => new Date(j.started_at)));
    const fin = Math.max(...jobs.map((j) => new Date(j.completed_at)));
    const pasos = jobs.flatMap((j) =>
      (j.steps ?? [])
        .filter((s) => s.started_at && s.completed_at && !/^(Set up job|Complete job|Post )/.test(s.name))
        .map((s) => ({ job: j.name, paso: s.name, seg: segs(s.started_at, s.completed_at) })),
    );
    return { ...r, seg: (fin - inicio) / 1000, jobs: jobs.length, pasos };
  });
  return { corridas, detalladas };
}

// --- Railway ------------------------------------------------------------------

function despliegues() {
  const todos = JSON.parse(
    correr('railway', ['deployment', 'list', '--service', SERVICIO, '--json', '--limit', '500']),
  ).filter((d) => enVentana(d.createdAt));

  const leerLogs = (tipo, id) => {
    try {
      return correr('railway', ['logs', tipo, id, '--json'])
        .trim()
        .split('\n')
        .map((l) => {
          try { return JSON.parse(l); } catch { return null; }
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  };

  // Desglose de los que efectivamente se construyeron. La espera es el tiempo
  // entre que Railway recibe el push y programa el build: con `checkSuites:
  // true` no arranca hasta que el CI termina en verde, y si hay otro
  // despliegue en curso, además espera en cola a que termine.
  const construidos = todos.filter((d) => ['SUCCESS', 'REMOVED', 'FAILED', 'CRASHED'].includes(d.status));
  const desglose = construidos.slice(0, maxDespliegues).map((d) => {
    const build = leerLogs('--build', d.id);
    const deploy = leerLogs('--deployment', d.id);
    const inicioBuild = build.find((l) => /scheduling build/.test(l.message))?.timestamp ?? build[0]?.timestamp;
    const push = build.filter((l) => l.message === 'image push' && l.status === 'complete').pop();
    const finBuild = push?.timestamp ?? build[build.length - 1]?.timestamp;
    const sano = deploy.find((l) => /Health check:/.test(l.message))?.timestamp;
    const imagenMB = push?.total_size ? push.total_size / 1024 / 1024 : NaN;
    return {
      commit: d.meta?.commitHash?.slice(0, 7),
      fecha: d.createdAt,
      estado: d.status,
      esperaCI: inicioBuild ? segs(d.createdAt, inicioBuild) : NaN,
      build: inicioBuild && finBuild ? segs(inicioBuild, finBuild) : NaN,
      arranque: finBuild && sano ? segs(finBuild, sano) : NaN,
      total: sano ? segs(d.createdAt, sano) : NaN,
      imagenMB,
    };
  });

  // Repetidos: más de un build del mismo commit. Los SKIPPED no cuentan.
  const porCommit = {};
  for (const d of construidos) {
    const c = d.meta?.commitHash;
    if (c) porCommit[c] = (porCommit[c] ?? 0) + 1;
  }
  const repetidos = Object.values(porCommit).filter((n) => n > 1).reduce((a, n) => a + (n - 1), 0);

  return { todos, construidos, desglose, repetidos };
}

// --- informe ------------------------------------------------------------------

function fila(...celdas) {
  return `| ${celdas.join(' | ')} |`;
}

function informe() {
  const salida = [];
  const p = (s = '') => salida.push(s);
  const ahora = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hourCycle: 'h23',
  });

  p(`# Métricas de entrega — ${etiqueta}`);
  p();
  p(`Medido el ${ahora}. Ventana: ${args.desde ?? '2026-01-01'} → ${args.hasta ?? 'hoy'}.`);
  p();

  const prs = pullRequests();
  const horas = prs.map((x) => segs(x.createdAt, x.mergedAt));
  const lineas = prs.map((x) => x.additions + x.deletions);
  p('## Pull requests');
  p();
  p(fila('Métrica', 'Valor'));
  p(fila('---', '---'));
  p(fila('PR mergeados', prs.length));
  p(fila('Tiempo de PR abierto a merge (mediana)', dur(mediana(horas))));
  p(fila('Tiempo de PR abierto a merge (promedio)', dur(promedio(horas))));
  p(fila('Tamaño del PR, líneas cambiadas (mediana)', Number.isFinite(mediana(lineas)) ? mediana(lineas) : '—'));
  p(fila('Tamaño del PR, archivos (mediana)', Number.isFinite(mediana(prs.map((x) => x.changedFiles))) ? mediana(prs.map((x) => x.changedFiles)) : '—'));
  p(fila('PR con al menos una revisión', `${prs.filter((x) => x.reviews.totalCount > 0).length} de ${prs.length}`));
  p(fila('PR que cierran un issue', `${prs.filter((x) => x.closingIssuesReferences.totalCount > 0).length} de ${prs.length}`));
  p();

  const commits = commitsDeMain();
  const porMes = {};
  for (const c of commits) {
    const mes = c.fecha.slice(0, 7);
    porMes[mes] ??= { total: 0, directos: 0 };
    porMes[mes].total += 1;
    if (!c.porPR) porMes[mes].directos += 1;
  }
  const directos = commits.filter((c) => !c.porPR).length;
  p('## Commits que llegaron a `main`');
  p();
  p(fila('Mes', 'Commits', 'Sin pasar por PR'));
  p(fila('---', '---', '---'));
  for (const [mes, v] of Object.entries(porMes).sort()) p(fila(mes, v.total, `${v.directos} (${pct(v.directos, v.total)})`));
  p(fila('**Total**', `**${commits.length}**`, `**${directos} (${pct(directos, commits.length)})**`));
  p();

  const { corridas, detalladas } = corridasCI();
  const durs = detalladas.map((r) => r.seg);
  p('## GitHub Actions — CI');
  p();
  p(fila('Métrica', 'Valor'));
  p(fila('---', '---'));
  p(fila('Corridas en la ventana', corridas.length));
  p(fila('Exitosas', `${corridas.filter((r) => r.conclusion === 'success').length} (${pct(corridas.filter((r) => r.conclusion === 'success').length, corridas.length)})`));
  p(fila(`Duración (mediana de las últimas ${detalladas.length})`, dur(mediana(durs))));
  p(fila('Duración (promedio)', dur(promedio(durs))));
  p(fila('Duración (máxima)', dur(Math.max(...durs))));
  p(fila('Jobs por corrida', [...new Set(detalladas.map((r) => r.jobs))].join(', ') || '—'));
  const docs = corridas.filter((r) => soloDocumentacion(r.headSha)).length;
  p(fila('Corridas sobre commits de sólo documentación', `${docs} (${pct(docs, corridas.length)})`));
  p();
  const porPaso = {};
  for (const r of detalladas) for (const s of r.pasos) (porPaso[`${s.job} › ${s.paso}`] ??= []).push(s.seg);
  const pasos = Object.entries(porPaso)
    .map(([k, v]) => [k, promedio(v)])
    .sort((a, b) => b[1] - a[1]);
  p(fila('Paso', 'Promedio'));
  p(fila('---', '---'));
  for (const [k, v] of pasos.slice(0, 8)) p(fila(k, `${v.toFixed(1)} s`));
  p();

  const { todos, construidos, desglose, repetidos } = despliegues();
  const estados = {};
  for (const d of todos) estados[d.status] = (estados[d.status] ?? 0) + 1;
  p('## Railway — despliegues');
  p();
  p(fila('Métrica', 'Valor'));
  p(fila('---', '---'));
  p(fila('Despliegues registrados', todos.length));
  p(fila('Construidos', construidos.length));
  p(fila('Salteados (SKIPPED)', estados.SKIPPED ?? 0));
  p(fila('Fallidos (FAILED / CRASHED)', (estados.FAILED ?? 0) + (estados.CRASHED ?? 0)));
  p(fila('Builds repetidos sobre el mismo commit', repetidos));
  p();
  if (desglose.length) {
    p(fila('Commit', 'Fecha', 'Espera (CI y cola)', 'Build', 'Arranque', 'Push → responde', 'Imagen'));
    p(fila('---', '---', '---', '---', '---', '---', '---'));
    for (const d of desglose)
      p(fila(d.commit, d.fecha.slice(0, 16).replace('T', ' '), dur(d.esperaCI), dur(d.build), dur(d.arranque), dur(d.total), Number.isFinite(d.imagenMB) ? `${d.imagenMB.toFixed(0)} MB` : '—'));
    const ok = desglose.filter((d) => Number.isFinite(d.total));
    p(fila('**Mediana**', '', dur(mediana(ok.map((d) => d.esperaCI))), dur(mediana(ok.map((d) => d.build))), dur(mediana(ok.map((d) => d.arranque))), dur(mediana(ok.map((d) => d.total))), ''));
    p();
  }

  return salida.join('\n');
}

console.log(informe().trimEnd());
