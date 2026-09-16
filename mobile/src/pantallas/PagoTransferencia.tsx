/**
 * Formulario de pago por transferencia.
 *
 * Tres bloques:
 *   1. Datos bancarios del colegio, con botón para copiar el CBU y el alias.
 *   2. Selector de ítems a pagar, con el monto calculándose al tocar.
 *   3. Carga del comprobante (cámara, galería o PDF) y envío.
 *
 * ── Una aclaración que la pantalla también le hace al usuario ───────────────
 * El backend asocia cada comprobante a una **factura entera**, no a ítems
 * sueltos: `montoPagado` acumula y el estado lo deriva un trigger. El selector
 * de ítems sirve para **armar el importe**, no para imputar el pago a un
 * concepto. Por eso la pantalla lo dice con todas las letras en lugar de dejar
 * que el tutor lo suponga.
 * ────────────────────────────────────────────────────────────────────────────
 */

import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import api, { type FacturaDetallada } from '../api/endpoints';
import {
  alternarItem,
  calcularMonto,
  hayAlgoSeleccionado,
  marcarTodos,
  prepararSeleccion,
  validarComprobante,
  type DatosComprobante,
} from '../dominio/pagos';
import { hoyISO, moneda, periodo, tipoItem } from '../dominio/formato';
import { Aviso, Boton, Dato, Tarjeta } from '../ui/componentes';
import { ALTO_TOCABLE, colores, espaciado, radio, tipografia } from '../ui/tema';

/** Datos bancarios del colegio. Coinciden con los de la factura del backend. */
const BANCO = {
  titular: 'Centro Educativo "Transformar para educar"',
  cuit: '30-71234567-9',
  banco: 'Banco de la Nación Argentina',
  cbu: '0110599520000012345678',
  alias: 'EDUCAR.TRANSFORMAR.CTA',
};

interface Props {
  factura: FacturaDetallada;
  onListo: () => void;
  onCancelar: () => void;
}

type Archivo = { uri: string; nombre: string; tipo: string };

