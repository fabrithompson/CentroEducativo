/**
 * Alumnos (administración).
 *
 * Lo que Administración necesita de cada alumno, desde el teléfono: si debe
 * cuotas, en qué está inscripto y su estado, con la posibilidad de darlo de
 * baja o reactivarlo. Es lo mismo que el panel web reparte entre "Alumnos",
 * "Reportes → Morosidad" y la ficha de servicios.
 *
 * La app no decide nada. La deuda sale del reporte de morosidad del backend; la
 * baja la hace `DELETE /api/alumnos/:id`, que además da de baja deportes,
 * transporte y comedor; y las inscripciones usan la misma pantalla que las
 * familias, con los mismos controles del servidor (tope de 2 deportes, choques
 * de horario).
 *
 * Tres vistas por estado, como el pago en `App.tsx`: lista, ficha e
 * inscripciones. Los filtros de la lista viven arriba para que volver de una
 * ficha no los borre.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import api, { type AlumnoListado, type EstadoAlumno, type FacturaAdmin, type RespuestaMorosidad } from '../api/endpoints';
import { deudaPorAlumno, textoDeuda, tieneDeuda, type DeudaAlumno } from '../dominio/alumnos';
import { fecha, moneda, periodo } from '../dominio/formato';
import {
  Aviso,
  Boton,
  CampoTexto,
  Cargando,
  Dato,
  ErrorPantalla,
  Estado,
  Opciones,
  Seccion,
  Tarjeta,
  Vacio,
} from '../ui/componentes';
import { ALTO_TOCABLE, colores, espaciado, tipografia } from '../ui/tema';
import { PantallaInscripciones } from './Inscripciones';

type MotivoBaja = Exclude<EstadoAlumno, 'ACTIVO'>;

/** La deuda de la ficha viaja desde la lista: `null` si la morosidad no cargó. */
type Vista =
  | { tipo: 'lista' }
  | { tipo: 'ficha'; alumno: AlumnoListado; deuda: DeudaAlumno | undefined | null }
  | { tipo: 'inscripciones'; alumno: AlumnoListado; deuda: DeudaAlumno | undefined | null };

const ESTADOS: { valor: EstadoAlumno; titulo: string }[] = [
  { valor: 'ACTIVO', titulo: 'Activos' },
  { valor: 'SUSPENDIDO', titulo: 'Suspendidos' },
  { valor: 'INACTIVO', titulo: 'Inactivos' },
  { valor: 'EGRESADO', titulo: 'Egresados' },
];

const MOTIVOS: { valor: MotivoBaja; titulo: string }[] = [
  { valor: 'INACTIVO', titulo: 'Inactivo' },
  { valor: 'EGRESADO', titulo: 'Egresado' },
  { valor: 'SUSPENDIDO', titulo: 'Suspendido' },
];

/** El máximo que acepta el backend por página. */
const POR_PAGINA = 100;

export function PantallaAlumnos() {
  const [vista, setVista] = useState<Vista>({ tipo: 'lista' });
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<EstadoAlumno>('ACTIVO');

  if (vista.tipo === 'inscripciones') {
    const { alumno, deuda } = vista;
    return (
      <View style={estilos.pantalla}>
        <Volver texto="Volver a la ficha" onPress={() => setVista({ tipo: 'ficha', alumno, deuda })} />
        <PantallaInscripciones alumnoId={alumno.id} nombre={alumno.nombres} deAdmin />
      </View>
    );
  }

  if (vista.tipo === 'ficha') {
    const { alumno, deuda } = vista;
    return (
      <View style={estilos.pantalla}>
        <Volver texto="Volver a la lista" onPress={() => setVista({ tipo: 'lista' })} />
        <FichaAlumno
          alumno={alumno}
          deuda={deuda}
          onInscripciones={() => setVista({ tipo: 'inscripciones', alumno, deuda })}
          onCambioEstado={(actualizado) => setVista({ tipo: 'ficha', alumno: actualizado, deuda })}
        />
      </View>
    );
  }

  return (
    <ListaAlumnos
      busqueda={busqueda}
      onBusqueda={setBusqueda}
      estado={estado}
      onEstado={setEstado}
      onElegir={(alumno, deuda) => setVista({ tipo: 'ficha', alumno, deuda })}
    />
  );
}

