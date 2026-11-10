/**
 * Alumnos (administración).
 *
 * Dos solapas:
 *
 *   - **Alumnos**: quién debe cuotas, la ficha de cada uno con sus cuotas, y
 *     darlo de baja o rehabilitarlo. También el alta ("Inscribir alumno").
 *   - **Solicitudes**: las que mandan las familias desde la app o la web para
 *     inscribir a un hijo al cursado. Se aceptan inscribiendo al alumno, o se
 *     rechazan.
 *
 * Inscribir a un alumno en deportes, transporte o comedor no está acá a
 * propósito: lo hace su familia, que es quien los paga.
 *
 * La app no decide nada. La deuda sale del reporte de morosidad del backend; la
 * baja la hace `DELETE /api/alumnos/:id`, que además da de baja sus
 * inscripciones; el alta la hace `POST /api/alumnos`, que asigna el legajo y
 * rechaza un DNI repetido o un curso sin lugar. Acá sólo se valida el formato.
 *
 * Las vistas son estado propio, como el pago en `App.tsx`. Los filtros viven
 * arriba para que volver de una ficha no los borre.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import api, {
  type AlumnoListado,
  type CursoConCupo,
  type EstadoAlumno,
  type EstadoSolicitud,
  type FacturaAdmin,
  type RespuestaMorosidad,
  type SolicitudInscripcion,
  type UsuarioListado,
} from '../api/endpoints';
import { deudaPorAlumno, textoDeuda, tieneDeuda, type DeudaAlumno } from '../dominio/alumnos';
import { fecha, moneda, periodo } from '../dominio/formato';
import { separarNombreCompleto, soloDigitos, validarAltaAlumno } from '../dominio/formularios';
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
import { ALTO_TOCABLE, colores, espaciado, radio, tipografia } from '../ui/tema';

type MotivoBaja = Exclude<EstadoAlumno, 'ACTIVO'>;
type Solapa = 'alumnos' | 'solicitudes';
/** `null`: la morosidad no cargó, así que no se puede decir "al día". */
type Deuda = DeudaAlumno | undefined | null;

type Vista =
  | { tipo: 'inicio' }
  | { tipo: 'ficha'; alumno: AlumnoListado; deuda: Deuda }
  | { tipo: 'alta'; solicitud: SolicitudInscripcion | null };

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

const FILTROS_SOLICITUD: { valor: EstadoSolicitud; titulo: string }[] = [
  { valor: 'PENDIENTE', titulo: 'Pendientes' },
  { valor: 'APROBADO', titulo: 'Aceptadas' },
  { valor: 'RECHAZADO', titulo: 'Rechazadas' },
];

/** El máximo que acepta el backend por página. */
const POR_PAGINA = 100;

export function PantallaAlumnos() {
  const [vista, setVista] = useState<Vista>({ tipo: 'inicio' });
  const [solapa, setSolapa] = useState<Solapa>('alumnos');
  const [busqueda, setBusqueda] = useState('');
  const [estado, setEstado] = useState<EstadoAlumno>('ACTIVO');
  const [filtroSolicitud, setFiltroSolicitud] = useState<EstadoSolicitud>('PENDIENTE');
  const [pendientes, setPendientes] = useState<number | null>(null);

  const contarPendientes = useCallback(async () => {
    try {
      setPendientes((await api.admin.solicitudes('PENDIENTE')).inscripciones.length);
    } catch {
      setPendientes(null);
    }
  }, []);

  useEffect(() => {
    void contarPendientes();
  }, [contarPendientes]);

  if (vista.tipo === 'ficha') {
    const { alumno, deuda } = vista;
    return (
      <View style={estilos.pantalla}>
        <Volver texto="Volver a la lista" onPress={() => setVista({ tipo: 'inicio' })} />
        <FichaAlumno
          alumno={alumno}
          deuda={deuda}
          onCambioEstado={(actualizado) => setVista({ tipo: 'ficha', alumno: actualizado, deuda })}
        />
      </View>
    );
  }

  if (vista.tipo === 'alta') {
    const desdeSolicitud = vista.solicitud !== null;
    return (
      <View style={estilos.pantalla}>
        <Volver
          texto={desdeSolicitud ? 'Volver a las solicitudes' : 'Volver a la lista'}
          onPress={() => setVista({ tipo: 'inicio' })}
        />
        <FormularioAlta
          solicitud={vista.solicitud}
          onListo={() => {
            setSolapa(desdeSolicitud ? 'solicitudes' : 'alumnos');
            setVista({ tipo: 'inicio' });
            void contarPendientes();
          }}
        />
      </View>
    );
  }

  return (
    <View style={estilos.pantalla}>
      <Solapas
        valor={solapa}
        onCambiar={setSolapa}
        opciones={[
          { valor: 'alumnos', titulo: 'Alumnos' },
          { valor: 'solicitudes', titulo: 'Solicitudes', contador: pendientes ?? undefined },
        ]}
      />
      {solapa === 'alumnos' ? (
        <ListaAlumnos
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          estado={estado}
          onEstado={setEstado}
          onElegir={(alumno, deuda) => setVista({ tipo: 'ficha', alumno, deuda })}
          onInscribir={() => setVista({ tipo: 'alta', solicitud: null })}
        />
      ) : (
        <ListaSolicitudes
          filtro={filtroSolicitud}
          onFiltro={setFiltroSolicitud}
          onInscribir={(solicitud) => setVista({ tipo: 'alta', solicitud })}
          onCambio={() => void contarPendientes()}
        />
      )}
    </View>
  );
}

