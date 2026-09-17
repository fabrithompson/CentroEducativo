/**
 * Seed del dominio académico y administrativo.
 *
 * Carga la estructura que introdujo la migración
 * `20260915201500_dominio_academico_deportes_facturacion`:
 * niveles, cursos, materias, profesores, alumnos, los 8 deportes oficiales con
 * su grilla semanal, los 4 recorridos de transporte, el comedor y un período de
 * facturación con comprobantes de transferencia en distintos estados.
 *
 * Datos ambientados en Resistencia y el Gran Resistencia (Chaco): calles,
 * barrios y localidades reales; aranceles en pesos, verosímiles para el ciclo.
 *
 * Es idempotente: usa `upsert` contra claves naturales (nombre, legajo, código),
 * así que se puede correr varias veces sin duplicar nada.
 */

import {
  DiaSemana,
  EstadoAlumno,
  EstadoComprobante,
  EstadoFactura,
  EstadoProfesor,
  PrismaClient,
  TipoItemFactura,
  Turno,
  TurnoTransporte,
  CodigoRecorrido,
} from '@prisma/client';

/**
 * Ciclo lectivo de los datos de demostración. Se mantiene 2026 para que sea
 * coherente con las notas, asistencias y anuncios que ya carga `seed.ts`.
 * La institución inicia actividades en marzo de 2027: para migrar el demo al
 * ciclo real alcanza con cambiar esta constante.
 */
const CICLO = 2026;

/** Fecha UTC sin hora, como espera un campo `@db.Date`. */
const fecha = (anio: number, mes: number, dia: number) => new Date(Date.UTC(anio, mes - 1, dia));

