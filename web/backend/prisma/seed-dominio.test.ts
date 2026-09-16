/**
 * Verificación del dataset de demostración.
 *
 * El seed sólo se puede ejecutar contra una base real, pero sus datos sí se
 * pueden auditar sin base: acá se comprueba que ninguna de las inscripciones
 * que carga viole las reglas de negocio que los triggers hacen cumplir.
 *
 * Si este archivo falla, `prisma db seed` va a reventar contra PostgreSQL.
 * Es más barato enterarse acá.
 *
 *   node --test prisma/seed-dominio.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALUMNOS,
  COMEDOR,
  CURSOS,
  DEPORTES,
  INSCRIPCIONES_COMEDOR,
  INSCRIPCIONES_DEPORTE,
  INSCRIPCIONES_TRANSPORTE,
  MATERIAS,
  NIVELES,
  PROFESORES,
  RECORRIDOS,
} from './seed-dominio.ts';
import {
  MAX_DEPORTES_POR_ALUMNO,
  describirConflicto,
  detectarConflictos,
  esFranjaValida,
  horaAMinutos,
  type DiaSemana,
  type FranjaDeDeporte,
} from '../src/modules/deportes/horarios.ts';

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

const nivelDeAlumno = (legajo: string): string | null => {
  const alumno = ALUMNOS.find((a) => a.legajo === legajo);
  return alumno ? alumno.curso.nivel : null;
};

const deporteIndex = new Map(DEPORTES.map((d, i) => [d.nombre, i]));

/** Franjas de un deporte para un nivel, en el formato del dominio puro. */
function franjasDe(nombreDeporte: string, nivel: string): FranjaDeDeporte[] {
  const deporte = DEPORTES.find((d) => d.nombre === nombreDeporte);
  if (!deporte) return [];

  return deporte.horarios
    .filter((h) => h.nivel === nivel)
    .map((h) => ({
      deporteId: deporteIndex.get(nombreDeporte)!,
      deporteNombre: nombreDeporte,
      diaSemana: h.dia as DiaSemana,
      horaInicio: horaAMinutos(h.desde),
      horaFin: horaAMinutos(h.hasta),
    }));
}

// ------------------------------------------------------------------
// Catálogos base
// ------------------------------------------------------------------

test('hay exactamente 3 niveles educativos', () => {
  assert.equal(NIVELES.length, 3);
  assert.deepEqual(
    NIVELES.map((n) => n.nombre),
    ['Inicial', 'Primario', 'Secundario'],
  );
});

test('hay exactamente 8 deportes oficiales', () => {
  assert.equal(DEPORTES.length, 8);
});

test('hay exactamente 4 recorridos de transporte, con códigos R1 a R4', () => {
  assert.equal(RECORRIDOS.length, 4);
  assert.deepEqual(RECORRIDOS.map((r) => String(r.codigo)).sort(), ['R1', 'R2', 'R3', 'R4']);
});

test('los códigos de recorrido no se repiten', () => {
  const codigos = RECORRIDOS.map((r) => String(r.codigo));
  assert.equal(new Set(codigos).size, codigos.length);
});

test('cada recorrido tiene arancel diferenciado y positivo', () => {
  const aranceles = RECORRIDOS.map((r) => r.arancel);
  for (const a of aranceles) assert.ok(a > 0, 'el arancel debe ser positivo');
  assert.equal(new Set(aranceles).size, aranceles.length, 'los 4 aranceles deben diferir entre sí');
});

test('los recorridos salen antes de regresar', () => {
  for (const r of RECORRIDOS) {
    assert.ok(
      horaAMinutos(r.salida) < horaAMinutos(r.regreso),
      `${r.nombre}: la salida debe ser anterior al regreso`,
    );
  }
});

test('cada deporte tiene profesor responsable, arancel y al menos un horario', () => {
  const legajos = new Set(PROFESORES.map((p) => p.legajo));
  for (const d of DEPORTES) {
    assert.ok(legajos.has(d.responsable), `${d.nombre}: profesor responsable inexistente`);
    assert.ok(d.arancel > 0, `${d.nombre}: arancel inválido`);
    assert.ok(d.horarios.length > 0, `${d.nombre}: sin horarios`);
  }
});

