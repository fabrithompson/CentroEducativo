/**
 * Mi cuenta: la misma para los cuatro roles.
 *
 * Cubre el Módulo 1 de la consigna con la sesión iniciada: cambiar la
 * contraseña y cerrar sesión. Recuperarla sin sesión está en la pantalla de
 * ingreso ("Olvidé mi contraseña").
 *
 * La app valida sólo el formato (no vacío, que coincidan, 8 o más con letras y
 * números) para no gastar un pedido en algo que va a fallar. Si la contraseña
 * actual es incorrecta lo dice el backend, con su mensaje.
 */

import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';

import api from '../api/endpoints';
import { useSesion } from '../auth/SesionContext';
import { validarClaveNueva } from '../dominio/formularios';
import { nombreDeRol, type Rol } from '../dominio/roles';
import { Aviso, Boton, CampoTexto, Seccion, Tarjeta } from '../ui/componentes';
import { colores, espaciado, tipografia } from '../ui/tema';

export function PantallaCuenta({ rol }: { rol: Rol }) {
  const { usuario, salir } = useSesion();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [repetida, setRepetida] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function cambiar() {
    setOk(null);
    const problema = validarClaveNueva(actual, nueva, repetida);
    if (problema) {
      setError(problema);
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const r = await api.auth.cambiarClave(actual, nueva);
      setOk(r.mensaje);
      setActual('');
      setNueva('');
      setRepetida('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cambiar la contraseña.');
    } finally {
      setEnviando(false);
    }
  }

  function confirmarSalida() {
    Alert.alert('Cerrar sesión', '¿Querés cerrar la sesión en este teléfono?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => void salir() },
    ]);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled">
        <Tarjeta>
          <Text style={estilos.nombre}>{usuario?.nombre}</Text>
          <Text style={estilos.rol}>{nombreDeRol(rol)}</Text>
        </Tarjeta>

        <Seccion titulo="Cambiar contraseña" />
        <Tarjeta>
          <CampoTexto etiqueta="Contraseña actual" valor={actual} onChange={setActual} secreto />
          <CampoTexto
            etiqueta="Contraseña nueva"
            valor={nueva}
            onChange={setNueva}
            secreto
            ayuda="Al menos 8 caracteres, con letras y números."
          />
          <CampoTexto etiqueta="Repetí la contraseña nueva" valor={repetida} onChange={setRepetida} secreto />

          {error ? <Aviso tono="alerta" texto={error} /> : null}
          {ok ? <Aviso tono="ok" texto={ok} /> : null}

          <Boton titulo="Guardar contraseña" onPress={() => void cambiar()} cargando={enviando} />
        </Tarjeta>

        <Boton titulo="Cerrar sesión" variante="suave" onPress={confirmarSalida} style={{ marginTop: espaciado.lg }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  scroll: { padding: espaciado.lg, paddingBottom: espaciado.xxl, backgroundColor: colores.fondo },
  nombre: { ...tipografia.titulo, color: colores.texto },
  rol: { ...tipografia.cuerpo, color: colores.textoSuave, marginTop: espaciado.xs },
});
