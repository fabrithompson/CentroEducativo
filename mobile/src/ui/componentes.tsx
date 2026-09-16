/**
 * Componentes compartidos de la app.
 *
 * Criterios que se aplican en todos:
 *  - Los elementos tocables miden al menos `ALTO_TOCABLE` (48dp).
 *  - Todo control lleva `accessibilityLabel` y `accessibilityRole`; en un
 *    teléfono, TalkBack y VoiceOver son el modo normal de uso para mucha gente.
 *  - Los estados llevan texto además de color.
 */

import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {
  ALTO_TOCABLE,
  colores,
  coloresDeTono,
  espaciado,
  etiquetaDeEstado,
  radio,
  tipografia,
  tonoDeEstado,
} from './tema';

// ==================================================================
// Tarjeta
// ==================================================================

export function Tarjeta({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[estilos.tarjeta, style]}>{children}</View>;
}

// ==================================================================
// Estado (badge)
// ==================================================================

export function Estado({ valor }: { valor: string }) {
  const { texto, fondo } = coloresDeTono(tonoDeEstado(valor));
  const etiqueta = etiquetaDeEstado(valor);

  return (
    <View style={[estilos.badge, { backgroundColor: fondo }]}>
      <Text style={[estilos.badgeTexto, { color: texto }]} accessibilityLabel={`Estado: ${etiqueta}`}>
        {etiqueta}
      </Text>
    </View>
  );
}

// ==================================================================
// Botón
// ==================================================================

type VarianteBoton = 'primario' | 'suave' | 'peligro';

export function Boton({
  titulo,
  onPress,
  variante = 'primario',
  deshabilitado = false,
  cargando = false,
  accesibilidad,
  style,
}: {
  titulo: string;
  onPress: () => void;
  variante?: VarianteBoton;
  deshabilitado?: boolean;
  cargando?: boolean;
  accesibilidad?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const inactivo = deshabilitado || cargando;

  const fondo =
    variante === 'primario' ? colores.primario : variante === 'peligro' ? colores.alerta : colores.superficie;
  const textoColor = variante === 'suave' ? colores.texto : colores.textoInverso;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactivo}
      accessibilityRole="button"
      accessibilityLabel={accesibilidad ?? titulo}
      accessibilityState={{ disabled: inactivo, busy: cargando }}
      style={({ pressed }) => [
        estilos.boton,
        { backgroundColor: fondo, opacity: inactivo ? 0.55 : pressed ? 0.85 : 1 },
        variante === 'suave' && estilos.botonSuave,
        style,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={textoColor} />
      ) : (
        <Text style={[estilos.botonTexto, { color: textoColor }]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

// ==================================================================
// Estados de pantalla
// ==================================================================

export function Cargando({ mensaje = 'Cargando…' }: { mensaje?: string }) {
  return (
    <View style={estilos.centrado} accessibilityRole="progressbar" accessibilityLabel={mensaje}>
      <ActivityIndicator size="large" color={colores.primario} />
      <Text style={estilos.textoSuave}>{mensaje}</Text>
    </View>
  );
}

export function Vacio({ mensaje, titulo }: { mensaje: string; titulo?: string }) {
  return (
    <View style={estilos.centrado}>
      {titulo ? <Text style={estilos.vacioTitulo}>{titulo}</Text> : null}
      <Text style={estilos.textoSuave}>{mensaje}</Text>
    </View>
  );
}

export function ErrorPantalla({ mensaje, onReintentar }: { mensaje: string; onReintentar?: () => void }) {
  return (
    <View style={estilos.centrado} accessibilityRole="alert" accessibilityLiveRegion="assertive">
      <View style={estilos.errorCaja}>
        <Text style={estilos.errorTexto}>{mensaje}</Text>
      </View>
      {onReintentar ? (
        <Boton titulo="Reintentar" variante="suave" onPress={onReintentar} style={{ marginTop: espaciado.lg }} />
      ) : null}
    </View>
  );
}

// ==================================================================
// Fila de datos
// ==================================================================

export function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    // Se agrupa para que el lector de pantalla lea "Saldo, $120.000" junto.
    <View style={estilos.dato} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      <Text style={estilos.datoEtiqueta}>{etiqueta}</Text>
      <Text style={estilos.datoValor}>{valor}</Text>
    </View>
  );
}

// ==================================================================
// Barra de progreso
// ==================================================================

export function Progreso({ porcentaje, etiqueta }: { porcentaje: number; etiqueta: string }) {
  const ancho = Math.max(0, Math.min(100, porcentaje));

  return (
    <View
      style={estilos.progreso}
      accessibilityRole="progressbar"
      accessibilityLabel={etiqueta}
      accessibilityValue={{ min: 0, max: 100, now: ancho }}
    >
      <View style={[estilos.progresoBarra, { width: `${ancho}%` }]} />
    </View>
  );
}

// ==================================================================
// Aviso
// ==================================================================

export function Aviso({ texto, tono = 'neutro' }: { texto: string; tono?: 'neutro' | 'espera' | 'alerta' | 'ok' }) {
  const c = coloresDeTono(tono);

  return (
    <View style={[estilos.aviso, { backgroundColor: c.fondo, borderLeftColor: c.texto }]}>
      <Text style={[estilos.avisoTexto, { color: c.texto }]}>{texto}</Text>
    </View>
  );
}

// ==================================================================
// Estilos
// ==================================================================

const estilos = StyleSheet.create({
  tarjeta: {
    backgroundColor: colores.superficie,
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.borde,
    padding: espaciado.lg,
    marginBottom: espaciado.md,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: espaciado.md,
    paddingVertical: espaciado.xs,
    borderRadius: radio.pill,
  },
  badgeTexto: {
    ...tipografia.etiqueta,
  },
  boton: {
    minHeight: ALTO_TOCABLE,
    borderRadius: radio.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: espaciado.xl,
    flexDirection: 'row',
  },
  botonSuave: {
    borderWidth: 1,
    borderColor: colores.borde,
  },
  botonTexto: {
    fontSize: 16,
    fontWeight: '600',
  },
  centrado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: espaciado.xl,
    gap: espaciado.md,
  },
  textoSuave: {
    ...tipografia.cuerpo,
    color: colores.textoSuave,
    textAlign: 'center',
  },
  vacioTitulo: {
    ...tipografia.subtitulo,
    color: colores.texto,
    textAlign: 'center',
  },
  errorCaja: {
    backgroundColor: colores.alertaFondo,
    borderLeftWidth: 4,
    borderLeftColor: colores.alerta,
    borderRadius: radio.sm,
    padding: espaciado.lg,
  },
  errorTexto: {
    ...tipografia.cuerpo,
    color: colores.alerta,
  },
  dato: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: espaciado.sm,
    gap: espaciado.md,
  },
  datoEtiqueta: {
    ...tipografia.cuerpo,
    color: colores.textoSuave,
    flexShrink: 1,
  },
  datoValor: {
    ...tipografia.cuerpo,
    color: colores.texto,
    fontWeight: '600',
    textAlign: 'right',
  },
  progreso: {
    height: 8,
    backgroundColor: colores.neutroFondo,
    borderRadius: radio.pill,
    overflow: 'hidden',
    marginVertical: espaciado.sm,
  },
  progresoBarra: {
    height: '100%',
    backgroundColor: colores.ok,
    borderRadius: radio.pill,
  },
  aviso: {
    borderRadius: radio.sm,
    borderLeftWidth: 4,
    padding: espaciado.md,
    marginBottom: espaciado.md,
  },
  avisoTexto: {
    fontSize: 14,
    lineHeight: 20,
  },
});
