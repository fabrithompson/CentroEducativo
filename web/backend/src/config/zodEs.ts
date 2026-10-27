/**
 * Mensajes de validación en español.
 *
 * Zod trae sus mensajes en inglés ("String must contain at least 2
 * character(s)") y el frontend los muestra tal cual en los avisos: la persona
 * que llenaba una inscripción leía eso sin saber de qué campo se trataba.
 *
 * Este mapa se registra una sola vez (ver app.ts) y cubre todos los esquemas.
 * Un esquema que ya pasa su propio mensaje (`.min(8, 'La contraseña…')`) lo
 * conserva: Zod sólo consulta el mapa cuando no hay mensaje explícito.
 */

import { z, ZodIssueCode, type ZodErrorMap } from 'zod';

/** Cómo se llama cada campo para quien completa el formulario. */
const ETIQUETAS: Record<string, string> = {
  nombre: 'Nombre',
  nombres: 'Nombres',
  apellido: 'Apellido',
  email: 'Email',
  dni: 'DNI',
  telefono: 'Teléfono',
  domicilio: 'Domicilio',
  localidad: 'Localidad',
  provincia: 'Provincia',
  usuario: 'Usuario',
  // Es la etiqueta del campo que ve la persona, no una credencial: SonarCloud
  // la toma por una contraseña escrita en el código (regla S2068).
  password: 'Contraseña', // NOSONAR
  actual: 'Contraseña actual',
  nueva: 'Contraseña nueva',
  tipo: 'Tipo',
  role: 'Rol',
  rol: 'Rol',
  curso: 'Curso',
  cursoId: 'Curso',
  nivel: 'Nivel',
  nivelId: 'Nivel',
  materia: 'Materia',
  materiaId: 'Materia',
  alumnoId: 'Alumno',
  estudianteId: 'Estudiante',
  profesorId: 'Profesor',
  profesorResponsableId: 'Profesor responsable',
  tutorId: 'Tutor',
  deporteId: 'Deporte',
  recorridoId: 'Recorrido',
  comedorId: 'Plan de comedor',
  facturaId: 'Factura',
  receiverId: 'Destinatario',
  nombreTutor: 'Nombre del tutor',
  emailTutor: 'Email del tutor',
  telefonoTutor: 'Teléfono del tutor',
  nombreEstudiante: 'Nombre del estudiante',
  mensaje: 'Mensaje',
  texto: 'Texto',
  rating: 'Valoración',
  puesto: 'Puesto',
  titulo: 'Título',
  contenido: 'Contenido',
  descripcion: 'Descripción',
  concepto: 'Concepto',
  monto: 'Monto',
  vencimiento: 'Vencimiento',
  fecha: 'Fecha',
  fechaEntrega: 'Fecha de entrega',
  desde: 'Desde',
  hasta: 'Hasta',
  anio: 'Año',
  anioLectivo: 'Año lectivo',
  mes: 'Mes',
  turno: 'Turno',
  division: 'División',
  especialidad: 'Especialidad',
  legajo: 'Legajo',
  estado: 'Estado',
  parentesco: 'Parentesco',
  score: 'Nota',
  maxScore: 'Nota máxima',
  feedback: 'Devolución',
  motivo: 'Motivo',
  motivoRechazo: 'Motivo del rechazo',
  numeroOperacion: 'Número de operación',
  bancoOrigen: 'Banco de origen',
  cupoMaximo: 'Cupo máximo',
  arancelMensual: 'Arancel mensual',
  cuotaMensual: 'Cuota mensual',
  cargaHoraria: 'Carga horaria',
  diaSemana: 'Día',
  targetRole: 'Destinatarios',
  observacion: 'Observación',
  observaciones: 'Observaciones',
  objetivos: 'Objetivos',
  contenidos: 'Contenidos',
  codigo: 'Código',
  lugar: 'Lugar',
};

/** `nombreTutor` → "Nombre tutor", para los campos que no están en la tabla. */
function humanizar(clave: string): string {
  const separado = clave.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
  return separado.charAt(0).toUpperCase() + separado.slice(1);
}

function etiquetaDe(path: (string | number)[]): string | null {
  const clave = [...path].reverse().find((p): p is string => typeof p === 'string');
  if (!clave) return null;
  return ETIQUETAS[clave] ?? humanizar(clave);
}

function detalle(issue: Parameters<ZodErrorMap>[0]): string | null {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      if (issue.received === 'undefined' || issue.received === 'null') return 'es obligatorio.';
      if (issue.expected === 'number' || issue.expected === 'integer') return 'tiene que ser un número.';
      if (issue.expected === 'date') return 'tiene que ser una fecha válida.';
      return 'tiene un formato inválido.';

    case ZodIssueCode.too_small:
      if (issue.type === 'string') {
        return Number(issue.minimum) <= 1
          ? 'no puede quedar vacío.'
          : `tiene que tener al menos ${issue.minimum} caracteres.`;
      }
      if (issue.type === 'number' || issue.type === 'bigint') {
        return `tiene que ser ${issue.inclusive ? 'mayor o igual a' : 'mayor que'} ${issue.minimum}.`;
      }
      if (issue.type === 'array' || issue.type === 'set') return `tiene que tener al menos ${issue.minimum} elemento(s).`;
      if (issue.type === 'date') return 'es una fecha demasiado temprana.';
      return null;

    case ZodIssueCode.too_big:
      if (issue.type === 'string') return `puede tener hasta ${issue.maximum} caracteres.`;
      if (issue.type === 'number' || issue.type === 'bigint') {
        return `tiene que ser ${issue.inclusive ? 'menor o igual a' : 'menor que'} ${issue.maximum}.`;
      }
      if (issue.type === 'array' || issue.type === 'set') return `puede tener hasta ${issue.maximum} elemento(s).`;
      if (issue.type === 'date') return 'es una fecha demasiado lejana.';
      return null;

    case ZodIssueCode.invalid_string:
      if (issue.validation === 'email') return 'no tiene un formato de email válido (usuario@dominio.com).';
      if (issue.validation === 'url') return 'no es una dirección web válida.';
      if (issue.validation === 'datetime' || issue.validation === 'date') return 'no es una fecha válida.';
      return 'tiene un formato inválido.';

    case ZodIssueCode.invalid_enum_value:
    case ZodIssueCode.invalid_literal:
    case ZodIssueCode.invalid_union:
    case ZodIssueCode.invalid_union_discriminator:
      return 'no es una opción válida.';

    case ZodIssueCode.invalid_date:
      return 'no es una fecha válida.';

    case ZodIssueCode.not_multiple_of:
      return `tiene que ser múltiplo de ${issue.multipleOf}.`;

    case ZodIssueCode.unrecognized_keys:
      return null;

    default:
      return null;
  }
}

export const errorMapEs: ZodErrorMap = (issue, ctx) => {
  const texto = detalle(issue);
  if (!texto) return { message: ctx.defaultError };
  const etiqueta = etiquetaDe(issue.path);
  return { message: etiqueta ? `${etiqueta}: ${texto}` : texto.charAt(0).toUpperCase() + texto.slice(1) };
};

/** Se llama una vez al armar la app. */
export function registrarMensajesEnEspanol(): void {
  z.setErrorMap(errorMapEs);
}
