/**
 * Pruebas de las reglas de negocio hechas cumplir por PostgreSQL.
 *
 * Requieren una base real: verifican disparadores en PL/pgSQL, restricciones
 * `CHECK` y el índice único parcial. Se ejecutan desde `test-integracion.ts`,
 * que levanta la instancia y aplica las migraciones antes de invocarlas.
 *
 * Estas pruebas responden a la pregunta que ninguna otra puede responder:
 * **¿el motor efectivamente rechaza lo que declaramos que no puede pasar?**
 */

import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let alumnoSecundario: number;
let alumnoOtro: number;
let deporteFutbol: number;
let deporteBasquet: number;
let deporteAjedrez: number;

before(async () => {
  // El seed ya cargó el dominio completo. Se toman referencias de ahí.
  const a1 = await prisma.alumno.findUnique({ where: { legajo: 'A-0001' } });
  const a2 = await prisma.alumno.findUnique({ where: { legajo: 'A-0005' } });
  const futbol = await prisma.deporte.findUnique({ where: { nombre: 'Fútbol' } });
  const basquet = await prisma.deporte.findUnique({ where: { nombre: 'Básquet' } });
  const ajedrez = await prisma.deporte.findUnique({ where: { nombre: 'Ajedrez' } });

  assert.ok(a1 && a2 && futbol && basquet && ajedrez, 'el seed debería haber cargado el dominio');

  alumnoSecundario = a1.id;
  alumnoOtro = a2.id;
  deporteFutbol = futbol.id;
  deporteBasquet = basquet.id;
  deporteAjedrez = ajedrez.id;
});

after(async () => {
  await prisma.$disconnect();
});

// ==================================================================
// Estructura
// ==================================================================

test('las migraciones crearon las 39 tablas del modelo', async () => {
  const filas = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      AND table_name <> '_prisma_migrations'`;

  assert.equal(Number(filas[0]!.n), 39);
});

test('las tablas de RF-07 y RF-08 existen', async () => {
  const filas = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('AvisoMasivo', 'MensajeEnviado', 'PosicionTransporte')`;

  const nombres = filas.map((f) => f.table_name).sort();
  assert.deepEqual(nombres, ['AvisoMasivo', 'MensajeEnviado', 'PosicionTransporte']);
});

test('RF-07: el campo telefono se agregó a User sin romper los datos', async () => {
  // La migración es aditiva: las cuentas existentes quedan con telefono nulo.
  const filas = await prisma.$queryRaw<{ data_type: string; is_nullable: string }[]>`
    SELECT data_type, is_nullable FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'telefono'`;

  assert.equal(filas.length, 1, 'la columna debería existir');
  assert.equal(filas[0]!.is_nullable, 'YES', 'debe admitir nulos para no romper las cuentas viejas');

  const usuarios = await prisma.user.count();
  assert.ok(usuarios > 0, 'el seed debería haber cargado usuarios');
});

test('las funciones en PL/pgSQL se crearon', async () => {
  const filas = await prisma.$queryRaw<{ proname: string }[]>`
    SELECT proname FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND proname LIKE 'fn_%'
    ORDER BY proname`;

  const nombres = filas.map((f) => f.proname);

  for (const esperada of [
    'fn_minutos_a_hora',
    'fn_proteger_recorridos',
    'fn_recalcular_estado_factura',
    'fn_validar_comprobante',
    'fn_validar_max_deportes',
    'fn_validar_solapamiento_deporte',
    'fn_validar_tutor_es_padre',
  ]) {
    assert.ok(nombres.includes(esperada), `falta la función ${esperada}`);
  }
});

test('los disparadores están activos', async () => {
  const filas = await prisma.$queryRaw<{ tgname: string }[]>`
    SELECT tgname FROM pg_trigger
    WHERE NOT tgisinternal AND tgname LIKE 'trg_%'
    ORDER BY tgname`;

  assert.ok(filas.length >= 6, `se esperaban al menos 6 disparadores, hay ${filas.length}`);
});

