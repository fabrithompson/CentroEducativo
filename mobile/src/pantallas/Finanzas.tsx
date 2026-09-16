/**
 * Módulo de Pagos y Finanzas.
 *
 * Tres vistas en una pantalla:
 *   1. Cuotas por solapa: pendientes, vencidas, pagadas.
 *   2. Historial de deuda discriminado por ítem.
 *   3. Formulario de pago por transferencia (en `PagoTransferencia.tsx`).
 *
 * La clasificación en solapas y el cálculo de la deuda salen de `dominio/pagos`,
 * que está testeado. Acá sólo se arma la interfaz.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import api, { type FacturaDetallada, type Hijo, type RespuestaDeuda } from '../api/endpoints';
import {
  contarPorSolapa,
  deudaTotal,
  filtrarPorSolapa,
  porcentajePagado,
  type FacturaResumen,
  type Solapa,
} from '../dominio/pagos';
import { moneda, periodo, textoVencimiento, tipoItem } from '../dominio/formato';
import { Aviso, Boton, Cargando, Dato, ErrorPantalla, Estado, Progreso, Tarjeta, Vacio } from '../ui/componentes';
import { ALTO_TOCABLE, colores, espaciado, radio, tipografia } from '../ui/tema';

interface Props {
  hijo: Hijo;
  onPagar: (factura: FacturaDetallada) => void;
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

  useEffect(() => {
    setFacturas(null);
    void cargar();
  }, [cargar]);

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  }, [cargar]);

  const resumenes: FacturaResumen[] = useMemo(
    () =>
      (facturas ?? []).map((f) => ({
        id: f.id,
        numero: f.numero,
        anio: f.anio,
        mes: f.mes,
        total: f.total,
        montoPagado: f.montoPagado,
        saldo: f.saldo,
        estado: f.estado,
        fechaVencimiento: f.fechaVencimiento,
      })),
    [facturas],
  );

  const conteo = useMemo(() => contarPorSolapa(resumenes), [resumenes]);
  const visibles = useMemo(() => filtrarPorSolapa(resumenes, solapa), [resumenes, solapa]);

  if (error) return <ErrorPantalla mensaje={error} onReintentar={() => void cargar()} />;
  if (!facturas) return <Cargando mensaje="Cargando tu estado de cuenta…" />;

  const total = deudaTotal(resumenes);

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
      {visibles.length === 0 ? (
        <Tarjeta>
          <Vacio
            mensaje={
              solapa === 'pagadas'
                ? 'Todavía no hay cuotas saldadas.'
                : solapa === 'vencidas'
                  ? 'No tenés cuotas vencidas. ¡Bien ahí!'
                  : 'No tenés cuotas pendientes.'
            }
          />
        </Tarjeta>
      ) : (
        visibles.map((resumen) => {
          const completa = facturas.find((f) => f.id === resumen.id);
          if (!completa) return null;
          return <TarjetaCuota key={resumen.id} factura={completa} onPagar={() => onPagar(completa)} />;
        })
      )}

      <View style={{ height: espaciado.xxl }} />
    </ScrollView>
  );
}

// ------------------------------------------------------------------

function TarjetaCuota({ factura, onPagar }: { factura: FacturaDetallada; onPagar: () => void }) {
  const [abierta, setAbierta] = useState(false);

  const resumen: FacturaResumen = {
    id: factura.id,
    numero: factura.numero,
    anio: factura.anio,
    mes: factura.mes,
    total: factura.total,
    montoPagado: factura.montoPagado,
    saldo: factura.saldo,
    estado: factura.estado,
    fechaVencimiento: factura.fechaVencimiento,
  };

  const pct = porcentajePagado(resumen);
  const puedePagar = factura.saldo > 0 && factura.estado !== 'ANULADA';

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
                    <Text style={estilos.itemFacturado}>Operación {c.numeroOperacion}</Text>
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
