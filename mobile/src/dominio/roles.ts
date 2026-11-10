/**
 * Qué ve cada rol en la app.
 *
 * La consigna (Parte 3, Módulo 1) pide que el usuario acceda "únicamente a las
 * funcionalidades correspondientes a su rol". La app es de los cuatro roles del
 * sistema, igual que la web, y cada uno tiene los módulos de la Parte 3 que le
 * tocan:
 *
 *   - padre: sigue a sus hijos, paga por transferencia e inscribe a deportes,
 *     transporte, comedor y al cursado.
 *   - estudiante: lo suyo, en lectura (pagar es de los padres), y su carnet.
 *   - docente: controla el acceso con el carnet y ve sus cursos y horarios.
 *   - admin: fija los aranceles, valida los comprobantes y controla el acceso.
 *
 * Esto es sólo lo que se muestra: el backend vuelve a verificar cada permiso.
 */

export type Rol = 'padre' | 'estudiante' | 'docente' | 'admin';

export type Vista =
  | 'inicio'
  | 'inscripciones'
  | 'carnet'
  | 'finanzas'
  | 'escanear'
  | 'cursos'
  | 'aranceles'
  | 'comprobantes'
  | 'cuenta';

export interface Pestania {
  clave: Vista;
  titulo: string;
}

/** `tipo` es lo que devuelve el login (`padre`, `estudiante`, `docente`, `admin`). */
export function rolDe(tipo: string | null | undefined): Rol | null {
  switch ((tipo ?? '').toLowerCase()) {
    case 'padre':
      return 'padre';
    case 'estudiante':
      return 'estudiante';
    case 'docente':
      return 'docente';
    case 'admin':
      return 'admin';
    default:
      return null;
  }
}

const PESTANIAS: Record<Rol, Pestania[]> = {
  padre: [
    { clave: 'inicio', titulo: 'Inicio' },
    { clave: 'inscripciones', titulo: 'Inscribir' },
    { clave: 'carnet', titulo: 'Carnet' },
    { clave: 'finanzas', titulo: 'Finanzas' },
    { clave: 'cuenta', titulo: 'Cuenta' },
  ],
  estudiante: [
    { clave: 'inicio', titulo: 'Inicio' },
    { clave: 'carnet', titulo: 'Carnet' },
    { clave: 'finanzas', titulo: 'Cuotas' },
    { clave: 'cuenta', titulo: 'Cuenta' },
  ],
  docente: [
    { clave: 'escanear', titulo: 'Escanear' },
    { clave: 'cursos', titulo: 'Mis cursos' },
    { clave: 'cuenta', titulo: 'Cuenta' },
  ],
  admin: [
    { clave: 'aranceles', titulo: 'Aranceles' },
    { clave: 'comprobantes', titulo: 'Pagos' },
    { clave: 'escanear', titulo: 'Escanear' },
    { clave: 'cuenta', titulo: 'Cuenta' },
  ],
};

export function pestaniasDe(rol: Rol): Pestania[] {
  return PESTANIAS[rol];
}

export function vistaInicial(rol: Rol): Vista {
  return PESTANIAS[rol][0]!.clave;
}

/** Los roles que siguen a uno o más alumnos (y necesitan el selector de hijo). */
export function esFamilia(rol: Rol): boolean {
  return rol === 'padre' || rol === 'estudiante';
}

/** Pagar por transferencia es de los padres; el estudiante ve sus cuotas sin pagar. */
export function puedePagar(rol: Rol): boolean {
  return rol === 'padre';
}

const NOMBRES: Record<Rol, string> = {
  padre: 'Familia',
  estudiante: 'Estudiante',
  docente: 'Docente',
  admin: 'Administración',
};

export function nombreDeRol(rol: Rol): string {
  return NOMBRES[rol];
}

const TITULOS: Record<Vista, string> = {
  inicio: 'Inicio',
  inscripciones: 'Inscripciones',
  carnet: 'Carnet digital',
  finanzas: 'Cuotas y pagos',
  escanear: 'Control de acceso',
  cursos: 'Mis cursos',
  aranceles: 'Aranceles',
  comprobantes: 'Comprobantes de pago',
  cuenta: 'Mi cuenta',
};

export function tituloDeVista(vista: Vista): string {
  return TITULOS[vista];
}