test('el índice único parcial del tope de deportes existe', async () => {
  const filas = await prisma.$queryRaw<{ indexdef: string }[]>`
    SELECT indexdef FROM pg_indexes
    WHERE indexname = 'ux_inscripcion_deporte_slot_activo'`;

  assert.equal(filas.length, 1, 'el índice debería existir');
  assert.match(filas[0]!.indexdef, /WHERE \(estado = 'ACTIVA'/, 'debería ser parcial');
});

// ==================================================================
// Regla: máximo 2 deportes simultáneos
// ==================================================================

test('REGLA: el motor rechaza un tercer deporte activo', async () => {
  // A-0001 ya cursa Fútbol y Ajedrez según el seed.
  const activas = await prisma.inscripcionDeporte.count({
    where: { alumnoId: alumnoSecundario, estado: 'ACTIVA' },
  });
  assert.equal(activas, 2, 'el seed debería dejarlo con 2 deportes');

  await assert.rejects(
    () =>
      prisma.inscripcionDeporte.create({
        data: { alumnoId: alumnoSecundario, deporteId: deporteBasquet, slot: 1 },
      }),
    (err: Error) => {
      // El disparador corta antes con un mensaje legible.
      assert.match(err.message, /máximo permitido es 2|deportes activos/i);
      return true;
    },
  );
});

test('REGLA: el CHECK rechaza un slot fuera de 1 y 2', async () => {
  // Se usa un alumno SIN deportes activos a propósito. En PostgreSQL los
  // disparadores BEFORE se evalúan antes que las restricciones CHECK, así que
  // con un alumno que ya cursa algo saltaría primero el de solapamiento y no
  // se estaría probando lo que se quiere probar.
  const sinDeportes = await prisma.alumno.findUnique({ where: { legajo: 'A-0012' } });
  assert.ok(sinDeportes);

  const activas = await prisma.inscripcionDeporte.count({
    where: { alumnoId: sinDeportes.id, estado: 'ACTIVA' },
  });
  assert.equal(activas, 0, 'el alumno elegido no debería cursar deportes');

  await assert.rejects(
    () =>
      prisma.$executeRaw`
        INSERT INTO "InscripcionDeporte" ("alumnoId","deporteId","slot","estado")
        VALUES (${sinDeportes.id}, ${deporteBasquet}, 3, 'ACTIVA')`,
    (err: Error) => {
      assert.match(err.message, /chk_inscripcion_deporte_slot|violates check/i);
      return true;
    },
  );
});

test('al dar de baja un deporte se libera el cupo', async () => {
  const inscripcion = await prisma.inscripcionDeporte.findFirst({
    where: { alumnoId: alumnoSecundario, estado: 'ACTIVA' },
  });
  assert.ok(inscripcion);

  await prisma.inscripcionDeporte.update({
    where: { id: inscripcion.id },
    data: { estado: 'BAJA', fechaBaja: new Date() },
  });

  // Ahora sí entra un tercero, porque sólo hay uno activo.
  const nueva = await prisma.inscripcionDeporte.create({
    data: { alumnoId: alumnoSecundario, deporteId: deporteBasquet, slot: inscripcion.slot },
  });
  assert.ok(nueva.id);

  // Se deja como estaba para no afectar a las pruebas siguientes.
  await prisma.inscripcionDeporte.delete({ where: { id: nueva.id } });
  await prisma.inscripcionDeporte.update({
    where: { id: inscripcion.id },
    data: { estado: 'ACTIVA', fechaBaja: null },
  });
});

// ==================================================================
// Regla: sin solapamiento de horarios
// ==================================================================

test('REGLA: el motor rechaza un deporte que se superpone', async () => {
  // A-0005 (Secundario) cursa Hockey: miércoles y viernes 17:00-18:30.
  // Vóley de Secundario va lunes y miércoles 17:00-18:30 → choca el miércoles.
  const voley = await prisma.deporte.findUnique({ where: { nombre: 'Vóley' } });
  assert.ok(voley);

  await assert.rejects(
    () =>
      prisma.inscripcionDeporte.create({
        data: { alumnoId: alumnoOtro, deporteId: voley.id, slot: 2 },
      }),
    (err: Error) => {
      assert.match(err.message, /Conflicto de horarios|se superpone/i);
      return true;
    },
  );
});

test('un deporte consecutivo SÍ se acepta: los extremos son semiabiertos', async () => {
  // A-0001 cursa Fútbol (jueves hasta 18:30) y Ajedrez (jueves desde 18:30).
  // El seed lo cargó sin error, lo que prueba que el criterio funciona.
  const inscripciones = await prisma.inscripcionDeporte.findMany({
    where: { alumnoId: alumnoSecundario, estado: 'ACTIVA' },
    include: { deporte: true },
  });

  const nombres = inscripciones.map((i) => i.deporte.nombre).sort();
  assert.deepEqual(nombres, ['Ajedrez', 'Fútbol']);
});

// ==================================================================
// Regla: exactamente 4 recorridos
// ==================================================================

test('REGLA: existen exactamente 4 recorridos', async () => {
  assert.equal(await prisma.recorridoTransporte.count(), 4);
});

test('REGLA: el motor impide borrar un recorrido', async () => {
  const r3 = await prisma.recorridoTransporte.findUnique({ where: { codigo: 'R3' } });
  assert.ok(r3);

  await assert.rejects(
    () => prisma.recorridoTransporte.delete({ where: { id: r3.id } }),
    (err: Error) => {
      assert.match(err.message, /fijos por regla de negocio|activo = false/i);
      return true;
    },
  );

  assert.equal(await prisma.recorridoTransporte.count(), 4, 'siguen siendo 4');
});

// ==================================================================
// Regla: factura 1:N comprobantes, estado derivado
// ==================================================================

test('REGLA: el estado de la factura lo deriva el motor, no la aplicación', async () => {
  const alumno = await prisma.alumno.findUnique({ where: { legajo: 'A-0003' } });
  assert.ok(alumno);

  const admin = await prisma.user.findUnique({ where: { usuario: 'fabriynahuel' } });
  assert.ok(admin);

  const factura = await prisma.factura.create({
    data: {
      numero: `9999-${Date.now().toString().slice(-8)}`,
      alumnoId: alumno.id,
      anio: 2026,
      mes: 1,
      fechaEmision: new Date('2026-01-31T00:00:00.000Z'),
      fechaVencimiento: new Date('2026-02-10T00:00:00.000Z'),
      subtotal: 100000,
      total: 100000,
      items: {
        create: [
          { tipo: 'CUOTA', descripcion: 'Prueba', cantidad: 1, precioUnitario: 100000, subtotal: 100000 },
        ],
      },
    },
  });

  // Primera transferencia: cubre la mitad.
  await prisma.comprobantePago.create({
    data: {
      facturaId: factura.id,
      subidoPorId: admin.id,
      monto: 40000,
      fechaTransferencia: new Date('2026-02-05T00:00:00.000Z'),
      bancoOrigen: 'Banco Nación',
      numeroOperacion: 'TEST-1',
      archivoUrl: '/uploads/test-1.pdf',
      estado: 'APROBADO',
      validadoPorId: admin.id,
      validadoEn: new Date(),
    },
  });

  let actual = await prisma.factura.findUnique({ where: { id: factura.id } });
  assert.equal(Number(actual!.montoPagado), 40000, 'el disparador debería acumular');
  assert.equal(actual!.estado, 'PARCIAL');

  // Segunda transferencia: completa el total. Esta es la relación 1:N.
  await prisma.comprobantePago.create({
    data: {
      facturaId: factura.id,
      subidoPorId: admin.id,
      monto: 60000,
      fechaTransferencia: new Date('2026-02-08T00:00:00.000Z'),
      bancoOrigen: 'Nuevo Banco del Chaco',
      numeroOperacion: 'TEST-2',
      archivoUrl: '/uploads/test-2.pdf',
      estado: 'APROBADO',
      validadoPorId: admin.id,
      validadoEn: new Date(),
    },
  });

  actual = await prisma.factura.findUnique({ where: { id: factura.id } });
  assert.equal(Number(actual!.montoPagado), 100000);
  assert.equal(actual!.estado, 'PAGADA', 'dos transferencias saldan una factura');

  await prisma.factura.delete({ where: { id: factura.id } });
});

test('REGLA: no se acepta un comprobante sin archivo adjunto', async () => {
  const factura = await prisma.factura.findFirst();
  const admin = await prisma.user.findUnique({ where: { usuario: 'fabriynahuel' } });
  assert.ok(factura && admin);

  await assert.rejects(
    () =>
      prisma.$executeRaw`
        INSERT INTO "ComprobantePago"
          ("facturaId","subidoPorId","monto","fechaTransferencia","bancoOrigen","numeroOperacion","archivoUrl","updatedAt")
        VALUES (${factura.id}, ${admin.id}, 1000, CURRENT_DATE, 'Banco', 'SIN-ARCHIVO', '   ', NOW())`,
    (err: Error) => {
      assert.match(err.message, /chk_comprobante_valido|violates check/i);
      return true;
    },
  );
});

// ==================================================================
// Regla: sólo un usuario PADRE puede ser tutor
// ==================================================================

test('REGLA: el motor rechaza como tutor a quien no tiene rol PADRE', async () => {
  const docente = await prisma.user.findFirst({ where: { role: 'DOCENTE' } });
  const alumno = await prisma.alumno.findUnique({ where: { legajo: 'A-0004' } });
  assert.ok(docente && alumno);

  await assert.rejects(
    () => prisma.tutorAlumno.create({ data: { tutorId: docente.id, alumnoId: alumno.id } }),
    (err: Error) => {
      assert.match(err.message, /rol PADRE/i);
      return true;
    },
  );
});

// ==================================================================
// Regla: anti-repetición del código QR
// ==================================================================

test('REGLA: un código QR no puede usarse dos veces en el mismo punto', async () => {
  const alumno = await prisma.alumno.findUnique({ where: { legajo: 'A-0001' } });
  const admin = await prisma.user.findUnique({ where: { usuario: 'fabriynahuel' } });
  assert.ok(alumno && admin);

  const credencial = await prisma.credencialDigital.create({
    data: { alumnoId: alumno.id, secreto: 'a'.repeat(64), emitidaPorId: admin.id },
  });

  const contador = 58_000_000;

  await prisma.registroAcceso.create({
    data: {
      credencialId: credencial.id,
      alumnoId: alumno.id,
      punto: 'COMEDOR',
      resultado: 'PERMITIDO',
      contador,
      operadorId: admin.id,
    },
  });

  // El mismo código, otra vez, en el mismo punto: lo impide el índice único.
  await assert.rejects(
    () =>
      prisma.registroAcceso.create({
        data: {
          credencialId: credencial.id,
          alumnoId: alumno.id,
          punto: 'COMEDOR',
          resultado: 'PERMITIDO',
          contador,
          operadorId: admin.id,
        },
      }),
    (err: Error) => {
      assert.match(err.message, /Unique constraint|unique/i);
      return true;
    },
  );

  await prisma.credencialDigital.delete({ where: { id: credencial.id } });
});
