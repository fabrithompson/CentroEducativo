/**
 * Raíz de la aplicación.
 *
 * Navegación propia por estado en vez de React Navigation: son tres pantallas y
 * un flujo lineal, así que sumar la librería (y sus dependencias nativas de
 * gestos y reanimated) no se justifica para este alcance. Si el flujo crece,
 * migrar es un cambio acotado a este archivo.
 *
 * El selector de hijo vive acá arriba porque lo comparten el dashboard y las
 * finanzas: una familia con dos chicos cambia una sola vez y las dos pantallas
 * quedan alineadas.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import api, { type FacturaDetallada, type Hijo } from './src/api/endpoints';
import { ProveedorSesion, useSesion } from './src/auth/SesionContext';
import { PantallaIngreso } from './src/pantallas/Ingreso';
import { PantallaDashboard } from './src/pantallas/Dashboard';
import { PantallaFinanzas } from './src/pantallas/Finanzas';
import { PantallaCarnet } from './src/pantallas/Carnet';
import { PantallaPago } from './src/pantallas/PagoTransferencia';
import { Boton, Cargando, ErrorPantalla, Vacio } from './src/ui/componentes';
import { ALTO_TOCABLE, colores, espaciado, radio, tipografia } from './src/ui/tema';

type Vista = 'dashboard' | 'carnet' | 'finanzas';

export default function App() {
  return (
    <SafeAreaProvider>
      <ProveedorSesion>
        <StatusBar style="light" />
        <Raiz />
      </ProveedorSesion>
    </SafeAreaProvider>
  );
}

function Raiz() {
  const { usuario, cargandoSesion } = useSesion();

  if (cargandoSesion) {
    return (
      <SafeAreaView style={estilos.pantallaCompleta}>
        <Cargando mensaje="Abriendo tu sesión…" />
      </SafeAreaView>
    );
  }

  if (!usuario) return <PantallaIngreso />;

  return <AppConSesion />;
}

function AppConSesion() {
  const { usuario, salir } = useSesion();

  const [hijos, setHijos] = useState<Hijo[] | null>(null);
  const [hijoActivo, setHijoActivo] = useState<number | null>(null);
  const [vista, setVista] = useState<Vista>('dashboard');
  const [pagando, setPagando] = useState<FacturaDetallada | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  const cargarHijos = useCallback(async () => {
    setError(null);
    try {
      const r = await api.padres.misHijos();
      setHijos(r.hijos);
      // Se conserva el hijo elegido si sigue existiendo tras recargar.
      setHijoActivo((actual) =>
        actual !== null && r.hijos.some((h) => h.alumno.id === actual)
          ? actual
          : (r.hijos[0]?.alumno.id ?? null),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar tus hijos.');
    }
  }, []);

  useEffect(() => {
    void cargarHijos();
  }, [cargarHijos, recarga]);

  if (error) {
    return (
      <SafeAreaView style={estilos.pantallaCompleta}>
        <ErrorPantalla mensaje={error} onReintentar={() => setRecarga((n) => n + 1)} />
      </SafeAreaView>
    );
  }

  if (!hijos) {
    return (
      <SafeAreaView style={estilos.pantallaCompleta}>
        <Cargando mensaje="Cargando tus hijos…" />
      </SafeAreaView>
    );
  }

  if (hijos.length === 0) {
    return (
      <SafeAreaView style={estilos.pantallaCompleta}>
        <Vacio
          titulo="Todavía no tenés hijos vinculados"
          mensaje="Administración realiza la vinculación. Acercate a secretaría con tu DNI y la vinculamos en el momento."
        />
        <View style={{ padding: espaciado.xl }}>
          <Boton titulo="Cerrar sesión" variante="suave" onPress={() => void salir()} />
        </View>
      </SafeAreaView>
    );
  }

  const hijo = hijos.find((h) => h.alumno.id === hijoActivo) ?? hijos[0]!;

  // La pantalla de pago se muestra sola, sin la barra inferior: es un flujo que
  // conviene terminar o cancelar, no dejar a medias cambiando de pestaña.
  if (pagando) {
    return (
      <SafeAreaView style={estilos.pantallaCompleta} edges={['top', 'bottom']}>
        <Encabezado titulo="Pagar por transferencia" />
        <PantallaPago
          factura={pagando}
          onListo={() => {
            setPagando(null);
            setRecarga((n) => n + 1);
          }}
          onCancelar={() => setPagando(null)}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={estilos.pantallaCompleta} edges={['top', 'bottom']}>
      <Encabezado
        titulo={vista === 'dashboard' ? 'Mi hijo' : vista === 'carnet' ? 'Carnet digital' : 'Pagos y finanzas'}
        subtitulo={usuario?.nombre}
        onSalir={() => void salir()}
      />

      {hijos.length > 1 ? (
        <View style={estilos.selectorHijo}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={estilos.selectorContenido}>
            {hijos.map((h) => {
              const activo = h.alumno.id === hijo.alumno.id;
              return (
                <Pressable
                  key={h.alumno.id}
                  onPress={() => setHijoActivo(h.alumno.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activo }}
                  accessibilityLabel={`Ver a ${h.alumno.nombres} ${h.alumno.apellido}`}
                  style={[estilos.chipHijo, activo && estilos.chipHijoActivo]}
                >
                  <Text style={[estilos.chipTexto, activo && estilos.chipTextoActivo]}>
                    {h.alumno.nombres}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ flex: 1 }}>
        {vista === 'dashboard' ? (
          <PantallaDashboard hijo={hijo} onIrAFinanzas={() => setVista('finanzas')} />
        ) : vista === 'carnet' ? (
          <PantallaCarnet hijo={hijo} />
        ) : (
          <PantallaFinanzas hijo={hijo} onPagar={setPagando} />
        )}
      </View>

      <BarraInferior vista={vista} onCambiar={setVista} />
    </SafeAreaView>
  );
}

// ------------------------------------------------------------------

function Encabezado({
  titulo,
  subtitulo,
  onSalir,
}: {
  titulo: string;
  subtitulo?: string;
  onSalir?: () => void;
}) {
  return (
    <View style={estilos.encabezado}>
      <View style={{ flex: 1 }}>
        <Text style={estilos.encabezadoTitulo}>{titulo}</Text>
        {subtitulo ? <Text style={estilos.encabezadoSub}>{subtitulo}</Text> : null}
      </View>
      {onSalir ? (
        <Pressable
          onPress={onSalir}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesión"
          style={estilos.botonSalir}
        >
          <Text style={estilos.botonSalirTexto}>Salir</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function BarraInferior({ vista, onCambiar }: { vista: Vista; onCambiar: (v: Vista) => void }) {
  const pestanias: { clave: Vista; titulo: string }[] = [
    { clave: 'dashboard', titulo: 'Inicio' },
    { clave: 'carnet', titulo: 'Carnet' },
    { clave: 'finanzas', titulo: 'Finanzas' },
  ];

  return (
    <View style={estilos.barra} accessibilityRole="tablist">
      {pestanias.map((p) => {
        const activa = p.clave === vista;
        return (
          <Pressable
            key={p.clave}
            onPress={() => onCambiar(p.clave)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activa }}
            accessibilityLabel={p.titulo}
            style={estilos.barraItem}
          >
            <Text style={[estilos.barraTexto, activa && estilos.barraTextoActivo]}>{p.titulo}</Text>
            {activa ? <View style={estilos.barraIndicador} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const estilos = StyleSheet.create({
  pantallaCompleta: { flex: 1, backgroundColor: colores.fondo },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colores.primario,
    paddingHorizontal: espaciado.lg,
    paddingVertical: espaciado.md,
    gap: espaciado.md,
  },
  encabezadoTitulo: { ...tipografia.subtitulo, color: colores.textoInverso },
  encabezadoSub: { fontSize: 12, color: colores.textoInverso, opacity: 0.8 },
  botonSalir: {
    minHeight: ALTO_TOCABLE,
    paddingHorizontal: espaciado.lg,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: radio.sm,
  },
  botonSalirTexto: { color: colores.textoInverso, fontWeight: '600' },

  selectorHijo: {
    backgroundColor: colores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: colores.borde,
  },
  selectorContenido: { padding: espaciado.md, gap: espaciado.sm },
  chipHijo: {
    minHeight: ALTO_TOCABLE,
    paddingHorizontal: espaciado.lg,
    justifyContent: 'center',
    borderRadius: radio.pill,
    borderWidth: 1,
    borderColor: colores.borde,
    backgroundColor: colores.superficie,
  },
  chipHijoActivo: { backgroundColor: colores.primario, borderColor: colores.primario },
  chipTexto: { color: colores.texto, fontWeight: '600' },
  chipTextoActivo: { color: colores.textoInverso },

  barra: {
    flexDirection: 'row',
    backgroundColor: colores.superficie,
    borderTopWidth: 1,
    borderTopColor: colores.borde,
  },
  barraItem: {
    flex: 1,
    minHeight: ALTO_TOCABLE + 8,
    alignItems: 'center',
    justifyContent: 'center',
    gap: espaciado.xs,
  },
  barraTexto: { fontSize: 14, fontWeight: '600', color: colores.textoSuave },
  barraTextoActivo: { color: colores.primario },
  barraIndicador: { height: 3, width: 28, borderRadius: radio.pill, backgroundColor: colores.primario },
});
