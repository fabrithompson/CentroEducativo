/**
 * Prueba de humo del ABM académico y del alta de alumnos y profesores.
 *
 * Levanta PostgreSQL real, aplica las migraciones y el seed, arranca la API y
 * recorre el circuito completo por HTTP, como lo haría el panel:
 *
 *   ingreso como ADMIN → listar niveles → crear nivel → crear curso →
 *   crear materia → dar de alta un alumno en ese curso → dar de alta un
 *   profesor → asignarle la materia → verificar los rechazos esperados.
 *
 * Existe porque el resto de la suite prueba los servicios con dobles: que el
 * módulo compile y que sus rutas estén montadas no dice nada sobre si el
 * circuito funciona contra el motor, que es donde viven las restricciones.
 *
 *   pnpm --filter backend exec tsx scripts/humo-academico.ts
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

    let token = '';
    const pedir = async (metodo: string, ruta: string, body?: unknown) => {
      const res = await fetch(base + ruta, {
        method: metodo,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: res.status, cuerpo: (await res.json()) as Record<string, any> };
    };

    console.log('\n=== Ingreso ===');
    const ingreso = await pedir('POST', '/api/auth/login', {
      usuario: 'fabriynahuel',
      password: '123456',
    });
    afirmar(ingreso.status === 200, 'el administrador del seed puede ingresar', ingreso.cuerpo);
    token = ingreso.cuerpo?.usuario?.token ?? '';
    afirmar(Boolean(token), 'el ingreso devuelve un token');

    console.log('\n=== Catálogo académico (antes inalcanzable) ===');
    const niveles = await pedir('GET', '/api/academico/niveles');
    afirmar(niveles.status === 200, 'GET /academico/niveles responde 200');
    afirmar(
      Array.isArray(niveles.cuerpo.niveles) && niveles.cuerpo.niveles.length > 0,
      `el seed trae niveles (${niveles.cuerpo.niveles?.length ?? 0})`,
    );

    const cursos = await pedir('GET', '/api/academico/cursos?activo=true');
    afirmar(cursos.status === 200, 'GET /academico/cursos responde 200');
    afirmar(
      Array.isArray(cursos.cuerpo.cursos) && cursos.cuerpo.cursos.length > 0,
      `hay cursos activos (${cursos.cuerpo.cursos?.length ?? 0})`,
    );

    console.log('\n=== Alta de nivel, curso y materia ===');
    const ordenLibre = Math.max(...niveles.cuerpo.niveles.map((n: any) => n.orden)) + 1;
    const nivelNuevo = await pedir('POST', '/api/academico/niveles', {
      nombre: 'Formación Profesional',
      orden: ordenLibre,
      cuotaMensual: 15000,
    });
    afirmar(nivelNuevo.status === 201, 'se crea un nivel', nivelNuevo.cuerpo);
    const nivelId = nivelNuevo.cuerpo?.nivel?.id;

    const repetido = await pedir('POST', '/api/academico/niveles', {
      nombre: 'Formación Profesional',
      orden: ordenLibre + 1,
    });
    afirmar(repetido.status === 409, 'un nivel con nombre repetido se rechaza con 409');

    const anio = new Date().getFullYear();
    const cursoNuevo = await pedir('POST', '/api/academico/cursos', {
      nivelId,
      nombre: 'Electricidad',
      division: 'A',
      anioLectivo: anio,
      cupoMaximo: 20,
    });
    afirmar(cursoNuevo.status === 201, 'se crea un curso en ese nivel', cursoNuevo.cuerpo);
    const cursoId = cursoNuevo.cuerpo?.curso?.id;

    const materiaNueva = await pedir('POST', '/api/academico/materias', {
      nombre: 'Instalaciones domiciliarias',
      cursoId,
      cargaHoraria: 6,
    });
    afirmar(materiaNueva.status === 201, 'se crea una materia en ese curso', materiaNueva.cuerpo);
    const materiaId = materiaNueva.cuerpo?.materia?.id;

    console.log('\n=== Alta de alumno (RF-01) ===');
    const dni = String(50000000 + Math.floor(Math.random() * 999999));
    const alumno = await pedir('POST', '/api/alumnos', {
      dni,
      apellido: 'Prueba',
      nombres: 'Alumno De',
      fechaNacimiento: '2010-05-14',
      domicilio: 'Av. Sarmiento 1200',
      cursoId,
    });
    afirmar(alumno.status === 201, 'se da de alta un alumno en el curso nuevo', alumno.cuerpo);
    afirmar(Boolean(alumno.cuerpo?.alumno?.legajo), 'el legajo lo asignó el sistema');

    const duplicado = await pedir('POST', '/api/alumnos', {
      dni,
      apellido: 'Otro',
      nombres: 'Distinto',
      fechaNacimiento: '2011-01-01',
      domicilio: 'Otra dirección 100',
      cursoId,
    });
    afirmar(duplicado.status === 409, 'REGLA RF-01: el DNI repetido se rechaza con 409');

    console.log('\n=== Alta de profesor y materias a cargo (RF-04) ===');
    const dniProf = String(20000000 + Math.floor(Math.random() * 999999));
    const profesor = await pedir('POST', '/api/profesores', {
      dni: dniProf,
      apellido: 'Docente',
      nombres: 'De Prueba',
      especialidad: 'Electrotecnia',
      email: `docente.${dniProf}@et.edu.ar`,
    });
    afirmar(profesor.status === 201, 'se da de alta un profesor', profesor.cuerpo);
    const profesorId = profesor.cuerpo?.profesor?.id;

    const sinProfesor = await pedir('GET', '/api/academico/materias?sinProfesor=true&activo=true');
    afirmar(
      (sinProfesor.cuerpo.materias ?? []).some((m: any) => m.id === materiaId),
      'la materia nueva aparece entre las que no tienen profesor',
    );

    const asignada = await pedir('POST', `/api/profesores/${profesorId}/materias`, { materiaId });
    afirmar(asignada.status === 200, 'se le asigna la materia al profesor', asignada.cuerpo);

    const aCargo = await pedir('GET', `/api/academico/materias?profesorId=${profesorId}`);
    afirmar(
      (aCargo.cuerpo.materias ?? []).some((m: any) => m.id === materiaId),
      'la materia figura a cargo del profesor',
    );

    console.log('\n=== Bajas: el sistema se niega cuando todavía cuelga algo ===');
    const bajaCurso = await pedir('DELETE', `/api/academico/cursos/${cursoId}`);
    afirmar(
      bajaCurso.status === 409,
      'no se puede dar de baja un curso con alumnos activos',
      bajaCurso.cuerpo,
    );

    const bajaNivel = await pedir('DELETE', `/api/academico/niveles/${nivelId}`);
    afirmar(
      bajaNivel.status === 409,
      'no se puede dar de baja un nivel con cursos activos',
      bajaNivel.cuerpo,
    );

    console.log('\n=== Permisos: un no-administrador no escribe el catálogo ===');
    const alumnoIngreso = await pedir('POST', '/api/auth/login', {
      usuario: 'mmedina',
      password: '123456',
    });
    if (alumnoIngreso.status === 200) {
      const tokenAdmin = token;
      token = alumnoIngreso.cuerpo.usuario.token;

      const lectura = await pedir('GET', '/api/academico/cursos');
      afirmar(lectura.status === 200, 'un estudiante sí puede leer el catálogo');

      const escritura = await pedir('POST', '/api/academico/niveles', {
        nombre: 'Colado',
        orden: 90,
      });
      afirmar(escritura.status === 403, 'un estudiante no puede crear un nivel (403)');

      token = tokenAdmin;
    } else {
      console.log('  [aviso] no se pudo ingresar como estudiante; se omite el control de permisos');
    }
  } finally {
    server?.close();
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
