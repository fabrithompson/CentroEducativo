/**
 * Proveedores de mensajería — patrón Strategy.
 *
 * El plan de trabajo lo pide explícitamente: *«Strategy: permite intercambiar el
 * proveedor de mensajería o de geolocalización sin modificar el Módulo
 * Servicios»*. El módulo de avisos depende de la interfaz `ProveedorMensajeria`,
 * nunca de un proveedor concreto.
 *
 * Hay dos implementaciones:
 *
 *  - `ProveedorConsola`: no envía nada, registra por consola. Es el que corre en
 *    desarrollo y en las pruebas. Permite demostrar el circuito completo en la
 *    defensa sin contratar un servicio ni gastar créditos.
 *
 *  - `ProveedorTwilio`: envío real por SMS o WhatsApp. Se activa solo cuando hay
 *    credenciales en el entorno; si faltan, el sistema cae al de consola en
 *    lugar de fallar.
 *
 * Sumar un proveedor nuevo —un gateway local, por ejemplo— es implementar la
 * interfaz y registrarlo en `obtenerProveedor()`. No se toca el servicio.
 */

import { CanalMensaje } from '@prisma/client';

import { logger } from '../../utils/logger';

export interface MensajeSaliente {
  telefono: string;
  texto: string;
  canal: CanalMensaje;
}

export interface ResultadoEnvio {
  exito: boolean;
  /** Identificador que devuelve el proveedor, para conciliar después. */
  referenciaExterna?: string;
  error?: string;
}

export interface ProveedorMensajeria {
  readonly nombre: string;
  /** Canales que sabe manejar. */
  readonly canales: CanalMensaje[];
  enviar(mensaje: MensajeSaliente): Promise<ResultadoEnvio>;
}

// ==================================================================
// Normalización de teléfonos
// ==================================================================

/**
 * Lleva un teléfono argentino al formato E.164 (+549…).
 *
 * En la base los números vienen como los tipeó el personal administrativo:
 * `362-4215880`, `(0362) 15 421-5880`, `+54 9 362 421 5880`. Un proveedor de
 * SMS rechaza todo lo que no sea E.164, así que hay que normalizar antes de
 * enviar, no al cargar: los datos históricos ya están como están.
 *
 * Devuelve `null` si el número no es utilizable, que es información: el plan
 * exige avisar por correo a quien no tenga teléfono válido.
 */
export function normalizarTelefono(crudo: string | null | undefined): string | null {
  if (!crudo) return null;

  // Se conservan los dígitos y un eventual '+' inicial.
  const limpio = crudo.trim().replace(/[^\d+]/g, '');
  if (limpio.length === 0) return null;

  let digitos = limpio.startsWith('+') ? limpio.slice(1) : limpio;

  // Prefijo internacional de Argentina.
  if (digitos.startsWith('54')) {
    digitos = digitos.slice(2);
  }

  // '0' de larga distancia nacional: 0362 → 362.
  if (digitos.startsWith('0')) digitos = digitos.slice(1);

  // '9' de móvil en formato internacional: se quita para volver a agregarlo
  // de forma uniforme más abajo.
  if (digitos.startsWith('9') && digitos.length > 10) digitos = digitos.slice(1);

  // '15' de móvil en formato local: 362 15 4215880 → 362 4215880.
  const codigosArea = [2, 3, 4];
  for (const largo of codigosArea) {
    if (digitos.length > largo + 2 && digitos.slice(largo, largo + 2) === '15') {
      digitos = digitos.slice(0, largo) + digitos.slice(largo + 2);
      break;
    }
  }

  // Un número argentino sin prefijos tiene 10 dígitos: área + abonado.
  if (digitos.length !== 10) return null;
  if (!/^\d{10}$/.test(digitos)) return null;

  return `+549${digitos}`;
}

// ==================================================================
// Proveedor de consola
// ==================================================================

