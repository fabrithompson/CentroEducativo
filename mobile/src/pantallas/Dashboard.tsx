/**
 * Dashboard del estudiante.
 *
 * Resume lo que una madre o padre quiere ver al abrir la app: si debe algo,
 * qué servicios tiene contratados el chico este mes y cuánto le cuestan.
 *
 * Los cuatro pedidos van en paralelo con `Promise.allSettled`: si el de
 * asistencia falla, el resto igual se muestra. En una red móvil, que una
 * pantalla entera se caiga porque una consulta no respondió es inaceptable.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import api, {
  type DeporteInscripto,
  type Hijo,
  type RespuestaAsistencia,
  type RespuestaDeportes,
  type RespuestaFacturas,
  type RespuestaServicios,
} from '../api/endpoints';
import { deudaTotal } from '../dominio/pagos';
import { dia, hora, moneda, periodo } from '../dominio/formato';
import { Aviso, Boton, Cargando, Dato, ErrorPantalla, Estado, Tarjeta, Vacio } from '../ui/componentes';
import { colores, espaciado, radio, tipografia } from '../ui/tema';

interface Props {
  hijo: Hijo;
  onIrAFinanzas: () => void;
}

interface Datos {
  deportes: RespuestaDeportes | null;
  servicios: RespuestaServicios | null;
  facturas: RespuestaFacturas | null;
  asistencia: RespuestaAsistencia | null;
}

export function PantallaDashboard({ hijo, onIrAFinanzas }: Props) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const alumnoId = hijo.alumno.id;

  const cargar = useCallback(async () => {
    setError(null);

    const [deportes, servicios, facturas, asistencia] = await Promise.allSettled([
      api.padres.deportes(alumnoId),
      api.padres.servicios(alumnoId),
      api.padres.facturas(alumnoId),
      api.padres.asistencia(alumnoId),
    ]);

    // Si TODO falló, es un problema de conexión y hay que decirlo.
    if ([deportes, servicios, facturas, asistencia].every((r) => r.status === 'rejected')) {
      const primero = deportes.status === 'rejected' ? deportes.reason : null;
      setError(primero instanceof Error ? primero.message : 'No pudimos cargar la información.');
      setDatos(null);
      return;
    }

    setDatos({
      deportes: deportes.status === 'fulfilled' ? deportes.value : null,
      servicios: servicios.status === 'fulfilled' ? servicios.value : null,
      facturas: facturas.status === 'fulfilled' ? facturas.value : null,
      asistencia: asistencia.status === 'fulfilled' ? asistencia.value : null,
    });
  }, [alumnoId]);

  useEffect(() => {
    setDatos(null);
    void cargar();
  }, [cargar]);

  const refrescar = useCallback(async () => {
    setRefrescando(true);
    await cargar();
    setRefrescando(false);
  }, [cargar]);

  if (error) return <ErrorPantalla mensaje={error} onReintentar={() => void cargar()} />;
  if (!datos) return <Cargando mensaje="Cargando la información del alumno…" />;

  const deuda = datos.facturas ? deudaTotal(datos.facturas.facturas) : 0;
  const hoy = new Date();

  return (
    <ScrollView
      contentContainerStyle={estilos.scroll}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
    >
      {/* ---------- Encabezado del alumno ---------- */}
      <Tarjeta>
        <Text style={estilos.nombre}>
          {hijo.alumno.apellido}, {hijo.alumno.nombres}
        </Text>
        <Text style={estilos.curso}>
          {hijo.alumno.curso
            ? `${hijo.alumno.curso.nivel.nombre} · ${hijo.alumno.curso.nombre} "${hijo.alumno.curso.division}"`
            : 'Sin curso asignado'}
        </Text>
        <View style={estilos.filaEstado}>
          <Estado valor={hijo.alumno.estado} />
          <Text style={estilos.legajo}>Legajo {hijo.alumno.legajo}</Text>
        </View>
      </Tarjeta>

      {/* ---------- Estado de cuenta ---------- */}
      {datos.facturas ? (
        <Tarjeta style={deuda > 0 ? estilos.tarjetaDeuda : estilos.tarjetaAlDia}>
          <Text style={estilos.etiquetaGrande}>
            {deuda > 0 ? 'Deuda pendiente' : 'Estado de cuenta'}
          </Text>
          <Text
            style={[estilos.importe, { color: deuda > 0 ? colores.alerta : colores.ok }]}
            accessibilityLabel={
              deuda > 0 ? `Deuda pendiente: ${moneda(deuda)}` : 'Sin deuda pendiente'
            }
          >
            {deuda > 0 ? moneda(deuda) : 'Al día'}
          </Text>

          {datos.facturas.resumen.vencidas > 0 ? (
            <Aviso
              tono="alerta"
              texto={`Tenés ${datos.facturas.resumen.vencidas} cuota(s) vencida(s). Tocá "Finanzas" para regularizar.`}
            />
          ) : null}

          {datos.facturas.resumen.enRevision > 0 ? (
            <Aviso
              tono="espera"
              texto={`${datos.facturas.resumen.enRevision} comprobante(s) esperando que Administración los valide.`}
            />
          ) : null}

          {deuda > 0 ? (
            <Boton
              titulo="Ver y pagar cuotas"
              onPress={onIrAFinanzas}
              accesibilidad={`Ir a finanzas para pagar una deuda de ${moneda(deuda)}`}
              style={{ marginTop: espaciado.sm }}
            />
          ) : null}
        </Tarjeta>
      ) : (
        <Tarjeta>
          <Vacio mensaje="No pudimos cargar el estado de cuenta. Deslizá hacia abajo para reintentar." />
        </Tarjeta>
      )}

      {/* ---------- Servicios del mes ---------- */}
      <Text style={estilos.seccion}>
        Servicios de {periodo(hoy.getFullYear(), hoy.getMonth() + 1)}
      </Text>

      {datos.servicios ? (
        <>
          <Tarjeta>
            <Text style={estilos.tituloTarjeta}>Transporte escolar</Text>
            {datos.servicios.transporte ? (
              <>
                <Text style={estilos.detalle}>{datos.servicios.transporte.recorrido.nombre}</Text>
                <Text style={estilos.detalleSuave}>{datos.servicios.transporte.recorrido.zonas}</Text>
                <Dato etiqueta="Salida" valor={hora(datos.servicios.transporte.recorrido.horaSalida)} />
                <Dato etiqueta="Regreso" valor={hora(datos.servicios.transporte.recorrido.horaRegreso)} />
                <Dato
                  etiqueta="Arancel mensual"
                  valor={moneda(datos.servicios.transporte.recorrido.arancelMensual)}
                />
              </>
            ) : (
              <Text style={estilos.detalleSuave}>No tiene transporte contratado este mes.</Text>
            )}
          </Tarjeta>

          <Tarjeta>
            <Text style={estilos.tituloTarjeta}>Comedor</Text>
            {datos.servicios.comedor ? (
              <>
                <Text style={estilos.detalle}>{datos.servicios.comedor.comedor.nombre}</Text>
                <Dato
                  etiqueta="Días por semana"
                  valor={String(datos.servicios.comedor.comedor.diasPorSemana)}
                />
                <Dato etiqueta="Horario" valor={hora(datos.servicios.comedor.comedor.horaServicio)} />
                <Dato
                  etiqueta="Arancel mensual"
                  valor={moneda(datos.servicios.comedor.comedor.arancelMensual)}
                />
              </>
            ) : (
              <Text style={estilos.detalleSuave}>No tiene comedor contratado este mes.</Text>
            )}
          </Tarjeta>

          <Tarjeta>
            <Text style={estilos.tituloTarjeta}>Costo mensual estimado</Text>
            <Dato etiqueta="Transporte" valor={moneda(datos.servicios.costoMensualEstimado.transporte)} />
            <Dato etiqueta="Comedor" valor={moneda(datos.servicios.costoMensualEstimado.comedor)} />
            <Dato etiqueta="Deportes" valor={moneda(datos.servicios.costoMensualEstimado.deportes)} />
            <View style={estilos.separador} />
            <Dato etiqueta="Total de servicios" valor={moneda(datos.servicios.costoMensualEstimado.total)} />
            <Text style={estilos.nota}>No incluye la cuota escolar.</Text>
          </Tarjeta>
        </>
      ) : null}

      {/* ---------- Deportes ---------- */}
      <Text style={estilos.seccion}>Actividades deportivas</Text>

      {datos.deportes ? (
        datos.deportes.deportes.length === 0 ? (
          <Tarjeta>
            <Text style={estilos.detalleSuave}>
              No está inscripto en ninguna actividad deportiva. Para anotarlo, acercate a
              Administración.
            </Text>
          </Tarjeta>
        ) : (
          <>
            <Aviso
              tono={datos.deportes.cupo.usado >= datos.deportes.cupo.maximo ? 'espera' : 'neutro'}
              texto={`Cursa ${datos.deportes.cupo.usado} de ${datos.deportes.cupo.maximo} deportes permitidos.`}
            />
            {datos.deportes.deportes.map((d) => (
              <TarjetaDeporte key={d.inscripcionId} inscripcion={d} />
            ))}
          </>
        )
      ) : null}

      {/* ---------- Asistencia ---------- */}
      {datos.asistencia?.resumen ? (
        <>
          <Text style={estilos.seccion}>Asistencia</Text>
          <Tarjeta>
            <Dato
              etiqueta="Porcentaje de asistencia"
              valor={
                datos.asistencia.resumen.porcentajeAsistencia === null
                  ? '—'
                  : `${datos.asistencia.resumen.porcentajeAsistencia}%`
              }
            />
            <Dato etiqueta="Presentes" valor={String(datos.asistencia.resumen.presentes)} />
            <Dato etiqueta="Ausentes" valor={String(datos.asistencia.resumen.ausentes)} />
            <Dato etiqueta="Llegadas tarde" valor={String(datos.asistencia.resumen.tardes)} />
          </Tarjeta>
        </>
      ) : null}

      <View style={{ height: espaciado.xxl }} />
    </ScrollView>
  );
}

