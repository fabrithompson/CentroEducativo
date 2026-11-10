/**
 * Inscripciones del hijo: deportes, transporte, comedor y cursado.
 *
 * La consigna: cada alumno puede inscribirse a dos deportes a la vez, al
 * transporte por recorrido (opcional, puede variar de un mes a otro) y al
 * comedor; y los padres pueden "inscribir a su hijo al cursado".
 *
 * Ninguna regla se decide acá. El tope de 2 deportes, los choques de horario y
 * el vínculo con el hijo los valida el backend; la lista de deportes ya llega
 * marcada como `inscribible` con el `motivo` si no lo es, y cualquier rechazo
 * se muestra con el mensaje del servidor. La solicitud de cursado la aprueba
 * Administración, como la del formulario de la página pública.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import api, {
  type DeporteDisponible,
  type Hijo,
  type PlanComedor,
  type Recorrido,
  type RespuestaDeportes,
  type RespuestaServicios,
  type TurnoTransporte,
} from '../api/endpoints';
import { useSesion } from '../auth/SesionContext';
import { dia, hora, moneda, periodo } from '../dominio/formato';
import { validarSolicitudCursado } from '../dominio/formularios';
import { mesDe, sumarMeses, type Mes } from '../dominio/rango';
import { Aviso, Boton, CampoTexto, Cargando, Dato, ErrorPantalla, Opciones, Seccion, Tarjeta } from '../ui/componentes';
import { colores, espaciado, tipografia } from '../ui/tema';

interface Datos {
  inscriptos: RespuestaDeportes;
  disponibles: DeporteDisponible[];
  servicios: RespuestaServicios;
  recorridos: Recorrido[];
  planes: PlanComedor[];
}

const TURNOS: { valor: TurnoTransporte; titulo: string }[] = [
  { valor: 'IDA_Y_VUELTA', titulo: 'Ida y vuelta' },
  { valor: 'IDA', titulo: 'Sólo ida' },
  { valor: 'VUELTA', titulo: 'Sólo vuelta' },
];

export function PantallaInscripciones({ hijo }: { hijo: Hijo }) {
  const alumnoId = hijo.alumno.id;
  const hoy = mesDe();
  const [mes, setMes] = useState<Mes>(hoy);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [turno, setTurno] = useState<TurnoTransporte>('IDA_Y_VUELTA');

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [inscriptos, disponibles, servicios, recorridos, planes] = await Promise.all([
        api.padres.deportes(alumnoId),
        api.inscripciones.deportesDisponibles(alumnoId),
        api.padres.servicios(alumnoId, mes.anio, mes.mes),
        api.inscripciones.recorridos(mes.anio, mes.mes),
        api.inscripciones.planesComedor(mes.anio, mes.mes),
      ]);
      setDatos({
        inscriptos,
        disponibles: disponibles.deportes,
        servicios,
        recorridos: recorridos.recorridos,
        planes: planes.planes,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar las inscripciones.');
    }
  }, [alumnoId, mes]);

  useEffect(() => {
    setDatos(null);
    void cargar();
  }, [cargar]);

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  }, [cargar]);

  /** Corre una acción, muestra el mensaje del servidor y recarga. */
  async function ejecutar(clave: string, accion: () => Promise<{ mensaje: string }>) {
    setOcupado(clave);
    try {
      const r = await accion();
      Alert.alert('Listo', r.mensaje);
      await cargar();
    } catch (err) {
      Alert.alert('No se pudo completar', err instanceof Error ? err.message : 'Intentá de nuevo.');
    } finally {
      setOcupado(null);
    }
  }

  function confirmar(titulo: string, texto: string, accion: () => void) {
    Alert.alert(titulo, texto, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Confirmar', style: 'destructive', onPress: accion },
    ]);
  }

  if (error) return <ErrorPantalla mensaje={error} onReintentar={() => void cargar()} />;
  if (!datos) return <Cargando mensaje="Cargando inscripciones…" />;

  const nombre = hijo.alumno.nombres;
  const inscriptosIds = new Set(datos.inscriptos.deportes.map((d) => d.deporte.id));
  const transporte = datos.servicios.transporte?.estado === 'ACTIVA' ? datos.servicios.transporte : null;
  const comedor = datos.servicios.comedor?.estado === 'ACTIVA' ? datos.servicios.comedor : null;
  const nombreMes = periodo(mes.anio, mes.mes);

  return (
    <ScrollView
      contentContainerStyle={estilos.scroll}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
    >
      {/* ---------- Deportes ---------- */}
      <Seccion titulo="Deportes" />
      <Aviso
        tono={datos.inscriptos.cupo.usado >= datos.inscriptos.cupo.maximo ? 'espera' : 'neutro'}
        texto={`${nombre} cursa ${datos.inscriptos.cupo.usado} de ${datos.inscriptos.cupo.maximo} deportes permitidos. Los horarios no se pueden superponer.`}
      />

      {datos.inscriptos.deportes.map((d) => (
        <Tarjeta key={d.inscripcionId}>
          <Text style={estilos.titulo}>{d.deporte.nombre}</Text>
          <Text style={estilos.suave}>
            {d.deporte.horarios.map((h) => `${dia(h.diaSemana)} ${h.horaInicioTexto ?? hora(h.horaInicio)}`).join(' · ')}
          </Text>
          <Boton
            titulo="Dar de baja"
            variante="suave"
            cargando={ocupado === `baja-dep-${d.inscripcionId}`}
            accesibilidad={`Dar de baja a ${nombre} de ${d.deporte.nombre}`}
            onPress={() =>
              confirmar('Dar de baja', `${nombre} deja ${d.deporte.nombre} y se libera el cupo.`, () =>
                void ejecutar(`baja-dep-${d.inscripcionId}`, () => api.inscripciones.bajaDeporte(d.inscripcionId)),
              )
            }
            style={{ marginTop: espaciado.sm }}
          />
        </Tarjeta>
      ))}

      {datos.disponibles
        .filter((d) => !inscriptosIds.has(d.id))
        .map((d) => (
          <Tarjeta key={d.id}>
            <Text style={estilos.titulo}>{d.nombre}</Text>
            <Text style={estilos.suave}>
              Profesor: {d.profesorResponsable.apellido}, {d.profesorResponsable.nombres}
            </Text>
            {d.horarios.map((h) => (
              <Dato key={h.id} etiqueta={dia(h.diaSemana)} valor={`${h.horaInicioTexto} – ${h.horaFinTexto}`} />
            ))}
            <Dato etiqueta="Arancel mensual" valor={moneda(d.arancelMensual)} />
            {d.inscribible ? (
              <Boton
                titulo={`Inscribir a ${nombre}`}
                cargando={ocupado === `dep-${d.id}`}
                onPress={() => void ejecutar(`dep-${d.id}`, () => api.inscripciones.inscribirDeporte(alumnoId, d.id))}
                style={{ marginTop: espaciado.sm }}
              />
            ) : (
              <Aviso tono="neutro" texto={d.motivo ?? 'No disponible.'} />
            )}
          </Tarjeta>
        ))}

      {/* ---------- Período de los servicios ---------- */}
      <Seccion titulo="Transporte y comedor" />
      <Opciones
        etiqueta="Mes"
        valor={`${mes.anio}-${mes.mes}`}
        opciones={[hoy, sumarMeses(hoy, 1)].map((m) => ({ valor: `${m.anio}-${m.mes}`, titulo: periodo(m.anio, m.mes) }))}
        onChange={(v) => {
          const [a, m] = v.split('-').map(Number);
          setMes({ anio: a!, mes: m! });
        }}
      />
      <Text style={estilos.nota}>El transporte es opcional y se contrata mes a mes.</Text>

      {/* ---------- Transporte ---------- */}
      <Tarjeta>
        <Text style={estilos.titulo}>Transporte escolar — {nombreMes}</Text>
        {transporte ? (
          <>
            <Dato etiqueta="Recorrido" valor={`${transporte.recorrido.codigo} · ${transporte.recorrido.nombre}`} />
            <Dato etiqueta="Turno" valor={TURNOS.find((t) => t.valor === transporte.turno)?.titulo ?? transporte.turno} />
            <Dato etiqueta="Arancel mensual" valor={moneda(transporte.recorrido.arancelMensual)} />
            <Boton
              titulo="Dar de baja el transporte"
              variante="suave"
              cargando={ocupado === 'baja-tr'}
              onPress={() =>
                confirmar('Dar de baja', `${nombre} deja de usar el transporte en ${nombreMes}.`, () =>
                  void ejecutar('baja-tr', () => api.inscripciones.bajaTransporte(transporte.id)),
                )
              }
              style={{ marginTop: espaciado.sm }}
            />
          </>
        ) : (
          <>
            <Text style={estilos.suave}>No tiene transporte en {nombreMes}. Elegí turno y recorrido:</Text>
            <Opciones etiqueta="Turno" valor={turno} opciones={TURNOS} onChange={setTurno} />
            {datos.recorridos.map((r) => (
              <View key={r.id} style={estilos.opcionServicio}>
                <Text style={estilos.titulo}>
                  {r.codigo} · {r.nombre}
                </Text>
                <Text style={estilos.suave}>{r.zonas}</Text>
                <Dato etiqueta="Sale / regresa" valor={`${r.horaSalidaTexto} / ${r.horaRegresoTexto}`} />
                <Dato etiqueta="Arancel mensual" valor={moneda(r.arancelMensual)} />
                <Boton
                  titulo={`Contratar ${r.codigo}`}
                  cargando={ocupado === `tr-${r.id}`}
                  onPress={() =>
                    void ejecutar(`tr-${r.id}`, () =>
                      api.inscripciones.contratarTransporte({ alumnoId, recorridoId: r.id, turno, anio: mes.anio, mes: mes.mes }),
                    )
                  }
                />
              </View>
            ))}
          </>
        )}
      </Tarjeta>

      {/* ---------- Comedor ---------- */}
      <Tarjeta>
        <Text style={estilos.titulo}>Comedor — {nombreMes}</Text>
        {comedor ? (
          <>
            <Dato etiqueta="Plan" valor={comedor.comedor.nombre} />
            <Dato etiqueta="Arancel mensual" valor={moneda(comedor.comedor.arancelMensual)} />
            <Boton
              titulo="Dar de baja el comedor"
              variante="suave"
              cargando={ocupado === 'baja-co'}
              onPress={() =>
                confirmar('Dar de baja', `${nombre} deja el comedor en ${nombreMes}.`, () =>
                  void ejecutar('baja-co', () => api.inscripciones.bajaComedor(comedor.id)),
                )
              }
              style={{ marginTop: espaciado.sm }}
            />
          </>
        ) : (
          datos.planes.map((p) => (
            <View key={p.id} style={estilos.opcionServicio}>
              <Text style={estilos.titulo}>{p.nombre}</Text>
              <Dato etiqueta="Horario" valor={p.horaServicioTexto ?? '—'} />
              <Dato etiqueta="Arancel mensual" valor={moneda(p.arancelMensual)} />
              <Boton
                titulo="Contratar este plan"
                cargando={ocupado === `co-${p.id}`}
                onPress={() =>
                  void ejecutar(`co-${p.id}`, () =>
                    api.inscripciones.contratarComedor({ alumnoId, comedorId: p.id, anio: mes.anio, mes: mes.mes }),
                  )
                }
              />
            </View>
          ))
        )}
      </Tarjeta>

      {/* ---------- Cursado ---------- */}
      <Seccion titulo="Inscripción al cursado" />
      <SolicitudCursado />

      <View style={{ height: espaciado.xxl }} />
    </ScrollView>
  );
}

