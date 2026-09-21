/**
 * Pruebas de la política de retención (RNF-09).
 *
 * Lo que se verifica no es el SQL sino las dos reglas que hacen que esto sea
 * seguro de encender: que en modo informe no borre nada, y que nunca alcance a
 * un registro sin resolver. Un error en cualquiera de las dos no se nota hasta
 * que los datos ya no están.
 *
 * Se usa un doble de Prisma que registra las consultas, así se puede afirmar
 * sobre el `where` que se armó sin levantar una base.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { PLAZOS, aplicarRetencion } from './retencion';

const DIA = 24 * 60 * 60 * 1000;
const AHORA = new Date('2026-09-21T03:00:00.000Z');

interface Llamada {
  modelo: string;
  operacion: 'count' | 'deleteMany';
  where: Record<string, any>;
}

/**
 * Doble mínimo. Cada modelo devuelve la cantidad que se le indique y anota lo
 * que le preguntaron.
 */
function doble(cantidades: Record<string, number> = {}) {
  const llamadas: Llamada[] = [];

  const modelo = (nombre: string) => ({
    count: async ({ where }: { where: Record<string, any> }) => {
      llamadas.push({ modelo: nombre, operacion: 'count', where });
      return cantidades[nombre] ?? 0;
    },
    deleteMany: async ({ where }: { where: Record<string, any> }) => {
      llamadas.push({ modelo: nombre, operacion: 'deleteMany', where });
      return { count: cantidades[nombre] ?? 0 };
    },
  });

  const prisma = {
    posicionTransporte: modelo('PosicionTransporte'),
    registroAcceso: modelo('RegistroAcceso'),
    emailLog: modelo('EmailLog'),
    mensajeEnviado: modelo('MensajeEnviado'),
    employmentApplication: modelo('EmploymentApplication'),
    inscription: modelo('Inscription'),
    opinionPublica: modelo('OpinionPublica'),
  };

  return { prisma: prisma as never, llamadas };
}

const borrados = (llamadas: Llamada[]) => llamadas.filter((l) => l.operacion === 'deleteMany');
const whereDe = (llamadas: Llamada[], modelo: string) =>
  llamadas.find((l) => l.modelo === modelo && l.operacion === 'count')!.where;

// ==================================================================
// Modo informe
// ==================================================================

test('REGLA: en modo informe no se borra nada', async () => {
  const { prisma, llamadas } = doble({
    PosicionTransporte: 5000,
    RegistroAcceso: 1200,
    EmailLog: 300,
  });

  const r = await aplicarRetencion(prisma, { activa: false, ahora: AHORA });

  assert.deepEqual(borrados(llamadas), [], 'no debería haberse llamado a deleteMany');
  assert.equal(r.totalBorrados, 0);
  assert.equal(r.activa, false);
});

test('el informe cuenta lo que se borraría aunque no borre', async () => {
  const { prisma } = doble({ PosicionTransporte: 5000, RegistroAcceso: 1200 });

  const r = await aplicarRetencion(prisma, { activa: false, ahora: AHORA });

  assert.equal(r.totalAlcanzados, 6200);
  const posiciones = r.lineas.find((l) => l.modelo === 'PosicionTransporte')!;
  assert.equal(posiciones.alcanzados, 5000);
  assert.equal(posiciones.borrados, 0);
});

test('con la purga activa sí borra', async () => {
  const { prisma, llamadas } = doble({ PosicionTransporte: 5000 });

  const r = await aplicarRetencion(prisma, { activa: true, ahora: AHORA });

  assert.equal(r.totalBorrados, 5000);
  assert.ok(
    borrados(llamadas).some((l) => l.modelo === 'PosicionTransporte'),
    'debería haber borrado las posiciones',
  );
});

test('no llama a deleteMany cuando no hay nada alcanzado', async () => {
  // Evita ruido en el log de PostgreSQL: un DELETE que no borra nada sigue
  // siendo una transacción escrita.
  const { prisma, llamadas } = doble({});

  await aplicarRetencion(prisma, { activa: true, ahora: AHORA });

  assert.deepEqual(borrados(llamadas), []);
});

