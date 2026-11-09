/**
 * Comprobantes de pago pendientes (administración).
 *
 * Los padres cargan la transferencia desde la app o la web; Administración la
 * aprueba o la rechaza. Al aprobar, el backend suma el importe a lo pagado y el
 * estado de la factura lo recalcula un disparador; al rechazar, el motivo le
 * llega a la familia. La app sólo muestra la cola y manda la decisión.
 *
 * Se marca cuando el importe no coincide con el saldo: puede ser un pago
 * parcial válido, pero conviene mirarlo antes de aprobar.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { API_URL } from '../api/client';
import api, { type ComprobantePendiente } from '../api/endpoints';
import { fecha, moneda } from '../dominio/formato';
import { Aviso, Boton, CampoTexto, Cargando, Dato, ErrorPantalla, Tarjeta, Vacio } from '../ui/componentes';
import { colores, espaciado, tipografia } from '../ui/tema';

export function PantallaComprobantes() {
  const [lista, setLista] = useState<ComprobantePendiente[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setLista((await api.admin.comprobantesPendientes()).comprobantes);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar los comprobantes.');
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  }, [cargar]);

  if (error) return <ErrorPantalla mensaje={error} onReintentar={() => void cargar()} />;
  if (!lista) return <Cargando mensaje="Cargando comprobantes…" />;

  return (
    <ScrollView
      contentContainerStyle={estilos.scroll}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
      keyboardShouldPersistTaps="handled"
    >
      {lista.length === 0 ? (
        <Tarjeta>
          <Vacio titulo="Sin pendientes" mensaje="No hay comprobantes esperando validación." />
        </Tarjeta>
      ) : (
        <Text style={estilos.resumen}>
          {lista.length} comprobante(s) por revisar · {moneda(lista.reduce((s, c) => s + c.monto, 0))}
        </Text>
      )}
      {lista.map((c) => (
        <TarjetaComprobante key={c.id} c={c} onDecidido={cargar} />
      ))}
      <View style={{ height: espaciado.xxl }} />
    </ScrollView>
  );
}

function TarjetaComprobante({ c, onDecidido }: { c: ComprobantePendiente; onDecidido: () => Promise<void> }) {
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState<'aprobar' | 'rechazar' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decidir(aprobar: boolean) {
    if (!aprobar && !motivo.trim()) {
      setError('Escribí el motivo: le llega a la familia.');
      return;
    }
    setEnviando(aprobar ? 'aprobar' : 'rechazar');
    setError(null);
    try {
      const r = await api.admin.validarComprobante(c.id, aprobar, aprobar ? undefined : motivo.trim());
      Alert.alert(aprobar ? 'Comprobante aprobado' : 'Comprobante rechazado', r.mensaje);
      await onDecidido();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos registrar la decisión.');
    } finally {
      setEnviando(null);
    }
  }

  const archivo = c.archivoUrl.startsWith('http') ? c.archivoUrl : `${API_URL}${c.archivoUrl}`;

  return (
    <Tarjeta>
      <Text style={estilos.alumno}>{c.factura.alumno}</Text>
      <Text style={estilos.suave}>
        {c.factura.curso} · Legajo {c.factura.legajo} · Cuota {c.factura.periodo}
      </Text>
      <Dato etiqueta="Importe transferido" valor={moneda(c.monto)} />
      <Dato etiqueta="Saldo de la cuota" valor={moneda(c.factura.saldo)} />
      <Dato etiqueta="Banco" valor={c.bancoOrigen} />
      <Dato etiqueta="Operación" valor={c.numeroOperacion} />
      <Dato etiqueta="Fecha de la transferencia" valor={fecha(c.fechaTransferencia)} />
      {c.subidoPor ? <Dato etiqueta="Cargado por" valor={c.subidoPor.nombre} /> : null}

      {!c.coincideConSaldo ? (
        <Aviso tono="espera" texto="El importe no coincide con el saldo de la cuota: puede ser un pago parcial." />
      ) : null}

      <Boton
        titulo="Ver comprobante adjunto"
        variante="suave"
        onPress={() => void Linking.openURL(archivo)}
        style={{ marginTop: espaciado.sm }}
      />

      {rechazando ? (
        <View style={{ marginTop: espaciado.md }}>
          <CampoTexto etiqueta="Motivo del rechazo" valor={motivo} onChange={setMotivo} multilinea />
          {error ? <Aviso tono="alerta" texto={error} /> : null}
          <View style={estilos.botones}>
            <Boton
              titulo="Rechazar"
              variante="peligro"
              cargando={enviando === 'rechazar'}
              onPress={() => void decidir(false)}
              style={{ flex: 1 }}
            />
            <Boton titulo="Cancelar" variante="suave" onPress={() => setRechazando(false)} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <>
          {error ? <Aviso tono="alerta" texto={error} /> : null}
          <View style={[estilos.botones, { marginTop: espaciado.md }]}>
            <Boton
              titulo="Aprobar"
              cargando={enviando === 'aprobar'}
              onPress={() => void decidir(true)}
              accesibilidad={`Aprobar la transferencia de ${moneda(c.monto)} de ${c.factura.alumno}`}
              style={{ flex: 1 }}
            />
            <Boton titulo="Rechazar" variante="suave" onPress={() => setRechazando(true)} style={{ flex: 1 }} />
          </View>
        </>
      )}
    </Tarjeta>
  );
}

const estilos = StyleSheet.create({
  scroll: { padding: espaciado.lg, backgroundColor: colores.fondo },
  resumen: { ...tipografia.subtitulo, color: colores.texto, marginBottom: espaciado.md },
  alumno: { ...tipografia.subtitulo, color: colores.texto },
  suave: { ...tipografia.cuerpo, color: colores.textoSuave, marginBottom: espaciado.sm },
  botones: { flexDirection: 'row', gap: espaciado.sm },
});