export function PantallaPago({ factura, onListo, onCancelar }: Props) {
  const [items, setItems] = useState(() => prepararSeleccion(factura.items));
  const [fechaTransferencia, setFecha] = useState(hoyISO());
  const [bancoOrigen, setBanco] = useState('');
  const [numeroOperacion, setOperacion] = useState('');
  const [archivo, setArchivo] = useState<Archivo | null>(null);

  const [errores, setErrores] = useState<Partial<Record<keyof DatosComprobante, string>>>({});
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const monto = useMemo(() => calcularMonto(items), [items]);
  const todosMarcados = items.every((i) => i.seleccionado);

  async function copiar(texto: string, queCosa: string) {
    await Clipboard.setStringAsync(texto);
    Alert.alert('Copiado', `${queCosa} copiado al portapapeles.`);
  }

  // ---------- Elección del archivo ----------

  async function sacarFoto() {
    const permiso = await ImagePicker.requestCameraPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert(
        'Permiso necesario',
        'Para fotografiar el comprobante necesitamos acceso a la cámara. Podés habilitarlo desde los ajustes del teléfono.',
      );
      return;
    }

    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (!r.canceled && r.assets[0]) {
      const a = r.assets[0];
      setArchivo({
        uri: a.uri,
        nombre: a.fileName ?? `comprobante-${Date.now()}.jpg`,
        tipo: a.mimeType ?? 'image/jpeg',
      });
      setErrores((e) => ({ ...e, archivo: undefined }));
    }
  }

  async function elegirDeGaleria() {
    const permiso = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permiso.granted) {
      Alert.alert(
        'Permiso necesario',
        'Para adjuntar una imagen necesitamos acceso a tus fotos. Podés habilitarlo desde los ajustes del teléfono.',
      );
      return;
    }

    const r = await ImagePicker.launchImageLibraryAsync({ quality: 0.7 });
    if (!r.canceled && r.assets[0]) {
      const a = r.assets[0];
      setArchivo({
        uri: a.uri,
        nombre: a.fileName ?? `comprobante-${Date.now()}.jpg`,
        tipo: a.mimeType ?? 'image/jpeg',
      });
      setErrores((e) => ({ ...e, archivo: undefined }));
    }
  }

  async function elegirPdf() {
    const r = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });

    if (!r.canceled && r.assets[0]) {
      const a = r.assets[0];
      setArchivo({
        uri: a.uri,
        nombre: a.name,
        tipo: a.mimeType ?? 'application/pdf',
      });
      setErrores((e) => ({ ...e, archivo: undefined }));
    }
  }

  // ---------- Envío ----------

  async function enviar() {
    setErrorEnvio(null);

    const datos: DatosComprobante = {
      monto,
      fechaTransferencia,
      bancoOrigen,
      numeroOperacion,
      archivo,
    };

    const validacion = validarComprobante(datos);
    setErrores(validacion.errores);
    if (!validacion.valido) return;

    setEnviando(true);
    try {
      const r = await api.facturacion.subirComprobante({
        facturaId: factura.id,
        monto,
        fechaTransferencia,
        bancoOrigen: bancoOrigen.trim(),
        numeroOperacion: numeroOperacion.trim(),
        archivo: archivo!,
      });

      Alert.alert(
        'Comprobante enviado',
        r.advertencia ? `${r.mensaje}\n\n${r.advertencia}` : r.mensaje,
        [{ text: 'Entendido', onPress: onListo }],
      );
    } catch (err) {
      // El backend rechaza duplicados, importes inválidos y facturas saldadas.
      // Su mensaje es más preciso que cualquier cosa que pueda inventar la app.
      setErrorEnvio(err instanceof Error ? err.message : 'No pudimos enviar el comprobante.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled">
        {/* ---------- Qué se está pagando ---------- */}
        <Tarjeta>
          <Text style={estilos.titulo}>Cuota de {periodo(factura.anio, factura.mes)}</Text>
          <Text style={estilos.numero}>{factura.numero}</Text>
          <Dato etiqueta="Total de la cuota" valor={moneda(factura.total)} />
          {factura.montoPagado > 0 ? <Dato etiqueta="Ya pagado" valor={moneda(factura.montoPagado)} /> : null}
          <Dato etiqueta="Saldo pendiente" valor={moneda(factura.saldo)} />
        </Tarjeta>

        {/* ---------- 1. Datos bancarios ---------- */}
        <Tarjeta>
          <Text style={estilos.tituloSeccion}>1. Transferí a esta cuenta</Text>

          <Aviso
            tono="neutro"
            texto="El colegio no acepta efectivo. Todos los pagos se hacen por transferencia bancaria."
          />

          <Dato etiqueta="Banco" valor={BANCO.banco} />
          <Dato etiqueta="Titular" valor={BANCO.titular} />
          <Dato etiqueta="CUIT" valor={BANCO.cuit} />

          <View style={estilos.filaCopiable}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.etiquetaCopia}>CBU</Text>
              <Text style={estilos.valorCopia} selectable>
                {BANCO.cbu}
              </Text>
            </View>
            <Pressable
              onPress={() => void copiar(BANCO.cbu, 'CBU')}
              accessibilityRole="button"
              accessibilityLabel="Copiar el CBU al portapapeles"
              style={estilos.botonCopiar}
            >
              <Text style={estilos.botonCopiarTexto}>Copiar</Text>
            </Pressable>
          </View>

          <View style={estilos.filaCopiable}>
            <View style={{ flex: 1 }}>
              <Text style={estilos.etiquetaCopia}>Alias</Text>
              <Text style={estilos.valorCopia} selectable>
                {BANCO.alias}
              </Text>
            </View>
            <Pressable
              onPress={() => void copiar(BANCO.alias, 'Alias')}
              accessibilityRole="button"
              accessibilityLabel="Copiar el alias al portapapeles"
              style={estilos.botonCopiar}
            >
              <Text style={estilos.botonCopiarTexto}>Copiar</Text>
            </Pressable>
          </View>
        </Tarjeta>

        {/* ---------- 2. Selector de ítems ---------- */}
        <Tarjeta>
          <View style={estilos.cabeceraItems}>
            <Text style={estilos.tituloSeccion}>2. ¿Qué vas a pagar?</Text>
            <Pressable
              onPress={() => setItems((i) => marcarTodos(i, !todosMarcados))}
              accessibilityRole="button"
              accessibilityLabel={todosMarcados ? 'Desmarcar todos los conceptos' : 'Marcar todos los conceptos'}
              style={estilos.botonTodos}
            >
              <Text style={estilos.enlaceTexto}>{todosMarcados ? 'Ninguno' : 'Todos'}</Text>
            </Pressable>
          </View>

          {items.map((item) => (
            <Pressable
              key={item.id}
              onPress={() => setItems((is) => alternarItem(is, item.id))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.seleccionado }}
              accessibilityLabel={`${tipoItem(item.tipo)}, ${item.descripcion}, ${moneda(item.subtotal)}`}
              style={estilos.filaSeleccion}
            >
              <View style={[estilos.casilla, item.seleccionado && estilos.casillaMarcada]}>
                {item.seleccionado ? <Text style={estilos.tilde}>✓</Text> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={estilos.itemNombre}>{tipoItem(item.tipo)}</Text>
                <Text style={estilos.itemDescripcion}>{item.descripcion}</Text>
              </View>
              <Text style={estilos.itemImporte}>{moneda(item.subtotal)}</Text>
            </Pressable>
          ))}

          <View style={estilos.totalCaja}>
            <Text style={estilos.totalEtiqueta}>Monto a transferir</Text>
            <Text
              style={estilos.totalImporte}
              accessibilityLiveRegion="polite"
              accessibilityLabel={`Monto a transferir: ${moneda(monto)}`}
            >
              {moneda(monto)}
            </Text>
          </View>

          {errores.monto ? <Text style={estilos.error}>{errores.monto}</Text> : null}

          {/* Cómo se imputa el pago: se explica, no se deja suponer. */}
          <Text style={estilos.nota}>
            El pago se registra sobre la cuota completa. Elegir conceptos te ayuda a calcular
            cuánto transferir; Administración aplica el importe al saldo de la cuota.
          </Text>

          {hayAlgoSeleccionado(items) && monto < factura.saldo ? (
            <Aviso
              tono="espera"
              texto={`Vas a pagar ${moneda(monto)} de un saldo de ${moneda(factura.saldo)}. Va a quedar un resto de ${moneda(factura.saldo - monto)}.`}
            />
          ) : null}
        </Tarjeta>

        {/* ---------- 3. Comprobante ---------- */}
        <Tarjeta>
          <Text style={estilos.tituloSeccion}>3. Cargá el comprobante</Text>

          <Campo
            etiqueta="Fecha de la transferencia"
            valor={fechaTransferencia}
            onChange={setFecha}
            placeholder="AAAA-MM-DD"
            error={errores.fechaTransferencia}
          />

          <Campo
            etiqueta="Banco desde el que transferiste"
            valor={bancoOrigen}
            onChange={setBanco}
            placeholder="Banco Nación"
            error={errores.bancoOrigen}
          />

          <Campo
            etiqueta="Número de operación"
            valor={numeroOperacion}
            onChange={setOperacion}
            placeholder="NAC-7781204"
            error={errores.numeroOperacion}
          />

          <Text style={estilos.campoEtiqueta}>Foto o PDF del comprobante</Text>

          {archivo ? (
            <View style={estilos.archivoElegido}>
              <Text style={estilos.archivoNombre} numberOfLines={1}>
                {archivo.nombre}
              </Text>
              <Pressable
                onPress={() => setArchivo(null)}
                accessibilityRole="button"
                accessibilityLabel="Quitar el archivo adjunto"
                style={estilos.botonCopiar}
              >
                <Text style={estilos.botonCopiarTexto}>Quitar</Text>
              </Pressable>
            </View>
          ) : (
            <View style={estilos.botonesArchivo}>
              <Boton titulo="Sacar foto" variante="suave" onPress={() => void sacarFoto()} style={estilos.botonArchivo} />
              <Boton titulo="Galería" variante="suave" onPress={() => void elegirDeGaleria()} style={estilos.botonArchivo} />
              <Boton titulo="Archivo" variante="suave" onPress={() => void elegirPdf()} style={estilos.botonArchivo} />
            </View>
          )}

          {errores.archivo ? <Text style={estilos.error}>{errores.archivo}</Text> : null}

          {errorEnvio ? (
            <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
              <Aviso tono="alerta" texto={errorEnvio} />
            </View>
          ) : null}

          <Boton
            titulo="Enviar comprobante"
            onPress={() => void enviar()}
            cargando={enviando}
            style={{ marginTop: espaciado.md }}
          />

          <Boton
            titulo="Cancelar"
            variante="suave"
            onPress={onCancelar}
            style={{ marginTop: espaciado.sm }}
          />

          <Text style={estilos.nota}>
            Una vez enviado, Administración lo valida y te avisamos. Podés pagar en varias
            transferencias: los importes aprobados se van acumulando.
          </Text>
        </Tarjeta>

        <View style={{ height: espaciado.xxl }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ------------------------------------------------------------------

function Campo({
  etiqueta,
  valor,
  onChange,
  placeholder,
  error,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
}) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.campoEtiqueta}>{etiqueta}</Text>
      <TextInput
        style={[estilos.input, error ? estilos.inputError : null]}
        value={valor}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colores.textoSuave}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={etiqueta}
        accessibilityHint={error}
      />
      {error ? <Text style={estilos.error}>{error}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  scroll: { padding: espaciado.lg, backgroundColor: colores.fondo },
  titulo: { ...tipografia.subtitulo, color: colores.texto, textTransform: 'capitalize' },
  numero: { fontSize: 12, color: colores.textoSuave, marginBottom: espaciado.sm },
  tituloSeccion: { ...tipografia.subtitulo, color: colores.primario, marginBottom: espaciado.md },

  filaCopiable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.md,
    paddingVertical: espaciado.sm,
    borderTopWidth: 1,
    borderTopColor: colores.superficieSuave,
  },
  etiquetaCopia: { ...tipografia.etiqueta, color: colores.textoSuave },
  valorCopia: { fontSize: 15, color: colores.texto, fontWeight: '700', letterSpacing: 0.4 },
  botonCopiar: {
    minHeight: ALTO_TOCABLE,
    paddingHorizontal: espaciado.lg,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colores.primario,
    borderRadius: radio.sm,
  },
  botonCopiarTexto: { color: colores.primario, fontWeight: '600' },

  cabeceraItems: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  botonTodos: { minHeight: ALTO_TOCABLE, justifyContent: 'center', paddingHorizontal: espaciado.sm },
  enlaceTexto: { color: colores.primario, fontWeight: '600', fontSize: 14 },

  filaSeleccion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.md,
    minHeight: ALTO_TOCABLE + 8,
    paddingVertical: espaciado.sm,
    borderBottomWidth: 1,
    borderBottomColor: colores.superficieSuave,
  },
  casilla: {
    width: 26,
    height: 26,
    borderRadius: radio.sm,
    borderWidth: 2,
    borderColor: colores.borde,
    alignItems: 'center',
    justifyContent: 'center',
  },
  casillaMarcada: { backgroundColor: colores.primario, borderColor: colores.primario },
  tilde: { color: colores.textoInverso, fontWeight: '700', fontSize: 15 },
  itemNombre: { ...tipografia.cuerpo, color: colores.texto, fontWeight: '600' },
  itemDescripcion: { fontSize: 12, color: colores.textoSuave, marginTop: 2 },
  itemImporte: { ...tipografia.cuerpo, color: colores.texto, fontWeight: '700' },

  totalCaja: {
    backgroundColor: colores.primario,
    borderRadius: radio.md,
    padding: espaciado.lg,
    marginTop: espaciado.md,
  },
  totalEtiqueta: { ...tipografia.etiqueta, color: colores.textoInverso, opacity: 0.85 },
  totalImporte: { ...tipografia.importe, color: colores.textoInverso, marginTop: espaciado.xs },

  campo: { gap: espaciado.xs, marginBottom: espaciado.md },
  campoEtiqueta: { ...tipografia.etiqueta, color: colores.textoSuave },
  input: {
    minHeight: ALTO_TOCABLE,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.sm,
    paddingHorizontal: espaciado.md,
    fontSize: 16,
    color: colores.texto,
    backgroundColor: colores.superficie,
  },
  inputError: { borderColor: colores.alerta },
  error: { color: colores.alerta, fontSize: 13, marginTop: espaciado.xs },

  botonesArchivo: { flexDirection: 'row', gap: espaciado.sm, marginTop: espaciado.xs },
  botonArchivo: { flex: 1, paddingHorizontal: espaciado.sm },
  archivoElegido: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.md,
    backgroundColor: colores.okFondo,
    borderRadius: radio.sm,
    padding: espaciado.md,
    marginTop: espaciado.xs,
  },
  archivoNombre: { flex: 1, color: colores.ok, fontWeight: '600' },

  nota: { fontSize: 12, color: colores.textoSuave, marginTop: espaciado.md, lineHeight: 18 },
});