// ------------------------------------------------------------------
// Lista
// ------------------------------------------------------------------

function ListaAlumnos({
  busqueda,
  onBusqueda,
  estado,
  onEstado,
  onElegir,
}: {
  busqueda: string;
  onBusqueda: (v: string) => void;
  estado: EstadoAlumno;
  onEstado: (v: EstadoAlumno) => void;
  onElegir: (alumno: AlumnoListado, deuda: DeudaAlumno | undefined | null) => void;
}) {
  // Lo que se le pide al backend: la búsqueda se manda cuando se deja de tipear.
  const [termino, setTermino] = useState(busqueda.trim());
  const [alumnos, setAlumnos] = useState<AlumnoListado[] | null>(null);
  const [pagina, setPagina] = useState({ actual: 1, total: 0, cantidad: 0 });
  const [deudas, setDeudas] = useState<Map<number, DeudaAlumno> | null>(null);
  const [totales, setTotales] = useState<RespuestaMorosidad['totales'] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [cargandoMas, setCargandoMas] = useState(false);
  // Si las respuestas llegan desordenadas, sólo cuenta la del último pedido.
  const ultimoPedido = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setTermino(busqueda.trim()), 400);
    return () => clearTimeout(t);
  }, [busqueda]);

  const cargar = useCallback(async () => {
    const pedido = ++ultimoPedido.current;
    setError(null);
    const [lista, morosidad] = await Promise.allSettled([
      api.admin.alumnos({ busqueda: termino || undefined, estado, page: 1, pageSize: POR_PAGINA }),
      api.admin.morosidad(),
    ]);
    if (pedido !== ultimoPedido.current) return;

    if (lista.status === 'rejected') {
      setError(lista.reason instanceof Error ? lista.reason.message : 'No pudimos cargar los alumnos.');
      return;
    }
    setAlumnos(lista.value.items);
    setPagina({ actual: lista.value.page, total: lista.value.totalPages, cantidad: lista.value.total });

    // Si la morosidad falla, la lista se muestra igual: sólo falta la deuda.
    if (morosidad.status === 'fulfilled') {
      setDeudas(deudaPorAlumno(morosidad.value.filas));
      setTotales(morosidad.value.totales);
    } else {
      setDeudas(null);
      setTotales(null);
    }
  }, [termino, estado]);

  useEffect(() => {
    setAlumnos(null);
    void cargar();
  }, [cargar]);

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  }, [cargar]);

  async function cargarMas() {
    setCargandoMas(true);
    try {
      const r = await api.admin.alumnos({
        busqueda: termino || undefined,
        estado,
        page: pagina.actual + 1,
        pageSize: POR_PAGINA,
      });
      setAlumnos((previos) => [...(previos ?? []), ...r.items]);
      setPagina((p) => ({ ...p, actual: r.page }));
    } catch (err) {
      Alert.alert('No pudimos cargar más alumnos', err instanceof Error ? err.message : 'Intentá de nuevo.');
    } finally {
      setCargandoMas(false);
    }
  }

  if (error) return <ErrorPantalla mensaje={error} onReintentar={() => void cargar()} />;

  return (
    <ScrollView
      contentContainerStyle={estilos.scroll}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
      keyboardShouldPersistTaps="handled"
    >
      <CampoTexto
        etiqueta="Buscar"
        valor={busqueda}
        onChange={onBusqueda}
        placeholder="Apellido, nombre, DNI o legajo"
        // El backend compara sin mayúsculas pero con acentos.
        ayuda="Con tilde si la lleva: «Gómez», no «Gomez»."
      />
      <Opciones etiqueta="Estado" valor={estado} opciones={ESTADOS} onChange={onEstado} />

      {totales ? (
        <Aviso
          tono={totales.alumnosConDeuda > 0 ? 'espera' : 'ok'}
          texto={
            totales.alumnosConDeuda > 0
              ? `En todo el colegio, ${totales.alumnosConDeuda} ${totales.alumnosConDeuda === 1 ? 'alumno debe' : 'alumnos deben'} cuotas: ${moneda(totales.deudaTotal)} en total.`
              : 'Ningún alumno debe cuotas.'
          }
        />
      ) : null}

      {!alumnos ? (
        <Cargando mensaje="Cargando alumnos…" />
      ) : alumnos.length === 0 ? (
        <Tarjeta>
          <Vacio
            mensaje={
              termino
                ? `No hay alumnos que coincidan con "${termino}".`
                : `No hay alumnos ${ESTADOS.find((e) => e.valor === estado)?.titulo.toLowerCase() ?? ''}.`
            }
          />
        </Tarjeta>
      ) : (
        <>
          <Text style={estilos.resumen}>
            {pagina.cantidad === 1 ? '1 alumno' : `${pagina.cantidad} alumnos`}
          </Text>
          {alumnos.map((a) => (
            <FilaAlumno
              key={a.id}
              alumno={a}
              deuda={deudas ? deudas.get(a.id) : null}
              onPress={() => onElegir(a, deudas ? deudas.get(a.id) : null)}
            />
          ))}
          {pagina.actual < pagina.total ? (
            <Boton titulo="Ver más alumnos" variante="suave" cargando={cargandoMas} onPress={() => void cargarMas()} />
          ) : null}
        </>
      )}

      <View style={{ height: espaciado.xxl }} />
    </ScrollView>
  );
}

