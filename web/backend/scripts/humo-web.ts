/**
 * Prueba de humo de las reglas que la web usa y que ninguna prueba con doble
 * puede verificar, contra PostgreSQL real.
 *
 * - Un docente desactivado no cae entre los pendientes de aprobación (antes
 *   caía, y "Rechazar" lo borraba con todo lo que había publicado).
 * - Desactivar cierra las sesiones: el refresh token de antes no vuelve a
 *   servir aunque la cuenta se reactive.
 * - Reactivar un alumno exige lugar en su curso, y el cupo lo ocupan sólo los
 *   alumnos activos.
 * - Un curso se reactiva con su nivel activo, y una materia con su curso
 *   activo. Dar de baja desde la edición respeta las mismas guardas que la baja.
 *
 *   pnpm --filter backend exec tsx scripts/humo-web.ts
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { Server } from 'node:http';

const RAIZ = path.resolve(import.meta.dirname ?? __dirname, '..');

let fallas = 0;
let pasos = 0;

function afirmar(condicion: boolean, titulo: string, detalle?: unknown) {
  pasos += 1;
  if (condicion) {
    console.log(`  [OK]    ${titulo}`);
  } else {
    fallas += 1;
    console.log(`  [FALLA] ${titulo}`);
    if (detalle !== undefined) console.log(`          ${JSON.stringify(detalle)}`);
  }
}

/** Extrae la cookie de refresco de un `set-cookie`. */
function cookieDe(res: Response): string | null {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    if (c.startsWith('et_refresh')) return c.split(';')[0]!;
  }
  return null;
}

type Cuerpo = Record<string, any>;

