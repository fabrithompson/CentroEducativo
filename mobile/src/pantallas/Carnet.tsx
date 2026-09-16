/**
 * Carnet digital con QR rotativo.
 *
 * El secreto se pide una sola vez y queda en `expo-secure-store`. A partir de
 * ahí el código se genera **en el teléfono, sin conexión**: un chico esperando
 * el micro en Fontana puede no tener señal, y el carnet igual tiene que andar.
 *
 * La cuenta regresiva no es decoración: le dice al chico y al operador cuánto
 * le queda de vida al código. Si está por vencer, conviene esperar la ventana
 * siguiente antes de acercarlo al lector.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as SecureStore from 'expo-secure-store';

import api, { type Hijo } from '../api/endpoints';
import {
  PERIODO_SEGUNDOS,
  armarContenidoQR,
  contadorPara,
  generarCodigo,
  segundosRestantes,
} from '../dominio/totp';
import { Aviso, Boton, Cargando, Dato, ErrorPantalla, Tarjeta } from '../ui/componentes';
import { colores, espaciado, radio, tipografia } from '../ui/tema';

interface Props {
  hijo: Hijo;
}

interface Credencial {
  id: number;
  secreto: string;
  version: number;
}

const claveSecreto = (alumnoId: number) => `et_credencial_${alumnoId}`;

export function PantallaCarnet({ hijo }: Props) {
  const alumnoId = hijo.alumno.id;

  const [credencial, setCredencial] = useState<Credencial | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [reemitiendo, setReemitiendo] = useState(false);

  const temporizador = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---------- Carga del secreto ----------

  const cargar = useCallback(
    async (forzarDescarga = false) => {
      setError(null);

      try {
        if (!forzarDescarga) {
          const guardado = await SecureStore.getItemAsync(claveSecreto(alumnoId));
          if (guardado) {
            setCredencial(JSON.parse(guardado) as Credencial);
            return;
          }
        }

        const r = await api.credenciales.obtener(alumnoId);
        const nueva: Credencial = {
          id: r.credencial.id,
          secreto: r.credencial.secreto,
          version: r.credencial.version,
        };

        await SecureStore.setItemAsync(claveSecreto(alumnoId), JSON.stringify(nueva));
        setCredencial(nueva);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No pudimos cargar el carnet.');
      }
    },
    [alumnoId],
  );

  useEffect(() => {
    setCredencial(null);
    void cargar();
  }, [cargar]);

  // ---------- Reloj ----------

  useEffect(() => {
    // Se actualiza cada segundo para la cuenta regresiva. Es barato: sólo
    // recalcula el código cuando cambia la ventana, por el useMemo de abajo.
    temporizador.current = setInterval(() => setAhora(Date.now()), 1000);

    // Al volver del fondo hay que resincronizar: mientras la app estuvo
    // suspendida el temporizador pudo no correr, y el QR quedaría vencido.
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') setAhora(Date.now());
    });

    return () => {
      if (temporizador.current) clearInterval(temporizador.current);
      sub.remove();
    };
  }, []);

  const contador = contadorPara(ahora);
  const restantes = segundosRestantes(ahora);

  // El código se recalcula sólo al cambiar de ventana, no en cada segundo.
  const contenidoQR = useMemo(() => {
    if (!credencial) return null;
    const codigo = generarCodigo(credencial.secreto, contador);
    return { codigo, texto: armarContenidoQR({ credencialId: credencial.id, contador, codigo }) };
  }, [credencial, contador]);

  // ---------- Reemisión ----------

  async function reemitir() {
    setReemitiendo(true);
    try {
      const r = await api.credenciales.reemitir(alumnoId);
      const nueva: Credencial = {
        id: r.credencial.id,
        secreto: r.credencial.secreto,
        version: r.credencial.version,
      };
      await SecureStore.setItemAsync(claveSecreto(alumnoId), JSON.stringify(nueva));
      setCredencial(nueva);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos reemitir la credencial.');
    } finally {
      setReemitiendo(false);
    }
  }

  // ---------- Render ----------

  if (error && !credencial) {
    return <ErrorPantalla mensaje={error} onReintentar={() => void cargar(true)} />;
  }

  if (!credencial || !contenidoQR) return <Cargando mensaje="Preparando el carnet…" />;

  const porVencer = restantes <= 5;

  return (
    <ScrollView contentContainerStyle={estilos.scroll}>
      <Tarjeta style={estilos.carnet}>
        <Text style={estilos.institucion}>Centro Educativo</Text>
        <Text style={estilos.marca}>Transformar para educar</Text>

        <View style={estilos.cajaQR}>
          <QRCode
            value={contenidoQR.texto}
            size={220}
            backgroundColor="#ffffff"
            color="#111827"
            // Nivel M: tolera manchas y reflejos en la pantalla sin agrandar
            // demasiado los módulos.
            ecl="M"
          />
        </View>

        {/* El código en números sirve de respaldo: si el lector no engancha
            —pantalla rayada, sol de frente— el operador lo tipea. */}
        <Text style={estilos.codigo} accessibilityLabel={`Código: ${contenidoQR.codigo.split('').join(' ')}`}>
          {contenidoQR.codigo.slice(0, 4)} {contenidoQR.codigo.slice(4)}
        </Text>

        <View style={estilos.barraTiempo}>
          <View
            style={[
              estilos.barraTiempoRelleno,
              {
                width: `${(restantes / PERIODO_SEGUNDOS) * 100}%`,
                backgroundColor: porVencer ? colores.espera : colores.ok,
              },
            ]}
          />
        </View>

        <Text
          style={[estilos.cuentaRegresiva, porVencer && { color: colores.espera }]}
          accessibilityLiveRegion="polite"
          accessibilityLabel={`El código se renueva en ${restantes} segundos`}
        >
          {porVencer
            ? `Se renueva en ${restantes} s — esperá el próximo`
            : `Se renueva en ${restantes} s`}
        </Text>

        <View style={estilos.separador} />

        <Text style={estilos.nombre}>
          {hijo.alumno.apellido}, {hijo.alumno.nombres}
        </Text>
        <Dato etiqueta="Legajo" valor={hijo.alumno.legajo} />
        <Dato etiqueta="DNI" valor={hijo.alumno.dni} />
        <Dato
          etiqueta="Curso"
          valor={
            hijo.alumno.curso
              ? `${hijo.alumno.curso.nombre} "${hijo.alumno.curso.division}"`
              : '—'
          }
        />
      </Tarjeta>

      <Aviso
        tono="neutro"
        texto={
          'El código cambia cada 30 segundos. Una foto de la pantalla no sirve para entrar: ' +
          'cuando alguien la use, ya venció.'
        }
      />

      {error ? <Aviso tono="alerta" texto={error} /> : null}

      <Tarjeta>
        <Text style={estilos.tituloAyuda}>¿Perdiste el teléfono?</Text>
        <Text style={estilos.textoAyuda}>
          Reemitir la credencial genera un código nuevo y deja sin efecto el del dispositivo
          anterior, en el momento.
        </Text>
        <Boton
          titulo="Reemitir credencial"
          variante="suave"
          onPress={() => void reemitir()}
          cargando={reemitiendo}
          style={{ marginTop: espaciado.md }}
        />
        <Text style={estilos.version}>Versión {credencial.version} de la credencial</Text>
      </Tarjeta>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  scroll: { padding: espaciado.lg, backgroundColor: colores.fondo },
  carnet: { alignItems: 'center', borderTopWidth: 5, borderTopColor: colores.primario },
  institucion: { ...tipografia.etiqueta, color: colores.textoSuave, textTransform: 'uppercase' },
  marca: { ...tipografia.subtitulo, color: colores.primario, marginBottom: espaciado.lg },
  cajaQR: {
    padding: espaciado.md,
    backgroundColor: '#ffffff',
    borderRadius: radio.md,
    borderWidth: 1,
    borderColor: colores.borde,
  },
  codigo: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: 4,
    color: colores.texto,
    marginTop: espaciado.lg,
    fontVariant: ['tabular-nums'],
  },
  barraTiempo: {
    height: 6,
    width: '100%',
    backgroundColor: colores.neutroFondo,
    borderRadius: radio.pill,
    overflow: 'hidden',
    marginTop: espaciado.md,
  },
  barraTiempoRelleno: { height: '100%', borderRadius: radio.pill },
  cuentaRegresiva: {
    ...tipografia.cuerpo,
    color: colores.textoSuave,
    marginTop: espaciado.sm,
  },
  separador: {
    height: 1,
    width: '100%',
    backgroundColor: colores.borde,
    marginVertical: espaciado.lg,
  },
  nombre: { ...tipografia.subtitulo, color: colores.texto, marginBottom: espaciado.sm },
  tituloAyuda: { ...tipografia.subtitulo, color: colores.texto, marginBottom: espaciado.xs },
  textoAyuda: { ...tipografia.cuerpo, color: colores.textoSuave, lineHeight: 21 },
  version: { fontSize: 12, color: colores.textoSuave, marginTop: espaciado.sm, textAlign: 'center' },
});
