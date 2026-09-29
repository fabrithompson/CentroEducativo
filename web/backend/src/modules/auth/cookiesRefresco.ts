/**
 * Cookies de refresco: una por cuenta.
 *
 * Con una sola cookie `et_refresh`, ingresar con una segunda cuenta en otra
 * pestaña la pisaba. A los 15 minutos, cuando el access token de la primera
 * pestaña vencía, se renovaba con la cookie de la segunda y la pestaña pasaba
 * a ser la otra cuenta sin ningún aviso: un administrador podía terminar
 * operando como docente, o al revés.
 *
 * Con una cookie por cuenta (`et_refresh_<id>`), cada pestaña renueva la suya
 * diciendo qué cuenta es. La app móvil maneja una sola cuenta y no manda el id:
 * para ella se usa la única cookie que haya.
 */

export const PREFIJO_COOKIE = 'et_refresh_';

/** La cookie única de antes. Se acepta mientras quede alguna, y se reemplaza. */
export const COOKIE_VIEJA = 'et_refresh';

export function cookieDeCuenta(usuarioId: number): string {
  return PREFIJO_COOKIE + usuarioId;
}

export interface CookieElegida {
  nombre: string;
  token: string;
}

type Cookies = Record<string, unknown>;

function valor(cookies: Cookies, nombre: string): string | null {
  const v = cookies[nombre];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Nombres de las cookies de refresco por cuenta presentes en el pedido. */
export function cookiesDeCuentas(cookies: Cookies): string[] {
  return Object.keys(cookies).filter((n) => n.startsWith(PREFIJO_COOKIE) && valor(cookies, n) !== null);
}

/**
 * Qué cookie usar para renovar.
 *
 * - Con `usuarioId` (la web): la de esa cuenta. Si no está, la vieja, que la
 *   ruta acepta sólo si el token es de esa misma cuenta.
 * - Sin `usuarioId` (la app móvil, o una pestaña nueva que todavía no sabe qué
 *   cuenta es): la única cookie por cuenta que haya, o la vieja si no hay
 *   ninguna. Con varias cuentas abiertas no se adivina: `null`.
 */
export function elegirCookieRefresco(cookies: Cookies, usuarioId?: number): CookieElegida | null {
  if (usuarioId) {
    const propia = valor(cookies, cookieDeCuenta(usuarioId));
    if (propia) return { nombre: cookieDeCuenta(usuarioId), token: propia };
    const vieja = valor(cookies, COOKIE_VIEJA);
    return vieja ? { nombre: COOKIE_VIEJA, token: vieja } : null;
  }

  const porCuenta = cookiesDeCuentas(cookies);
  if (porCuenta.length === 1) {
    const nombre = porCuenta[0]!;
    return { nombre, token: valor(cookies, nombre)! };
  }
  if (porCuenta.length === 0) {
    const vieja = valor(cookies, COOKIE_VIEJA);
    return vieja ? { nombre: COOKIE_VIEJA, token: vieja } : null;
  }
  return null;
}
