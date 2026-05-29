// Cliente HTTP mínimo para hablar con la API.
// Inyecta el token JWT y normaliza el manejo de errores.

const TOKEN_KEY = 'ce_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request(path, { method = 'GET', body, isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload;
  if (isForm) {
    payload = body; // FormData: el navegador pone el Content-Type con boundary.
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  const res = await fetch(`/api${path}`, { method, headers, body: payload });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // El backend devuelve { error } o { errores: [...] }.
    const mensaje = data.errores?.join(' ') || data.error || 'Ocurrió un error.';
    throw new Error(mensaje);
  }
  return data;
}

export const api = {
  // Auth
  register: (body) => request('/auth/register', { method: 'POST', body }),
  login: (body) => request('/auth/login', { method: 'POST', body }),
  me: () => request('/auth/me'),
  // Público
  listarOpiniones: () => request('/opiniones'),
  crearOpinion: (body) => request('/opiniones', { method: 'POST', body }),
  crearInscripcion: (body) => request('/inscripciones', { method: 'POST', body }),
  crearContacto: (body) => request('/contacto', { method: 'POST', body }),
  crearPostulacion: (formData) => request('/empleo', { method: 'POST', body: formData, isForm: true }),
  listarNoticias: () => request('/noticias'),
  // Panel
  panelResumen: () => request('/panel/resumen'),
};
