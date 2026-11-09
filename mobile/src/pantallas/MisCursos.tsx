/**
 * Mis cursos (docente): el reporte por docente de la consigna, para uno mismo.
 *
 * Cursos a cargo agrupados por nivel, con las materias, su carga horaria y la
 * grilla de cada una, y los deportes de los que es responsable. Sale de
 * `GET /api/profesores/yo/cursos`, que es el mismo reporte que ve el
 * administrador en la web.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import api, { type ReporteDocente } from '../api/endpoints';
import { dia } from '../dominio/formato';
import { Cargando, Dato, ErrorPantalla, Seccion, Tarjeta, Vacio } from '../ui/componentes';
import { colores, espaciado, tipografia } from '../ui/tema';

const TURNOS: Record<string, string> = { MANANA: 'Mañana', TARDE: 'Tarde', JORNADA_COMPLETA: 'Jornada completa' };

export function PantallaMisCursos() {
  const [datos, setDatos] = useState<ReporteDocente | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setDatos(await api.docente.misCursos());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos cargar tus cursos.');
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
  if (!datos) return <Cargando mensaje="Cargando tus cursos…" />;

  return (
    <ScrollView
      contentContainerStyle={estilos.scroll}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={refrescar} />}
    >
      <Tarjeta>
        <Text style={estilos.nombre}>
          {datos.profesor.apellido}, {datos.profesor.nombres}
        </Text>
        {datos.profesor.especialidad ? <Text style={estilos.suave}>{datos.profesor.especialidad}</Text> : null}
        <Dato etiqueta="Niveles" valor={String(datos.totales.niveles)} />
        <Dato etiqueta="Cursos" valor={String(datos.totales.cursos)} />
        <Dato etiqueta="Materias" valor={String(datos.totales.materias)} />
        <Dato etiqueta="Horas cátedra por semana" valor={String(datos.totales.horasSemanales)} />
      </Tarjeta>

      {datos.niveles.length === 0 ? (
        <Tarjeta>
          <Vacio mensaje="Todavía no tenés materias asignadas." />
        </Tarjeta>
      ) : null}

      {datos.niveles.map((n) => (
        <View key={n.nivel}>
          <Seccion titulo={n.nivel} />
          {n.cursos.map((c) => (
            <Tarjeta key={c.curso}>
              <Text style={estilos.titulo}>{c.curso}</Text>
              <Text style={estilos.suave}>Turno {TURNOS[c.turno] ?? c.turno}</Text>
              {c.materias.map((m) => (
                <View key={m.id} style={estilos.materia}>
                  <Text style={estilos.materiaNombre}>
                    {m.nombre} · {m.cargaHoraria} h
                  </Text>
                  {m.horarios.length === 0 ? (
                    <Text style={estilos.suave}>Sin horarios cargados.</Text>
                  ) : (
                    m.horarios.map((h) => (
                      <Dato
                        key={`${h.diaSemana}-${h.desde}`}
                        etiqueta={dia(h.diaSemana)}
                        valor={`${h.desde} – ${h.hasta}${h.aula ? ` · ${h.aula}` : ''}`}
                      />
                    ))
                  )}
                </View>
              ))}
            </Tarjeta>
          ))}
        </View>
      ))}

      {datos.deportes.length > 0 ? (
        <>
          <Seccion titulo="Deportes a cargo" />
          {datos.deportes.map((d) => (
            <Tarjeta key={d.id}>
              <Text style={estilos.titulo}>{d.nombre}</Text>
              {d.horarios.map((h) => (
                <Dato
                  key={`${h.nivel}-${h.diaSemana}-${h.desde}`}
                  etiqueta={`${dia(h.diaSemana)} · ${h.nivel}`}
                  valor={`${h.desde} – ${h.hasta}`}
                />
              ))}
            </Tarjeta>
          ))}
        </>
      ) : null}

      <View style={{ height: espaciado.xxl }} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  scroll: { padding: espaciado.lg, backgroundColor: colores.fondo },
  nombre: { ...tipografia.titulo, color: colores.texto },
  titulo: { ...tipografia.subtitulo, color: colores.texto },
  suave: { ...tipografia.cuerpo, color: colores.textoSuave, marginBottom: espaciado.xs },
  materia: { borderTopWidth: 1, borderTopColor: colores.borde, paddingTop: espaciado.sm, marginTop: espaciado.sm },
  materiaNombre: { ...tipografia.cuerpo, color: colores.texto, fontWeight: '600' },
});