test('todas las franjas horarias de deportes son válidas', () => {
  for (const d of DEPORTES) {
    for (const h of d.horarios) {
      const franja = {
        diaSemana: h.dia as DiaSemana,
        horaInicio: horaAMinutos(h.desde),
        horaFin: horaAMinutos(h.hasta),
      };
      assert.ok(esFranjaValida(franja), `${d.nombre} ${h.nivel} ${h.dia}: franja inválida`);
    }
  }
});

test('los horarios de un deporte apuntan a niveles que existen', () => {
  const nombres = new Set(NIVELES.map((n) => n.nombre));
  for (const d of DEPORTES) {
    for (const h of d.horarios) {
      assert.ok(nombres.has(h.nivel), `${d.nombre}: nivel desconocido "${h.nivel}"`);
    }
  }
});

test('los planes de comedor tienen días y arancel coherentes', () => {
  assert.ok(COMEDOR.length > 0);
  for (const c of COMEDOR) {
    assert.ok(c.dias >= 1 && c.dias <= 5, `${c.nombre}: días fuera de rango`);
    assert.ok(c.arancel > 0, `${c.nombre}: arancel inválido`);
  }
});

// ------------------------------------------------------------------
// Integridad referencial del dataset
// ------------------------------------------------------------------

test('cada alumno apunta a un curso que existe (1 alumno -> 1 curso -> 1 nivel)', () => {
  const clavesCurso = new Set(CURSOS.map((c) => `${c.nivel}|${c.nombre}`));
  for (const a of ALUMNOS) {
    const clave = `${a.curso.nivel}|${a.curso.nombre}`;
    assert.ok(clavesCurso.has(clave), `${a.legajo}: curso inexistente "${clave}"`);
  }
});

test('cada curso apunta a un nivel que existe', () => {
  const nombres = new Set(NIVELES.map((n) => n.nombre));
  for (const c of CURSOS) {
    assert.ok(nombres.has(c.nivel), `${c.nombre}: nivel inexistente "${c.nivel}"`);
  }
});

test('legajos y DNI de alumnos son únicos', () => {
  const legajos = ALUMNOS.map((a) => a.legajo);
  const dnis = ALUMNOS.map((a) => a.dni);
  assert.equal(new Set(legajos).size, legajos.length, 'legajos duplicados');
  assert.equal(new Set(dnis).size, dnis.length, 'DNI duplicados');
});

test('legajos y DNI de profesores son únicos', () => {
  const legajos = PROFESORES.map((p) => p.legajo);
  const dnis = PROFESORES.map((p) => p.dni);
  assert.equal(new Set(legajos).size, legajos.length, 'legajos duplicados');
  assert.equal(new Set(dnis).size, dnis.length, 'DNI duplicados');
});

test('cada materia apunta a un curso y a un profesor existentes', () => {
  const clavesCurso = new Set(CURSOS.map((c) => `${c.nivel}|${c.nombre}`));
  const legajos = new Set(PROFESORES.map((p) => p.legajo));
  for (const m of MATERIAS) {
    assert.ok(clavesCurso.has(`${m.nivel}|${m.curso}`), `${m.nombre}: curso inexistente`);
    if (m.profesor) assert.ok(legajos.has(m.profesor), `${m.nombre}: profesor inexistente`);
  }
});

test('las inscripciones apuntan a alumnos, deportes, recorridos y planes existentes', () => {
  const legajos = new Set(ALUMNOS.map((a) => a.legajo));
  const nombresDeporte = new Set(DEPORTES.map((d) => d.nombre));
  const codigos = new Set(RECORRIDOS.map((r) => String(r.codigo)));
  const planes = new Set(COMEDOR.map((c) => c.nombre));

  for (const i of INSCRIPCIONES_DEPORTE) {
    assert.ok(legajos.has(i.legajo), `deporte: alumno inexistente ${i.legajo}`);
    for (const d of i.deportes) assert.ok(nombresDeporte.has(d), `deporte inexistente "${d}"`);
  }
  for (const t of INSCRIPCIONES_TRANSPORTE) {
    assert.ok(legajos.has(t.legajo), `transporte: alumno inexistente ${t.legajo}`);
    assert.ok(codigos.has(String(t.recorrido)), `recorrido inexistente ${t.recorrido}`);
  }
  for (const c of INSCRIPCIONES_COMEDOR) {
    assert.ok(legajos.has(c.legajo), `comedor: alumno inexistente ${c.legajo}`);
    assert.ok(planes.has(c.plan), `plan de comedor inexistente "${c.plan}"`);
  }
});

