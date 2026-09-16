/**
 * Selección de ítems a pagar y cálculo del monto.
 *
 * Módulo puro: no importa React, ni React Native, ni el cliente HTTP. Es la
 * única lógica de cálculo que vive en la app, y existe por un motivo concreto
 * que conviene entender antes de tocarla.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IMPORTANTE — cómo se relaciona esto con el backend
 *
 * En el backend, un `ComprobantePago` se asocia a una **factura entera**, no a
 * ítems sueltos: `montoPagado` acumula los comprobantes aprobados y el estado
 * de la factura lo deriva un trigger. La deuda por ítem que expone
 * `/api/padres/mis-hijos/:id/deuda` está **prorrateada** sobre el saldo, porque
 * un pago parcial no se imputa a un concepto puntual.
 *
 * Por lo tanto, el selector de ítems de esta pantalla es una **ayuda para armar
 * el importe**, no una imputación. La app suma lo que el tutor marcó y manda un
 * comprobante por ese monto contra la factura. Quien decide cómo queda la
 * factura sigue siendo el backend.
 *
 * La pantalla se lo dice al usuario con todas las letras: no hay que inferirlo
 * del código.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** Tipos de ítem que emite el backend (enum `TipoItemFactura`). */
export type TipoItem =
  | 'MATRICULA'
  | 'CUOTA'
  | 'TRANSPORTE'
  | 'COMEDOR'
  | 'DEPORTE'
  | 'RECARGO'
  | 'OTRO';

export interface ItemFactura {
  id: number;
  tipo: TipoItem;
  descripcion: string;
  subtotal: number;
}

export interface ItemSeleccionable extends ItemFactura {
  seleccionado: boolean;
}

/** Redondeo a dos decimales. Evita que 0.1 + 0.2 llegue al backend como 0.30000000000000004. */
export function redondear(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Suma de los ítems marcados. */
export function calcularMonto(items: readonly ItemSeleccionable[]): number {
  return redondear(items.filter((i) => i.seleccionado).reduce((s, i) => s + i.subtotal, 0));
}

export function hayAlgoSeleccionado(items: readonly ItemSeleccionable[]): boolean {
  return items.some((i) => i.seleccionado);
}

/** Alterna un ítem sin mutar el arreglo original. */
export function alternarItem(
  items: readonly ItemSeleccionable[],
  id: number,
): ItemSeleccionable[] {
  return items.map((i) => (i.id === id ? { ...i, seleccionado: !i.seleccionado } : i));
}

export function marcarTodos(
  items: readonly ItemSeleccionable[],
  seleccionado: boolean,
): ItemSeleccionable[] {
  return items.map((i) => ({ ...i, seleccionado }));
}

/** Prepara los ítems de una factura con todo marcado: pagar el total es lo habitual. */
export function prepararSeleccion(items: readonly ItemFactura[]): ItemSeleccionable[] {
  return items.map((i) => ({ ...i, seleccionado: true }));
}

// ==================================================================
// Validación previa al envío
// ==================================================================

export interface DatosComprobante {
  monto: number;
  fechaTransferencia: string; // YYYY-MM-DD
  bancoOrigen: string;
  numeroOperacion: string;
  archivo: { uri: string; nombre: string; tipo: string } | null;
}

export interface ResultadoValidacion {
  valido: boolean;
  errores: Partial<Record<keyof DatosComprobante, string>>;
}

const FORMATO_FECHA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Valida el formulario antes de gastar una subida.
 *
 * Reproduce las validaciones del backend a propósito, pero **sólo las de
 * formato**: importe positivo, fecha no futura, campos obligatorios. Las reglas
 * de negocio —que la factura admita pagos, que el número de operación no esté
 * repetido, que el importe no exceda el saldo— las resuelve el servidor, que es
 * el único que tiene los datos para hacerlo.
 */
export function validarComprobante(
  datos: DatosComprobante,
  hoy: Date = new Date(),
): ResultadoValidacion {
  const errores: ResultadoValidacion['errores'] = {};

  if (!Number.isFinite(datos.monto) || datos.monto <= 0) {
    errores.monto = 'Elegí al menos un ítem para pagar.';
  }

  if (!FORMATO_FECHA.test(datos.fechaTransferencia)) {
    errores.fechaTransferencia = 'Indicá la fecha con el formato AAAA-MM-DD.';
  } else {
    const fecha = new Date(`${datos.fechaTransferencia}T00:00:00.000Z`);
    if (Number.isNaN(fecha.getTime())) {
      errores.fechaTransferencia = 'La fecha no es válida.';
    } else {
      const limite = new Date(
        Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate(), 23, 59, 59, 999),
      );
      if (fecha > limite) {
        errores.fechaTransferencia = 'La fecha de transferencia no puede ser futura.';
      }
    }
  }

  if (datos.bancoOrigen.trim().length < 2) {
    errores.bancoOrigen = 'Indicá desde qué banco transferiste.';
  }

  if (datos.numeroOperacion.trim().length < 3) {
    errores.numeroOperacion = 'Indicá el número de operación del comprobante.';
  }

  if (!datos.archivo) {
    // Regla de negocio: no se acepta efectivo, todo pago necesita respaldo.
    errores.archivo = 'Adjuntá la foto o el PDF del comprobante bancario.';
  }

  return { valido: Object.keys(errores).length === 0, errores };
}

