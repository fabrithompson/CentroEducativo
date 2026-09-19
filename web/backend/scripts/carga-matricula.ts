/**
 * Carga de matrícula para medir el RNF-03, y medición.
 *
 * El RNF-03 pide consultas en menos de 3 s y reportes en menos de 10 s. Nunca
 * se pudo verificar porque la base de desarrollo tiene 12 alumnos: con ese
 * volumen cualquier consulta entra, y el número no dice nada. Esto genera una
 * matrícula del tamaño real de una escuela y cronometra los reportes usando
 * **las funciones de servicio que ejecuta la aplicación**, no consultas
 * reescritas para la ocasión — si se midiera otra consulta, se mediría otra cosa.
 *
 *   # sólo medir, sin escribir nada
 *   pnpm --filter backend matricula:medir
 *
 *   # cargar (pide --confirmar de forma explícita)
 *   pnpm --filter backend exec tsx scripts/carga-matricula.ts --cantidad=5000 --confirmar
 *
 *   # borrar exactamente lo que cargó este script
 *   pnpm --filter backend exec tsx scripts/carga-matricula.ts --limpiar --confirmar
 *
 * DOS DECISIONES QUE IMPORTAN
 *
 * 1. Todo lo que se crea queda marcado: el legajo arranca con `CARGA-` y el DNI
 *    sale de un rango reservado que no existe en la realidad. Eso vuelve al
 *    borrado exacto y no aproximado. Una carga de prueba que no se puede
 *    deshacer con precisión no es una prueba, es una contaminación.
 *
 * 2. Ninguna escritura ocurre sin `--confirmar`, y antes de escribir se informa
 *    contra qué base se va a trabajar. El script puede terminar apuntado a
 *    producción mediante `railway run`, y ahí la diferencia entre medir y
 *    arruinar la base es una variable de entorno.
 */

import { fakerES as faker } from '@faker-js/faker';
import { PrismaClient } from '@prisma/client';

import {
  alumnosPorDeporte,
  alumnosPorMateria,
  reporteMorosidad,
} from '../src/modules/reportes/reportes.service';

// ------------------------------------------------------------------
// Marcas de identificación
// ------------------------------------------------------------------

/** Prefijo de legajo. Los reales son `A-0001`; los de prueba, imposibles de confundir. */
const PREFIJO_LEGAJO = 'CARGA-';

/**
 * Los DNI generados arrancan acá. El padrón argentino todavía no llega a los
 * 90 millones, así que ninguno de estos números puede pisar a una persona real.
 */
const DNI_BASE = 90_000_000;

const MARCA = 'Carga de prueba RNF-03. Se borra con scripts/carga-matricula.ts --limpiar';

/** Tamaño de lote del `createMany`. */
const LOTE = 500;

const LOCALIDADES = ['Resistencia', 'Barranqueras', 'Fontana', 'Puerto Vilelas'];

// ------------------------------------------------------------------
// Argumentos
// ------------------------------------------------------------------

const argv = process.argv.slice(2);
const tiene = (bandera: string) => argv.includes(bandera);

function numero(nombre: string, porDefecto: number): number {
  const crudo = argv.find((a) => a.startsWith(`--${nombre}=`))?.split('=')[1];
  if (crudo === undefined) return porDefecto;

  const n = Number(crudo);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`--${nombre} tiene que ser un entero positivo, llegó "${crudo}"`);
  }
  return n;
}

const opciones = {
  cantidad: numero('cantidad', 5000),
  confirmar: tiene('--confirmar'),
  limpiar: tiene('--limpiar'),
  soloMedir: tiene('--medir'),
};

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------

/** Describe la base sin filtrar la contraseña al log. */
function describirBase(): string {
  const url = process.env.DATABASE_URL;
  if (!url) return 'DATABASE_URL no está definida';

  try {
    const u = new URL(url);
    return `${u.hostname}:${u.port || '5432'}${u.pathname} (usuario ${u.username})`;
  } catch {
    return 'DATABASE_URL con formato no reconocible';
  }
}

function separador(titulo: string): void {
  console.log(`\n${'='.repeat(68)}\n${titulo}\n${'='.repeat(68)}`);
}

/** Corre `fn` varias veces y devuelve el mejor y el peor tiempo, en milisegundos. */
async function cronometrar<T>(
  veces: number,
  fn: () => Promise<T>,
): Promise<{ mejor: number; peor: number; ultimo: T }> {
  const marcas: number[] = [];
  let ultimo!: T;

  for (let i = 0; i < veces; i += 1) {
    const arranque = performance.now();
    ultimo = await fn();
    marcas.push(performance.now() - arranque);
  }

  return { mejor: Math.min(...marcas), peor: Math.max(...marcas), ultimo };
}

const segundos = (ms: number) => `${(ms / 1000).toFixed(2)} s`;

function veredicto(ms: number, umbralSegundos: number): string {
  return ms / 1000 <= umbralSegundos
    ? `CUMPLE (umbral ${umbralSegundos} s)`
    : `NO CUMPLE (umbral ${umbralSegundos} s)`;
}

