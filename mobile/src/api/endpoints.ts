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

export interface Hijo {
  vinculoId: number;
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

// ==================================================================
// Llamadas
// ==================================================================

export const api = {
  auth: {
    login: (usuario: string, password: string) =>
      http.postSinAuth<Sesion>('/auth/login', { usuario, password }),

    logout: () => http.post<{ exito: boolean }>('/auth/logout'),

    olvideMiClave: (email: string) =>
      http.postSinAuth<{ exito: boolean; mensaje: string }>('/auth/forgot-password', { email }),

    yo: () => http.get<{ exito: boolean; usuario: { id: number; nombre: string; role: string } }>('/auth/me'),
  },

  /**
   * Portal de tutores. Es el único camino por el que la app lee datos de un
   * alumno: el backend verifica el vínculo antes de devolver nada, así que la
   * app nunca inventa un `alumnoId`, siempre usa los que trajo `misHijos()`.
   */
  padres: {
    misHijos: () => http.get<{ exito: boolean; hijos: Hijo[] }>('/padres/mis-hijos'),

    ficha: (alumnoId: number) =>
      http.get<{ exito: boolean; alumno: Hijo['alumno'] }>(`/padres/mis-hijos/${alumnoId}`),

    deportes: (alumnoId: number) =>
      http.get<RespuestaDeportes>(`/padres/mis-hijos/${alumnoId}/deportes`),

    servicios: (alumnoId: number, anio?: number, mes?: number) =>
      http.get<RespuestaServicios>(`/padres/mis-hijos/${alumnoId}/servicios`, { anio, mes }),

    facturas: (alumnoId: number) =>
      http.get<RespuestaFacturas>(`/padres/mis-hijos/${alumnoId}/facturas`),

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
     * Sube el comprobante de transferencia.
     *
     * El archivo va como `multipart/form-data` con el shape que espera React
     * Native: `{ uri, name, type }`. No se usa `Blob`, que en RN no lee del
     * sistema de archivos.
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
      fd.append('comprobante', {
        uri: datos.archivo.uri,
        name: datos.archivo.nombre,
        type: datos.archivo.tipo,
      } as unknown as Blob);

      return http.subir<RespuestaSubida>('/facturacion/comprobantes', fd);
    },
  },
};

export default api;
