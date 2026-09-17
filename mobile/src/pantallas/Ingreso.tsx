/**
 * Pantalla de ingreso.
 */

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ApiError } from '../api/client';
import api from '../api/endpoints';
import { useSesion } from '../auth/SesionContext';
import { Aviso, Boton } from '../ui/componentes';
import { ALTO_TOCABLE, colores, espaciado, radio, tipografia } from '../ui/tema';

export function PantallaIngreso() {
  const { ingresar } = useSesion();

  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const [modoRecuperar, setModoRecuperar] = useState(false);
  const [email, setEmail] = useState('');
  const [avisoRecuperar, setAvisoRecuperar] = useState<string | null>(null);

  async function enviar() {
    setError(null);

    if (!usuario.trim() || !password) {
      setError('Completá tu usuario y tu contraseña.');
      return;
    }

    setEnviando(true);
    try {
      await ingresar(usuario, password);
    } catch (err) {
      const mensaje =
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'No pudimos iniciar sesión. Intentá de nuevo.';
      setError(mensaje);
    } finally {
      setEnviando(false);
    }
  }

  async function recuperar() {
    setError(null);
    setAvisoRecuperar(null);

    if (!email.includes('@')) {
      setError('Ingresá el correo con el que te registraste.');
      return;
    }

    setEnviando(true);
    try {
      const r = await api.auth.olvideMiClave(email.trim());
      // El backend responde lo mismo exista o no la cuenta, a propósito.
      setAvisoRecuperar(r.mensaje);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el correo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={estilos.contenedor}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={estilos.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={estilos.encabezado}>
          <Text style={estilos.marca}>Transformar para educar</Text>
          <Text style={estilos.subtitulo}>Portal de familias</Text>
        </View>

        <View style={estilos.formulario}>
          {error ? (
            <View accessibilityLiveRegion="assertive" accessibilityRole="alert">
              <Aviso texto={error} tono="alerta" />
            </View>
          ) : null}

          {avisoRecuperar ? (
            <View accessibilityLiveRegion="polite">
              <Aviso texto={avisoRecuperar} tono="ok" />
            </View>
          ) : null}

          {modoRecuperar ? (
            <>
              <Text style={estilos.ayuda}>
                Te enviamos un enlace para elegir una contraseña nueva. Vence en 30 minutos.
              </Text>

              <Campo
                etiqueta="Correo electrónico"
                valor={email}
                onChange={setEmail}
                tipoTeclado="email-address"
                autoCompletar="email"
                placeholder="tu@correo.com"
              />

              <Boton
                titulo="Enviar enlace"
                onPress={recuperar}
                cargando={enviando}
                style={{ marginTop: espaciado.md }}
              />

              <Pressable
                onPress={() => {
                  setModoRecuperar(false);
                  setError(null);
                  setAvisoRecuperar(null);
                }}
                accessibilityRole="button"
                style={estilos.enlace}
              >
                <Text style={estilos.enlaceTexto}>Volver a iniciar sesión</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Campo
                etiqueta="Usuario"
                valor={usuario}
                onChange={setUsuario}
                autoCompletar="username"
                placeholder="Tu nombre de usuario"
              />

              <View>
                <Campo
                  etiqueta="Contraseña"
                  valor={password}
                  onChange={setPassword}
                  secreto={!verClave}
                  autoCompletar="password"
                  placeholder="Tu contraseña"
                  alEnviar={enviar}
                />
                <Pressable
                  onPress={() => setVerClave((v) => !v)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: verClave }}
                  accessibilityLabel={verClave ? 'Ocultar la contraseña' : 'Mostrar la contraseña'}
                  style={estilos.verClave}
                >
                  <Text style={estilos.enlaceTexto}>{verClave ? 'Ocultar' : 'Mostrar'}</Text>
                </Pressable>
              </View>

              <Boton
                titulo="Ingresar"
                onPress={enviar}
                cargando={enviando}
                style={{ marginTop: espaciado.lg }}
              />

              <Pressable
                onPress={() => {
                  setModoRecuperar(true);
                  setError(null);
                }}
                accessibilityRole="button"
                style={estilos.enlace}
              >
                <Text style={estilos.enlaceTexto}>Olvidé mi contraseña</Text>
              </Pressable>
            </>
          )}
        </View>

        <Text style={estilos.pie}>
          Centro Educativo "Transformar para educar" — Resistencia, Chaco
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ------------------------------------------------------------------

function Campo({
  etiqueta,
  valor,
  onChange,
  secreto = false,
  placeholder,
  tipoTeclado = 'default',
  autoCompletar,
  alEnviar,
}: {
  etiqueta: string;
  valor: string;
  onChange: (v: string) => void;
  secreto?: boolean;
  placeholder?: string;
  tipoTeclado?: 'default' | 'email-address';
  autoCompletar?: 'username' | 'password' | 'email';
  alEnviar?: () => void;
}) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.campoEtiqueta} nativeID={`lbl-${etiqueta}`}>
        {etiqueta}
      </Text>
      <TextInput
        style={estilos.input}
        value={valor}
        onChangeText={onChange}
        secureTextEntry={secreto}
        placeholder={placeholder}
        placeholderTextColor={colores.textoSuave}
        keyboardType={tipoTeclado}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete={autoCompletar}
        textContentType={
          autoCompletar === 'password' ? 'password' : autoCompletar === 'email' ? 'emailAddress' : 'username'
        }
        returnKeyType={alEnviar ? 'go' : 'next'}
        onSubmitEditing={alEnviar}
        accessibilityLabel={etiqueta}
        accessibilityLabelledBy={`lbl-${etiqueta}`}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, backgroundColor: colores.primario },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: espaciado.xl },
  encabezado: { alignItems: 'center', marginBottom: espaciado.xxl },
  marca: { ...tipografia.titulo, color: colores.textoInverso, textAlign: 'center' },
  subtitulo: {
    ...tipografia.cuerpo,
    color: colores.textoInverso,
    opacity: 0.85,
    marginTop: espaciado.xs,
  },
  formulario: {
    backgroundColor: colores.superficie,
    borderRadius: radio.lg,
    padding: espaciado.xl,
    gap: espaciado.md,
  },
  campo: { gap: espaciado.xs },
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
  verClave: { alignSelf: 'flex-end', paddingVertical: espaciado.sm, minHeight: ALTO_TOCABLE, justifyContent: 'center' },
  enlace: { alignItems: 'center', paddingVertical: espaciado.md, minHeight: ALTO_TOCABLE, justifyContent: 'center' },
  enlaceTexto: { color: colores.primario, fontSize: 15, fontWeight: '600' },
  ayuda: { ...tipografia.cuerpo, color: colores.textoSuave },
  pie: {
    textAlign: 'center',
    color: colores.textoInverso,
    opacity: 0.75,
    fontSize: 12,
    marginTop: espaciado.xxl,
  },
});