// ------------------------------------------------------------------
// Generación
// ------------------------------------------------------------------

interface CursoDestino {
  id: number;
  etiqueta: string;
}

async function cursosDestino(prisma: PrismaClient): Promise<CursoDestino[]> {
  const anio = await prisma.curso.aggregate({ _max: { anioLectivo: true } });
  const anioLectivo = anio._max.anioLectivo;

  if (anioLectivo === null) {
    throw new Error(
      'No hay cursos en la base. Primero hay que cargar el dominio: pnpm --filter backend prisma:seed:limpio',
    );
  }

  const cursos = await prisma.curso.findMany({
    where: { activo: true, anioLectivo },
    select: { id: true, nombre: true, division: true },
    orderBy: { id: 'asc' },
  });

  if (cursos.length === 0) {
    throw new Error(`No hay cursos activos del año lectivo ${anioLectivo}.`);
  }

  return cursos.map((c) => ({ id: c.id, etiqueta: `${c.nombre} "${c.division}"` }));
}

/**
 * Los alumnos se reparten de forma pareja entre los cursos, en vez de al azar:
 * un reparto aleatorio deja cursos con el doble de alumnos que otros y ensucia
 * la medición, porque los reportes agrupan por curso.
 */
function construirAlumnos(
  desde: number,
  cantidad: number,
  cursos: CursoDestino[],
): Array<Record<string, unknown>> {
  const filas: Array<Record<string, unknown>> = [];

  for (let i = 0; i < cantidad; i += 1) {
    const n = desde + i;
    const curso = cursos[i % cursos.length];
    const sexo = faker.person.sexType();

    filas.push({
      legajo: `${PREFIJO_LEGAJO}${String(n).padStart(5, '0')}`,
      dni: String(DNI_BASE + n),
      apellido: faker.person.lastName(),
      nombres: `${faker.person.firstName(sexo)} ${faker.person.firstName(sexo)}`,
      fechaNacimiento: faker.date.birthdate({ min: 4, max: 18, mode: 'age' }),
      domicilio: faker.location.streetAddress(),
      localidad: faker.helpers.arrayElement(LOCALIDADES),
      provincia: 'Chaco',
      telefono: `362${faker.string.numeric(7)}`,
      email: faker.internet.email().toLowerCase(),
      cursoId: curso.id,
      // Todos activos a propósito: los reportes filtran por ACTIVO, así que es
      // el caso más caro y el único que sirve para afirmar que se cumple.
      estado: 'ACTIVO',
      fechaIngreso: faker.date.past({ years: 6 }),
      observaciones: MARCA,
    });
  }

  return filas;
}

// ------------------------------------------------------------------
// Acciones
// ------------------------------------------------------------------

async function contarCargados(prisma: PrismaClient): Promise<number> {
  return prisma.alumno.count({ where: { legajo: { startsWith: PREFIJO_LEGAJO } } });
}

async function cargar(prisma: PrismaClient): Promise<void> {
  const cursos = await cursosDestino(prisma);
  const yaHay = await contarCargados(prisma);
  const faltan = opciones.cantidad - yaHay;

  console.log(`Cursos activos destino: ${cursos.length} (${cursos.map((c) => c.etiqueta).join(', ')})`);
  console.log(`Alumnos de prueba ya cargados: ${yaHay}`);

  if (faltan <= 0) {
    console.log(`Ya hay ${yaHay} alumnos de prueba, que alcanzan los ${opciones.cantidad} pedidos. No se crea nada.`);
    return;
  }

  console.log(`A crear: ${faltan}, en lotes de ${LOTE}.\n`);

  // Semilla fija: dos corridas sobre bases distintas generan la misma matrícula,
  // así una medición se puede comparar contra otra.
  faker.seed(20260919);

  const arranque = performance.now();
  let creados = 0;

  for (let offset = 0; offset < faltan; offset += LOTE) {
    const tamanio = Math.min(LOTE, faltan - offset);
    const filas = construirAlumnos(yaHay + offset + 1, tamanio, cursos);

    // `skipDuplicates` cubre la corrida interrumpida: reintentar no choca contra
    // los legajos que ya entraron.
    const r = await prisma.alumno.createMany({
      data: filas as never,
      skipDuplicates: true,
    });

    creados += r.count;
    process.stdout.write(`\r  ${creados}/${faltan} creados…`);
  }

  const total = await contarCargados(prisma);
  console.log(`\n\nListo en ${segundos(performance.now() - arranque)}.`);
  console.log(`Alumnos de prueba en la base: ${total}`);
  console.log(`Total de alumnos (reales + prueba): ${await prisma.alumno.count()}`);
}

