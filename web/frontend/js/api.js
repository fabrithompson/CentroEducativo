/**
 * Cliente de la API v0.4 — módulo ES.
 *
 * Reemplaza a las llamadas sueltas con `fetch` repartidas por los paneles.
 * Centraliza tres cosas que antes estaban duplicadas en cada archivo:
 *   - el header de autorización,
 *   - el reintento con refresh token ante un 401,
 *   - el manejo de errores, para que la UI reciba un mensaje legible.
 *
 * Convive con `campus.js` (que sigue sirviendo a las vistas viejas) y usa el
 * mismo `sessionStorage.token`, así que ambas capas comparten la sesión.
 */

const BASE = '/api';

/** Error con el status HTTP y los detalles de validación de Zod, si los hay. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

function token() {
  try {
    return sessionStorage.getItem('token');
  } catch {
    return null;
  }
}

let refrescando = null;

/**
 * Renueva el access token. Las llamadas concurrentes comparten la misma
 * promesa: si cinco widgets reciben 401 a la vez, se refresca una sola vez.
 */
async function refrescar() {
  if (refrescando) return refrescando;

  refrescando = fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then((r) => r.json())
    .then((data) => {
      if (data?.exito && data.usuario?.token) {
        sessionStorage.setItem('token', data.usuario.token);
        localStorage.setItem('usuarioActual', JSON.stringify(data.usuario));
        return true;
      }
      return false;
    })
    .catch(() => false)
    .finally(() => {
      setTimeout(() => {
        refrescando = null;
      }, 0);
    });

  return refrescando;
}

async function pedir(metodo, ruta, { body, query, esFormData = false } = {}) {
  let url = BASE + ruta;

  if (query) {
    const params = new URLSearchParams();
    for (const [clave, valor] of Object.entries(query)) {
      // Un filtro vacío no se manda: el backend aplica su valor por defecto.
      if (valor === undefined || valor === null || valor === '') continue;
      params.append(clave, String(valor));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers = {};
  if (!esFormData) headers['Content-Type'] = 'application/json';

  const tk = token();
  if (tk) headers.Authorization = `Bearer ${tk}`;

  const opciones = {
    method: metodo,
    headers,
    credentials: 'include',
    body: esFormData ? body : body ? JSON.stringify(body) : undefined,
  };

  let res = await fetch(url, opciones);

  // Un 401 puede ser sólo un access token vencido: se reintenta una vez.
  if (res.status === 401 && !ruta.startsWith('/auth/')) {
    const ok = await refrescar();
    if (ok) {
      const nuevo = token();
      if (nuevo) opciones.headers.Authorization = `Bearer ${nuevo}`;
      res = await fetch(url, opciones);
    }
  }

  if (res.status === 204) return null;

  const tipo = res.headers.get('content-type') ?? '';
  if (!tipo.includes('application/json')) {
    const texto = await res.text();
    if (!res.ok) throw new ApiError(res.status, texto || res.statusText);
    return texto;
  }

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.message || data?.mensaje || 'No se pudo completar la operación.',
      data?.details,
    );
  }

  return data;
}

const get = (ruta, query) => pedir('GET', ruta, { query });
const post = (ruta, body) => pedir('POST', ruta, { body });
const patch = (ruta, body) => pedir('PATCH', ruta, { body });
const del = (ruta, body) => pedir('DELETE', ruta, { body });
const subir = (ruta, formData) => pedir('POST', ruta, { body: formData, esFormData: true });

// ==================================================================
// Endpoints agrupados por módulo
// ==================================================================

