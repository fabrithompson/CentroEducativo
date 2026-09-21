/**
 * Prueba de humo de la política de retención (RNF-09), contra PostgreSQL real.
 *
 * Las pruebas unitarias usan un doble: verifican la forma del `where`, no que
 * Prisma borre las filas correctas. Acá se insertan datos envejecidos a
 * propósito y se comprueba qué desaparece y —más importante— qué sobrevive.
 *
 * El caso que más importa es el negativo: una postulación **sin resolver** y
 * una opinión **aprobada** tienen que seguir ahí después de la purga. Si eso
 * se rompe, la escuela pierde datos que debía conservar y no se entera.
 *
 *   pnpm --filter backend exec tsx scripts/humo-retencion.ts
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname ?? __dirname, '..');
const DIA = 24 * 60 * 60 * 1000;

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

  try {
    const entorno = { ...process.env, DATABASE_URL };
    const r = spawnSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: RAIZ,
      env: entorno,
      stdio: 'inherit',
      shell: true,
    });
    if (r.status !== 0) throw new Error('las migraciones fallaron');

    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });
    const { aplicarRetencion, PLAZOS } = await import('../src/modules/shared/retencion.ts');

    const ahora = new Date();
    const viejo = (dias: number) => new Date(ahora.getTime() - (dias + 10) * DIA);
    const reciente = new Date(ahora.getTime() - DIA);

    // ------------------------------------------------------------------
    console.log('\n=== Sembrando datos envejecidos y recientes ===');

    // Postulaciones: una vieja resuelta, una vieja SIN resolver, una reciente.
    await prisma.employmentApplication.createMany({
      data: [
        {
          nombre: 'Vieja Resuelta',
          email: 'vieja.resuelta@ejemplo.ar',
          puesto: 'Docente',
          status: 'RECHAZADO',
          resolvedAt: viejo(PLAZOS.postulacionesResueltas),
        },
        {
          nombre: 'Vieja Sin Resolver',
          email: 'vieja.pendiente@ejemplo.ar',
          puesto: 'Docente',
          status: 'PENDIENTE',
          resolvedAt: null,
        },
        {
          nombre: 'Reciente Resuelta',
          email: 'reciente@ejemplo.ar',
          puesto: 'Docente',
          status: 'APROBADO',
          resolvedAt: reciente,
        },
      ],
    });

    // Opiniones: una vieja rechazada, una vieja APROBADA.
    await prisma.opinionPublica.createMany({
      data: [
        {
          nombre: 'Opinión Rechazada',
          rol: 'Tutor',
          texto: 'texto rechazado',
          rating: 1,
          status: 'RECHAZADO',
          resolvedAt: viejo(PLAZOS.opinionesRechazadas),
        },
        {
          nombre: 'Opinión Aprobada',
          rol: 'Tutor',
          texto: 'texto aprobado y publicado',
          rating: 5,
          status: 'APROBADO',
          resolvedAt: viejo(PLAZOS.opinionesRechazadas),
        },
      ],
    });

    // Correos: uno viejo, uno reciente.
    await prisma.emailLog.createMany({
      data: [
        { destino: 'viejo@ejemplo.ar', asunto: 'viejo', tipo: 'factura', createdAt: viejo(PLAZOS.registrosDeCorreo) },
        { destino: 'nuevo@ejemplo.ar', asunto: 'nuevo', tipo: 'factura', createdAt: reciente },
      ],
    });

    const antes = {
      postulaciones: await prisma.employmentApplication.count(),
      opiniones: await prisma.opinionPublica.count(),
      correos: await prisma.emailLog.count(),
    };
    console.log(`  sembrado: ${JSON.stringify(antes)}`);

    // ------------------------------------------------------------------
    console.log('\n=== Modo informe: cuenta y no toca nada ===');
    const informe = await aplicarRetencion(prisma, { activa: false, ahora });

    afirmar(informe.totalBorrados === 0, 'el informe no borra', informe.totalBorrados);
    // Tres, no cinco: de las tres postulaciones sólo una está vencida Y
    // resuelta, y de las dos opiniones viejas sólo cuenta la rechazada.
    afirmar(
      informe.totalAlcanzados === 3,
      'cuenta exactamente las 3 filas vencidas: 1 postulación, 1 opinión y 1 correo',
      informe.lineas.filter((l) => l.alcanzados > 0),
    );
    afirmar(
      (await prisma.employmentApplication.count()) === antes.postulaciones,
      'las postulaciones siguen todas después del informe',
    );

    // ------------------------------------------------------------------
    console.log('\n=== Purga activa: borra sólo lo que corresponde ===');
    const purga = await aplicarRetencion(prisma, { activa: true, ahora });

    afirmar(purga.totalBorrados > 0, `borró ${purga.totalBorrados} registros`);

    const postulaciones = await prisma.employmentApplication.findMany({ select: { nombre: true } });
    const nombres = postulaciones.map((p) => p.nombre).sort();

    afirmar(
      !nombres.includes('Vieja Resuelta'),
      'REGLA: la postulación vieja YA RESUELTA se borró (con su CV)',
    );
    afirmar(
      nombres.includes('Vieja Sin Resolver'),
      'REGLA: la postulación vieja SIN RESOLVER sobrevivió',
      nombres,
    );
    afirmar(nombres.includes('Reciente Resuelta'), 'la postulación reciente sobrevivió', nombres);

    const opiniones = await prisma.opinionPublica.findMany({ select: { nombre: true, status: true } });
    afirmar(
      !opiniones.some((o) => o.status === 'RECHAZADO'),
      'REGLA: la opinión rechazada se borró',
    );
    afirmar(
      opiniones.some((o) => o.status === 'APROBADO'),
      'REGLA: la opinión APROBADA sobrevivió, aunque sea igual de vieja',
      opiniones,
    );

    const correos = await prisma.emailLog.findMany({ select: { destino: true } });
    afirmar(correos.length === 1 && correos[0]!.destino === 'nuevo@ejemplo.ar',
      'de los correos quedó sólo el reciente', correos);

    // ------------------------------------------------------------------
    console.log('\n=== Idempotencia: correrla dos veces no rompe ===');
    const segunda = await aplicarRetencion(prisma, { activa: true, ahora });
    afirmar(segunda.totalBorrados === 0, 'la segunda corrida no borra nada más', segunda.totalBorrados);

    await prisma.$disconnect();
  } finally {
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
