/**
 * Endpoints del backend, tipados.
 *
 * Un archivo por capa: acá está el contrato con el servidor. Si el backend
 * cambia una respuesta, se corrige en un solo lugar y TypeScript marca todas
 * las pantallas afectadas.
 *
 * Todos los importes llegan como `number` porque los routers ya convierten el
 * `Decimal` de Prisma antes de serializar.
 */

import { File } from 'expo-file-system';

import { http } from './client';
import type { EstadoFactura, ItemFactura, TipoItem } from '../dominio/pagos';

// ==================================================================
// Tipos de respuesta
// ==================================================================

export interface Sesion {
  exito: boolean;
  mensaje: string;
  usuario: { id: number; nombre: string; tipo: string; token: string };
}

/**
 * Un alumno que la cuenta puede ver. Para un padre, cada hijo vinculado; para
 * un estudiante, él mismo (`vinculoId` nulo y `parentesco` "PROPIO").
 */
export interface Hijo {
  vinculoId: number | null;
  parentesco: string | null;
  esResponsableFacturacion: boolean;
  alumno: {
    id: number;
    legajo: string;
    apellido: string;
    nombres: string;
    dni: string;
    estado: string;
    curso: {
      id: number;
      nombre: string;
      division: string;
      turno: string;
      nivel: { id: number; nombre: string };
    } | null;
  };
}

export interface HorarioDeporte {
  id: number;
  diaSemana: string;
  horaInicio: number;
  horaFin: number;
  horaInicioTexto?: string;
  horaFinTexto?: string;
  lugar: string;
}

export interface DeporteInscripto {
  inscripcionId: number;
  slot: number;
  fechaAlta: string;
  deporte: {
    id: number;
    nombre: string;
    arancelMensual: number;
    profesorResponsable: { apellido: string; nombres: string };
    horarios: HorarioDeporte[];
  };
}

export interface RespuestaDeportes {
  exito: boolean;
  cupo: { usado: number; maximo: number };
  deportes: DeporteInscripto[];
}

export interface RespuestaServicios {
  exito: boolean;
  periodo: { anio: number; mes: number };
  transporte: {
    id: number;
    turno: string;
    estado: string;
    recorrido: {
      id: number;
      codigo: string;
      nombre: string;
      zonas: string;
      arancelMensual: number;
      horaSalida: number;
      horaRegreso: number;
    };
  } | null;
  comedor: {
    id: number;
    estado: string;
    comedor: { id: number; nombre: string; diasPorSemana: number; arancelMensual: number; horaServicio: number };
  } | null;
  costoMensualEstimado: { transporte: number; comedor: number; deportes: number; total: number };
}

export interface ComprobanteCargado {
  id: number;
  monto: number;
  fechaTransferencia: string;
  bancoOrigen: string;
  numeroOperacion: string;
  estado: 'PENDIENTE' | 'APROBADO' | 'RECHAZADO';
  motivoRechazo: string | null;
  archivoUrl: string;
  createdAt: string;
}

export interface FacturaDetallada {
  id: number;
  numero: string;
  anio: number;
  mes: number;
  fechaEmision: string;
  fechaVencimiento: string;
  total: number;
  montoPagado: number;
  saldo: number;
  estado: EstadoFactura;
  items: (ItemFactura & { cantidad: number; precioUnitario: number })[];
  comprobantes: ComprobanteCargado[];
}

export interface RespuestaFacturas {
  exito: boolean;
  facturas: FacturaDetallada[];
  resumen: { cantidad: number; deudaTotal: number; vencidas: number; enRevision: number };
}

export interface RespuestaDeuda {
  exito: boolean;
  deudaPorItem: { tipo: TipoItem; facturado: number; adeudado: number }[];
  deudaTotal: number;
  facturasImpagas: number;
  nota: string;
}

export interface Calificacion {
  id: number;
  materia: string;
  instancia: string;
  nota: number;
  fecha: string;
  docente: { nombre: string };
}

export interface RespuestaAsistencia {
  exito: boolean;
  asistencias: { id: number; fecha: string; status: string; materia: string | null }[];
  resumen: {
    total: number;
    presentes: number;
    ausentes: number;
    tardes: number;
    justificados: number;
    porcentajeAsistencia: number | null;
  } | null;
}

export interface RespuestaSubida {
  exito: boolean;
  mensaje: string;
  comprobante: ComprobanteCargado;
  advertencia: string | null;
}