function FilaAlumno({
  alumno,
  deuda,
  onPress,
}: {
  alumno: AlumnoListado;
  deuda: DeudaAlumno | undefined | null;
  onPress: () => void;
}) {
  const nombre = `${alumno.apellido}, ${alumno.nombres}`;
  // `null`: la morosidad no cargó, así que no se puede decir "al día".
  const textoDeDeuda = deuda === null ? null : textoDeuda(deuda);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${nombre}, legajo ${alumno.legajo}${textoDeDeuda ? `. ${textoDeDeuda}` : ''}. Ver ficha`}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Tarjeta>
        <View style={estilos.cabecera}>
          <View style={{ flex: 1 }}>
            <Text style={estilos.nombre}>{nombre}</Text>
            <Text style={estilos.suave}>
              Legajo {alumno.legajo} · {cursoDe(alumno)}
            </Text>
          </View>
          <Estado valor={alumno.estado} />
        </View>
        {textoDeDeuda ? (
          <Text style={[estilos.deuda, { color: tieneDeuda(deuda ?? undefined) ? colores.alerta : colores.ok }]}>
            {textoDeDeuda}
          </Text>
        ) : null}
      </Tarjeta>
    </Pressable>
  );
}

// ------------------------------------------------------------------
// Ficha
// ------------------------------------------------------------------

function FichaAlumno({
  alumno,
  deuda,
  onInscripciones,
  onCambioEstado,
}: {
  alumno: AlumnoListado;
  deuda: DeudaAlumno | undefined | null;
  onInscripciones: () => void;
  onCambioEstado: (alumno: AlumnoListado) => void;
}) {
  const [facturas, setFacturas] = useState<FacturaAdmin[] | null>(null);
  const [errorCuotas, setErrorCuotas] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [bajaAbierta, setBajaAbierta] = useState(false);
  const [motivo, setMotivo] = useState<MotivoBaja>('INACTIVO');
  const [ocupado, setOcupado] = useState(false);

  const activo = alumno.estado === 'ACTIVO';
  const nombre = `${alumno.nombres} ${alumno.apellido}`;

  const cargarCuotas = useCallback(async () => {
    setErrorCuotas(null);
    try {
      setFacturas((await api.admin.facturasDe(alumno.id)).items);
    } catch (err) {
      setErrorCuotas(err instanceof Error ? err.message : 'No pudimos cargar las cuotas.');
    }
  }, [alumno.id]);

  useEffect(() => {
    void cargarCuotas();
  }, [cargarCuotas]);

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    await cargarCuotas();
    setRefrescando(false);
  }, [cargarCuotas]);

  async function darDeBaja() {
    setOcupado(true);
    try {
      const r = await api.admin.darDeBaja(alumno.id, motivo);
      setBajaAbierta(false);
      onCambioEstado({ ...alumno, estado: motivo });
      Alert.alert('Alumno dado de baja', r.mensaje);
    } catch (err) {
      Alert.alert('No se pudo dar de baja', err instanceof Error ? err.message : 'Intentá de nuevo.');
    } finally {
      setOcupado(false);
    }
  }

  async function reactivar() {
    setOcupado(true);
    try {
      await api.admin.reactivar(alumno.id);
      onCambioEstado({ ...alumno, estado: 'ACTIVO' });
      Alert.alert('Alumno reactivado', `${alumno.nombres} vuelve a estar activo. Sus inscripciones hay que cargarlas de nuevo.`);
    } catch (err) {
      Alert.alert('No se pudo reactivar', err instanceof Error ? err.message : 'Intentá de nuevo.');
    } finally {
      setOcupado(false);
    }
  }

  function confirmarReactivacion() {
    Alert.alert(
      'Reactivar alumno',
      `${nombre} vuelve a figurar como alumno activo de su curso. Tiene que haber lugar en el curso. Las inscripciones a deportes, transporte y comedor no vuelven solas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Reactivar', onPress: () => void reactivar() },
      ],
    );
  }

  return (
    <ScrollView
      contentContainerStyle={estilos.scroll}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
    >
      {/* ---------- Datos ---------- */}
      <Tarjeta>
        <View style={estilos.cabecera}>
          <Text style={[estilos.nombre, { flex: 1 }]}>
            {alumno.apellido}, {alumno.nombres}
          </Text>
          <Estado valor={alumno.estado} />
        </View>
        <Dato etiqueta="Legajo" valor={alumno.legajo} />
        <Dato etiqueta="DNI" valor={alumno.dni} />
        <Dato etiqueta="Curso" valor={cursoDe(alumno)} />
        <Dato etiqueta="Teléfono" valor={alumno.telefono ?? '—'} />
        <Dato etiqueta="Correo" valor={alumno.email ?? '—'} />
        <Dato etiqueta="Domicilio" valor={alumno.domicilio} />
        <Dato etiqueta="Ingreso" valor={fecha(alumno.fechaIngreso)} />
      </Tarjeta>

      {/* ---------- Cuotas ---------- */}
      <Seccion titulo="Cuotas" />
      {deuda !== null ? <Aviso tono={tieneDeuda(deuda) ? 'alerta' : 'ok'} texto={textoDeuda(deuda)} /> : null}

      {errorCuotas ? (
        <Tarjeta>
          <Aviso tono="alerta" texto={errorCuotas} />
          <Boton titulo="Reintentar" variante="suave" onPress={() => void cargarCuotas()} />
        </Tarjeta>
      ) : !facturas ? (
        <Cargando mensaje="Cargando cuotas…" />
      ) : facturas.length === 0 ? (
        <Tarjeta>
          <Vacio mensaje="No tiene cuotas emitidas." />
        </Tarjeta>
      ) : (
        facturas.map((f) => (
          <Tarjeta key={f.id}>
            <View style={estilos.cabecera}>
              <Text style={[estilos.periodo, { flex: 1 }]}>{periodo(f.anio, f.mes)}</Text>
              <Estado valor={f.estado} />
            </View>
            <Dato etiqueta="Total" valor={moneda(f.total)} />
            {f.montoPagado > 0 ? <Dato etiqueta="Pagado" valor={moneda(f.montoPagado)} /> : null}
            {f.saldo > 0 ? <Dato etiqueta="Saldo" valor={moneda(f.saldo)} /> : null}
            {f.saldo > 0 ? <Dato etiqueta="Vence" valor={fecha(f.fechaVencimiento)} /> : null}
          </Tarjeta>
        ))
      )}

      {/* ---------- Inscripciones ---------- */}
      <Seccion titulo="Inscripciones" />
      <Tarjeta>
        <Text style={estilos.suave}>Deportes, transporte y comedor de {alumno.nombres}.</Text>
        {activo ? (
          <Boton titulo="Ver y cambiar inscripciones" onPress={onInscripciones} />
        ) : (
          <Aviso tono="neutro" texto="No está activo. Para inscribirlo, primero hay que reactivarlo." />
        )}
      </Tarjeta>

      {/* ---------- Baja o reactivación ---------- */}
      <Seccion titulo="Estado del alumno" />
      <Tarjeta>
        {!activo ? (
          <Boton titulo="Reactivar" cargando={ocupado} onPress={confirmarReactivacion} />
        ) : bajaAbierta ? (
          <>
            <Opciones etiqueta="Motivo de la baja" valor={motivo} opciones={MOTIVOS} onChange={setMotivo} />
            <Aviso
              tono="espera"
              texto="Deja de figurar entre los alumnos activos de su curso. Se dan de baja sus inscripciones a deportes, transporte y comedor, para que no ocupe cupo ni genere cargos. Sus notas, asistencias y facturas se conservan, y se lo puede reactivar después."
            />
            <Boton
              titulo="Confirmar la baja"
              variante="peligro"
              cargando={ocupado}
              accesibilidad={`Confirmar la baja de ${nombre} como ${motivo.toLowerCase()}`}
              onPress={() => void darDeBaja()}
            />
            <Boton
              titulo="Cancelar"
              variante="suave"
              onPress={() => setBajaAbierta(false)}
              style={{ marginTop: espaciado.sm }}
            />
          </>
        ) : (
          <Boton
            titulo="Dar de baja"
            variante="peligro"
            accesibilidad={`Dar de baja a ${nombre}`}
            onPress={() => setBajaAbierta(true)}
          />
        )}
      </Tarjeta>

      <View style={{ height: espaciado.xxl }} />
    </ScrollView>
  );
}

