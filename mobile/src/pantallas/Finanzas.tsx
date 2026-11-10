/**
 * Módulo de Pagos y Finanzas.
 *
 * Tres vistas en una pantalla:
 *   1. Cuotas por solapa: pendientes, vencidas, pagadas, con filtro opcional
 *      por período (facturas y comprobantes asociados en un rango de meses).
 *      Cada cuota abre su comprobante para guardarlo como PDF o compartirlo.
 *   2. Historial de deuda discriminado por ítem.
 *   3. Formulario de pago por transferencia (en `PagoTransferencia.tsx`).
 *
 * La clasificación en solapas y el cálculo de la deuda salen de `dominio/pagos`,
 * y el rango de meses de `dominio/rango`; los dos están testeados. Acá sólo se
 * arma la interfaz.
 *
 * El filtro achica el listado, no el resumen: la deuda total y la deuda por
 * concepto siguen calculándose sobre todas las cuotas. Una familia que mira
 * "marzo a mayo" no tiene que creer que está al día porque la deuda de junio
 * quedó fuera del rango.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Print from 'expo-print';

import api, { type FacturaDetallada, type Hijo, type RespuestaDeuda } from '../api/endpoints';
import { esImpresionCancelada } from '../dominio/errores';
import {
  contarPorSolapa,
  deudaTotal,
  filtrarPorSolapa,
  porcentajePagado,
  type FacturaResumen,
  type Solapa,
} from '../dominio/pagos';
import { fecha, moneda, periodo, textoVencimiento, tipoItem } from '../dominio/formato';
import {
  consultaDeRango,
  mover,
  puedeMover,
  rangoInicial,
  textoRango,
  type Extremo,
  type Mes,
  type RangoMeses,
} from '../dominio/rango';
import { Aviso, Boton, Cargando, Dato, ErrorPantalla, Estado, Progreso, Tarjeta, Vacio } from '../ui/componentes';
import { ALTO_TOCABLE, colores, espaciado, radio, tipografia } from '../ui/tema';

interface Props {
  hijo: Hijo;
  /** Sin `onPagar` la pantalla es de sólo lectura: el estudiante ve sus cuotas pero no paga. */
  onPagar?: (factura: FacturaDetallada) => void;
}

const SOLAPAS: { clave: Solapa; titulo: string }[] = [
  { clave: 'pendientes', titulo: 'Pendientes' },
  { clave: 'vencidas', titulo: 'Vencidas' },
  { clave: 'pagadas', titulo: 'Pagadas' },
];