/** Lo que el proveedor de consola fue registrando; lo leen las pruebas. */
const bandejaSalida: MensajeSaliente[] = [];

export function leerBandejaSalida(): readonly MensajeSaliente[] {
  return bandejaSalida;
}

export function limpiarBandejaSalida(): void {
  bandejaSalida.length = 0;
}

export class ProveedorConsola implements ProveedorMensajeria {
  readonly nombre = 'consola';
  readonly canales: CanalMensaje[] = [CanalMensaje.SMS, CanalMensaje.WHATSAPP];

  async enviar(mensaje: MensajeSaliente): Promise<ResultadoEnvio> {
    bandejaSalida.push(mensaje);

    logger.info(
      `[mensajeria:consola] ${mensaje.canal} -> ${mensaje.telefono}\n` +
        `  ${mensaje.texto.replace(/\n/g, '\n  ')}`,
    );

    return {
      exito: true,
      referenciaExterna: `consola-${Date.now()}-${bandejaSalida.length}`,
    };
  }
}

// ==================================================================
// Proveedor Twilio
// ==================================================================

/**
 * Envío real. Usa la API HTTP de Twilio directamente, sin su SDK: es una sola
 * petición `POST` con `application/x-www-form-urlencoded` y no justifica sumar
 * una dependencia con todo su árbol.
 */
export class ProveedorTwilio implements ProveedorMensajeria {
  readonly nombre = 'twilio';
  readonly canales: CanalMensaje[] = [CanalMensaje.SMS, CanalMensaje.WHATSAPP];

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly remitenteSms: string,
    private readonly remitenteWhatsapp: string,
  ) {}

  async enviar(mensaje: MensajeSaliente): Promise<ResultadoEnvio> {
    // WhatsApp exige el prefijo `whatsapp:` en ambos extremos.
    const esWhatsapp = mensaje.canal === CanalMensaje.WHATSAPP;
    const desde = esWhatsapp ? `whatsapp:${this.remitenteWhatsapp}` : this.remitenteSms;
    const hacia = esWhatsapp ? `whatsapp:${mensaje.telefono}` : mensaje.telefono;

    const cuerpo = new URLSearchParams({ From: desde, To: hacia, Body: mensaje.texto });

    try {
      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization:
              'Basic ' + Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: cuerpo.toString(),
          signal: AbortSignal.timeout(15_000),
        },
      );

      const data = (await res.json()) as { sid?: string; message?: string };

      if (!res.ok) {
        return { exito: false, error: data?.message ?? `HTTP ${res.status}` };
      }

      return { exito: true, referenciaExterna: data.sid };
    } catch (err) {
      return {
        exito: false,
        error: err instanceof Error ? err.message : 'Error de red con el proveedor.',
      };
    }
  }
}

// ==================================================================
// Selección del proveedor
// ==================================================================

let proveedorActual: ProveedorMensajeria | null = null;

/**
 * Devuelve el proveedor configurado.
 *
 * Si faltan credenciales cae al de consola en lugar de fallar: un aviso de
 * cambio de horario no puede romper el sistema porque nadie cargó las claves
 * de Twilio.
 */
export function obtenerProveedor(): ProveedorMensajeria {
  if (proveedorActual) return proveedorActual;

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const sms = process.env.TWILIO_FROM_SMS;
  const whatsapp = process.env.TWILIO_FROM_WHATSAPP;

  if (sid && token && sms) {
    proveedorActual = new ProveedorTwilio(sid, token, sms, whatsapp ?? sms);
    logger.info('[mensajeria] proveedor activo: Twilio');
  } else {
    proveedorActual = new ProveedorConsola();
    logger.info(
      '[mensajeria] proveedor activo: consola (sin credenciales de Twilio en el entorno)',
    );
  }

  return proveedorActual;
}

/** Permite inyectar un proveedor distinto. Lo usan las pruebas. */
export function configurarProveedor(proveedor: ProveedorMensajeria | null): void {
  proveedorActual = proveedor;
}