// ------------------------------------------------------------------

function Volver({ texto, onPress }: { texto: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={texto} style={estilos.volver}>
      <Text style={estilos.volverTexto}>‹ {texto}</Text>
    </Pressable>
  );
}

function cursoDe(a: AlumnoListado): string {
  if (!a.curso) return 'Sin curso';
  return `${a.curso.nivel.nombre} — ${a.curso.nombre} "${a.curso.division}"`;
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colores.fondo },
  scroll: { padding: espaciado.lg, backgroundColor: colores.fondo },
  resumen: { fontSize: 13, color: colores.textoSuave, marginBottom: espaciado.sm },
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: espaciado.md, marginBottom: espaciado.xs },
  nombre: { ...tipografia.subtitulo, color: colores.texto },
  periodo: { ...tipografia.subtitulo, color: colores.texto, textTransform: 'capitalize' },
  suave: { ...tipografia.cuerpo, color: colores.textoSuave, marginBottom: espaciado.sm },
  deuda: { fontSize: 14, fontWeight: '600', marginTop: espaciado.xs },
  volver: {
    minHeight: ALTO_TOCABLE,
    justifyContent: 'center',
    paddingHorizontal: espaciado.lg,
    backgroundColor: colores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: colores.borde,
  },
  volverTexto: { color: colores.primario, fontWeight: '600', fontSize: 15 },
});
