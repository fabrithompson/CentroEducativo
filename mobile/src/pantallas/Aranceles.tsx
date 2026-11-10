/**
 * Aranceles (administración).
 *
 * La consigna: "los administradores solamente pueden especificar el valor de
 * la cuota, deportes y servicios de transporte y comedor", y "cada recorrido y
 * deporte tienen valores diferenciados". Acá se ve y se cambia cada uno:
 *
 *   - cuota escolar por nivel      PATCH /api/academico/niveles/:id
 *   - arancel de cada deporte      PATCH /api/deportes/:id
 *   - arancel de cada recorrido    PATCH /api/servicios/transporte/recorridos/:id
 *   - arancel de cada plan comedor PATCH /api/servicios/comedor/planes/:id
 *
 * El valor nuevo rige desde la próxima facturación: las facturas ya emitidas
 * guardan el precio con el que se emitieron.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import api from '../api/endpoints';
import { moneda } from '../dominio/formato';
import { leerImporte } from '../dominio/formularios';
import { mesDe } from '../dominio/rango';
import { Aviso, Boton, Cargando, ErrorPantalla, Seccion, Tarjeta } from '../ui/componentes';
import { ALTO_TOCABLE, colores, espaciado, radio, tipografia } from '../ui/tema';

interface Fila {
  clave: string;
  nombre: string;
  detalle?: string;
  valor: number;
  guardar: (valor: number) => Promise<{ mensaje: string }>;
}

interface Grupos {
  cuotas: Fila[];
  deportes: Fila[];
  recorridos: Fila[];
  comedor: Fila[];
}

export function PantallaAranceles() {
  const [grupos, setGrupos] = useState<Grupos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const { anio, mes } = mesDe();
      const [niveles, deportes, recorridos, planes] = await Promise.all([
        api.admin.niveles(),
        api.admin.deportes(),
        api.inscripciones.recorridos(anio, mes),
        api.inscripciones.planesComedor(anio, mes),
      ]);
      setGrupos({
        cuotas: niveles.niveles
          .filter((n) => n.activo)
          .sort((a, b) => a.orden - b.orden)
          .map((n) => ({
            clave: `nivel-${n.id}`,
            nombre: `Cuota ${n.nombre}`,
            valor: Number(n.cuotaMensual),
            guardar: (v) => api.admin.cuotaNivel(n.id, v),
          })),
        deportes: deportes.deportes
          .filter((d) => d.activo)
          .map((d) => ({
            clave: `deporte-${d.id}`,
            nombre: d.nombre,
            detalle: `Responsable: ${d.profesorResponsable.apellido}, ${d.profesorResponsable.nombres}`,
            valor: d.arancelMensual,
            guardar: (v) => api.admin.arancelDeporte(d.id, v),
          })),
        recorridos: recorridos.recorridos.map((r) => ({
          clave: `recorrido-${r.id}`,
          nombre: `${r.codigo} · ${r.nombre}`,
          detalle: r.zonas,
          valor: r.arancelMensual,
          guardar: (v) => api.admin.arancelRecorrido(r.id, v),
        })),
        comedor: planes.planes.map((p) => ({
          clave: `comedor-${p.id}`,
          nombre: p.nombre,
          valor: p.arancelMensual,
          guardar: (v) => api.admin.arancelComedor(p.id, v),
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar los aranceles.');
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
  if (!grupos) return <Cargando mensaje="Cargando aranceles…" />;

  return (
    <ScrollView
      contentContainerStyle={estilos.scroll}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
      keyboardShouldPersistTaps="handled"
    >
      <Aviso
        tono="neutro"
        texto="Un valor nuevo rige desde la próxima facturación. Las facturas ya emitidas conservan su precio."
      />
      <Grupo titulo="Cuota escolar por nivel" filas={grupos.cuotas} onGuardado={cargar} />
      <Grupo titulo="Deportes" filas={grupos.deportes} onGuardado={cargar} />
      <Grupo titulo="Transporte (4 recorridos)" filas={grupos.recorridos} onGuardado={cargar} />
      <Grupo titulo="Comedor" filas={grupos.comedor} onGuardado={cargar} />
      <View style={{ height: espaciado.xxl }} />
    </ScrollView>
  );
}

function Grupo({ titulo, filas, onGuardado }: { titulo: string; filas: Fila[]; onGuardado: () => Promise<void> }) {
  return (
    <>
      <Seccion titulo={titulo} />
      <Tarjeta>
        {filas.map((f, i) => (
          <FilaArancel key={f.clave} fila={f} primera={i === 0} onGuardado={onGuardado} />
        ))}
      </Tarjeta>
    </>
  );
}

function FilaArancel({ fila, primera, onGuardado }: { fila: Fila; primera: boolean; onGuardado: () => Promise<void> }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const leido = leerImporte(texto);
    if ('error' in leido) {
      setError(leido.error);
      return;
    }
    setGuardando(true);
    setError(null);
    try {
      const r = await fila.guardar(leido.valor);
      setEditando(false);
      Alert.alert('Arancel actualizado', r.mensaje);
      await onGuardado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos guardar el valor.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <View style={[estilos.fila, !primera && estilos.filaSeparada]}>
      <View style={estilos.filaCabecera}>
        <View style={{ flex: 1 }}>
          <Text style={estilos.nombre}>{fila.nombre}</Text>
          {fila.detalle ? <Text style={estilos.detalle}>{fila.detalle}</Text> : null}
        </View>
        <Text style={estilos.valor}>{moneda(fila.valor)}</Text>
      </View>

      {editando ? (
        <View style={estilos.edicion}>
          <TextInput
            style={estilos.input}
            value={texto}
            onChangeText={setTexto}
            keyboardType="numeric"
            placeholder="Nuevo valor, ej. 104.000"
            placeholderTextColor={colores.textoSuave}
            accessibilityLabel={`Nuevo valor para ${fila.nombre}`}
            autoFocus
          />
          {error ? <Aviso tono="alerta" texto={error} /> : null}
          <View style={estilos.botones}>
            <Boton titulo="Guardar" cargando={guardando} onPress={() => void guardar()} style={{ flex: 1 }} />
            <Boton titulo="Cancelar" variante="suave" onPress={() => setEditando(false)} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => {
            setTexto(String(fila.valor).replace('.', ','));
            setError(null);
            setEditando(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={`Cambiar el valor de ${fila.nombre}, hoy ${moneda(fila.valor)}`}
          style={estilos.enlace}
        >
          <Text style={estilos.enlaceTexto}>Cambiar valor</Text>
        </Pressable>
      )}
    </View>
  );
}

const estilos = StyleSheet.create({
  scroll: { padding: espaciado.lg, backgroundColor: colores.fondo },
  fila: { paddingVertical: espaciado.sm },
  filaSeparada: { borderTopWidth: 1, borderTopColor: colores.borde },
  filaCabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: espaciado.md },
  nombre: { ...tipografia.cuerpo, color: colores.texto, fontWeight: '600' },
  detalle: { fontSize: 12, color: colores.textoSuave, marginTop: 2 },
  valor: { ...tipografia.cuerpo, color: colores.texto, fontWeight: '700' },
  edicion: { marginTop: espaciado.sm, gap: espaciado.sm },
  input: {
    minHeight: ALTO_TOCABLE,
    borderWidth: 1,
    borderColor: colores.borde,
    borderRadius: radio.sm,
    paddingHorizontal: espaciado.md,
    fontSize: 16,
    color: colores.texto,
  },
  botones: { flexDirection: 'row', gap: espaciado.sm },
  enlace: { minHeight: ALTO_TOCABLE, justifyContent: 'center' },
  enlaceTexto: { color: colores.primario, fontWeight: '600' },
});