export function PantallaFinanzas({ hijo, onPagar }: Props) {
  const [facturas, setFacturas] = useState<FacturaDetallada[] | null>(null);
  const [deuda, setDeuda] = useState<RespuestaDeuda | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [solapa, setSolapa] = useState<Solapa>('pendientes');

  // Filtro por período. `null` es "todas las cuotas", como antes de existir el
  // filtro. Las filtradas se guardan con el alumno al que pertenecen para no
  // mostrar, ni por un instante, las del hijo anterior al cambiar de chip.
  const [rango, setRango] = useState<RangoMeses | null>(null);
  const [filtradas, setFiltradas] = useState<{ alumnoId: number; facturas: FacturaDetallada[] } | null>(null);
  const [cargandoFiltro, setCargandoFiltro] = useState(false);
  const [errorFiltro, setErrorFiltro] = useState<string | null>(null);
  // Cada toque en una flecha dispara un pedido. Si las respuestas llegan en
  // otro orden, sólo vale la del último: sin esto, tocar rápido podía dejar en
  // pantalla el listado de un rango que ya no es el elegido.
  const ultimoPedido = useRef(0);

  const alumnoId = hijo.alumno.id;

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [f, d] = await Promise.all([api.padres.facturas(alumnoId), api.padres.deuda(alumnoId)]);
      setFacturas(f.facturas);
      setDeuda(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar tu estado de cuenta.');
    }
  }, [alumnoId]);

  const cargarFiltradas = useCallback(async () => {
    const pedido = ++ultimoPedido.current;
    setErrorFiltro(null);

    if (!rango) {
      setFiltradas(null);
      setCargandoFiltro(false);
      return;
    }

    setCargandoFiltro(true);
    try {
      const r = await api.padres.facturas(alumnoId, consultaDeRango(rango));
      if (pedido === ultimoPedido.current) setFiltradas({ alumnoId, facturas: r.facturas });
    } catch (err) {
      if (pedido === ultimoPedido.current) {
        setErrorFiltro(err instanceof Error ? err.message : 'No pudimos cargar las cuotas de ese período.');
      }
    } finally {
      if (pedido === ultimoPedido.current) setCargandoFiltro(false);
    }
  }, [alumnoId, rango]);

  useEffect(() => {
    setFacturas(null);
    void cargar();
  }, [cargar]);

  useEffect(() => {
    void cargarFiltradas();
  }, [cargarFiltradas]);

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    await Promise.all([cargar(), cargarFiltradas()]);
    setRefrescando(false);
  }, [cargar, cargarFiltradas]);

  // Lo que se lista: todas, o las del período si hay filtro. `null` mientras
  // llega el primer resultado del filtro para este alumno.
  const listado: FacturaDetallada[] | null = rango
    ? filtradas && filtradas.alumnoId === alumnoId
      ? filtradas.facturas
      : null
    : facturas;

  // El resumen de deuda usa siempre todas las cuotas, con o sin filtro.
  const total = useMemo(() => deudaTotal((facturas ?? []).map(aResumen)), [facturas]);

  const resumenes: FacturaResumen[] = useMemo(() => (listado ?? []).map(aResumen), [listado]);

  const conteo = useMemo(() => contarPorSolapa(resumenes), [resumenes]);
  const visibles = useMemo(() => filtrarPorSolapa(resumenes, solapa), [resumenes, solapa]);

  if (error) return <ErrorPantalla mensaje={error} onReintentar={() => void cargar()} />;
  if (!facturas) return <Cargando mensaje="Cargando tu estado de cuenta…" />;

  return (
    <ScrollView
      contentContainerStyle={estilos.scroll}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
    >
      {/* ---------- Resumen ---------- */}
      <Tarjeta style={total > 0 ? estilos.tarjetaDeuda : estilos.tarjetaAlDia}>
        <Text style={estilos.etiquetaGrande}>Deuda total</Text>
        <Text
          style={[estilos.importe, { color: total > 0 ? colores.alerta : colores.ok }]}
          accessibilityLabel={total > 0 ? `Deuda total: ${moneda(total)}` : 'Sin deuda'}
        >
          {total > 0 ? moneda(total) : 'Al día'}
        </Text>
      </Tarjeta>

      {/* ---------- Deuda por ítem ---------- */}
      {deuda && deuda.deudaPorItem.length > 0 ? (
        <Tarjeta>
          <Text style={estilos.tituloTarjeta}>Deuda por concepto</Text>

          {deuda.deudaPorItem.map((item) => (
            <View key={item.tipo} style={estilos.filaItem}>
              <View style={estilos.itemTexto}>
                <Text style={estilos.itemNombre}>{tipoItem(item.tipo)}</Text>
                <Text style={estilos.itemFacturado}>Facturado: {moneda(item.facturado)}</Text>
              </View>
              <Text style={estilos.itemAdeudado}>{moneda(item.adeudado)}</Text>
            </View>
          ))}

          {/* La nota del backend explica que el reparto es prorrateado. No se
              oculta: si el tutor suma los ítems y no le da exacto, tiene que
              saber por qué. */}
          <Text style={estilos.nota}>{deuda.nota}</Text>
        </Tarjeta>
      ) : null}

      {/* ---------- Período ---------- */}
      <FiltroPeriodo rango={rango} cargando={cargandoFiltro} onCambiar={setRango} />

      {/* ---------- Solapas ---------- */}
      <View style={estilos.solapas} accessibilityRole="tablist">
        {SOLAPAS.map((s) => {
          const activa = s.clave === solapa;
          return (
            <Pressable
              key={s.clave}
              onPress={() => setSolapa(s.clave)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activa }}
              accessibilityLabel={`${s.titulo}: ${conteo[s.clave]} cuota(s)`}
              style={[estilos.solapa, activa && estilos.solapaActiva]}
            >
              <Text style={[estilos.solapaTexto, activa && estilos.solapaTextoActivo]}>
                {s.titulo}
              </Text>
              <View style={[estilos.contador, activa && estilos.contadorActivo]}>
                <Text style={[estilos.contadorTexto, activa && estilos.contadorTextoActivo]}>
                  {conteo[s.clave]}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {/* ---------- Listado ---------- */}
      {errorFiltro ? (
        <Tarjeta>
          <Aviso tono="alerta" texto={errorFiltro} />
          <Boton titulo="Reintentar" variante="suave" onPress={() => void cargarFiltradas()} />
        </Tarjeta>
      ) : !listado ? (
        <Tarjeta>
          <Cargando mensaje="Buscando las cuotas del período…" />
        </Tarjeta>
      ) : visibles.length === 0 ? (
        <Tarjeta>
          <Vacio mensaje={mensajeVacio(solapa, rango)} />
        </Tarjeta>
      ) : (
        visibles.map((resumen) => {
          const completa = listado.find((f) => f.id === resumen.id);
          if (!completa) return null;
          return (
            <TarjetaCuota
              key={resumen.id}
              factura={completa}
              onPagar={onPagar ? () => onPagar(completa) : undefined}
            />
          );
        })
      )}

      <View style={{ height: espaciado.xxl }} />
    </ScrollView>
  );
}

function aResumen(f: FacturaDetallada): FacturaResumen {
  return {
    id: f.id,
    numero: f.numero,
    anio: f.anio,
    mes: f.mes,
    total: f.total,
    montoPagado: f.montoPagado,
    saldo: f.saldo,
    estado: f.estado,
    fechaVencimiento: f.fechaVencimiento,
  };
}

/**
 * Con filtro, el mensaje habla del período: "no tenés cuotas vencidas" sería
 * falso si la vencida está fuera del rango elegido.
 */
function mensajeVacio(solapa: Solapa, rango: RangoMeses | null): string {
  if (rango) {
    const cuando = `en ${textoRango(rango)}`;
    if (solapa === 'pagadas') return `No hay cuotas saldadas ${cuando}.`;
    if (solapa === 'vencidas') return `No hay cuotas vencidas ${cuando}.`;
    return `No hay cuotas pendientes ${cuando}.`;
  }
  if (solapa === 'pagadas') return 'Todavía no hay cuotas saldadas.';
  if (solapa === 'vencidas') return 'No tenés cuotas vencidas. ¡Bien ahí!';
  return 'No tenés cuotas pendientes.';
}

// ------------------------------------------------------------------

function FiltroPeriodo({
  rango,
  cargando,
  onCambiar,
}: {
  rango: RangoMeses | null;
  cargando: boolean;
  onCambiar: (r: RangoMeses | null) => void;
}) {
  return (
    <Tarjeta>
      <View style={estilos.filtroCabecera}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.tituloFiltro}>Período</Text>
          <Text style={estilos.filtroAyuda} accessibilityLiveRegion="polite">
            {rango ? `Cuotas de ${textoRango(rango)}` : 'Todas las cuotas'}
          </Text>
        </View>
        {cargando ? (
          <ActivityIndicator color={colores.primario} accessibilityLabel="Buscando las cuotas del período" />
        ) : null}
        <Pressable
          onPress={() => onCambiar(rango ? null : rangoInicial())}
          accessibilityRole="button"
          accessibilityLabel={rango ? 'Quitar el filtro y ver todas las cuotas' : 'Filtrar las cuotas por período'}
          style={estilos.enlace}
        >
          <Text style={estilos.enlaceTexto}>{rango ? 'Ver todas' : 'Filtrar'}</Text>
        </Pressable>
      </View>

      {rango ? (
        <View style={estilos.selectores}>
          <SelectorMes etiqueta="Desde" extremo="desde" rango={rango} onCambiar={onCambiar} />
          <SelectorMes etiqueta="Hasta" extremo="hasta" rango={rango} onCambiar={onCambiar} />
        </View>
      ) : null}
    </Tarjeta>
  );
}

function SelectorMes({
  etiqueta,
  extremo,
  rango,
  onCambiar,
}: {
  etiqueta: string;
  extremo: Extremo;
  rango: RangoMeses;
  onCambiar: (r: RangoMeses) => void;
}) {
  const mes: Mes = rango[extremo];
  const nombre = periodo(mes.anio, mes.mes);

  return (
    <View style={estilos.selectorMes}>
      <Text style={estilos.selectorEtiqueta}>{etiqueta}</Text>
      <View style={estilos.selectorControles}>
        <Flecha
          simbolo="‹"
          accesibilidad={`${etiqueta}: mes anterior a ${nombre}`}
          habilitada={puedeMover(rango, extremo, -1)}
          onPress={() => onCambiar(mover(rango, extremo, -1))}
        />
        <Text style={estilos.selectorValor} accessibilityLabel={`${etiqueta}: ${nombre}`}>
          {nombre}
        </Text>
        <Flecha
          simbolo="›"
          accesibilidad={`${etiqueta}: mes siguiente a ${nombre}`}
          habilitada={puedeMover(rango, extremo, 1)}
          onPress={() => onCambiar(mover(rango, extremo, 1))}
        />
      </View>
    </View>
  );
}

function Flecha({
  simbolo,
  accesibilidad,
  habilitada,
  onPress,
}: {
  simbolo: string;
  accesibilidad: string;
  habilitada: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!habilitada}
      accessibilityRole="button"
      accessibilityLabel={accesibilidad}
      accessibilityState={{ disabled: !habilitada }}
      style={({ pressed }) => [
        estilos.flecha,
        { opacity: !habilitada ? 0.35 : pressed ? 0.7 : 1 },
      ]}
    >
      <Text style={estilos.flechaTexto}>{simbolo}</Text>
    </Pressable>
  );
}