// ------------------------------------------------------------------
// Las dos reglas estrictas, aplicadas al dataset
// ------------------------------------------------------------------

test('REGLA: ningún alumno del seed supera los 2 deportes', () => {
  for (const i of INSCRIPCIONES_DEPORTE) {
    assert.ok(
      i.deportes.length <= MAX_DEPORTES_POR_ALUMNO,
      `${i.legajo} tiene ${i.deportes.length} deportes; el máximo es ${MAX_DEPORTES_POR_ALUMNO}`,
    );
  }
});

test('REGLA: ningún alumno del seed repite el mismo deporte', () => {
  for (const i of INSCRIPCIONES_DEPORTE) {
    assert.equal(new Set(i.deportes).size, i.deportes.length, `${i.legajo} repite un deporte`);
  }
});

test('REGLA: ninguna inscripción del seed produce solapamiento de horarios', () => {
  for (const insc of INSCRIPCIONES_DEPORTE) {
    const nivel = nivelDeAlumno(insc.legajo);
    assert.ok(nivel, `${insc.legajo}: alumno sin nivel`);

    const acumuladas: FranjaDeDeporte[] = [];
    for (const nombre of insc.deportes) {
      const nuevas = franjasDe(nombre, nivel!);
      const conflictos = detectarConflictos(nuevas, acumuladas);

      assert.equal(
        conflictos.length,
        0,
        `${insc.legajo} (${nivel}) — ${conflictos.map(describirConflicto).join(' | ')}`,
      );
      acumuladas.push(...nuevas);
    }
  }
});

test('cada deporte inscripto tiene grupo abierto en el nivel del alumno', () => {
  for (const insc of INSCRIPCIONES_DEPORTE) {
    const nivel = nivelDeAlumno(insc.legajo)!;
    for (const nombre of insc.deportes) {
      assert.ok(
        franjasDe(nombre, nivel).length > 0,
        `${insc.legajo}: ${nombre} no abre grupo para el nivel ${nivel}`,
      );
    }
  }
});

// ------------------------------------------------------------------
// Casos negativos: el dataset debe permitir demostrar los rechazos
// ------------------------------------------------------------------

test('el dataset contiene al menos un par de deportes que SÍ chocan (caso de demo)', () => {
  const nivel = 'Secundario';
  let encontrado: string | null = null;

  for (const a of DEPORTES) {
    for (const b of DEPORTES) {
      if (a.nombre === b.nombre) continue;
      const conflictos = detectarConflictos(franjasDe(a.nombre, nivel), franjasDe(b.nombre, nivel));
      if (conflictos.length > 0) {
        encontrado = `${a.nombre} vs ${b.nombre}`;
        break;
      }
    }
    if (encontrado) break;
  }

  assert.ok(
    encontrado,
    'sin un par conflictivo no se puede demostrar la validación de solapamiento en la defensa',
  );
});

test('Fútbol y Básquet chocan los martes en Secundario', () => {
  const conflictos = detectarConflictos(franjasDe('Básquet', 'Secundario'), franjasDe('Fútbol', 'Secundario'));
  assert.ok(conflictos.length > 0);
  assert.equal(conflictos[0].dia, 'MARTES');
});

test('Fútbol y Ajedrez NO chocan los jueves: son consecutivos', () => {
  const conflictos = detectarConflictos(franjasDe('Ajedrez', 'Secundario'), franjasDe('Fútbol', 'Secundario'));
  assert.deepEqual(conflictos, []);
});