async function main() {
  const { DATABASE_URL, levantar } = await import('./db-test.ts');

  console.log('Levantando PostgreSQL 15 embebido…');
  const pg = await levantar();

  process.env.DATABASE_URL = DATABASE_URL;
  process.env.NODE_ENV = 'test';
  process.env.JWT_ACCESS_SECRET = 'a'.repeat(48);
  process.env.JWT_REFRESH_SECRET = 'b'.repeat(48);

  let server: Server | undefined;

  try {
    const entorno = { ...process.env, DATABASE_URL };
    const correr = (titulo: string, args: string[]) => {
      const r = spawnSync('pnpm', args, { cwd: RAIZ, env: entorno, stdio: 'inherit', shell: true });
      if (r.status !== 0) throw new Error(`${titulo} falló con código ${r.status}`);
    };

    console.log('\nAplicando migraciones…');
    correr('MIGRACIONES', ['exec', 'prisma', 'migrate', 'deploy']);
    console.log('\nCargando el seed…');
    correr('SEED', ['exec', 'tsx', 'prisma/seed.ts']);

    const { createApp } = await import('../src/app.ts');
    server = createApp().listen(0);
    const dir = server.address();
    if (!dir || typeof dir === 'string') throw new Error('no se pudo abrir el puerto');
    const base = `http://127.0.0.1:${dir.port}`;

    async function pedir(metodo: string, ruta: string, opciones: { token?: string; cookie?: string; body?: unknown } = {}) {
      const res = await fetch(base + ruta, {
        method: metodo,
        headers: {
          'Content-Type': 'application/json',
          ...(opciones.token ? { Authorization: `Bearer ${opciones.token}` } : {}),
          ...(opciones.cookie ? { Cookie: opciones.cookie } : {}),
        },
        body: opciones.body === undefined ? undefined : JSON.stringify(opciones.body),
      });
      const cuerpo = (await res.json().catch(() => ({}))) as Cuerpo;
      return { status: res.status, cuerpo, res };
    }

    async function ingresar(usuario: string, password = '123456') {
      const r = await pedir('POST', '/api/auth/login', { body: { usuario, password } });
      return { ...r, token: r.cuerpo?.usuario?.token as string, cookie: cookieDe(r.res) };
    }

    const admin = await ingresar('fabriynahuel');
    if (admin.status !== 200) throw new Error('el administrador del seed no pudo ingresar');
    const comoAdmin = (metodo: string, ruta: string, body?: unknown) =>
      pedir(metodo, ruta, { token: admin.token, body });

    const idDe = async (usuario: string) => {
      const r = await comoAdmin('GET', `/api/admin/users?q=${usuario}`);
      return (r.cuerpo.usuarios as Cuerpo[]).find((u) => u.usuario === usuario)!.id as number;
    };
    const pendientes = async () =>
      ((await comoAdmin('GET', '/api/admin/teachers/pending')).cuerpo.docentes as Cuerpo[]).map((d) => d.usuario);

    // ------------------------------------------------------------------
    console.log('\n=== Un docente que se registra queda pendiente ===');
    const registro = await pedir('POST', '/api/auth/register', {
      body: {
        tipo: 'docente',
        nombre: 'Docente de Humo',
        email: 'humo.docente@et.edu.ar',
        usuario: 'humo_docente',
        password: 'claveHumo2026',
        dni: '29999001',
      },
    });
    afirmar(registro.status === 200 && registro.cuerpo.pendingApproval === true, 'el registro de un docente queda pendiente', registro.cuerpo);

    const ingresoPendiente = await ingresar('humo_docente', 'claveHumo2026');
    afirmar(
      ingresoPendiente.status === 401 && /pendiente/i.test(ingresoPendiente.cuerpo.message ?? ''),
      'y no puede ingresar: el mensaje dice que está pendiente',
      ingresoPendiente.cuerpo,
    );
    afirmar((await pendientes()).includes('humo_docente'), 'aparece en la lista de pendientes');

    const conteo = await comoAdmin('GET', '/api/admin/moderation/counts');
    afirmar(conteo.cuerpo?.pendientes?.docentes === 1, 'el contador de pendientes lo cuenta', conteo.cuerpo?.pendientes);

    // ------------------------------------------------------------------
    console.log('\n=== Un docente desactivado no es un pendiente ===');
    const lopez = await ingresar('mlopez');
    afirmar(lopez.status === 200 && Boolean(lopez.cookie), 'mlopez ingresa y tiene su cookie de refresco');
    const idLopez = await idDe('mlopez');

    const baja = await comoAdmin('DELETE', `/api/admin/users/${idLopez}`);
    afirmar(baja.status === 200, 'el administrador desactiva a mlopez', baja.cuerpo);
    afirmar(!(await pendientes()).includes('mlopez'), 'REGLA: mlopez no aparece entre los pendientes');

    const rechazo = await comoAdmin('DELETE', `/api/admin/teachers/${idLopez}/reject`);
    afirmar(rechazo.status === 400, 'REGLA: "Rechazar" no puede borrar a un docente desactivado', rechazo.cuerpo);

    const ingresoInactivo = await ingresar('mlopez');
    afirmar(
      ingresoInactivo.status === 401 && /deshabilitada/i.test(ingresoInactivo.cuerpo.message ?? ''),
      'al ingresar, el mensaje dice "deshabilitada" y no "pendiente"',
      ingresoInactivo.cuerpo,
    );

    const reactivar = await comoAdmin('PATCH', `/api/admin/users/${idLopez}`, { isActive: true });
    afirmar(reactivar.status === 200 && reactivar.cuerpo.usuario?.isActive === true, 'el administrador lo reactiva', reactivar.cuerpo);

    const refrescoViejo = await pedir('POST', '/api/auth/refresh', { cookie: lopez.cookie! });
    afirmar(
      refrescoViejo.status === 401,
      'REGLA: la sesión abierta antes de la baja no vuelve con la reactivación',
      refrescoViejo.cuerpo,
    );
    afirmar((await ingresar('mlopez')).status === 200, 'y mlopez vuelve a ingresar con su contraseña');

    // ------------------------------------------------------------------
    console.log('\n=== Aprobar y rechazar ===');
    const idHumo = await idDe('humo_docente');
    const aprobacion = await comoAdmin('POST', `/api/admin/teachers/${idHumo}/approve`, {});
    afirmar(aprobacion.status === 200, 'el docente pendiente se aprueba', aprobacion.cuerpo);
    afirmar((await ingresar('humo_docente', 'claveHumo2026')).status === 200, 'y ya puede ingresar');
    afirmar(!(await pendientes()).includes('humo_docente'), 'y sale de la lista de pendientes');

    const segundaAprobacion = await comoAdmin('POST', `/api/admin/teachers/${idHumo}/approve`, {});
    afirmar(segundaAprobacion.status === 400, 'aprobarlo dos veces se rechaza');

    const idAdmin = await idDe('fabriynahuel');
    const autoBaja = await comoAdmin('PATCH', `/api/admin/users/${idAdmin}`, { isActive: false });
    afirmar(autoBaja.status === 400, 'REGLA: el administrador no puede desactivarse a sí mismo por PATCH', autoBaja.cuerpo);

    // ------------------------------------------------------------------
    console.log('\n=== Alumnos: el cupo lo ocupan los activos ===');
    const activos = (await comoAdmin('GET', '/api/alumnos?estado=ACTIVO&pageSize=100')).cuerpo.items as Cuerpo[];
    const porCurso = new Map<number, Cuerpo[]>();
    for (const a of activos) porCurso.set(a.curso.id, [...(porCurso.get(a.curso.id) ?? []), a]);
    const [cursoId, delCurso] = [...porCurso.entries()].sort((x, y) => y[1].length - x[1].length)[0]!;
    const n = delCurso.length;
    afirmar(n >= 2, `hay un curso con al menos dos alumnos activos (${n})`);

    const cursos = (await comoAdmin('GET', '/api/academico/cursos')).cuerpo.cursos as Cuerpo[];
    const curso = cursos.find((c) => c.id === cursoId)!;
    const cupoOriginal = curso.cupoMaximo as number;
    afirmar(curso._count.alumnos === n, 'el listado de cursos cuenta sólo los alumnos activos', curso._count);

    const alumno = delCurso[0]!;
    const bajaAlumno = await pedir('DELETE', `/api/alumnos/${alumno.id}`, { token: admin.token, body: { estado: 'INACTIVO' } });
    afirmar(bajaAlumno.status === 200, `se da de baja a ${alumno.apellido}`, bajaAlumno.cuerpo);

    const achicar = await comoAdmin('PATCH', `/api/academico/cursos/${cursoId}`, { cupoMaximo: n - 1 });
    afirmar(achicar.status === 200, `el cupo del curso baja a ${n - 1}: el inactivo no lo ocupa`, achicar.cuerpo);

    const sinLugar = await comoAdmin('PATCH', `/api/alumnos/${alumno.id}`, { estado: 'ACTIVO' });
    afirmar(
      sinLugar.status === 409 && /cupo/i.test(sinLugar.cuerpo.message ?? ''),
      'REGLA: con el curso lleno no se lo puede reactivar',
      sinLugar.cuerpo,
    );

    await comoAdmin('PATCH', `/api/academico/cursos/${cursoId}`, { cupoMaximo: cupoOriginal });
    const conLugar = await comoAdmin('PATCH', `/api/alumnos/${alumno.id}`, { estado: 'ACTIVO' });
    afirmar(conLugar.status === 200 && conLugar.cuerpo.alumno?.estado === 'ACTIVO', 'con lugar, se reactiva', conLugar.cuerpo);

    // ------------------------------------------------------------------
    console.log('\n=== Niveles, cursos y materias ===');
    const nivel = (await comoAdmin('POST', '/api/academico/niveles', { nombre: 'Nivel de humo', orden: 90 })).cuerpo.nivel;
    const cursoNuevo = (await comoAdmin('POST', '/api/academico/cursos', { nivelId: nivel.id, nombre: '1er Año', anioLectivo: 2026 })).cuerpo.curso;
    const materia = (await comoAdmin('POST', '/api/academico/materias', { nombre: 'Materia de humo', cursoId: cursoNuevo.id })).cuerpo.materia;
    afirmar(Boolean(nivel?.id && cursoNuevo?.id && materia?.id), 'se crean un nivel, un curso y una materia de prueba');

    const bajaPorPatch = await comoAdmin('PATCH', `/api/academico/niveles/${nivel.id}`, { activo: false });
    afirmar(bajaPorPatch.status === 409, 'REGLA: la baja por PATCH respeta la guarda (el nivel tiene un curso activo)', bajaPorPatch.cuerpo);

    await comoAdmin('DELETE', `/api/academico/materias/${materia.id}`);
    await comoAdmin('DELETE', `/api/academico/cursos/${cursoNuevo.id}`);
    const bajaNivel = await comoAdmin('DELETE', `/api/academico/niveles/${nivel.id}`);
    afirmar(bajaNivel.status === 200, 'dados de baja la materia y el curso, se da de baja el nivel', bajaNivel.cuerpo);

    const materiaHuerfana = await comoAdmin('PATCH', `/api/academico/materias/${materia.id}`, { activo: true });
    afirmar(materiaHuerfana.status === 409, 'REGLA: una materia no se reactiva con su curso dado de baja', materiaHuerfana.cuerpo);
    const cursoHuerfano = await comoAdmin('PATCH', `/api/academico/cursos/${cursoNuevo.id}`, { activo: true });
    afirmar(cursoHuerfano.status === 409, 'REGLA: un curso no se reactiva con su nivel dado de baja', cursoHuerfano.cuerpo);

    const r1 = await comoAdmin('PATCH', `/api/academico/niveles/${nivel.id}`, { activo: true });
    const r2 = await comoAdmin('PATCH', `/api/academico/cursos/${cursoNuevo.id}`, { activo: true });
    const r3 = await comoAdmin('PATCH', `/api/academico/materias/${materia.id}`, { activo: true });
    afirmar(
      r1.cuerpo.nivel?.activo === true && r2.cuerpo.curso?.activo === true && r3.cuerpo.materia?.activo === true,
      'reactivados en orden —nivel, curso, materia— quedan los tres activos',
      [r1.status, r2.status, r3.status],
    );

    // ------------------------------------------------------------------
    console.log('\n=== Profesores ===');
    const deportes = (await comoAdmin('GET', '/api/deportes')).cuerpo.deportes as Cuerpo[];
    const responsables = new Set(deportes.map((d) => d.profesorResponsable?.id).filter(Boolean));
    const conDeporte = [...responsables][0] as number;
    const edicionConDeporte = await comoAdmin('PATCH', `/api/profesores/${conDeporte}`, { estado: 'INACTIVO' });
    afirmar(
      edicionConDeporte.status === 409,
      'REGLA: pasar a INACTIVO desde la edición respeta la guarda de deportes a cargo',
      edicionConDeporte.cuerpo,
    );

    const materias = (await comoAdmin('GET', '/api/academico/materias')).cuerpo.materias as Cuerpo[];
    const libre = materias.find((m) => m.profesor && !responsables.has(m.profesor.id))?.profesor?.id as number | undefined;
    if (libre) {
      const inactivo = await comoAdmin('PATCH', `/api/profesores/${libre}`, { estado: 'INACTIVO' });
      const suyas = (await comoAdmin('GET', `/api/academico/materias?profesorId=${libre}`)).cuerpo.materias as Cuerpo[];
      afirmar(inactivo.status === 200 && suyas.length === 0, 'y al pasarlo a INACTIVO se liberan sus materias, como en la baja', {
        status: inactivo.status,
        materias: suyas.length,
      });
      const vuelve = await comoAdmin('PATCH', `/api/profesores/${libre}`, { estado: 'ACTIVO' });
      afirmar(vuelve.status === 200 && vuelve.cuerpo.profesor?.estado === 'ACTIVO', 'el profesor se reactiva', vuelve.cuerpo);
    } else {
      afirmar(false, 'hay un profesor con materias y sin deportes a cargo para probar la baja');
    }
  } finally {
    server?.close();
    // Sin esto, apagar PostgreSQL con conexiones abiertas en el pool llena la
    // salida de "ConnectionReset".
    const { prisma } = await import('../src/db/prisma.ts');
    await prisma.$disconnect();
    await pg.stop();
    console.log('\nPostgreSQL detenido.');
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(fallas === 0 ? `TODO OK — ${pasos} comprobaciones` : `${fallas} de ${pasos} fallaron`);
  console.log('='.repeat(60));

  process.exit(fallas === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\nLa prueba de humo se interrumpió:', err);
  process.exit(1);
});