// ==================================================================
// Clasificación de cuotas
// ==================================================================

export type EstadoFactura =
  | 'PENDIENTE'
  | 'EN_REVISION'
  | 'PARCIAL'
  | 'PAGADA'
  | 'VENCIDA'
  | 'ANULADA';

export type Solapa = 'pendientes' | 'vencidas' | 'pagadas';

export interface FacturaResumen {
  id: number;
  numero: string;
  anio: number;
  mes: number;
  total: number;
  montoPagado: number;
  saldo: number;
  estado: EstadoFactura;
  fechaVencimiento: string;
}

/**
 * A qué solapa pertenece una factura.
 *
 * Se usa el `estado` que calculó el backend y no una regla propia: si la app
 * decidiera por su cuenta qué está vencido, tarde o temprano mostraría algo
 * distinto de lo que dice el sistema.
 *
 * `ANULADA` no cae en ninguna solapa: no es deuda ni es un pago.
 */
export function solapaDe(factura: FacturaResumen): Solapa | null {
  switch (factura.estado) {
    case 'PAGADA':
      return 'pagadas';
    case 'VENCIDA':
      return 'vencidas';
    case 'PENDIENTE':
    case 'EN_REVISION':
    case 'PARCIAL':
      return 'pendientes';
    case 'ANULADA':
      return null;
  }
}

export function filtrarPorSolapa(
  facturas: readonly FacturaResumen[],
  solapa: Solapa,
): FacturaResumen[] {
  return facturas.filter((f) => solapaDe(f) === solapa);
}

export function contarPorSolapa(
  facturas: readonly FacturaResumen[],
): Record<Solapa, number> {
  return {
    pendientes: filtrarPorSolapa(facturas, 'pendientes').length,
    vencidas: filtrarPorSolapa(facturas, 'vencidas').length,
    pagadas: filtrarPorSolapa(facturas, 'pagadas').length,
  };
}

/** Deuda viva: suma de saldos de todo lo que no está pagado ni anulado. */
export function deudaTotal(facturas: readonly FacturaResumen[]): number {
  return redondear(
    facturas
      .filter((f) => f.estado !== 'PAGADA' && f.estado !== 'ANULADA')
      .reduce((s, f) => s + f.saldo, 0),
  );
}

/** Porcentaje cubierto de una factura, para la barra de progreso. */
export function porcentajePagado(factura: FacturaResumen): number {
  if (factura.total <= 0) return 0;
  return Math.min(100, Math.round((factura.montoPagado / factura.total) * 100));
}
