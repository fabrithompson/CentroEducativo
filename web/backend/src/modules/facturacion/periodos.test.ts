/**
 * Tests del cálculo de períodos y días hábiles.
 *
 * Esto es lo que decide cuándo corre la tarea de fin de mes. Si el cálculo está
 * mal, el error no se nota hasta que la factura sale un día tarde o no sale.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIA_RECORDATORIO,
  aISO,
  esDiaHabil,
  esFeriado,
  esFinDeSemana,
  esUltimoDiaHabilDelMes,
  fechaEmision,
  fechaVencimiento,
  formatearFecha,
  formatearPeriodo,
  limpiarFeriadosExtra,
  nombrePeriodo,
  periodoAnterior,
  periodoDe,
  periodoSiguiente,
  proximoDiaHabil,
  registrarFeriado,
  ultimoDiaDelMes,
  ultimoDiaHabilDelMes,
} from './periodos.ts';

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

// ------------------------------------------------------------------
// Fines de semana y feriados
// ------------------------------------------------------------------

test('reconoce sábados y domingos', () => {
  assert.ok(esFinDeSemana(d('2026-09-12')), '12/09/2026 es sábado');
  assert.ok(esFinDeSemana(d('2026-09-13')), '13/09/2026 es domingo');
  assert.ok(!esFinDeSemana(d('2026-09-14')), '14/09/2026 es lunes');
  assert.ok(!esFinDeSemana(d('2026-09-11')), '11/09/2026 es viernes');
});

test('reconoce los feriados nacionales cargados', () => {
  assert.ok(esFeriado(d('2026-01-01')), 'Año Nuevo');
  assert.ok(esFeriado(d('2026-05-25')), 'Revolución de Mayo');
  assert.ok(esFeriado(d('2026-07-09')), 'Día de la Independencia');
  assert.ok(esFeriado(d('2026-12-25')), 'Navidad');
  assert.ok(!esFeriado(d('2026-09-15')), 'un martes cualquiera');
});

test('un día hábil no es ni fin de semana ni feriado', () => {
  assert.ok(esDiaHabil(d('2026-09-15')));
  assert.ok(!esDiaHabil(d('2026-09-12')), 'sábado');
  assert.ok(!esDiaHabil(d('2026-12-25')), 'Navidad, que cae viernes');
});

test('se pueden registrar feriados adicionales en caliente', () => {
  limpiarFeriadosExtra();
  const puente = '2026-09-16';

  assert.ok(esDiaHabil(d(puente)));
  registrarFeriado(puente);
  assert.ok(!esDiaHabil(d(puente)), 'tras registrarlo debería dejar de ser hábil');

  limpiarFeriadosExtra();
  assert.ok(esDiaHabil(d(puente)), 'al limpiar debería volver a ser hábil');
});

// ------------------------------------------------------------------
// Último día hábil del mes — el corazón de la tarea 1
// ------------------------------------------------------------------

test('ultimoDiaDelMes contempla los meses de 30, 31 y 28 días', () => {
  assert.equal(aISO(ultimoDiaDelMes(2026, 1)), '2026-01-31');
  assert.equal(aISO(ultimoDiaDelMes(2026, 4)), '2026-04-30');
  assert.equal(aISO(ultimoDiaDelMes(2026, 2)), '2026-02-28');
  assert.equal(aISO(ultimoDiaDelMes(2026, 12)), '2026-12-31');
});

test('ultimoDiaDelMes contempla el año bisiesto', () => {
  assert.equal(aISO(ultimoDiaDelMes(2028, 2)), '2028-02-29');
  assert.equal(aISO(ultimoDiaDelMes(2027, 2)), '2027-02-28');
});

test('si el último día del mes es hábil, se usa ese', () => {
  // 30/09/2026 es miércoles.
  assert.equal(aISO(ultimoDiaHabilDelMes(2026, 9)), '2026-09-30');
});

test('si el último día cae fin de semana, retrocede al viernes', () => {
  // 31/10/2026 es sábado -> viernes 30.
  assert.equal(aISO(ultimoDiaHabilDelMes(2026, 10)), '2026-10-30');
  // 31/01/2026 es sábado -> viernes 30.
  assert.equal(aISO(ultimoDiaHabilDelMes(2026, 1)), '2026-01-30');
});

test('si el último día es feriado, retrocede hasta el hábil anterior', () => {
  // 25/12/2026 es Navidad y cae viernes; 26 y 27 son fin de semana.
  // El 31/12 es jueves y hábil, así que el último hábil de diciembre es el 31.
  assert.equal(aISO(ultimoDiaHabilDelMes(2026, 12)), '2026-12-31');
});

test('el último día hábil siempre es un día hábil', () => {
  for (let anio = 2026; anio <= 2027; anio++) {
    for (let mes = 1; mes <= 12; mes++) {
      const ultimo = ultimoDiaHabilDelMes(anio, mes);
      assert.ok(esDiaHabil(ultimo), `${aISO(ultimo)} debería ser hábil`);
      assert.equal(ultimo.getUTCMonth() + 1, mes, 'no debe salirse del mes');
    }
  }
});

test('esUltimoDiaHabilDelMes sólo es verdadero ese día', () => {
  assert.ok(esUltimoDiaHabilDelMes(d('2026-09-30')));
  assert.ok(!esUltimoDiaHabilDelMes(d('2026-09-29')));
  assert.ok(!esUltimoDiaHabilDelMes(d('2026-10-01')));

  // Octubre cierra el viernes 30, no el sábado 31.
  assert.ok(esUltimoDiaHabilDelMes(d('2026-10-30')));
  assert.ok(!esUltimoDiaHabilDelMes(d('2026-10-31')));
});

test('en un año entero hay exactamente 12 últimos días hábiles', () => {
  let encontrados = 0;
  const cursor = d('2026-01-01');

  while (cursor.getUTCFullYear() === 2026) {
    if (esUltimoDiaHabilDelMes(cursor)) encontrados++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  assert.equal(encontrados, 12, 'la tarea debe dispararse una vez por mes, ni más ni menos');
});

// ------------------------------------------------------------------
// Próximo día hábil y vencimientos
// ------------------------------------------------------------------

test('proximoDiaHabil devuelve la misma fecha si ya es hábil', () => {
  assert.equal(aISO(proximoDiaHabil(d('2026-09-15'))), '2026-09-15');
});

test('proximoDiaHabil salta el fin de semana', () => {
  assert.equal(aISO(proximoDiaHabil(d('2026-09-12'))), '2026-09-14', 'sábado -> lunes');
  assert.equal(aISO(proximoDiaHabil(d('2026-09-13'))), '2026-09-14', 'domingo -> lunes');
});

test('proximoDiaHabil salta feriados', () => {
  // 01/01/2026 es jueves y feriado -> viernes 2.
  assert.equal(aISO(proximoDiaHabil(d('2026-01-01'))), '2026-01-02');
});

test('el vencimiento cae el 10 del mes siguiente, corrido al próximo hábil', () => {
  // Cuota de septiembre: el 10/10/2026 es sábado, el 11 domingo y el lunes 12
  // es feriado (Respeto a la Diversidad Cultural). Cae el martes 13.
  assert.equal(aISO(fechaVencimiento({ anio: 2026, mes: 9 })), '2026-10-13');

  // Cuota de noviembre: el 10/12/2026 es jueves y hábil, no se corre.
  assert.equal(aISO(fechaVencimiento({ anio: 2026, mes: 11 })), '2026-12-10');
});

test('el vencimiento de diciembre cae en enero del año siguiente', () => {
  const v = fechaVencimiento({ anio: 2026, mes: 12 });
  assert.equal(v.getUTCFullYear(), 2027);
  assert.equal(v.getUTCMonth() + 1, 1);
});

test('el vencimiento siempre es un día hábil', () => {
  for (let mes = 1; mes <= 12; mes++) {
    assert.ok(esDiaHabil(fechaVencimiento({ anio: 2026, mes })), `mes ${mes}`);
  }
});

test('la emisión es el último día hábil del período facturado', () => {
  assert.equal(aISO(fechaEmision({ anio: 2026, mes: 9 })), '2026-09-30');
  assert.equal(aISO(fechaEmision({ anio: 2026, mes: 10 })), '2026-10-30');
});

test('la emisión siempre es anterior al vencimiento', () => {
  for (let mes = 1; mes <= 12; mes++) {
    const periodo = { anio: 2026, mes };
    assert.ok(
      fechaEmision(periodo) < fechaVencimiento(periodo),
      `en el mes ${mes} la emisión debe preceder al vencimiento`,
    );
  }
});

// ------------------------------------------------------------------
// Aritmética de períodos
// ------------------------------------------------------------------

test('periodoDe extrae año y mes de una fecha', () => {
  assert.deepEqual(periodoDe(d('2026-09-15')), { anio: 2026, mes: 9 });
  assert.deepEqual(periodoDe(d('2026-01-01')), { anio: 2026, mes: 1 });
});

test('periodoSiguiente cruza el fin de año', () => {
  assert.deepEqual(periodoSiguiente({ anio: 2026, mes: 11 }), { anio: 2026, mes: 12 });
  assert.deepEqual(periodoSiguiente({ anio: 2026, mes: 12 }), { anio: 2027, mes: 1 });
});

test('periodoAnterior cruza el inicio de año', () => {
  assert.deepEqual(periodoAnterior({ anio: 2026, mes: 2 }), { anio: 2026, mes: 1 });
  assert.deepEqual(periodoAnterior({ anio: 2026, mes: 1 }), { anio: 2025, mes: 12 });
});

test('periodoSiguiente y periodoAnterior son inversas', () => {
  for (let mes = 1; mes <= 12; mes++) {
    const p = { anio: 2026, mes };
    assert.deepEqual(periodoAnterior(periodoSiguiente(p)), p);
  }
});

// ------------------------------------------------------------------
// Formato
// ------------------------------------------------------------------

test('formatearPeriodo usa MM/AAAA con cero a la izquierda', () => {
  assert.equal(formatearPeriodo({ anio: 2026, mes: 9 }), '09/2026');
  assert.equal(formatearPeriodo({ anio: 2026, mes: 12 }), '12/2026');
});

test('nombrePeriodo escribe el mes en castellano', () => {
  assert.equal(nombrePeriodo({ anio: 2026, mes: 1 }), 'enero de 2026');
  assert.equal(nombrePeriodo({ anio: 2026, mes: 9 }), 'septiembre de 2026');
  assert.equal(nombrePeriodo({ anio: 2026, mes: 12 }), 'diciembre de 2026');
});

test('formatearFecha usa DD/MM/AAAA', () => {
  assert.equal(formatearFecha(d('2026-09-05')), '05/09/2026');
  assert.equal(formatearFecha(d('2026-12-31')), '31/12/2026');
});

test('el recordatorio está fijado el día 20', () => {
  assert.equal(DIA_RECORDATORIO, 20);
});