// ------------------------------------------------------------------

function TarjetaCuota({ factura, onPagar }: { factura: FacturaDetallada; onPagar?: () => void }) {
  const [abierta, setAbierta] = useState(false);
  const [abriendo, setAbriendo] = useState(false);

  const resumen = aResumen(factura);

  const pct = porcentajePagado(resumen);
  const puedePagar = onPagar !== undefined && factura.saldo > 0 && factura.estado !== 'ANULADA';

  /**
   * El comprobante es el HTML que emite el backend —el mismo de la web y del
   * mail mensual—, con las transferencias ya acreditadas. Se abre con la vista
   * previa de impresión del sistema: desde ahí se guarda como PDF o se
   * comparte, sin que la app tenga que armar el documento por su cuenta.
   */
  async function verComprobante() {
    setAbriendo(true);
    try {
      const html = await api.facturacion.comprobanteHtml(factura.id);
      await Print.printAsync({ html });
    } catch (err) {
      if (!esImpresionCancelada(err)) {
        Alert.alert(
          'No pudimos abrir el comprobante',
          err instanceof Error ? err.message : 'Intentá de nuevo en unos minutos.',
        );
      }
    } finally {
      setAbriendo(false);
    }
  }

  return (
    <Tarjeta>
      <View style={estilos.cabeceraCuota}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.periodoCuota}>{periodo(factura.anio, factura.mes)}</Text>
          <Text style={estilos.numeroCuota}>{factura.numero}</Text>
        </View>
        <Estado valor={factura.estado} />
      </View>

      <Dato etiqueta="Total" valor={moneda(factura.total)} />
      {factura.montoPagado > 0 ? <Dato etiqueta="Pagado" valor={moneda(factura.montoPagado)} /> : null}
      {factura.saldo > 0 ? <Dato etiqueta="Saldo" valor={moneda(factura.saldo)} /> : null}

      {factura.montoPagado > 0 && factura.saldo > 0 ? (
        <Progreso porcentaje={pct} etiqueta={`Pagado el ${pct} por ciento de la cuota`} />
      ) : null}

      {factura.saldo > 0 ? (
        <Text
          style={[
            estilos.vencimiento,
            factura.estado === 'VENCIDA' && { color: colores.alerta, fontWeight: '600' },
          ]}
        >
          {textoVencimiento(factura.fechaVencimiento)}
        </Text>
      ) : null}

      {factura.estado === 'EN_REVISION' ? (
        <Aviso
          tono="espera"
          texto="Ya cargaste un comprobante. Administración lo está revisando; te avisamos cuando lo valide."
        />
      ) : null}

      {/* Comprobantes rechazados: hay que decir por qué. */}
      {factura.comprobantes
        .filter((c) => c.estado === 'RECHAZADO' && c.motivoRechazo)
        .map((c) => (
          <Aviso key={c.id} tono="alerta" texto={`Comprobante rechazado: ${c.motivoRechazo}`} />
        ))}

      <Pressable
        onPress={() => setAbierta((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: abierta }}
        accessibilityLabel={abierta ? 'Ocultar el detalle de la cuota' : 'Ver el detalle de la cuota'}
        style={estilos.verDetalle}
      >
        <Text style={estilos.verDetalleTexto}>{abierta ? 'Ocultar detalle' : 'Ver detalle'}</Text>
      </Pressable>

      {abierta ? (
        <View style={estilos.detalleAbierto}>
          <Text style={estilos.subtituloDetalle}>Conceptos</Text>
          {factura.items.map((item) => (
            <View key={item.id} style={estilos.filaItem}>
              <View style={estilos.itemTexto}>
                <Text style={estilos.itemNombre}>{tipoItem(item.tipo)}</Text>
                <Text style={estilos.itemFacturado}>{item.descripcion}</Text>
              </View>
              <Text style={estilos.itemAdeudado}>{moneda(item.subtotal)}</Text>
            </View>
          ))}

          {factura.comprobantes.length > 0 ? (
            <>
              <Text style={estilos.subtituloDetalle}>Transferencias cargadas</Text>
              {factura.comprobantes.map((c) => (
                <View key={c.id} style={estilos.filaItem}>
                  <View style={estilos.itemTexto}>
                    <Text style={estilos.itemNombre}>{c.bancoOrigen}</Text>
                    <Text style={estilos.itemFacturado}>
                      {fecha(c.fechaTransferencia)} · Operación {c.numeroOperacion}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: espaciado.xs }}>
                    <Text style={estilos.itemAdeudado}>{moneda(c.monto)}</Text>
                    <Estado valor={c.estado} />
                  </View>
                </View>
              ))}
            </>
          ) : null}
        </View>
      ) : null}

      {puedePagar ? (
        <Boton
          titulo="Pagar por transferencia"
          onPress={onPagar}
          accesibilidad={`Pagar la cuota de ${periodo(factura.anio, factura.mes)}, saldo ${moneda(factura.saldo)}`}
          style={{ marginTop: espaciado.md }}
        />
      ) : null}

      <Boton
        titulo="Ver comprobante"
        variante="suave"
        cargando={abriendo}
        onPress={() => void verComprobante()}
        accesibilidad={`Ver el comprobante de la cuota de ${periodo(factura.anio, factura.mes)} para guardarlo o compartirlo`}
        style={{ marginTop: puedePagar ? espaciado.sm : espaciado.md }}
      />
    </Tarjeta>
  );
}