function TarjetaDeporte({ inscripcion }: { inscripcion: DeporteInscripto }) {
  const { deporte } = inscripcion;

  return (
    <Tarjeta>
      <Text style={estilos.tituloTarjeta}>{deporte.nombre}</Text>
      <Text style={estilos.detalleSuave}>
        Profesor: {deporte.profesorResponsable.apellido}, {deporte.profesorResponsable.nombres}
      </Text>

      {deporte.horarios.map((h) => (
        <Dato
          key={h.id}
          etiqueta={dia(h.diaSemana)}
          valor={`${h.horaInicioTexto ?? hora(h.horaInicio)} – ${h.horaFinTexto ?? hora(h.horaFin)}`}
        />
      ))}

      {deporte.horarios[0]?.lugar ? (
        <Text style={estilos.nota}>{deporte.horarios[0].lugar}</Text>
      ) : null}

      <View style={estilos.separador} />
      <Dato etiqueta="Arancel mensual" valor={moneda(deporte.arancelMensual)} />
    </Tarjeta>
  );
}

const estilos = StyleSheet.create({
  scroll: { padding: espaciado.lg, backgroundColor: colores.fondo },
  nombre: { ...tipografia.titulo, color: colores.texto },
  curso: { ...tipografia.cuerpo, color: colores.textoSuave, marginTop: espaciado.xs },
  filaEstado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.md,
    marginTop: espaciado.md,
  },
  legajo: { ...tipografia.etiqueta, color: colores.textoSuave },
  tarjetaDeuda: { borderLeftWidth: 4, borderLeftColor: colores.alerta },
  tarjetaAlDia: { borderLeftWidth: 4, borderLeftColor: colores.ok },
  etiquetaGrande: { ...tipografia.etiqueta, color: colores.textoSuave, textTransform: 'uppercase' },
  importe: { ...tipografia.importe, marginVertical: espaciado.sm },
  seccion: {
    ...tipografia.subtitulo,
    color: colores.texto,
    marginTop: espaciado.lg,
    marginBottom: espaciado.md,
  },
  tituloTarjeta: { ...tipografia.subtitulo, color: colores.texto, marginBottom: espaciado.xs },
  detalle: { ...tipografia.cuerpo, color: colores.texto },
  detalleSuave: { ...tipografia.cuerpo, color: colores.textoSuave, marginBottom: espaciado.sm },
  nota: { fontSize: 12, color: colores.textoSuave, marginTop: espaciado.xs, fontStyle: 'italic' },
  separador: { height: 1, backgroundColor: colores.borde, marginVertical: espaciado.sm },
});
