/**
 * Cliente HTTP de la app móvil.
 *
 * Habla con los mismos endpoints que el campus web. **No duplica ninguna regla
 * de negocio**: el tope de 2 deportes, el estado de las facturas, la deuda
 * prorrateada por ítem y la validación de comprobantes los resuelve el backend.
 * Acá sólo se transporta y se tipa.
 *
 * ── Sobre la sesión ─────────────────────────────────────────────────────────
 * El backend entrega un access token de 15 minutos y deja el refresh en una
 * cookie `httpOnly` con `path=/api/auth`. En React Native el manejo de cookies
 * lo hace la capa nativa (NSURLSession en iOS, OkHttp en Android), así que la
 * cookie de refresh viaja sola y no se puede —ni conviene— leer desde JS.
 *
 * El access token sí se guarda, y va a `expo-secure-store`: Keychain en iOS y
 * EncryptedSharedPreferences en Android. **No se usa AsyncStorage**, que guarda
 * en texto plano y en un dispositivo con root queda expuesto.
 * ────────────────────────────────────────────────────────────────────────────
 */

import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const CLAVE_TOKEN = 'et_access_token';
const CLAVE_USUARIO = 'et_usuario';

/**
 * URL de la API.
 *
 * En el emulador de Android `localhost` es el propio emulador, no la máquina de
 * desarrollo: por eso el valor por defecto es `10.0.2.2`, que es como el
 * emulador ve al host. En un dispositivo real hay que poner la IP de la red
 * local en `app.json` → `extra.apiUrl`.
 */
export const API_URL: string =
  (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? 'http://10.0.2.2:4000';

export class ApiError extends Error {
  readonly status: number;
  readonly detalles?: unknown;

  constructor(status: number, mensaje: string, detalles?: unknown) {
    super(mensaje);
    this.name = 'ApiError';
    this.status = status;
    this.detalles = detalles;
  }

  /** `true` si el problema es de red y no del servidor. */
  get esDeRed(): boolean {
    return this.status === 0;
  }
}

// ==================================================================
// Sesión
// ==================================================================

export interface UsuarioSesion {
  id: number;
  nombre: string;
  tipo: string;
  token: string;
}

let tokenEnMemoria: string | null = null;

export async function guardarSesion(usuario: UsuarioSesion): Promise<void> {
  tokenEnMemoria = usuario.token;
  await SecureStore.setItemAsync(CLAVE_TOKEN, usuario.token);
  await SecureStore.setItemAsync(
    CLAVE_USUARIO,
    JSON.stringify({ id: usuario.id, nombre: usuario.nombre, tipo: usuario.tipo }),
  );
}

export async function leerToken(): Promise<string | null> {
  if (tokenEnMemoria) return tokenEnMemoria;
  tokenEnMemoria = await SecureStore.getItemAsync(CLAVE_TOKEN);
  return tokenEnMemoria;
}

export async function leerUsuario(): Promise<Omit<UsuarioSesion, 'token'> | null> {
  const crudo = await SecureStore.getItemAsync(CLAVE_USUARIO);
  if (!crudo) return null;
  try {
    return JSON.parse(crudo) as Omit<UsuarioSesion, 'token'>;
  } catch {
    return null;
  }
}

export async function borrarSesion(): Promise<void> {
  tokenEnMemoria = null;
  await SecureStore.deleteItemAsync(CLAVE_TOKEN);
  await SecureStore.deleteItemAsync(CLAVE_USUARIO);
}

// ==================================================================
// Petición
// ==================================================================

/** Corta una petición colgada: en redes móviles pasa seguido. */
const TIMEOUT_MS = 15_000;

let refrescando: Promise<boolean> | null = null;

/**
 * Renueva el access token usando la cookie de refresh.
 * Las llamadas concurrentes comparten la promesa: si tres pantallas reciben
 * 401 a la vez, se refresca una sola vez.
 */
async function refrescarToken(): Promise<boolean> {
  if (refrescando) return refrescando;

  refrescando = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, { method: 'POST' });
      if (!res.ok) return false;

      const data = (await res.json()) as { exito?: boolean; usuario?: UsuarioSesion };
      if (data?.exito && data.usuario?.token) {
        await guardarSesion(data.usuario);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setTimeout(() => {
        refrescando = null;
      }, 0);
    }
  })();

  return refrescando;
}

/** Se dispara cuando la sesión no se puede recuperar; lo escucha el AuthContext. */
type OyenteSesion = () => void;
const oyentesSesionCaida: OyenteSesion[] = [];

export function alCaerLaSesion(oyente: OyenteSesion): () => void {
  oyentesSesionCaida.push(oyente);
  return () => {
    const i = oyentesSesionCaida.indexOf(oyente);
    if (i >= 0) oyentesSesionCaida.splice(i, 1);
  };
}

interface OpcionesPeticion {
  body?: unknown;
  query?: Record<string, string | number | undefined | null>;
  formData?: FormData;
  sinAuth?: boolean;
}

async function pedir<T>(
  metodo: string,
  ruta: string,
  opciones: OpcionesPeticion = {},
  esReintento = false,
): Promise<T> {
  let url = `${API_URL}/api${ruta}`;

  if (opciones.query) {
    const params = new URLSearchParams();
    for (const [clave, valor] of Object.entries(opciones.query)) {
      if (valor === undefined || valor === null || valor === '') continue;
      params.append(clave, String(valor));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = {};
  if (!opciones.formData) headers['Content-Type'] = 'application/json';

  if (!opciones.sinAuth) {
    const token = await leerToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const controlador = new AbortController();
  const reloj = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      method: metodo,
      headers,
      body: opciones.formData ?? (opciones.body ? JSON.stringify(opciones.body) : undefined),
      signal: controlador.signal,
    });
  } catch (err) {
    clearTimeout(reloj);
    const abortada = err instanceof Error && err.name === 'AbortError';
    throw new ApiError(
      0,
      abortada
        ? 'La conexión tardó demasiado. Revisá tu señal e intentá de nuevo.'
        : 'No pudimos conectarnos con el colegio. Revisá tu conexión a internet.',
    );
  } finally {
    clearTimeout(reloj);
  }

  // Un 401 puede ser sólo el access token vencido: se reintenta una vez.
  if (res.status === 401 && !esReintento && !ruta.startsWith('/auth/')) {
    if (await refrescarToken()) {
      return pedir<T>(metodo, ruta, opciones, true);
    }
    await borrarSesion();
    for (const oyente of oyentesSesionCaida) oyente();
    throw new ApiError(401, 'Tu sesión venció. Iniciá sesión de nuevo.');
  }

  if (res.status === 204) return undefined as T;

  const tipo = res.headers.get('content-type') ?? '';
  if (!tipo.includes('application/json')) {
    const texto = await res.text();
    if (!res.ok) throw new ApiError(res.status, texto || 'Ocurrió un error inesperado.');
    return texto as T;
  }

  const data = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      (data?.message as string) ?? (data?.mensaje as string) ?? 'No se pudo completar la operación.',
      data?.details,
    );
  }

  return data as T;
}

export const http = {
  get: <T>(ruta: string, query?: OpcionesPeticion['query']) => pedir<T>('GET', ruta, { query }),
  post: <T>(ruta: string, body?: unknown) => pedir<T>('POST', ruta, { body }),
  postSinAuth: <T>(ruta: string, body?: unknown) => pedir<T>('POST', ruta, { body, sinAuth: true }),
  subir: <T>(ruta: string, formData: FormData) => pedir<T>('POST', ruta, { formData }),
};