export interface RespuestaCredencial {
  exito: boolean;
  credencial: {
    id: number;
    secreto: string;
    version: number;
    emitidaEn: string;
    periodoSegundos: number;
    digitos: number;
  };
  alumno?: {
    id: number;
    legajo: string;
    apellido: string;
    nombres: string;
    dni: string;
    curso: string;
    nivel: string;
    estado: string;
  };
  mensaje?: string;
}

export interface RegistroAcceso {
  id: number;
  fecha: string;
  punto: 'TRANSPORTE' | 'COMEDOR';
  resultado: string;
  motivo: string | null;
  notificado: boolean;
  recorrido: { codigo: string; nombre: string } | null;
  comedor: { nombre: string } | null;
}

// ------------------------------------------------------------------
// Materias, inscripciones y servicios
// ------------------------------------------------------------------

export interface FranjaHoraria {
  id: number;
  diaSemana: string;
  horaInicio: number;
  horaFin: number;
  aula?: string | null;
}

export interface MateriaDelCurso {
  id: number;
  nombre: string;
  cargaHoraria: number;
  profesor: { apellido: string; nombres: string; email?: string | null } | null;
  horarios: FranjaHoraria[];
}

export interface FichaAlumno {
  exito: boolean;
  alumno: Hijo['alumno'] & { curso: (NonNullable<Hijo['alumno']['curso']> & { materias: MateriaDelCurso[] }) | null };
}

export interface DeporteDisponible {
  id: number;
  nombre: string;
  descripcion: string | null;
  arancelMensual: number;
  profesorResponsable: { apellido: string; nombres: string };
  horarios: HorarioDeporte[];
  inscribible: boolean;
  motivo: string | null;
}

export interface Recorrido {
  id: number;
  codigo: string;
  nombre: string;
  zonas: string;
  arancelMensual: number;
  horaSalidaTexto?: string;
  horaRegresoTexto?: string;
}

export interface PlanComedor {
  id: number;
  nombre: string;
  diasPorSemana: number;
  arancelMensual: number;
  horaServicioTexto?: string;
}

export type TurnoTransporte = 'IDA' | 'VUELTA' | 'IDA_Y_VUELTA';

export interface SolicitudCursado {
  nombreTutor: string;
  emailTutor: string;
  telefonoTutor: string;
  nombreEstudiante: string;
  nivel: string;
  curso: string;
  mensaje?: string | null;
}

// ------------------------------------------------------------------
// Personal: docente y administración
// ------------------------------------------------------------------

export interface ReporteDocente {
  exito: boolean;
  profesor: { id: number; legajo: string; apellido: string; nombres: string; especialidad: string | null };
  totales: { niveles: number; cursos: number; materias: number; horasSemanales: number };
  niveles: {
    nivel: string;
    cursos: {
      curso: string;
      turno: string;
      materias: {
        id: number;
        nombre: string;
        cargaHoraria: number;
        horarios: { diaSemana: string; desde: string; hasta: string; aula: string | null }[];
      }[];
    }[];
  }[];
  deportes: { id: number; nombre: string; horarios: { diaSemana: string; desde: string; hasta: string; nivel: string; lugar: string }[] }[];
}

export interface NivelConCuota {
  id: number;
  nombre: string;
  orden: number;
  /** Llega como `Decimal` serializado: a veces número, a veces texto. */
  cuotaMensual: number | string;
  activo: boolean;
}

export interface DeporteDelCatalogo {
  id: number;
  nombre: string;
  arancelMensual: number;
  activo: boolean;
  profesorResponsable: { apellido: string; nombres: string };
}

export interface ComprobantePendiente {
  id: number;
  monto: number;
  fechaTransferencia: string;
  bancoOrigen: string;
  numeroOperacion: string;
  archivoUrl: string;
  cargadoEl: string;
  subidoPor: { nombre: string; email: string } | null;
  factura: {
    id: number;
    numero: string;
    periodo: string;
    total: number;
    montoPagado: number;
    saldo: number;
    estado: string;
    alumno: string;
    legajo: string;
    curso: string;
  };
  coincideConSaldo: boolean;
}

export type EstadoAlumno = 'ACTIVO' | 'INACTIVO' | 'EGRESADO' | 'SUSPENDIDO';