const estilos = StyleSheet.create({
  scroll: { padding: espaciado.lg, backgroundColor: colores.fondo },
  tarjetaDeuda: { borderLeftWidth: 4, borderLeftColor: colores.alerta },
  tarjetaAlDia: { borderLeftWidth: 4, borderLeftColor: colores.ok },
  etiquetaGrande: { ...tipografia.etiqueta, color: colores.textoSuave, textTransform: 'uppercase' },
  importe: { ...tipografia.importe, marginTop: espaciado.sm },
  tituloTarjeta: { ...tipografia.subtitulo, color: colores.texto, marginBottom: espaciado.md },

  filaItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: espaciado.sm,
    borderBottomWidth: 1,
    borderBottomColor: colores.superficieSuave,
    gap: espaciado.md,
  },
  itemTexto: { flex: 1 },
  itemNombre: { ...tipografia.cuerpo, color: colores.texto, fontWeight: '600' },
  itemFacturado: { fontSize: 12, color: colores.textoSuave, marginTop: 2 },
  itemAdeudado: { ...tipografia.cuerpo, color: colores.texto, fontWeight: '700' },
  nota: { fontSize: 12, color: colores.textoSuave, marginTop: espaciado.md, fontStyle: 'italic' },

  filtroCabecera: { flexDirection: 'row', alignItems: 'center', gap: espaciado.md },
  tituloFiltro: { ...tipografia.subtitulo, color: colores.texto },
  filtroAyuda: { fontSize: 13, color: colores.textoSuave, marginTop: 2 },
  enlace: { minHeight: ALTO_TOCABLE, justifyContent: 'center', paddingHorizontal: espaciado.sm },
  enlaceTexto: { color: colores.primario, fontWeight: '600', fontSize: 14 },
  selectores: { marginTop: espaciado.sm, gap: espaciado.xs },
  selectorMes: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaciado.md,
  },
  selectorEtiqueta: { ...tipografia.cuerpo, color: colores.textoSuave, width: 56 },
  selectorControles: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  selectorValor: {
    ...tipografia.cuerpo,
    flex: 1,
    color: colores.texto,
    fontWeight: '600',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  flecha: {
    width: ALTO_TOCABLE,
    height: ALTO_TOCABLE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.sm,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficieSuave,
  },
  flechaTexto: { fontSize: 24, lineHeight: 28, color: colores.primario, fontWeight: '600' },

  solapas: {
    flexDirection: 'row',
    backgroundColor: colores.superficie,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: espaciado.xs,
    marginBottom: espaciado.md,
    gap: espaciado.xs,
  },
  solapa: {
    flex: 1,
    minHeight: ALTO_TOCABLE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.sm,
    gap: 2,
    paddingVertical: espaciado.sm,
  },
  solapaActiva: { backgroundColor: colores.primario },
  solapaTexto: { fontSize: 13, fontWeight: '600', color: colores.textoSuave },
  solapaTextoActivo: { color: colores.textoInverso },
  contador: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radio.pill,
    backgroundColor: colores.neutroFondo,
  },
  contadorActivo: { backgroundColor: 'rgba(255,255,255,0.25)' },
  contadorTexto: { fontSize: 11, fontWeight: '700', color: colores.textoSuave, textAlign: 'center' },
  contadorTextoActivo: { color: colores.textoInverso },

  cabeceraCuota: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espaciado.md,
    marginBottom: espaciado.sm,
  },
  periodoCuota: { ...tipografia.subtitulo, color: colores.texto, textTransform: 'capitalize' },
  numeroCuota: { fontSize: 12, color: colores.textoSuave },
  vencimiento: { fontSize: 13, color: colores.textoSuave, marginTop: espaciado.xs },

  verDetalle: { minHeight: ALTO_TOCABLE, justifyContent: 'center', marginTop: espaciado.xs },
  verDetalleTexto: { color: colores.primario, fontWeight: '600', fontSize: 14 },
  detalleAbierto: { marginTop: espaciado.sm },
  subtituloDetalle: {
    ...tipografia.etiqueta,
    color: colores.textoSuave,
    textTransform: 'uppercase',
    marginTop: espaciado.md,
    marginBottom: espaciado.xs,
  },
});