// ==================================================================
// Lo que nunca se toca
// ==================================================================

test('REGLA: una postulación sin resolver no se purga por vieja que sea', async () => {
  const { prisma, llamadas } = doble({ EmploymentApplication: 10 });
  await aplicarRetencion(prisma, { activa: true, ahora: AHORA });

  const where = whereDe(llamadas, 'EmploymentApplication');
  assert.equal(where.resolvedAt.not, null, 'debe exigir resolvedAt distinto de null');
});

test('REGLA: una inscripción sin resolver no se purga', async () => {
  const { prisma, llamadas } = doble({ Inscription: 10 });
  await aplicarRetencion(prisma, { activa: true, ahora: AHORA });

  const where = whereDe(llamadas, 'Inscription');
  assert.equal(where.resolvedAt.not, null);
});

test('REGLA: sólo se purgan las opiniones rechazadas, no las aprobadas ni las pendientes', async () => {
  const { prisma, llamadas } = doble({ OpinionPublica: 10 });
  await aplicarRetencion(prisma, { activa: true, ahora: AHORA });

  const where = whereDe(llamadas, 'OpinionPublica');
  assert.equal(where.status, 'RECHAZADO');
  assert.equal(where.resolvedAt.not, null);
});

test('la política no alcanza a alumnos, notas, asistencias ni facturas', async () => {
  // Tienen obligación de conservación documental y sus bajas son lógicas.
  // Si alguien los agrega a la política, esta prueba lo frena.
  const { prisma, llamadas } = doble({});
  await aplicarRetencion(prisma, { activa: true, ahora: AHORA });

  const prohibidos = ['Alumno', 'Grade', 'Attendance', 'Factura', 'ComprobantePago', 'User'];
  const tocados = llamadas.map((l) => l.modelo);

  for (const m of prohibidos) {
    assert.ok(!tocados.includes(m), `la retención no debería tocar ${m}`);
  }
});

// ==================================================================
// Los plazos
// ==================================================================

test('cada fecha de corte corresponde al plazo declarado', async () => {
  const { prisma, llamadas } = doble({});
  await aplicarRetencion(prisma, { activa: false, ahora: AHORA });

  const esperado = (dias: number) => new Date(AHORA.getTime() - dias * DIA);

  assert.deepEqual(
    whereDe(llamadas, 'PosicionTransporte').registradoEn.lt,
    esperado(PLAZOS.posicionesTransporte),
  );
  assert.deepEqual(
    whereDe(llamadas, 'RegistroAcceso').createdAt.lt,
    esperado(PLAZOS.registrosDeAcceso),
  );
  assert.deepEqual(
    whereDe(llamadas, 'EmailLog').createdAt.lt,
    esperado(PLAZOS.registrosDeCorreo),
  );
});

test('el historial de accesos se conserva al menos un ciclo lectivo', () => {
  // Es el dato más sensible —los movimientos de un menor— y a la vez el que
  // hace falta para resolver un reclamo del año en curso. Menos de un ciclo
  // lectivo dejaría a la escuela sin con qué responder.
  assert.ok(
    PLAZOS.registrosDeAcceso >= 365,
    `los accesos se guardan ${PLAZOS.registrosDeAcceso} días, menos de un ciclo lectivo`,
  );
});

test('las posiciones del transporte son lo que menos se conserva', () => {
  // Es telemetría sin obligación legal y lo que más volumen acumula.
  const otros = Object.entries(PLAZOS).filter(([k]) => k !== 'posicionesTransporte');

  for (const [nombre, dias] of otros) {
    assert.ok(
      PLAZOS.posicionesTransporte <= dias,
      `posicionesTransporte (${PLAZOS.posicionesTransporte}) debería ser <= ${nombre} (${dias})`,
    );
  }
});

test('todos los plazos son positivos', () => {
  // Un plazo en 0 borraría todo en la primera corrida.
  for (const [nombre, dias] of Object.entries(PLAZOS)) {
    assert.ok(dias > 0, `${nombre} tiene un plazo de ${dias} días`);
  }
});