async function limpiar(prisma: PrismaClient): Promise<void> {
  const cuantos = await contarCargados(prisma);
  console.log(`Alumnos de prueba encontrados: ${cuantos}`);

  if (cuantos === 0) {
    console.log('No hay nada que borrar.');
    return;
  }

  const ids = (
    await prisma.alumno.findMany({
      where: { legajo: { startsWith: PREFIJO_LEGAJO } },
      select: { id: true },
    })
  ).map((a) => a.id);

  // `Factura.alumnoId` es la única FK hacia Alumno con onDelete Restrict: si a
  // un alumno de prueba se le llegó a emitir una factura, el borrado del alumno
  // falla. Se borran primero, y sólo las de estos alumnos.
  const facturas = await prisma.factura.deleteMany({ where: { alumnoId: { in: ids } } });
  if (facturas.count > 0) console.log(`Facturas de alumnos de prueba borradas: ${facturas.count}`);

  // El resto de las relaciones (inscripciones, tutores, credencial, accesos)
  // están en Cascade o SetNull, así que las resuelve el motor.
  const borrados = await prisma.alumno.deleteMany({
    where: { legajo: { startsWith: PREFIJO_LEGAJO } },
  });

  console.log(`Alumnos de prueba borrados: ${borrados.count}`);
  console.log(`Alumnos que quedan en la base: ${await prisma.alumno.count()}`);
}

async function medir(prisma: PrismaClient): Promise<void> {
  const totalAlumnos = await prisma.alumno.count();
  const activos = await prisma.alumno.count({ where: { estado: 'ACTIVO' } });
  const anio = new Date().getFullYear();

  console.log(`Alumnos en la base: ${totalAlumnos} (${activos} activos)`);
  console.log(`De prueba: ${await contarCargados(prisma)}`);
  console.log('\nCada medición corre 3 veces. Se informa el mejor y el peor tiempo.');

  separador('CONSULTAS — umbral RNF-03: 3 segundos');

  const listado = await cronometrar(3, () =>
    prisma.alumno.findMany({
      where: { estado: 'ACTIVO' },
      include: { curso: { include: { nivel: true } } },
      orderBy: [{ apellido: 'asc' }, { nombres: 'asc' }],
      take: 50,
    }),
  );
  console.log(
    `Listado de alumnos paginado (50)   mejor ${segundos(listado.mejor)}  peor ${segundos(listado.peor)}  ${veredicto(listado.peor, 3)}`,
  );

  const busqueda = await cronometrar(3, () =>
    prisma.alumno.findMany({
      where: { estado: 'ACTIVO', apellido: { startsWith: 'G', mode: 'insensitive' } },
      take: 50,
    }),
  );
  console.log(
    `Búsqueda por apellido              mejor ${segundos(busqueda.mejor)}  peor ${segundos(busqueda.peor)}  ${veredicto(busqueda.peor, 3)}`,
  );

  separador('REPORTES — umbral RNF-03: 10 segundos');

  const materias = await cronometrar(3, () => alumnosPorMateria(prisma, {}));
  console.log(
    `alumnos-por-materia (RF-06)        mejor ${segundos(materias.mejor)}  peor ${segundos(materias.peor)}  ${veredicto(materias.peor, 10)}`,
  );
  console.log(
    `   filas devueltas: ${materias.ultimo.totales.filas}, materias: ${materias.ultimo.totales.materias}`,
  );

  const deportes = await cronometrar(3, () => alumnosPorDeporte(prisma, {}));
  console.log(
    `alumnos-por-deporte                mejor ${segundos(deportes.mejor)}  peor ${segundos(deportes.peor)}  ${veredicto(deportes.peor, 10)}`,
  );

  const morosidad = await cronometrar(3, () => reporteMorosidad(prisma, { anio }));
  console.log(
    `morosidad                          mejor ${segundos(morosidad.mejor)}  peor ${segundos(morosidad.peor)}  ${veredicto(morosidad.peor, 10)}`,
  );

  console.log(
    '\nNota: `morosidad` recorre facturas, y este script no genera facturas. Su tiempo\n' +
      'refleja el volumen de facturación real de la base, no el de la matrícula cargada.',
  );
}

// ------------------------------------------------------------------
// Entrada
// ------------------------------------------------------------------

async function main(): Promise<void> {
  separador('CARGA DE MATRÍCULA — RNF-03');
  console.log(`Base de datos: ${describirBase()}`);

  const escribe = opciones.limpiar || !opciones.soloMedir;

  if (escribe && !opciones.confirmar) {
    console.error(
      `\nEste modo ESCRIBE en la base que figura arriba y falta --confirmar.\n\n` +
        `  Para medir sin tocar nada:  --medir\n` +
        `  Para cargar:                --cantidad=${opciones.cantidad} --confirmar\n` +
        `  Para borrar lo cargado:     --limpiar --confirmar\n\n` +
        `Revisá que la base sea la que querés antes de confirmar.`,
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    if (opciones.limpiar) {
      separador('BORRADO');
      await limpiar(prisma);
    } else if (!opciones.soloMedir) {
      separador(`CARGA DE ${opciones.cantidad} ALUMNOS`);
      await cargar(prisma);
    }

    separador('MEDICIÓN');
    await medir(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('\nFalló la carga:', err instanceof Error ? err.message : err);
  process.exit(1);
});