/** Una página del listado paginado del backend (`armarPagina`). */
export interface Pagina<T> {
  exito: boolean;
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AlumnoListado {
  id: number;
  legajo: string;
  dni: string;
  apellido: string;
  nombres: string;
  fechaNacimiento: string;
  domicilio: string;
  telefono: string | null;
  email: string | null;
  estado: EstadoAlumno;
  fechaIngreso: string;
  curso: {
    id: number;
    nombre: string;
    division: string;
    turno: string;
    nivel: { id: number; nombre: string };
  } | null;
}

export interface FilaMorosidad {
  alumnoId: number;
  legajo: string;
  apellido: string;
  nombres: string;
  curso: string;
  nivel: string;
  facturasImpagas: number;
  mesesAdeudados: string[];
  deuda: number;
}

export interface RespuestaMorosidad {
  exito: boolean;
  totales: { alumnosConDeuda: number; deudaTotal: number; facturasImpagas: number };
  filas: FilaMorosidad[];
}

export interface FacturaAdmin {
  id: number;
  numero: string;
  anio: number;
  mes: number;
  fechaVencimiento: string;
  total: number;
  montoPagado: number;
  saldo: number;
  estado: EstadoFactura;
}

export type PuntoControl = 'TRANSPORTE' | 'COMEDOR';

export interface ResultadoEscaneo {
  exito: boolean;
  permitido: boolean;
  resultado: string;
  mensaje: string;
  alumno: { id: number; legajo: string; nombre: string; curso: string } | null;
  detalle?: string;
}

// ==================================================================
// Llamadas
// ==================================================================

export const api = {
  auth: {
    login: (usuario: string, password: string) =>
      http.postSinAuth<Sesion>('/auth/login', { usuario, password }),

    /** Con el id se borra sólo la cookie de esa cuenta; sin él, todas. */
    logout: (usuarioId?: number) =>
      http.post<{ exito: boolean }>('/auth/logout', usuarioId ? { usuarioId } : undefined),

    olvideMiClave: (email: string) =>
      http.postSinAuth<{ exito: boolean; mensaje: string }>('/auth/forgot-password', { email }),

    yo: () => http.get<{ exito: boolean; usuario: { id: number; nombre: string; role: string } }>('/auth/me'),

    /** Módulo 1 de la consigna: cambiar la contraseña con la sesión iniciada. */
    cambiarClave: (actual: string, nueva: string) =>
      http.post<{ exito: boolean; mensaje: string }>('/auth/change-password', { actual, nueva }),
  },

  /**
   * Inscripción a deportes, transporte y comedor. El backend valida el tope de
   * 2 deportes, los choques de horario y que el alumno sea hijo del tutor.
   */
  inscripciones: {
    /**
     * Deportes que cursa el alumno, para quien no es su tutor (Administración).
     * `/deportes/alumno/:id` devuelve `inscripciones[]` con el `id` de cada una;
     * se lo lleva a la forma de `/padres/mis-hijos/:id/deportes` para que la
     * pantalla de inscripciones sea la misma para los dos roles.
     */
    deportesDeAlumno: async (alumnoId: number): Promise<RespuestaDeportes> => {
      const r = await http.get<{
        exito: boolean;
        cupo: RespuestaDeportes['cupo'];
        inscripciones: (Omit<DeporteInscripto, 'inscripcionId'> & { id: number })[];
      }>(`/deportes/alumno/${alumnoId}`);
      return {
        exito: r.exito,
        cupo: r.cupo,
        deportes: r.inscripciones.map(({ id, slot, fechaAlta, deporte }) => ({ inscripcionId: id, slot, fechaAlta, deporte })),
      };
    },

    /** Transporte y comedor del mes, para Administración. Misma forma que la del portal de tutores. */
    serviciosDeAlumno: (alumnoId: number, anio?: number, mes?: number) =>
      http.get<RespuestaServicios>(`/servicios/alumno/${alumnoId}`, { anio, mes }),

    deportesDisponibles: (alumnoId: number) =>
      http.get<{ exito: boolean; deportes: DeporteDisponible[] }>(`/deportes/alumno/${alumnoId}/disponibles`),

    inscribirDeporte: (alumnoId: number, deporteId: number) =>
      http.post<{ exito: boolean; mensaje: string }>('/deportes/inscripciones', { alumnoId, deporteId }),

    bajaDeporte: (inscripcionId: number) =>
      http.del<{ exito: boolean; mensaje: string }>(`/deportes/inscripciones/${inscripcionId}`),

    recorridos: (anio: number, mes: number) =>
      http.get<{ exito: boolean; recorridos: Recorrido[] }>('/servicios/transporte/recorridos', { anio, mes }),

    contratarTransporte: (datos: { alumnoId: number; recorridoId: number; turno: TurnoTransporte; anio: number; mes: number }) =>
      http.post<{ exito: boolean; mensaje: string }>('/servicios/transporte', datos),

    bajaTransporte: (inscripcionId: number) =>
      http.del<{ exito: boolean; mensaje: string }>(`/servicios/transporte/${inscripcionId}`),

    planesComedor: (anio: number, mes: number) =>
      http.get<{ exito: boolean; planes: PlanComedor[] }>('/servicios/comedor/planes', { anio, mes }),

    contratarComedor: (datos: { alumnoId: number; comedorId: number; anio: number; mes: number }) =>
      http.post<{ exito: boolean; mensaje: string }>('/servicios/comedor', datos),

    bajaComedor: (inscripcionId: number) =>
      http.del<{ exito: boolean; mensaje: string }>(`/servicios/comedor/${inscripcionId}`),

    /** "Inscribir a su hijo al cursado": la solicitud la aprueba Administración. */
    solicitarCursado: (datos: SolicitudCursado) =>
      http.postSinAuth<{ exito: boolean; mensaje: string }>('/public/inscriptions', datos),
  },

  docente: {
    misCursos: () => http.get<ReporteDocente>('/profesores/yo/cursos'),
  },

  admin: {
    /** Listado de alumnos. El backend pagina de a 100 como máximo. */
    alumnos: (filtros: { busqueda?: string; estado?: EstadoAlumno; page?: number; pageSize?: number }) =>
      http.get<Pagina<AlumnoListado>>('/alumnos', filtros),

    /** Deuda por alumno: saldo, cuotas impagas y meses. La calcula el backend. */
    morosidad: () => http.get<RespuestaMorosidad>('/reportes/morosidad'),

    facturasDe: (alumnoId: number) =>
      http.get<Pagina<FacturaAdmin>>('/facturacion/facturas', { alumnoId, pageSize: 100 }),

    /**
     * Baja lógica: el alumno cambia de estado y el backend da de baja sus
     * deportes, transporte y comedor. Notas, asistencias y facturas quedan.
     */
    darDeBaja: (alumnoId: number, estado: Exclude<EstadoAlumno, 'ACTIVO'>) =>
      http.del<{ exito: boolean; mensaje: string }>(`/alumnos/${alumnoId}`, { estado }),

    /** Vuelve a activo. Las inscripciones no vuelven solas. */
    reactivar: (alumnoId: number) =>
      http.patch<{ exito: boolean; mensaje: string }>(`/alumnos/${alumnoId}`, { estado: 'ACTIVO' }),

    niveles: () => http.get<{ exito: boolean; niveles: NivelConCuota[] }>('/academico/niveles'),
    cuotaNivel: (id: number, cuotaMensual: number) =>
      http.patch<{ exito: boolean; mensaje: string }>(`/academico/niveles/${id}`, { cuotaMensual }),

    deportes: () => http.get<{ exito: boolean; deportes: DeporteDelCatalogo[] }>('/deportes'),
    arancelDeporte: (id: number, arancelMensual: number) =>
      http.patch<{ exito: boolean; mensaje: string }>(`/deportes/${id}`, { arancelMensual }),
    arancelRecorrido: (id: number, arancelMensual: number) =>
      http.patch<{ exito: boolean; mensaje: string }>(`/servicios/transporte/recorridos/${id}`, { arancelMensual }),
    arancelComedor: (id: number, arancelMensual: number) =>
      http.patch<{ exito: boolean; mensaje: string }>(`/servicios/comedor/planes/${id}`, { arancelMensual }),

    comprobantesPendientes: () =>
      http.get<{ exito: boolean; cantidad: number; montoTotal: number; comprobantes: ComprobantePendiente[] }>(
        '/facturacion/comprobantes/pendientes',
      ),
    validarComprobante: (id: number, aprobar: boolean, motivoRechazo?: string) =>
      http.post<{ exito: boolean; mensaje: string }>(`/facturacion/comprobantes/${id}/validar`, { aprobar, motivoRechazo }),
  },

  /** Control de acceso con el carnet: lo usan docentes y administración. */
  accesos: {
    escanear: (datos: { qr?: string; legajo?: string; codigo?: string; punto: PuntoControl; recorridoId?: number }) =>
      http.post<ResultadoEscaneo>('/accesos/escanear', { ...datos, dispositivo: 'app-movil' }),
  },

  /**
   * Portal de tutores. Es el único camino por el que la app lee datos de un
   * alumno: el backend verifica el vínculo antes de devolver nada, así que la
   * app nunca inventa un `alumnoId`, siempre usa los que trajo `misHijos()`.
   */
  padres: {
    misHijos: () => http.get<{ exito: boolean; hijos: Hijo[] }>('/padres/mis-hijos'),

    /** Ficha del alumno con sus materias, el profesor de cada una y la grilla. */
    ficha: (alumnoId: number) => http.get<FichaAlumno>(`/padres/mis-hijos/${alumnoId}`),

    deportes: (alumnoId: number) =>
      http.get<RespuestaDeportes>(`/padres/mis-hijos/${alumnoId}/deportes`),

    servicios: (alumnoId: number, anio?: number, mes?: number) =>
      http.get<RespuestaServicios>(`/padres/mis-hijos/${alumnoId}/servicios`, { anio, mes }),

    /**
     * Sin `rango`, todas las facturas del alumno. Con `rango` (AAAA-MM-DD), sólo
     * las emitidas en ese período; el backend toma `hasta` inclusive.
     */
    facturas: (alumnoId: number, rango?: { desde: string; hasta: string }) =>
      http.get<RespuestaFacturas>(`/padres/mis-hijos/${alumnoId}/facturas`, rango),

    deuda: (alumnoId: number) => http.get<RespuestaDeuda>(`/padres/mis-hijos/${alumnoId}/deuda`),

    calificaciones: (alumnoId: number) =>
      http.get<{ exito: boolean; calificaciones: Calificacion[] }>(
        `/padres/mis-hijos/${alumnoId}/calificaciones`,
      ),

    asistencia: (alumnoId: number) =>
      http.get<RespuestaAsistencia>(`/padres/mis-hijos/${alumnoId}/asistencia`),
  },


  /** Carnet digital con QR rotativo. */
  credenciales: {
    /**
     * Trae la credencial, creándola si es la primera vez.
     * Devuelve el secreto: la app lo guarda en el almacenamiento seguro y con
     * él genera los códigos sin conexión.
     */
    obtener: (alumnoId: number) =>
      http.get<RespuestaCredencial>(`/credenciales/alumno/${alumnoId}`),

    /** Genera un secreto nuevo. Invalida el del dispositivo anterior. */
    reemitir: (alumnoId: number) =>
      http.post<RespuestaCredencial>(`/credenciales/alumno/${alumnoId}/reemitir`),

    accesos: (alumnoId: number) =>
      http.get<{ exito: boolean; cantidad: number; registros: RegistroAcceso[] }>(
        `/accesos/alumno/${alumnoId}`,
      ),
  },

  facturacion: {
    /**
     * HTML del comprobante de la cuota: conceptos, total, pagado, saldo y las
     * transferencias ya acreditadas. Es el mismo documento que abre la web y
     * que viaja adjunto en el mail mensual. El backend verifica el vínculo con
     * el alumno antes de devolverlo.
     */
    comprobanteHtml: (facturaId: number) =>
      http.get<string>(`/facturacion/facturas/${facturaId}/comprobante`),

    /**
     * Sube el comprobante de transferencia.
     *
     * El archivo va como `multipart/form-data`, como un `File` de
     * `expo-file-system`. Desde el SDK 58 el `fetch` global es `expo/fetch`,
     * que no acepta el `{ uri, name, type }` propio de React Native: tiraba una
     * excepción antes de mandar nada y la app mostraba "no pudimos
     * conectarnos". `File` implementa `Blob` y `expo/fetch` lee sus bytes; el
     * nombre y el tipo MIME salen del archivo.
     */
    subirComprobante: (datos: {
      facturaId: number;
      monto: number;
      fechaTransferencia: string;
      bancoOrigen: string;
      numeroOperacion: string;
      archivo: { uri: string; nombre: string; tipo: string };
    }) => {
      const fd = new FormData();
      fd.append('facturaId', String(datos.facturaId));
      fd.append('monto', String(datos.monto));
      fd.append('fechaTransferencia', datos.fechaTransferencia);
      fd.append('bancoOrigen', datos.bancoOrigen);
      fd.append('numeroOperacion', datos.numeroOperacion);
      fd.append('comprobante', new File(datos.archivo.uri), datos.archivo.nombre);

      return http.subir<RespuestaSubida>('/facturacion/comprobantes', fd);
    },
  },
};

export default api;