// ------------------------------------------------------------------

const NIVELES = ['Inicial', 'Primario', 'Secundario'];

function SolicitudCursado() {
  const { usuario } = useSesion();
  const [abierta, setAbierta] = useState(false);
  const [datos, setDatos] = useState({
    nombreTutor: usuario?.nombre ?? '',
    emailTutor: '',
    telefonoTutor: '',
    nombreEstudiante: '',
    nivel: '',
    curso: '',
    mensaje: '',
  });
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const cambiar = (campo: keyof typeof datos) => (v: string) => setDatos((d) => ({ ...d, [campo]: v }));

  async function enviar() {
    const problema = validarSolicitudCursado(datos);
    if (problema) {
      setError(problema);
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const r = await api.inscripciones.solicitarCursado({
        ...datos,
        nombreTutor: datos.nombreTutor.trim(),
        emailTutor: datos.emailTutor.trim(),
        nombreEstudiante: datos.nombreEstudiante.trim(),
        curso: datos.curso.trim(),
        mensaje: datos.mensaje.trim() || null,
      });
      setOk(r.mensaje);
      setDatos((d) => ({ ...d, nombreEstudiante: '', nivel: '', curso: '', mensaje: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos enviar la solicitud.');
    } finally {
      setEnviando(false);
    }
  }

  if (!abierta) {
    return (
      <Tarjeta>
        <Text style={estilos.suave}>
          Para anotar a un hijo en un nivel o curso, mandá la solicitud. Administración la revisa y se comunica con vos.
        </Text>
        {ok ? <Aviso tono="ok" texto={ok} /> : null}
        <Boton titulo="Solicitar inscripción" onPress={() => setAbierta(true)} />
      </Tarjeta>
    );
  }

  return (
    <Tarjeta>
      <CampoTexto etiqueta="Tu nombre" valor={datos.nombreTutor} onChange={cambiar('nombreTutor')} />
      <CampoTexto etiqueta="Tu correo" valor={datos.emailTutor} onChange={cambiar('emailTutor')} tipoTeclado="email-address" />
      <CampoTexto etiqueta="Tu teléfono" valor={datos.telefonoTutor} onChange={cambiar('telefonoTutor')} tipoTeclado="phone-pad" />
      <CampoTexto etiqueta="Nombre y apellido del estudiante" valor={datos.nombreEstudiante} onChange={cambiar('nombreEstudiante')} />
      <Opciones
        etiqueta="Nivel"
        valor={datos.nivel || null}
        opciones={NIVELES.map((n) => ({ valor: n, titulo: n }))}
        onChange={cambiar('nivel')}
      />
      <CampoTexto etiqueta="Curso, grado o sala" valor={datos.curso} onChange={cambiar('curso')} placeholder="Ej.: 1er Grado" />
      <CampoTexto etiqueta="Comentario (opcional)" valor={datos.mensaje} onChange={cambiar('mensaje')} multilinea />
      {error ? <Aviso tono="alerta" texto={error} /> : null}
      <Boton
        titulo="Enviar solicitud"
        cargando={enviando}
        onPress={() => void enviar()}
      />
      {ok ? <Aviso tono="ok" texto={ok} /> : null}
      <Boton titulo="Cerrar" variante="suave" onPress={() => setAbierta(false)} style={{ marginTop: espaciado.sm }} />
    </Tarjeta>
  );
}

const estilos = StyleSheet.create({
  scroll: { padding: espaciado.lg, backgroundColor: colores.fondo },
  titulo: { ...tipografia.subtitulo, color: colores.texto, marginBottom: espaciado.xs },
  suave: { ...tipografia.cuerpo, color: colores.textoSuave, marginBottom: espaciado.sm },
  nota: { fontSize: 12, color: colores.textoSuave, marginBottom: espaciado.md, fontStyle: 'italic' },
  opcionServicio: {
    borderTopWidth: 1,
    borderTopColor: colores.borde,
    paddingTop: espaciado.md,
    marginTop: espaciado.md,
  },
});