// ------------------------------------------------------------------
// Lista de alumnos
// ------------------------------------------------------------------

function ListaAlumnos({
  busqueda,
  onBusqueda,
  estado,
  onEstado,
  onElegir,
  onInscribir,
}: {
  busqueda: string;
  onBusqueda: (v: string) => void;
  estado: EstadoAlumno;
  onEstado: (v: EstadoAlumno) => void;
  onElegir: (alumno: AlumnoListado, deuda: Deuda) => void;
  onInscribir: () => void;
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
      <Boton titulo="Inscribir alumno" onPress={onInscribir} style={{ marginBottom: espaciado.md }} />

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

function FilaAlumno({ alumno, deuda, onPress }: { alumno: AlumnoListado; deuda: Deuda; onPress: () => void }) {
  const nombre = `${alumno.apellido}, ${alumno.nombres}`;
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
// Ficha: datos, cuotas, baja y rehabilitación
// ------------------------------------------------------------------

function FichaAlumno({
  alumno,
  deuda,
  onCambioEstado,
}: {
  alumno: AlumnoListado;
  deuda: Deuda;
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

  async function rehabilitar() {
    setOcupado(true);
    try {
      await api.admin.reactivar(alumno.id);
      onCambioEstado({ ...alumno, estado: 'ACTIVO' });
      Alert.alert(
        'Alumno rehabilitado',
        `${alumno.nombres} vuelve a estar activo. Sus deportes, transporte y comedor los vuelve a cargar la familia.`,
      );
    } catch (err) {
      Alert.alert('No se pudo rehabilitar', err instanceof Error ? err.message : 'Intentá de nuevo.');
    } finally {
      setOcupado(false);
    }
  }

  function confirmarRehabilitacion() {
    Alert.alert(
      'Rehabilitar alumno',
      `${nombre} vuelve a figurar como alumno activo de su curso. Tiene que haber lugar en el curso. Las inscripciones a deportes, transporte y comedor no vuelven solas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Rehabilitar', onPress: () => void rehabilitar() },
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

      {/* ---------- Baja o rehabilitación ---------- */}
      <Seccion titulo="Estado del alumno" />
      <Tarjeta>
        {!activo ? (
          <Boton titulo="Rehabilitar" cargando={ocupado} onPress={confirmarRehabilitacion} />
        ) : bajaAbierta ? (
          <>
            <Opciones etiqueta="Motivo de la baja" valor={motivo} opciones={MOTIVOS} onChange={setMotivo} />
            <Aviso
              tono="espera"
              texto="Deja de figurar entre los alumnos activos de su curso. Se dan de baja sus inscripciones a deportes, transporte y comedor, para que no ocupe cupo ni genere cargos. Sus notas, asistencias y facturas se conservan, y se lo puede rehabilitar después."
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
// Solicitudes de las familias
// ------------------------------------------------------------------

function ListaSolicitudes({
  filtro,
  onFiltro,
  onInscribir,
  onCambio,
}: {
  filtro: EstadoSolicitud;
  onFiltro: (v: EstadoSolicitud) => void;
  onInscribir: (solicitud: SolicitudInscripcion) => void;
  onCambio: () => void;
}) {
  const [lista, setLista] = useState<SolicitudInscripcion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setLista((await api.admin.solicitudes(filtro)).inscripciones);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar las solicitudes.');
    }
  }, [filtro]);

  useEffect(() => {
    setLista(null);
    void cargar();
  }, [cargar]);

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  }, [cargar]);

  if (error) return <ErrorPantalla mensaje={error} onReintentar={() => void cargar()} />;

  const vacio =
    filtro === 'PENDIENTE'
      ? 'No hay solicitudes esperando respuesta.'
      : filtro === 'APROBADO'
        ? 'Todavía no se aceptó ninguna solicitud.'
        : 'No hay solicitudes rechazadas.';

  return (
    <ScrollView
      contentContainerStyle={estilos.scroll}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
      keyboardShouldPersistTaps="handled"
    >
      <Opciones etiqueta="Mostrar" valor={filtro} opciones={FILTROS_SOLICITUD} onChange={onFiltro} />
      {filtro === 'PENDIENTE' ? (
        <Text style={estilos.nota}>
          Aceptar una solicitud es inscribir al alumno: se cargan sus datos y se elige el curso.
        </Text>
      ) : null}

      {!lista ? (
        <Cargando mensaje="Cargando solicitudes…" />
      ) : lista.length === 0 ? (
        <Tarjeta>
          <Vacio mensaje={vacio} />
        </Tarjeta>
      ) : (
        lista.map((s) => (
          <TarjetaSolicitud
            key={s.id}
            solicitud={s}
            onInscribir={() => onInscribir(s)}
            onRechazada={() => {
              void cargar();
              onCambio();
            }}
          />
        ))
      )}

      <View style={{ height: espaciado.xxl }} />
    </ScrollView>
  );
}

function TarjetaSolicitud({
  solicitud: s,
  onInscribir,
  onRechazada,
}: {
  solicitud: SolicitudInscripcion;
  onInscribir: () => void;
  onRechazada: () => void;
}) {
  const [rechazando, setRechazando] = useState(false);
  const [nota, setNota] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function rechazar() {
    setOcupado(true);
    try {
      await api.admin.rechazarSolicitud(s.id, nota.trim() || undefined);
      Alert.alert('Solicitud rechazada', `La solicitud de ${s.nombreEstudiante} quedó rechazada.`);
      onRechazada();
    } catch (err) {
      Alert.alert('No se pudo rechazar', err instanceof Error ? err.message : 'Intentá de nuevo.');
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Tarjeta>
      <View style={estilos.cabecera}>
        <Text style={[estilos.nombre, { flex: 1 }]}>{s.nombreEstudiante}</Text>
        <Estado valor={s.status} />
      </View>
      <Dato etiqueta="Pide" valor={`${s.nivel} · ${s.curso}`} />
      <Dato etiqueta="Familia" valor={s.nombreTutor} />
      <Dato etiqueta="Correo" valor={s.emailTutor} />
      <Dato etiqueta="Teléfono" valor={s.telefonoTutor} />
      <Dato etiqueta="Enviada" valor={fecha(s.createdAt)} />
      {s.mensaje ? <Text style={estilos.mensaje}>"{s.mensaje}"</Text> : null}
      {s.notaAdmin ? <Aviso tono="neutro" texto={`Nota: ${s.notaAdmin}`} /> : null}

      {s.status === 'PENDIENTE' ? (
        rechazando ? (
          <>
            <CampoTexto
              etiqueta="Motivo (opcional)"
              valor={nota}
              onChange={setNota}
              multilinea
              placeholder="Ej.: no hay vacantes en ese curso"
            />
            <Boton
              titulo="Confirmar el rechazo"
              variante="peligro"
              cargando={ocupado}
              onPress={() => void rechazar()}
            />
            <Boton
              titulo="Cancelar"
              variante="suave"
              onPress={() => setRechazando(false)}
              style={{ marginTop: espaciado.sm }}
            />
          </>
        ) : (
          <>
            <Boton
              titulo="Aceptar e inscribir"
              accesibilidad={`Aceptar la solicitud e inscribir a ${s.nombreEstudiante}`}
              onPress={onInscribir}
              style={{ marginTop: espaciado.sm }}
            />
            <Boton
              titulo="Rechazar"
              variante="suave"
              accesibilidad={`Rechazar la solicitud de ${s.nombreEstudiante}`}
              onPress={() => setRechazando(true)}
              style={{ marginTop: espaciado.sm }}
            />
          </>
        )
      ) : null}
    </Tarjeta>
  );
}

// ------------------------------------------------------------------
// Alta (inscribir al alumno en el colegio)
// ------------------------------------------------------------------

function FormularioAlta({
  solicitud,
  onListo,
}: {
  solicitud: SolicitudInscripcion | null;
  onListo: () => void;
}) {
  const inicial = solicitud ? separarNombreCompleto(solicitud.nombreEstudiante) : { nombres: '', apellido: '' };
  const [datos, setDatos] = useState({
    dni: '',
    apellido: inicial.apellido,
    nombres: inicial.nombres,
    fechaNacimiento: '',
    domicilio: '',
    telefono: '',
    email: '',
    observaciones: '',
  });
  const [cursos, setCursos] = useState<CursoConCupo[] | null>(null);
  const [errorCursos, setErrorCursos] = useState<string | null>(null);
  const [nivelId, setNivelId] = useState<number | null>(null);
  const [cursoId, setCursoId] = useState<number | null>(null);
  // La cuenta de la familia que mandó la solicitud, si existe con ese correo.
  const [tutor, setTutor] = useState<UsuarioListado | null | undefined>(undefined);
  const [vincular, setVincular] = useState<'si' | 'no'>('si');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (campo: keyof typeof datos) => (v: string) => setDatos((d) => ({ ...d, [campo]: v }));

  useEffect(() => {
    void (async () => {
      try {
        const lista = (await api.admin.cursos()).cursos;
        setCursos(lista);
        // Con una solicitud, arranca en el nivel que pidió la familia.
        const pedido = solicitud
          ? lista.find((c) => c.nivel.nombre.toLowerCase() === solicitud.nivel.trim().toLowerCase())
          : undefined;
        setNivelId(pedido?.nivel.id ?? lista[0]?.nivel.id ?? null);
      } catch (err) {
        setErrorCursos(err instanceof Error ? err.message : 'No pudimos cargar los cursos.');
      }
    })();
  }, [solicitud]);

  useEffect(() => {
    if (!solicitud) return;
    void (async () => {
      try {
        const { usuarios } = await api.admin.buscarPadres(solicitud.emailTutor.trim());
        const correo = solicitud.emailTutor.trim().toLowerCase();
        setTutor(usuarios.find((u) => u.isActive && u.email.toLowerCase() === correo) ?? null);
      } catch {
        setTutor(null);
      }
    })();
  }, [solicitud]);

  async function guardar() {
    const problema = validarAltaAlumno({ ...datos, cursoId });
    if (problema) {
      setError(problema);
      return;
    }
    setError(null);
    setEnviando(true);

    let legajo: string;
    let alumnoId: number;
    try {
      const r = await api.admin.inscribirAlumno({
        dni: soloDigitos(datos.dni),
        apellido: datos.apellido.trim(),
        nombres: datos.nombres.trim(),
        fechaNacimiento: datos.fechaNacimiento,
        domicilio: datos.domicilio.trim(),
        telefono: datos.telefono.trim() || null,
        email: datos.email.trim() || null,
        cursoId: cursoId!,
        observaciones: datos.observaciones.trim() || null,
      });
      legajo = r.alumno.legajo;
      alumnoId = r.alumno.id;
    } catch (err) {
      // DNI repetido, curso sin lugar: el mensaje del backend dice qué pasó.
      setError(err instanceof Error ? err.message : 'No pudimos inscribir al alumno.');
      setEnviando(false);
      return;
    }

    // El alumno ya existe. Lo que sigue no lo deshace si falla: se avisa.
    const avisos: string[] = [];
    if (solicitud && solicitud.status === 'PENDIENTE') {
      try {
        await api.admin.aceptarSolicitud(solicitud.id, `Inscripto con el legajo ${legajo}.`);
      } catch (err) {
        avisos.push(`La solicitud no se pudo marcar como aceptada: ${err instanceof Error ? err.message : 'error'}.`);
      }
    }
    if (tutor && vincular === 'si') {
      try {
        await api.admin.vincularTutor(alumnoId, tutor.id);
      } catch (err) {
        avisos.push(`No se pudo vincular la cuenta de ${tutor.nombre}: ${err instanceof Error ? err.message : 'error'}.`);
      }
    }

    setEnviando(false);
    Alert.alert(
      'Alumno inscripto',
      [`${datos.nombres.trim()} ${datos.apellido.trim()} quedó inscripto con el legajo ${legajo}.`, ...avisos].join('\n\n'),
      [{ text: 'Entendido', onPress: onListo }],
    );
  }

  const niveles = cursos
    ? [...new Map(cursos.map((c) => [c.nivel.id, c.nivel])).values()].sort((a, b) => a.orden - b.orden)
    : [];
  const cursosDelNivel = (cursos ?? []).filter((c) => c.nivel.id === nivelId);

  return (
    <ScrollView contentContainerStyle={estilos.scroll} keyboardShouldPersistTaps="handled">
      {solicitud ? (
        <Tarjeta>
          <Text style={estilos.nombre}>Solicitud de {solicitud.nombreTutor}</Text>
          <Dato etiqueta="Alumno" valor={solicitud.nombreEstudiante} />
          <Dato etiqueta="Pide" valor={`${solicitud.nivel} · ${solicitud.curso}`} />
          <Aviso
            tono="neutro"
            texto="El nombre y el apellido salen de la solicitud, que los trae juntos: revisá que estén bien separados."
          />
        </Tarjeta>
      ) : null}

      <Seccion titulo="Datos del alumno" />
      <Tarjeta>
        <CampoTexto etiqueta="DNI" valor={datos.dni} onChange={cambiar('dni')} tipoTeclado="numeric" />
        <CampoTexto etiqueta="Apellido" valor={datos.apellido} onChange={cambiar('apellido')} />
        <CampoTexto etiqueta="Nombres" valor={datos.nombres} onChange={cambiar('nombres')} />
        <CampoTexto
          etiqueta="Fecha de nacimiento"
          valor={datos.fechaNacimiento}
          onChange={cambiar('fechaNacimiento')}
          placeholder="AAAA-MM-DD"
          ayuda="Por ejemplo, 2015-03-21."
        />
        <CampoTexto etiqueta="Domicilio" valor={datos.domicilio} onChange={cambiar('domicilio')} />
        <CampoTexto
          etiqueta="Teléfono (opcional)"
          valor={datos.telefono}
          onChange={cambiar('telefono')}
          tipoTeclado="phone-pad"
        />
        <CampoTexto
          etiqueta="Correo del alumno (opcional)"
          valor={datos.email}
          onChange={cambiar('email')}
          tipoTeclado="email-address"
        />
        <CampoTexto
          etiqueta="Observaciones (opcional)"
          valor={datos.observaciones}
          onChange={cambiar('observaciones')}
          multilinea
        />
      </Tarjeta>

      <Seccion titulo="Curso" />
      <Tarjeta>
        {errorCursos ? (
          <Aviso tono="alerta" texto={errorCursos} />
        ) : !cursos ? (
          <Cargando mensaje="Cargando cursos…" />
        ) : (
          <>
            <Opciones
              etiqueta="Nivel"
              valor={nivelId}
              opciones={niveles.map((n) => ({ valor: n.id, titulo: n.nombre }))}
              onChange={(v) => {
                setNivelId(v);
                setCursoId(null);
              }}
            />
            {cursosDelNivel.length === 0 ? (
              <Text style={estilos.suave}>No hay cursos activos en ese nivel.</Text>
            ) : (
              <Opciones
                etiqueta="Curso (alumnos activos sobre el cupo)"
                valor={cursoId}
                opciones={cursosDelNivel.map((c) => ({
                  valor: c.id,
                  titulo: `${c.nombre} "${c.division}" · ${c._count.alumnos}/${c.cupoMaximo}`,
                }))}
                onChange={setCursoId}
              />
            )}
          </>
        )}
      </Tarjeta>

      {solicitud ? (
        <>
          <Seccion titulo="Cuenta de la familia" />
          <Tarjeta>
            {tutor === undefined ? (
              <Cargando mensaje="Buscando la cuenta de la familia…" />
            ) : tutor ? (
              <>
                <Text style={estilos.suave}>
                  {tutor.nombre} tiene cuenta con {tutor.email}. Si se vincula, ve a su hijo en la app y recibe sus
                  cuotas.
                </Text>
                <Opciones
                  etiqueta="Vincular con el alumno"
                  valor={vincular}
                  opciones={[
                    { valor: 'si', titulo: 'Sí, vincular' },
                    { valor: 'no', titulo: 'No por ahora' },
                  ]}
                  onChange={setVincular}
                />
              </>
            ) : (
              <Aviso
                tono="neutro"
                texto={`No hay una cuenta de padre con el correo ${solicitud.emailTutor}. Cuando la familia se registre, se vincula desde la web, en "Vínculos familia-alumno".`}
              />
            )}
          </Tarjeta>
        </>
      ) : null}

      {error ? <Aviso tono="alerta" texto={error} /> : null}
      <Boton
        titulo={solicitud ? 'Aceptar la solicitud e inscribir' : 'Inscribir alumno'}
        cargando={enviando}
        onPress={() => void guardar()}
      />
      <Text style={estilos.nota}>El legajo lo asigna el sistema al guardar.</Text>

      <View style={{ height: espaciado.xxl }} />
    </ScrollView>
  );
}

// ------------------------------------------------------------------

function Solapas<T extends string>({
  valor,
  opciones,
  onCambiar,
}: {
  valor: T;
  opciones: { valor: T; titulo: string; contador?: number }[];
  onCambiar: (v: T) => void;
}) {
  return (
    <View style={estilos.solapas} accessibilityRole="tablist">
      {opciones.map((o) => {
        const activa = o.valor === valor;
        return (
          <Pressable
            key={o.valor}
            onPress={() => onCambiar(o.valor)}
            accessibilityRole="tab"
            accessibilityState={{ selected: activa }}
            accessibilityLabel={o.contador ? `${o.titulo}: ${o.contador} pendientes` : o.titulo}
            style={[estilos.solapa, activa && estilos.solapaActiva]}
          >
            <Text style={[estilos.solapaTexto, activa && estilos.solapaTextoActiva]}>
              {o.contador ? `${o.titulo} (${o.contador})` : o.titulo}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

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
  nota: { fontSize: 12, color: colores.textoSuave, marginBottom: espaciado.md, fontStyle: 'italic' },
  cabecera: { flexDirection: 'row', alignItems: 'flex-start', gap: espaciado.md, marginBottom: espaciado.xs },
  nombre: { ...tipografia.subtitulo, color: colores.texto },
  periodo: { ...tipografia.subtitulo, color: colores.texto, textTransform: 'capitalize' },
  suave: { ...tipografia.cuerpo, color: colores.textoSuave, marginBottom: espaciado.sm },
  mensaje: { ...tipografia.cuerpo, color: colores.textoSuave, fontStyle: 'italic', marginVertical: espaciado.sm },
  deuda: { fontSize: 14, fontWeight: '600', marginTop: espaciado.xs },
  solapas: {
    flexDirection: 'row',
    gap: espaciado.xs,
    padding: espaciado.xs,
    backgroundColor: colores.superficie,
    borderBottomWidth: 1,
    borderBottomColor: colores.borde,
  },
  solapa: {
    flex: 1,
    minHeight: ALTO_TOCABLE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.sm,
  },
  solapaActiva: { backgroundColor: colores.primario },
  solapaTexto: { fontSize: 14, fontWeight: '600', color: colores.textoSuave },
  solapaTextoActiva: { color: colores.textoInverso },
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