/** `'17:00'` -> minutos desde medianoche. Ver convención en schema.prisma. */
function hm(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

// ============================================================
// NIVELES
// ============================================================

export const NIVELES = [
  { nombre: 'Inicial', orden: 1, descripcion: 'Salas de 3, 4 y 5 años. Jornada simple, turno mañana.' },
  { nombre: 'Primario', orden: 2, descripcion: 'De 1er a 6to grado. Jornada simple, turno mañana.' },
  { nombre: 'Secundario', orden: 3, descripcion: 'De 1er a 5to año. Ciclo básico y orientado.' },
];

// ============================================================
// CURSOS
// ============================================================

export const CURSOS: { nivel: string; nombre: string; division: string; turno: Turno; cupo: number }[] = [
  { nivel: 'Inicial', nombre: 'Sala de 3', division: 'A', turno: Turno.MANANA, cupo: 20 },
  { nivel: 'Inicial', nombre: 'Sala de 4', division: 'A', turno: Turno.MANANA, cupo: 22 },
  { nivel: 'Inicial', nombre: 'Sala de 5', division: 'A', turno: Turno.MANANA, cupo: 22 },

  { nivel: 'Primario', nombre: '1er Grado', division: 'A', turno: Turno.MANANA, cupo: 28 },
  { nivel: 'Primario', nombre: '2do Grado', division: 'A', turno: Turno.MANANA, cupo: 28 },
  { nivel: 'Primario', nombre: '3er Grado', division: 'A', turno: Turno.MANANA, cupo: 28 },
  { nivel: 'Primario', nombre: '4to Grado', division: 'A', turno: Turno.MANANA, cupo: 28 },
  { nivel: 'Primario', nombre: '5to Grado', division: 'A', turno: Turno.MANANA, cupo: 28 },
  { nivel: 'Primario', nombre: '6to Grado', division: 'A', turno: Turno.MANANA, cupo: 28 },

  { nivel: 'Secundario', nombre: '1er Año', division: 'A', turno: Turno.MANANA, cupo: 30 },
  { nivel: 'Secundario', nombre: '2do Año', division: 'A', turno: Turno.MANANA, cupo: 30 },
  { nivel: 'Secundario', nombre: '3er Año', division: 'A', turno: Turno.MANANA, cupo: 30 },
  { nivel: 'Secundario', nombre: '4to Año', division: 'A', turno: Turno.MANANA, cupo: 30 },
  { nivel: 'Secundario', nombre: '5to Año', division: 'A', turno: Turno.MANANA, cupo: 30 },
];

// ============================================================
// PROFESORES
// ============================================================

type ProfesorSeed = {
  legajo: string;
  dni: string;
  apellido: string;
  nombres: string;
  especialidad: string;
  email: string;
  telefono: string;
  domicilio: string;
  /** Usuario existente al que se vincula el perfil, si lo tiene. */
  usuario?: string;
};

export const PROFESORES: ProfesorSeed[] = [
  {
    legajo: 'P-0001', dni: '20000001', apellido: 'López', nombres: 'María Fernanda',
    especialidad: 'Matemática', email: 'm.lopez@et.edu.ar', telefono: '362-4215880',
    domicilio: 'Av. Sarmiento 1450', usuario: 'mlopez',
  },
  {
    legajo: 'P-0002', dni: '20000002', apellido: 'García', nombres: 'Javier Alberto',
    especialidad: 'Lengua y Literatura', email: 'j.garcia@et.edu.ar', telefono: '362-4467123',
    domicilio: 'Juan B. Justo 780', usuario: 'jgarcia',
  },
  {
    legajo: 'P-0003', dni: '20000003', apellido: 'Silva', nombres: 'Carolina Beatriz',
    especialidad: 'Ciencias Naturales (Física y Química)', email: 'c.silva@et.edu.ar', telefono: '362-4330951',
    domicilio: 'French 233', usuario: 'csilva',
  },
  {
    legajo: 'P-0004', dni: '20000004', apellido: 'Martínez', nombres: 'Andrés Ramón',
    especialidad: 'Ciencias Sociales e Historia', email: 'a.martinez@et.edu.ar', telefono: '362-4198442',
    domicilio: 'Güemes 1120', usuario: 'amartinez',
  },
  // Departamento de Educación Física — sin cuenta de campus todavía.
  {
    legajo: 'P-0005', dni: '21000001', apellido: 'Ojeda', nombres: 'Gustavo Daniel',
    especialidad: 'Educación Física — Deportes de conjunto', email: 'g.ojeda@et.edu.ar',
    telefono: '362-4556201', domicilio: 'Av. Alvear 2310',
  },
  {
    legajo: 'P-0006', dni: '21000002', apellido: 'Benítez', nombres: 'Natalia Soledad',
    especialidad: 'Educación Física — Natación y hockey', email: 'n.benitez@et.edu.ar',
    telefono: '362-4778310', domicilio: 'Santa María de Oro 645',
  },
  {
    legajo: 'P-0007', dni: '21000003', apellido: 'Fernández', nombres: 'Ramón Eduardo',
    especialidad: 'Educación Física — Atletismo y básquet', email: 'r.fernandez@et.edu.ar',
    telefono: '362-4602877', domicilio: 'Hipólito Yrigoyen 1890',
  },
];

// ============================================================
// ALUMNOS
// ============================================================

type AlumnoSeed = {
  legajo: string;
  dni: string;
  apellido: string;
  nombres: string;
  nacimiento: [number, number, number];
  domicilio: string;
  localidad?: string;
  telefono: string;
  curso: { nivel: string; nombre: string };
  /** Usuario del campus, si el alumno ya tiene credenciales. */
  usuario?: string;
};

export const ALUMNOS: AlumnoSeed[] = [
  // --- Secundario (con cuenta de campus) ---
  {
    legajo: 'A-0001', dni: '40000001', apellido: 'Barrabino', nombres: 'Franco Nicolás',
    nacimiento: [2013, 4, 18], domicilio: 'Av. 9 de Julio 2145', telefono: '362-4501122',
    curso: { nivel: 'Secundario', nombre: '1er Año' }, usuario: 'fbarrabino',
  },
  {
    legajo: 'A-0002', dni: '40000002', apellido: 'Pérez', nombres: 'Juan Manuel',
    nacimiento: [2013, 9, 2], domicilio: 'Mitre 855', telefono: '362-4338790',
    curso: { nivel: 'Secundario', nombre: '1er Año' }, usuario: 'jperez',
  },
  {
    legajo: 'A-0003', dni: '40000007', apellido: 'Sánchez', nombres: 'Valentina',
    nacimiento: [2013, 12, 11], domicilio: 'Necochea 1032', telefono: '362-4667401',
    curso: { nivel: 'Secundario', nombre: '1er Año' }, usuario: 'vsanchez',
  },
  {
    legajo: 'A-0004', dni: '40000004', apellido: 'Ferreyra', nombres: 'Lucía Belén',
    nacimiento: [2012, 6, 25], domicilio: 'Av. Laprida 470', telefono: '362-4229615',
    curso: { nivel: 'Secundario', nombre: '2do Año' }, usuario: 'lferreyra',
  },
  {
    legajo: 'A-0005', dni: '40000005', apellido: 'Rodríguez', nombres: 'Sofía Milagros',
    nacimiento: [2011, 3, 7], domicilio: 'Pellegrini 1560', telefono: '362-4814503',
    curso: { nivel: 'Secundario', nombre: '3er Año' }, usuario: 'srodriguez',
  },

  // --- Primario (con cuenta de campus) ---
  {
    legajo: 'A-0006', dni: '40000003', apellido: 'Gómez', nombres: 'María Paz',
    nacimiento: [2014, 8, 30], domicilio: 'Arturo Illia 925', telefono: '362-4445218',
    curso: { nivel: 'Primario', nombre: '6to Grado' }, usuario: 'mgomez',
  },
  {
    legajo: 'A-0007', dni: '40000008', apellido: 'Flores', nombres: 'Ignacio Tomás',
    nacimiento: [2014, 11, 14], domicilio: 'Entre Ríos 340', telefono: '362-4390077',
    curso: { nivel: 'Primario', nombre: '6to Grado' }, usuario: 'iflores',
  },
  {
    legajo: 'A-0008', dni: '40000006', apellido: 'Moreno', nombres: 'Tomás Agustín',
    nacimiento: [2015, 5, 21], domicilio: 'Av. Italia 1710', localidad: 'Barranqueras',
    telefono: '362-4720194', curso: { nivel: 'Primario', nombre: '5to Grado' }, usuario: 'tmoreno',
  },

  // --- Alumnos sin cuenta de campus: en Inicial opera el tutor ---
  {
    legajo: 'A-0009', dni: '55000001', apellido: 'Acosta', nombres: 'Bautista',
    nacimiento: [2021, 2, 9], domicilio: 'Av. Castelli 1244', telefono: '362-4556780',
    curso: { nivel: 'Inicial', nombre: 'Sala de 5' },
  },
  {
    legajo: 'A-0010', dni: '55000002', apellido: 'Gauna', nombres: 'Renata',
    nacimiento: [2022, 7, 3], domicilio: 'Obligado 610', localidad: 'Fontana',
    telefono: '362-4903312', curso: { nivel: 'Inicial', nombre: 'Sala de 4' },
  },
  {
    legajo: 'A-0011', dni: '55000003', apellido: 'Zalazar', nombres: 'Thiago Benjamín',
    nacimiento: [2023, 1, 27], domicilio: 'Av. Malvinas Argentinas 2050', telefono: '362-4188245',
    curso: { nivel: 'Inicial', nombre: 'Sala de 3' },
  },
  {
    legajo: 'A-0012', dni: '55000004', apellido: 'Meza', nombres: 'Catalina',
    nacimiento: [2016, 10, 5], domicilio: 'Av. Hernandarias 415', localidad: 'Puerto Vilelas',
    telefono: '362-4667902', curso: { nivel: 'Primario', nombre: '4to Grado' },
  },
];

// ============================================================
// MATERIAS
// ============================================================

export const MATERIAS: { nivel: string; curso: string; nombre: string; profesor?: string; horas: number }[] = [
  // Secundario — 1er Año
  { nivel: 'Secundario', curso: '1er Año', nombre: 'Álgebra y Geometría', profesor: 'P-0001', horas: 6 },
  { nivel: 'Secundario', curso: '1er Año', nombre: 'Literatura', profesor: 'P-0002', horas: 5 },
  { nivel: 'Secundario', curso: '1er Año', nombre: 'Física', profesor: 'P-0003', horas: 4 },
  { nivel: 'Secundario', curso: '1er Año', nombre: 'Química', profesor: 'P-0003', horas: 4 },
  { nivel: 'Secundario', curso: '1er Año', nombre: 'Historia', profesor: 'P-0004', horas: 4 },
  { nivel: 'Secundario', curso: '1er Año', nombre: 'Geografía', profesor: 'P-0004', horas: 3 },
  { nivel: 'Secundario', curso: '1er Año', nombre: 'Inglés', profesor: 'P-0004', horas: 3 },
  { nivel: 'Secundario', curso: '1er Año', nombre: 'Educación Física', profesor: 'P-0005', horas: 3 },

  // Secundario — 2do Año
  { nivel: 'Secundario', curso: '2do Año', nombre: 'Álgebra y Geometría', profesor: 'P-0001', horas: 6 },
  { nivel: 'Secundario', curso: '2do Año', nombre: 'Literatura', profesor: 'P-0002', horas: 5 },
  { nivel: 'Secundario', curso: '2do Año', nombre: 'Biología', profesor: 'P-0003', horas: 4 },
  { nivel: 'Secundario', curso: '2do Año', nombre: 'Historia', profesor: 'P-0004', horas: 4 },
  { nivel: 'Secundario', curso: '2do Año', nombre: 'Educación Física', profesor: 'P-0006', horas: 3 },

  // Secundario — 3er Año
  { nivel: 'Secundario', curso: '3er Año', nombre: 'Matemática Discreta', profesor: 'P-0001', horas: 5 },
  { nivel: 'Secundario', curso: '3er Año', nombre: 'Química Orgánica', profesor: 'P-0003', horas: 4 },
  { nivel: 'Secundario', curso: '3er Año', nombre: 'Geografía', profesor: 'P-0004', horas: 3 },
  { nivel: 'Secundario', curso: '3er Año', nombre: 'Educación Física', profesor: 'P-0007', horas: 3 },

  // Primario — 5to y 6to
  { nivel: 'Primario', curso: '5to Grado', nombre: 'Matemáticas', profesor: 'P-0001', horas: 6 },
  { nivel: 'Primario', curso: '5to Grado', nombre: 'Prácticas del Lenguaje', profesor: 'P-0002', horas: 6 },
  { nivel: 'Primario', curso: '5to Grado', nombre: 'Ciencias Naturales', profesor: 'P-0003', horas: 4 },
  { nivel: 'Primario', curso: '5to Grado', nombre: 'Ciencias Sociales', profesor: 'P-0004', horas: 4 },
  { nivel: 'Primario', curso: '5to Grado', nombre: 'Educación Física', profesor: 'P-0005', horas: 2 },

  { nivel: 'Primario', curso: '6to Grado', nombre: 'Matemáticas', profesor: 'P-0001', horas: 6 },
  { nivel: 'Primario', curso: '6to Grado', nombre: 'Prácticas del Lenguaje', profesor: 'P-0002', horas: 6 },
  { nivel: 'Primario', curso: '6to Grado', nombre: 'Ciencias Naturales', profesor: 'P-0003', horas: 4 },
  { nivel: 'Primario', curso: '6to Grado', nombre: 'Ciencias Sociales', profesor: 'P-0004', horas: 4 },
  { nivel: 'Primario', curso: '6to Grado', nombre: 'Educación Física', profesor: 'P-0005', horas: 2 },
];

// ============================================================
// DEPORTES — los 8 oficiales
// ============================================================

type HorarioSeed = { nivel: string; dia: DiaSemana; desde: string; hasta: string; lugar?: string };

type DeporteSeed = {
  nombre: string;
  descripcion: string;
  responsable: string; // legajo de profesor
  arancel: number;
  cupo: number;
  horarios: HorarioSeed[];
};

const CANCHA = 'Polideportivo del colegio';
const PILETA = 'Natatorio climatizado';
const PISTA = 'Pista de atletismo';
const SUM = 'SUM — Salón de usos múltiples';

/**
 * Grilla semanal. Está diseñada con cruces deliberados para poder demostrar la
 * validación de solapamiento:
 *   - Secundario: Fútbol y Básquet comparten el martes 17:00-18:30.
 *   - Secundario: Vóley y Hockey comparten el miércoles 17:00-18:30.
 * Y también casos límite que NO deben bloquearse:
 *   - Secundario: Fútbol termina 18:30 y Ajedrez arranca 18:30 el jueves.
 *   - Secundario: Vóley termina 18:30 y Handball arranca 18:30 el lunes.
 */
export const DEPORTES: DeporteSeed[] = [
  {
    nombre: 'Fútbol', descripcion: 'Fútbol 11 y fútbol 7. Participa en la liga intercolegial del Chaco.',
    responsable: 'P-0005', arancel: 22000, cupo: 30,
    horarios: [
      { nivel: 'Inicial', dia: DiaSemana.VIERNES, desde: '10:30', hasta: '11:15' },
      { nivel: 'Primario', dia: DiaSemana.LUNES, desde: '14:00', hasta: '15:15' },
      { nivel: 'Primario', dia: DiaSemana.MIERCOLES, desde: '14:00', hasta: '15:15' },
      { nivel: 'Secundario', dia: DiaSemana.MARTES, desde: '17:00', hasta: '18:30' },
      { nivel: 'Secundario', dia: DiaSemana.JUEVES, desde: '17:00', hasta: '18:30' },
    ],
  },
  {
    nombre: 'Vóley', descripcion: 'Vóley femenino y masculino. Categorías sub-14 y sub-17.',
    responsable: 'P-0006', arancel: 22000, cupo: 24,
    horarios: [
      { nivel: 'Primario', dia: DiaSemana.MARTES, desde: '14:00', hasta: '15:15' },
      { nivel: 'Secundario', dia: DiaSemana.LUNES, desde: '17:00', hasta: '18:30' },
      { nivel: 'Secundario', dia: DiaSemana.MIERCOLES, desde: '17:00', hasta: '18:30' },
    ],
  },
  {
    nombre: 'Básquet', descripcion: 'Básquet formativo y competitivo. Torneo local de mini y cadetes.',
    responsable: 'P-0007', arancel: 22000, cupo: 24,
    horarios: [
      { nivel: 'Primario', dia: DiaSemana.JUEVES, desde: '14:00', hasta: '15:15' },
      { nivel: 'Secundario', dia: DiaSemana.MARTES, desde: '17:00', hasta: '18:30' },
      { nivel: 'Secundario', dia: DiaSemana.VIERNES, desde: '17:00', hasta: '18:30' },
    ],
  },
  {
    nombre: 'Handball', descripcion: 'Handball escolar. Entrenamiento técnico y participación en torneos zonales.',
    responsable: 'P-0005', arancel: 20000, cupo: 24,
    horarios: [
      { nivel: 'Primario', dia: DiaSemana.VIERNES, desde: '14:00', hasta: '15:15' },
      { nivel: 'Secundario', dia: DiaSemana.LUNES, desde: '18:30', hasta: '20:00' },
      { nivel: 'Secundario', dia: DiaSemana.MIERCOLES, desde: '18:30', hasta: '20:00' },
    ],
  },
  {
    nombre: 'Natación', descripcion: 'Natatorio climatizado. Iniciación, perfeccionamiento y equipo competitivo.',
    responsable: 'P-0006', arancel: 38000, cupo: 18,
    horarios: [
      { nivel: 'Inicial', dia: DiaSemana.LUNES, desde: '10:30', hasta: '11:15', lugar: PILETA },
      { nivel: 'Primario', dia: DiaSemana.MIERCOLES, desde: '15:30', hasta: '16:45', lugar: PILETA },
      { nivel: 'Secundario', dia: DiaSemana.MARTES, desde: '15:00', hasta: '16:30', lugar: PILETA },
      { nivel: 'Secundario', dia: DiaSemana.JUEVES, desde: '15:00', hasta: '16:30', lugar: PILETA },
    ],
  },
  {
    nombre: 'Atletismo', descripcion: 'Velocidad, fondo, salto en largo y lanzamiento. Preparación para los juegos escolares.',
    responsable: 'P-0007', arancel: 18000, cupo: 30,
    horarios: [
      { nivel: 'Inicial', dia: DiaSemana.MIERCOLES, desde: '10:30', hasta: '11:15', lugar: PISTA },
      { nivel: 'Primario', dia: DiaSemana.MARTES, desde: '15:30', hasta: '16:45', lugar: PISTA },
      { nivel: 'Secundario', dia: DiaSemana.VIERNES, desde: '15:00', hasta: '16:30', lugar: PISTA },
    ],
  },
  {
    nombre: 'Hockey sobre césped', descripcion: 'Hockey femenino. Categorías sub-14, sub-16 y sub-18.',
    responsable: 'P-0006', arancel: 26000, cupo: 22,
    horarios: [
      { nivel: 'Primario', dia: DiaSemana.LUNES, desde: '15:30', hasta: '16:45' },
      { nivel: 'Secundario', dia: DiaSemana.MIERCOLES, desde: '17:00', hasta: '18:30' },
      { nivel: 'Secundario', dia: DiaSemana.VIERNES, desde: '17:00', hasta: '18:30' },
    ],
  },
  {
    nombre: 'Ajedrez', descripcion: 'Ajedrez escolar. Torneos internos y representación en el circuito provincial.',
    responsable: 'P-0004', arancel: 15000, cupo: 20,
    horarios: [
      { nivel: 'Primario', dia: DiaSemana.VIERNES, desde: '15:30', hasta: '16:30', lugar: SUM },
      { nivel: 'Secundario', dia: DiaSemana.JUEVES, desde: '18:30', hasta: '19:30', lugar: SUM },
    ],
  },
];

// ============================================================
// TRANSPORTE — exactamente 4 recorridos
// ============================================================

export const RECORRIDOS = [
  {
    codigo: CodigoRecorrido.R1,
    nombre: 'Recorrido 1 — Centro y Macrocentro',
    descripcion: 'Cubre el casco céntrico de Resistencia y el anillo del macrocentro.',
    zonas: 'Centro, Villa Chica, Barrio España, Av. 9 de Julio, Av. Sarmiento',
    arancel: 46000, capacidad: 45, chofer: 'Ramón Alberto Sosa', patente: 'AD 412 KZ',
    salida: '06:40', regreso: '13:30',
  },
  {
    codigo: CodigoRecorrido.R2,
    nombre: 'Recorrido 2 — Zona Norte',
    descripcion: 'Villa Río Negro y barrios del norte de la ciudad.',
    zonas: 'Villa Río Negro, Barrio Güiraldes, Villa Prosperidad, Barrio Mujeres Argentinas',
    arancel: 52000, capacidad: 45, chofer: 'Julio César Ayala', patente: 'AC 889 TR',
    salida: '06:25', regreso: '13:45',
  },
  {
    codigo: CodigoRecorrido.R3,
    nombre: 'Recorrido 3 — Fontana y Oeste',
    descripcion: 'Localidad de Fontana y barrios del oeste del Gran Resistencia.',
    zonas: 'Fontana, Villa Don Andrés, Barrio Toba, Av. Soberanía Nacional',
    arancel: 58000, capacidad: 40, chofer: 'Mirta Elena Romero', patente: 'AB 305 QW',
    salida: '06:10', regreso: '14:00',
  },
  {
    codigo: CodigoRecorrido.R4,
    nombre: 'Recorrido 4 — Barranqueras y Puerto Vilelas',
    descripcion: 'Localidades de Barranqueras y Puerto Vilelas, sobre la ribera del Paraná.',
    zonas: 'Barranqueras, Puerto Vilelas, Villa Forestación, Barrio Sarmiento',
    arancel: 62000, capacidad: 40, chofer: 'Héctor Daniel Gauna', patente: 'AF 174 LM',
    salida: '06:00', regreso: '14:10',
  },
];

// ============================================================
// COMEDOR
// ============================================================

export const COMEDOR = [
  {
    nombre: 'Comedor — 5 días', descripcion: 'Almuerzo de lunes a viernes. Menú elaborado en cocina propia.',
    dias: 5, arancel: 68000, cupo: 120, hora: '12:00',
  },
  {
    nombre: 'Comedor — 3 días', descripcion: 'Almuerzo lunes, miércoles y viernes.',
    dias: 3, arancel: 44000, cupo: 80, hora: '12:00',
  },
  {
    nombre: 'Comedor — 2 días', descripcion: 'Almuerzo martes y jueves. Pensado para quienes cursan deportes por la tarde.',
    dias: 2, arancel: 32000, cupo: 60, hora: '12:00',
  },
];

/** Cuota mensual por nivel educativo. */
export const CUOTA_POR_NIVEL: Record<string, number> = {
  Inicial: 82000,
  Primario: 92000,
  Secundario: 104000,
};

// ============================================================
// INSCRIPCIONES DE DEMOSTRACIÓN
// ============================================================

/**
 * Ninguna de estas combinaciones viola las reglas: todas respetan el máximo de
 * 2 deportes y ninguna se solapa. Los casos que SÍ violan las reglas quedan
 * documentados en `docs/modelo_de_datos.md` para probarlos a mano.
 */
export const INSCRIPCIONES_DEPORTE: { legajo: string; deportes: string[] }[] = [
  { legajo: 'A-0001', deportes: ['Fútbol', 'Ajedrez'] },        // jueves consecutivos: 17:00-18:30 y 18:30-19:30
  { legajo: 'A-0002', deportes: ['Vóley', 'Handball'] },        // lunes y miércoles consecutivos
  { legajo: 'A-0003', deportes: ['Natación'] },
  { legajo: 'A-0004', deportes: ['Básquet', 'Atletismo'] },
  { legajo: 'A-0005', deportes: ['Hockey sobre césped'] },
  { legajo: 'A-0006', deportes: ['Vóley', 'Natación'] },
  { legajo: 'A-0007', deportes: ['Ajedrez', 'Atletismo'] },
  { legajo: 'A-0008', deportes: ['Fútbol'] },
  { legajo: 'A-0009', deportes: ['Natación'] },
];

export const INSCRIPCIONES_TRANSPORTE: { legajo: string; recorrido: CodigoRecorrido; turno: TurnoTransporte }[] = [
  { legajo: 'A-0001', recorrido: CodigoRecorrido.R1, turno: TurnoTransporte.IDA_Y_VUELTA },
  { legajo: 'A-0002', recorrido: CodigoRecorrido.R2, turno: TurnoTransporte.IDA_Y_VUELTA },
  { legajo: 'A-0006', recorrido: CodigoRecorrido.R1, turno: TurnoTransporte.IDA },
  { legajo: 'A-0008', recorrido: CodigoRecorrido.R4, turno: TurnoTransporte.IDA_Y_VUELTA },
  { legajo: 'A-0010', recorrido: CodigoRecorrido.R3, turno: TurnoTransporte.IDA_Y_VUELTA },
  { legajo: 'A-0012', recorrido: CodigoRecorrido.R4, turno: TurnoTransporte.IDA_Y_VUELTA },
];

export const INSCRIPCIONES_COMEDOR: { legajo: string; plan: string }[] = [
  { legajo: 'A-0001', plan: 'Comedor — 5 días' },
  { legajo: 'A-0003', plan: 'Comedor — 3 días' },
  { legajo: 'A-0006', plan: 'Comedor — 5 días' },
  { legajo: 'A-0009', plan: 'Comedor — 5 días' },
  { legajo: 'A-0011', plan: 'Comedor — 2 días' },
];

// ============================================================
// SEED
// ============================================================

export async function seedDominio(prisma: PrismaClient): Promise<void> {
  console.log('🏫 Seed del dominio académico y administrativo...');

  // ---------- Niveles ----------
  // `cuotaMensual` es lo que toma el generador de facturas como cuota base.
  for (const n of NIVELES) {
    const cuotaMensual = CUOTA_POR_NIVEL[n.nombre] ?? 0;

    await prisma.nivelEducativo.upsert({
      where: { nombre: n.nombre },
      update: { orden: n.orden, descripcion: n.descripcion, cuotaMensual },
      create: { ...n, cuotaMensual },
    });
  }
  const niveles = new Map(
    (await prisma.nivelEducativo.findMany()).map((n) => [n.nombre, n.id]),
  );

  // ---------- Cursos ----------
  for (const c of CURSOS) {
    await prisma.curso.upsert({
      where: {
        nivelId_nombre_division_anioLectivo: {
          nivelId: niveles.get(c.nivel)!,
          nombre: c.nombre,
          division: c.division,
          anioLectivo: CICLO,
        },
      },
      update: { turno: c.turno, cupoMaximo: c.cupo },
      create: {
        nivelId: niveles.get(c.nivel)!,
        nombre: c.nombre,
        division: c.division,
        turno: c.turno,
        anioLectivo: CICLO,
        cupoMaximo: c.cupo,
      },
    });
  }
  const cursos = new Map(
    (await prisma.curso.findMany({ where: { anioLectivo: CICLO }, include: { nivel: true } })).map(
      (c) => [`${c.nivel.nombre}|${c.nombre}`, c.id],
    ),
  );

  // ---------- Profesores ----------
  const usuarios = new Map(
    (await prisma.user.findMany({ select: { id: true, usuario: true } })).map((u) => [u.usuario, u.id]),
  );

  for (const p of PROFESORES) {
    const { usuario, ...datos } = p;
    const userId = usuario ? usuarios.get(usuario) ?? null : null;
    await prisma.profesor.upsert({
      where: { legajo: p.legajo },
      update: { ...datos, userId, estado: EstadoProfesor.ACTIVO },
      create: { ...datos, userId, estado: EstadoProfesor.ACTIVO, fechaIngreso: fecha(CICLO, 3, 1) },
    });
  }
  const profesores = new Map(
    (await prisma.profesor.findMany({ select: { id: true, legajo: true } })).map((p) => [p.legajo, p.id]),
  );

  // ---------- Alumnos ----------
  for (const a of ALUMNOS) {
    const { usuario, curso, nacimiento, localidad, ...datos } = a;
    const userId = usuario ? usuarios.get(usuario) ?? null : null;
    const cursoId = cursos.get(`${curso.nivel}|${curso.nombre}`)!;

    await prisma.alumno.upsert({
      where: { legajo: a.legajo },
      update: { ...datos, userId, cursoId, localidad: localidad ?? 'Resistencia' },
      create: {
        ...datos,
        userId,
        cursoId,
        localidad: localidad ?? 'Resistencia',
        fechaNacimiento: fecha(...nacimiento),
        fechaIngreso: fecha(CICLO, 3, 1),
        estado: EstadoAlumno.ACTIVO,
      },
    });
  }
  const alumnos = new Map(
    (
      await prisma.alumno.findMany({
        select: { id: true, legajo: true, apellido: true, nombres: true, curso: { select: { nivel: true } } },
      })
    ).map((a) => [a.legajo, a]),
  );

  // ---------- Materias ----------
  for (const m of MATERIAS) {
    const cursoId = cursos.get(`${m.nivel}|${m.curso}`)!;
    await prisma.materia.upsert({
      where: { cursoId_nombre: { cursoId, nombre: m.nombre } },
      update: { profesorId: m.profesor ? profesores.get(m.profesor) : null, cargaHoraria: m.horas },
      create: {
        cursoId,
        nombre: m.nombre,
        profesorId: m.profesor ? profesores.get(m.profesor) : null,
        cargaHoraria: m.horas,
      },
    });
  }

  // ---------- Deportes y su grilla ----------
  for (const d of DEPORTES) {
    const deporte = await prisma.deporte.upsert({
      where: { nombre: d.nombre },
      update: {
        descripcion: d.descripcion,
        profesorResponsableId: profesores.get(d.responsable)!,
        arancelMensual: d.arancel,
        cupoMaximo: d.cupo,
        activo: true,
      },
      create: {
        nombre: d.nombre,
        descripcion: d.descripcion,
        profesorResponsableId: profesores.get(d.responsable)!,
        arancelMensual: d.arancel,
        cupoMaximo: d.cupo,
      },
    });

    for (const h of d.horarios) {
      await prisma.horarioDeporte.upsert({
        where: {
          deporteId_nivelId_diaSemana_horaInicio: {
            deporteId: deporte.id,
            nivelId: niveles.get(h.nivel)!,
            diaSemana: h.dia,
            horaInicio: hm(h.desde),
          },
        },
        update: { horaFin: hm(h.hasta), lugar: h.lugar ?? CANCHA, activo: true },
        create: {
          deporteId: deporte.id,
          nivelId: niveles.get(h.nivel)!,
          diaSemana: h.dia,
          horaInicio: hm(h.desde),
          horaFin: hm(h.hasta),
          lugar: h.lugar ?? CANCHA,
          profesorId: profesores.get(d.responsable)!,
          cupoMaximo: d.cupo,
        },
      });
    }
  }
  const deportes = new Map(
    (await prisma.deporte.findMany({ select: { id: true, nombre: true, arancelMensual: true } })).map((d) => [
      d.nombre,
      d,
    ]),
  );

  // ---------- Recorridos de transporte (los 4 fijos) ----------
  for (const r of RECORRIDOS) {
    await prisma.recorridoTransporte.upsert({
      where: { codigo: r.codigo },
      update: {
        nombre: r.nombre,
        descripcion: r.descripcion,
        zonas: r.zonas,
        arancelMensual: r.arancel,
        capacidad: r.capacidad,
        choferNombre: r.chofer,
        patente: r.patente,
        horaSalida: hm(r.salida),
        horaRegreso: hm(r.regreso),
        activo: true,
      },
      create: {
        codigo: r.codigo,
        nombre: r.nombre,
        descripcion: r.descripcion,
        zonas: r.zonas,
        arancelMensual: r.arancel,
        capacidad: r.capacidad,
        choferNombre: r.chofer,
        patente: r.patente,
        horaSalida: hm(r.salida),
        horaRegreso: hm(r.regreso),
      },
    });
  }
  const recorridos = new Map(
    (await prisma.recorridoTransporte.findMany()).map((r) => [r.codigo, r]),
  );

  // ---------- Comedor ----------
  for (const c of COMEDOR) {
    await prisma.comedor.upsert({
      where: { nombre: c.nombre },
      update: {
        descripcion: c.descripcion,
        diasPorSemana: c.dias,
        arancelMensual: c.arancel,
        cupoMaximo: c.cupo,
        horaServicio: hm(c.hora),
        activo: true,
      },
      create: {
        nombre: c.nombre,
        descripcion: c.descripcion,
        diasPorSemana: c.dias,
        arancelMensual: c.arancel,
        cupoMaximo: c.cupo,
        horaServicio: hm(c.hora),
      },
    });
  }
  const comedores = new Map((await prisma.comedor.findMany()).map((c) => [c.nombre, c]));

  // ---------- Inscripciones a deportes ----------
  // El trigger `trg_inscripcion_deporte_max2` y el índice único parcial validan
  // cada alta: si esta carga fallara, el dato de demostración estaría mal armado.
  for (const insc of INSCRIPCIONES_DEPORTE) {
    const alumno = alumnos.get(insc.legajo);
    if (!alumno) continue;

    let slot = 0;
    for (const nombreDeporte of insc.deportes) {
      const deporte = deportes.get(nombreDeporte);
      if (!deporte) continue;
      slot += 1;

      await prisma.inscripcionDeporte.upsert({
        where: { alumnoId_deporteId: { alumnoId: alumno.id, deporteId: deporte.id } },
        update: {},
        create: { alumnoId: alumno.id, deporteId: deporte.id, slot },
      });
    }
  }

  // ---------- Inscripciones a transporte y comedor (mes en curso) ----------
  const MES_ACTUAL = 9;

  for (const t of INSCRIPCIONES_TRANSPORTE) {
    const alumno = alumnos.get(t.legajo);
    const recorrido = recorridos.get(t.recorrido);
    if (!alumno || !recorrido) continue;

    await prisma.inscripcionTransporte.upsert({
      where: { alumnoId_anio_mes: { alumnoId: alumno.id, anio: CICLO, mes: MES_ACTUAL } },
      update: { recorridoId: recorrido.id, turno: t.turno },
      create: {
        alumnoId: alumno.id,
        recorridoId: recorrido.id,
        anio: CICLO,
        mes: MES_ACTUAL,
        turno: t.turno,
      },
    });
  }

  for (const c of INSCRIPCIONES_COMEDOR) {
    const alumno = alumnos.get(c.legajo);
    const comedor = comedores.get(c.plan);
    if (!alumno || !comedor) continue;

    await prisma.inscripcionComedor.upsert({
      where: { alumnoId_anio_mes: { alumnoId: alumno.id, anio: CICLO, mes: MES_ACTUAL } },
      update: { comedorId: comedor.id },
      create: { alumnoId: alumno.id, comedorId: comedor.id, anio: CICLO, mes: MES_ACTUAL },
    });
  }

  // ---------- Facturación ----------
  await seedFacturacion(prisma, { alumnos, deportes, recorridos, comedores, usuarios });

  console.log(
    `   ${NIVELES.length} niveles · ${CURSOS.length} cursos · ${MATERIAS.length} materias · ` +
      `${PROFESORES.length} profesores · ${ALUMNOS.length} alumnos`,
  );
  console.log(
    `   ${DEPORTES.length} deportes · ${DEPORTES.reduce((n, d) => n + d.horarios.length, 0)} horarios · ` +
      `${RECORRIDOS.length} recorridos · ${COMEDOR.length} planes de comedor`,
  );
}

// ============================================================
// FACTURACIÓN DE DEMOSTRACIÓN
// ============================================================

type Catalogos = {
  alumnos: Map<string, { id: number; apellido: string; nombres: string; curso: { nivel: { nombre: string } } }>;
  deportes: Map<string, { id: number; nombre: string; arancelMensual: unknown }>;
  recorridos: Map<string, { id: number; nombre: string; arancelMensual: unknown }>;
  comedores: Map<string, { id: number; nombre: string; arancelMensual: unknown }>;
  usuarios: Map<string, number>;
};

type ItemSeed = { tipo: TipoItemFactura; descripcion: string; precio: number; referenciaId?: number };

/**
 * Facturas de julio, agosto y septiembre de 2026 para tres familias, con
 * comprobantes de transferencia en distintos estados. Cubre los cuatro casos
 * que el circuito tiene que saber representar:
 *   - saldada con una sola transferencia;
 *   - saldada con DOS transferencias (la relación 1:N que pide la consigna);
 *   - con un comprobante esperando validación;
 *   - impaga y vencida.
 *
 * `montoPagado` y `estado` NO se escriben acá: los deriva el trigger
 * `fn_recalcular_estado_factura` a partir de los comprobantes aprobados.
 */
async function seedFacturacion(prisma: PrismaClient, cat: Catalogos): Promise<void> {
  // Puede no existir: el seed del dominio corre también sobre una base sin
  // usuarios (`prisma/seed-sin-usuarios.ts`). Antes esto era `get('admin')!`,
  // una afirmación que no se sostenía y hacía fallar el seed entero.
  const adminId = cat.usuarios.get('admin');
  let correlativo = 1;

  const numeroFactura = () => `0001-${String(correlativo++).padStart(8, '0')}`;

  async function crearFactura(opts: {
    legajo: string;
    tutor?: string;
    mes: number;
    items: ItemSeed[];
    vencimientoDia?: number;
  }) {
    const alumno = cat.alumnos.get(opts.legajo);
    if (!alumno) return null;

    const subtotal = opts.items.reduce((s, i) => s + i.precio, 0);
    const vencimientoDia = opts.vencimientoDia ?? 10;
    const vencimiento = fecha(CICLO, opts.mes, vencimientoDia);
    const emision = fecha(CICLO, opts.mes, 1);

    // Estado inicial; si la factura recibe comprobantes, el trigger lo recalcula.
    const hoy = fecha(2026, 9, 15);
    const estadoInicial = vencimiento < hoy ? EstadoFactura.VENCIDA : EstadoFactura.PENDIENTE;

    const factura = await prisma.factura.upsert({
      where: { alumnoId_anio_mes: { alumnoId: alumno.id, anio: CICLO, mes: opts.mes } },
      update: {},
      create: {
        numero: numeroFactura(),
        alumnoId: alumno.id,
        tutorId: opts.tutor ? cat.usuarios.get(opts.tutor) ?? null : null,
        anio: CICLO,
        mes: opts.mes,
        fechaEmision: emision,
        fechaVencimiento: vencimiento,
        subtotal,
        recargo: 0,
        total: subtotal,
        estado: estadoInicial,
        items: {
          create: opts.items.map((i) => ({
            tipo: i.tipo,
            descripcion: i.descripcion,
            cantidad: 1,
            precioUnitario: i.precio,
            subtotal: i.precio,
            referenciaId: i.referenciaId ?? null,
          })),
        },
      },
    });

    return factura;
  }

  async function agregarComprobante(opts: {
    facturaId: number;
    subidoPor: string;
    monto: number;
    dia: [number, number, number];
    banco: string;
    operacion: string;
    estado: EstadoComprobante;
    motivoRechazo?: string;
  }) {
    const subidoPorId = cat.usuarios.get(opts.subidoPor) ?? adminId;
    // `ComprobantePago.subidoPorId` es un FK obligatorio a User: sin ninguna
    // cuenta en la base, un comprobante no puede existir. Se omite en lugar de
    // cortar el seed; las facturas quedan igual, en estado impago.
    if (subidoPorId === undefined) return;

    const resuelto = opts.estado !== EstadoComprobante.PENDIENTE;

    await prisma.comprobantePago.upsert({
      where: { facturaId_numeroOperacion: { facturaId: opts.facturaId, numeroOperacion: opts.operacion } },
      update: {},
      create: {
        facturaId: opts.facturaId,
        subidoPorId,
        monto: opts.monto,
        fechaTransferencia: fecha(...opts.dia),
        bancoOrigen: opts.banco,
        numeroOperacion: opts.operacion,
        archivoUrl: `/uploads/comprobantes/demo-${opts.operacion}.pdf`,
        estado: opts.estado,
        validadoPorId: resuelto ? adminId ?? null : null,
        validadoEn: resuelto ? fecha(opts.dia[0], opts.dia[1], Math.min(opts.dia[2] + 1, 28)) : null,
        motivoRechazo: opts.motivoRechazo ?? null,
      },
    });
  }

  const cuota = (legajo: string) => {
    const nivel = cat.alumnos.get(legajo)?.curso.nivel.nombre ?? 'Primario';
    return CUOTA_POR_NIVEL[nivel];
  };

  const futbol = cat.deportes.get('Fútbol');
  const ajedrez = cat.deportes.get('Ajedrez');
  const r1 = cat.recorridos.get(CodigoRecorrido.R1);
  const comedor5 = cat.comedores.get('Comedor — 5 días');

  // --- Familia Barrabino (A-0001): el caso completo ---
  const itemsBarrabino: ItemSeed[] = [
    { tipo: TipoItemFactura.CUOTA, descripcion: 'Cuota mensual — Secundario 1er Año', precio: cuota('A-0001') },
    { tipo: TipoItemFactura.TRANSPORTE, descripcion: `Transporte — ${r1?.nombre ?? 'Recorrido 1'}`, precio: 46000, referenciaId: r1?.id },
    { tipo: TipoItemFactura.COMEDOR, descripcion: 'Comedor — 5 días', precio: 68000, referenciaId: comedor5?.id },
    { tipo: TipoItemFactura.DEPORTE, descripcion: 'Deporte — Fútbol', precio: 22000, referenciaId: futbol?.id },
    { tipo: TipoItemFactura.DEPORTE, descripcion: 'Deporte — Ajedrez', precio: 15000, referenciaId: ajedrez?.id },
  ];
  const totalBarrabino = itemsBarrabino.reduce((s, i) => s + i.precio, 0);

  // Julio: saldada con una sola transferencia.
  const fJul = await crearFactura({ legajo: 'A-0001', tutor: 'pbarrabino', mes: 7, items: itemsBarrabino });
  if (fJul) {
    await agregarComprobante({
      facturaId: fJul.id, subidoPor: 'pbarrabino', monto: totalBarrabino,
      dia: [CICLO, 7, 8], banco: 'Banco Nación', operacion: 'NAC-7781204',
      estado: EstadoComprobante.APROBADO,
    });
  }

  // Agosto: saldada con DOS transferencias — la relación 1:N de la consigna.
  const fAgo = await crearFactura({ legajo: 'A-0001', tutor: 'pbarrabino', mes: 8, items: itemsBarrabino });
  if (fAgo) {
    await agregarComprobante({
      facturaId: fAgo.id, subidoPor: 'pbarrabino', monto: 120000,
      dia: [CICLO, 8, 6], banco: 'Banco Nación', operacion: 'NAC-7902551',
      estado: EstadoComprobante.APROBADO,
    });
    await agregarComprobante({
      facturaId: fAgo.id, subidoPor: 'pbarrabino', monto: totalBarrabino - 120000,
      dia: [CICLO, 8, 9], banco: 'Nuevo Banco del Chaco', operacion: 'NBCH-334871',
      estado: EstadoComprobante.APROBADO,
    });
  }

  // Septiembre: comprobante cargado, esperando validación de Administración.
  const fSep = await crearFactura({ legajo: 'A-0001', tutor: 'pbarrabino', mes: 9, items: itemsBarrabino });
  if (fSep) {
    await agregarComprobante({
      facturaId: fSep.id, subidoPor: 'pbarrabino', monto: totalBarrabino,
      dia: [CICLO, 9, 9], banco: 'Nuevo Banco del Chaco', operacion: 'NBCH-401223',
      estado: EstadoComprobante.PENDIENTE,
    });
  }

  // --- Familia Pérez (A-0002): pago parcial ---
  const itemsPerez: ItemSeed[] = [
    { tipo: TipoItemFactura.CUOTA, descripcion: 'Cuota mensual — Secundario 1er Año', precio: cuota('A-0002') },
    { tipo: TipoItemFactura.TRANSPORTE, descripcion: 'Transporte — Recorrido 2', precio: 52000 },
    { tipo: TipoItemFactura.DEPORTE, descripcion: 'Deporte — Vóley', precio: 22000 },
    { tipo: TipoItemFactura.DEPORTE, descripcion: 'Deporte — Handball', precio: 20000 },
  ];
  const fPerezAgo = await crearFactura({ legajo: 'A-0002', tutor: 'rperez', mes: 8, items: itemsPerez });
  if (fPerezAgo) {
    await agregarComprobante({
      facturaId: fPerezAgo.id, subidoPor: 'rperez', monto: 100000,
      dia: [CICLO, 8, 12], banco: 'Banco Macro', operacion: 'MAC-118844',
      estado: EstadoComprobante.APROBADO,
    });
  }

  // Septiembre de Pérez: comprobante rechazado (importe que no coincide).
  const fPerezSep = await crearFactura({ legajo: 'A-0002', tutor: 'rperez', mes: 9, items: itemsPerez });
  if (fPerezSep) {
    await agregarComprobante({
      facturaId: fPerezSep.id, subidoPor: 'rperez', monto: 50000,
      dia: [CICLO, 9, 11], banco: 'Banco Macro', operacion: 'MAC-120391',
      estado: EstadoComprobante.RECHAZADO,
      motivoRechazo: 'El comprobante corresponde a otra cuenta de destino. Reenviar la transferencia a la cuenta institucional.',
    });
  }

  // --- Familia Gómez (A-0006): factura impaga y vencida ---
  await crearFactura({
    legajo: 'A-0006',
    tutor: 'mgomezp',
    mes: 7,
    items: [
      { tipo: TipoItemFactura.CUOTA, descripcion: 'Cuota mensual — Primario 6to Grado', precio: cuota('A-0006') },
      { tipo: TipoItemFactura.TRANSPORTE, descripcion: 'Transporte — Recorrido 1 (sólo ida)', precio: 23000 },
      { tipo: TipoItemFactura.COMEDOR, descripcion: 'Comedor — 5 días', precio: 68000 },
    ],
  });

  const totalFacturas = await prisma.factura.count();
  const totalComprobantes = await prisma.comprobantePago.count();
  console.log(`   ${totalFacturas} facturas · ${totalComprobantes} comprobantes de transferencia`);
}
