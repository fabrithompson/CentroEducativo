/**
 * Control de acceso con el carnet digital (docentes y administración).
 *
 * Es el desafío de valor agregado del proyecto: el alumno muestra el QR
 * dinámico de su carnet al subir al micro o al entrar al comedor, y quien
 * controla lo lee con la cámara del teléfono. Lo mismo que hace la vista
 * "Escanear carnet" de la web, con `POST /api/accesos/escanear`.
 *
 * La app no decide nada: el backend verifica el código (TOTP), que no se haya
 * usado, que la credencial esté vigente y que el alumno tenga el servicio, y
 * registra el acceso (y avisa a la familia). Acá sólo se lee el QR y se
 * muestra el resultado. Si la cámara no está disponible, se puede cargar a mano
 * el legajo y el código que el carnet muestra a la vista.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';

import api, { type PuntoControl, type Recorrido, type ResultadoEscaneo } from '../api/endpoints';
import { mesDe } from '../dominio/rango';
import { Aviso, Boton, CampoTexto, Opciones, Tarjeta } from '../ui/componentes';
import { colores, espaciado, radio, tipografia } from '../ui/tema';

export function PantallaEscaner() {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [punto, setPunto] = useState<PuntoControl>('COMEDOR');
  const [recorridos, setRecorridos] = useState<Recorrido[]>([]);
  const [recorridoId, setRecorridoId] = useState<number | null>(null);
  const [resultado, setResultado] = useState<ResultadoEscaneo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validando, setValidando] = useState(false);
  const [manual, setManual] = useState({ legajo: '', codigo: '' });
  // La cámara dispara el mismo QR muchas veces por segundo: se procesa uno y se
  // ignora el resto hasta que el operador pida escanear otro.
  const bloqueado = useRef(false);

  useEffect(() => {
    const { anio, mes } = mesDe();
    api.inscripciones
      .recorridos(anio, mes)
      .then((r) => {
        setRecorridos(r.recorridos);
        setRecorridoId((actual) => actual ?? r.recorridos[0]?.id ?? null);
      })
      .catch(() => setRecorridos([]));
  }, []);

  const validar = useCallback(
    async (datos: { qr?: string; legajo?: string; codigo?: string }) => {
      if (punto === 'TRANSPORTE' && !recorridoId) {
        setError('Elegí el recorrido del micro.');
        return;
      }
      bloqueado.current = true;
      setValidando(true);
      setError(null);
      try {
        setResultado(
          await api.accesos.escanear({ ...datos, punto, recorridoId: punto === 'TRANSPORTE' ? recorridoId! : undefined }),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No pudimos validar el carnet.');
      } finally {
        setValidando(false);
      }
    },
    [punto, recorridoId],
  );

  function otro() {
    setResultado(null);
    setError(null);
    setManual({ legajo: '', codigo: '' });
    bloqueado.current = false;
  }

  const mostrandoResultado = resultado !== null || error !== null;

  return (
    <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled">
      <Opciones
        etiqueta="Punto de control"
        valor={punto}
        opciones={[
          { valor: 'COMEDOR', titulo: 'Comedor' },
          { valor: 'TRANSPORTE', titulo: 'Transporte' },
        ]}
        onChange={(v) => {
          setPunto(v);
          otro();
        }}
      />
      {punto === 'TRANSPORTE' ? (
        <Opciones
          etiqueta="Recorrido"
          valor={recorridoId}
          opciones={recorridos.map((r) => ({ valor: r.id, titulo: `${r.codigo} · ${r.nombre}` }))}
          onChange={setRecorridoId}
        />
      ) : null}

      {/* ---------- Resultado ---------- */}
      {resultado ? (
        <Tarjeta style={[estilos.resultado, { borderLeftColor: resultado.permitido ? colores.ok : colores.alerta }]}>
          <Text
            style={[estilos.veredicto, { color: resultado.permitido ? colores.ok : colores.alerta }]}
            accessibilityLiveRegion="assertive"
          >
            {resultado.permitido ? 'Acceso permitido' : 'Acceso denegado'}
          </Text>
          {resultado.alumno ? (
            <Text style={estilos.alumno}>
              {resultado.alumno.nombre} · {resultado.alumno.curso} · Legajo {resultado.alumno.legajo}
            </Text>
          ) : null}
          <Text style={estilos.mensaje}>{resultado.mensaje}</Text>
          {resultado.detalle ? <Text style={estilos.mensaje}>{resultado.detalle}</Text> : null}
        </Tarjeta>
      ) : null}
      {error ? <Aviso tono="alerta" texto={error} /> : null}
      {mostrandoResultado ? <Boton titulo="Escanear otro carnet" onPress={otro} /> : null}

      {/* ---------- Cámara ---------- */}
      {!mostrandoResultado ? (
        permiso?.granted ? (
          <View style={estilos.camaraMarco}>
            <CameraView
              style={estilos.camara}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={({ data }) => {
                if (bloqueado.current || validando) return;
                void validar({ qr: data });
              }}
            />
            <Text style={estilos.ayuda}>Apuntá la cámara al QR del carnet del alumno.</Text>
          </View>
        ) : (
          <Tarjeta>
            <Text style={estilos.mensaje}>
              Para leer el carnet hace falta la cámara. Si no querés usarla, cargá el legajo y el código a mano.
            </Text>
            {permiso?.canAskAgain === false ? (
              <Aviso tono="espera" texto="La cámara está bloqueada para esta app: habilitala desde los ajustes del teléfono." />
            ) : (
              <Boton titulo="Usar la cámara" onPress={() => void pedirPermiso()} />
            )}
          </Tarjeta>
        )
      ) : null}

      {/* ---------- Carga manual ---------- */}
      {!mostrandoResultado ? (
        <Tarjeta>
          <Text style={estilos.subtitulo}>Carga manual</Text>
          <CampoTexto
            etiqueta="Legajo"
            valor={manual.legajo}
            onChange={(v) => setManual((m) => ({ ...m, legajo: v.toUpperCase() }))}
            placeholder="A-0001"
          />
          <CampoTexto
            etiqueta="Código del carnet"
            valor={manual.codigo}
            onChange={(v) => setManual((m) => ({ ...m, codigo: v.replace(/\D/g, '') }))}
            tipoTeclado="numeric"
          />
          <Boton
            titulo="Validar"
            cargando={validando}
            deshabilitado={!manual.legajo.trim() || !manual.codigo.trim()}
            onPress={() => void validar({ legajo: manual.legajo.trim(), codigo: manual.codigo.trim() })}
          />
        </Tarjeta>
      ) : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  scroll: { padding: espaciado.lg, paddingBottom: espaciado.xxl, backgroundColor: colores.fondo },
  camaraMarco: { marginBottom: espaciado.md },
  camara: { height: 320, borderRadius: radio.md, overflow: 'hidden' },
  ayuda: { ...tipografia.cuerpo, color: colores.textoSuave, textAlign: 'center', marginTop: espaciado.sm },
  resultado: { borderLeftWidth: 6 },
  veredicto: { ...tipografia.titulo },
  alumno: { ...tipografia.subtitulo, color: colores.texto, marginTop: espaciado.sm },
  mensaje: { ...tipografia.cuerpo, color: colores.textoSuave, marginTop: espaciado.xs, marginBottom: espaciado.sm },
  subtitulo: { ...tipografia.subtitulo, color: colores.texto, marginBottom: espaciado.sm },
});