export const api = {
  error: ApiError,

  auth: {
    yo: () => get('/auth/me'),
    olvide: (email) => post('/auth/forgot-password', { email }),
    restablecer: (token, password) => post('/auth/reset-password', { token, password }),
    cambiarPassword: (actual, nueva) => post('/auth/change-password', { actual, nueva }),
  },

  alumnos: {
    listar: (filtros) => get('/alumnos', filtros),
    obtener: (id) => get(`/alumnos/${id}`),
    crear: (datos) => post('/alumnos', datos),
    actualizar: (id, datos) => patch(`/alumnos/${id}`, datos),
    darDeBaja: (id, estado) => del(`/alumnos/${id}`, { estado }),
    vincularTutor: (id, datos) => post(`/alumnos/${id}/tutores`, datos),
    desvincularTutor: (vinculoId) => del(`/alumnos/tutores/${vinculoId}`),
  },

  profesores: {
    listar: (filtros) => get('/profesores', filtros),
    obtener: (id) => get(`/profesores/${id}`),
    crear: (datos) => post('/profesores', datos),
    actualizar: (id, datos) => patch(`/profesores/${id}`, datos),
    darDeBaja: (id, estado) => del(`/profesores/${id}`, { estado }),
    asignarMateria: (id, materiaId) => post(`/profesores/${id}/materias`, { materiaId }),
    quitarMateria: (materiaId) => del(`/profesores/materias/${materiaId}`),
  },

  admin: {
    // Informe de retención (RNF-09). Siempre en seco: cuenta qué superó su
    // plazo y nunca borra. El borrado lo hace la tarea programada.
    retencion: () => get('/admin/retencion'),
  },

  // Catálogo académico: niveles, cursos y materias. Es lo que alimenta los
  // desplegables del alta de alumnos (a qué curso) y de profesores (qué
  // materia); sin esto la API pedía ids que no había forma de averiguar.
  academico: {
    niveles: (filtros) => get('/academico/niveles', filtros),
    crearNivel: (datos) => post('/academico/niveles', datos),
    actualizarNivel: (id, datos) => patch(`/academico/niveles/${id}`, datos),
    darDeBajaNivel: (id) => del(`/academico/niveles/${id}`),

    cursos: (filtros) => get('/academico/cursos', filtros),
    crearCurso: (datos) => post('/academico/cursos', datos),
    actualizarCurso: (id, datos) => patch(`/academico/cursos/${id}`, datos),
    darDeBajaCurso: (id) => del(`/academico/cursos/${id}`),

    materias: (filtros) => get('/academico/materias', filtros),
    crearMateria: (datos) => post('/academico/materias', datos),
    actualizarMateria: (id, datos) => patch(`/academico/materias/${id}`, datos),
    darDeBajaMateria: (id) => del(`/academico/materias/${id}`),
  },

  deportes: {
    catalogo: (filtros) => get('/deportes', filtros),
    obtener: (id) => get(`/deportes/${id}`),
    deAlumno: (alumnoId) => get(`/deportes/alumno/${alumnoId}`),
    disponiblesPara: (alumnoId) => get(`/deportes/alumno/${alumnoId}/disponibles`),
    inscribir: (alumnoId, deporteId) => post('/deportes/inscripciones', { alumnoId, deporteId }),
    darDeBaja: (inscripcionId) => del(`/deportes/inscripciones/${inscripcionId}`),
  },

  servicios: {
    recorridos: (periodo) => get('/servicios/transporte/recorridos', periodo),
    contratarTransporte: (datos) => post('/servicios/transporte', datos),
    bajaTransporte: (id) => del(`/servicios/transporte/${id}`),
    planesComedor: (periodo) => get('/servicios/comedor/planes', periodo),
    contratarComedor: (datos) => post('/servicios/comedor', datos),
    bajaComedor: (id) => del(`/servicios/comedor/${id}`),
    deAlumno: (alumnoId, periodo) => get(`/servicios/alumno/${alumnoId}`, periodo),
  },

  padres: {
    misHijos: () => get('/padres/mis-hijos'),
    hijo: (alumnoId) => get(`/padres/mis-hijos/${alumnoId}`),
    deportes: (alumnoId) => get(`/padres/mis-hijos/${alumnoId}/deportes`),
    servicios: (alumnoId, periodo) => get(`/padres/mis-hijos/${alumnoId}/servicios`, periodo),
    facturas: (alumnoId, filtros) => get(`/padres/mis-hijos/${alumnoId}/facturas`, filtros),
    deuda: (alumnoId) => get(`/padres/mis-hijos/${alumnoId}/deuda`),
    calificaciones: (alumnoId) => get(`/padres/mis-hijos/${alumnoId}/calificaciones`),
    asistencia: (alumnoId, rango) => get(`/padres/mis-hijos/${alumnoId}/asistencia`, rango),
  },

  reportes: {
    alumnosPorDeporte: (filtros) => get('/reportes/alumnos-por-deporte', filtros),
    alumnosPorMateria: (filtros) => get('/reportes/alumnos-por-materia', filtros),
    alumnosPorTransporte: (filtros) => get('/reportes/alumnos-por-transporte', filtros),
    pagos: (filtros) => get('/reportes/pagos', filtros),
    ingresos: (filtros) => get('/reportes/ingresos', filtros),
    morosidad: (filtros) => get('/reportes/morosidad', filtros),
  },

  facturacion: {
    listar: (filtros) => get('/facturacion/facturas', filtros),
    obtener: (id) => get(`/facturacion/facturas/${id}`),
    urlComprobante: (id) => `${BASE}/facturacion/facturas/${id}/comprobante`,
    anular: (id, motivo) => post(`/facturacion/facturas/${id}/anular`, { motivo }),
    previsualizar: (periodo) => get('/facturacion/previsualizar', periodo),
    generar: (periodo) => post('/facturacion/generar', periodo),
    subirComprobante: (formData) => subir('/facturacion/comprobantes', formData),
    pendientes: () => get('/facturacion/comprobantes/pendientes'),
    validar: (id, aprobar, motivoRechazo) =>
      post(`/facturacion/comprobantes/${id}/validar`, { aprobar, motivoRechazo }),
    tareas: () => get('/facturacion/tareas'),
    ejecutarTarea: (tarea, opciones) => post(`/facturacion/tareas/${tarea}/ejecutar`, opciones),
    emails: (filtros) => get('/facturacion/emails', filtros),
  },


  accesos: {
    escanear: (datos) => post('/accesos/escanear', datos),
    historial: (filtros) => get('/accesos', filtros),
    deAlumno: (alumnoId) => get(`/accesos/alumno/${alumnoId}`),
  },

  credenciales: {
    obtener: (alumnoId) => get(`/credenciales/alumno/${alumnoId}`),
    revocar: (alumnoId, motivo) => post(`/credenciales/alumno/${alumnoId}/revocar`, { motivo }),
  },
  // Endpoints del bloque 1, que los paneles siguen usando.
  legacy: {
    cursosDelDocente: () => get('/grades/mine'),
    estudiantes: () => get('/students'),
    anuncios: () => get('/announcements'),
  },
};

export default api;
