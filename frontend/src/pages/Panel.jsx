import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

const ETIQUETA_ROL = {
  estudiante: 'Estudiante',
  padre: 'Padre / Tutor',
  docente: 'Docente',
  autoridad: 'Autoridad',
  personal: 'Personal',
};

// --- Componentes auxiliares de presentación ---

function ModuloLista({ titulo, icono, children }) {
  return (
    <div className="modulo-card">
      <h4><i className={icono} /> {titulo}</h4>
      {children}
    </div>
  );
}

function Tabla({ columnas, filas, render }) {
  if (!filas || filas.length === 0) return <p className="subtitle">Sin registros.</p>;
  return (
    <div className="tabla-wrapper">
      <table className="tabla-admin">
        <thead>
          <tr>{columnas.map((c) => <th key={c}>{c}</th>)}</tr>
        </thead>
        <tbody>{filas.map(render)}</tbody>
      </table>
    </div>
  );
}

const fecha = (f) => new Date(f).toLocaleDateString('es-AR');

// --- Renderers por rol ---

function PanelEstudiante({ m }) {
  return (
    <div className="modulo-grid">
      <ModuloLista titulo="Mis Cursos" icono="fas fa-book">
        <ul>{m.cursos.map((c) => <li key={c}>{c}</li>)}</ul>
      </ModuloLista>
      <ModuloLista titulo="Horario" icono="fas fa-clock">
        <ul>{m.horario.map((h) => <li key={h.dia}><strong>{h.dia}:</strong> {h.detalle}</li>)}</ul>
      </ModuloLista>
      <ModuloLista titulo="Tareas" icono="fas fa-tasks">
        <ul>{m.tareas.map((t, i) => <li key={i}>{t.materia}: {t.detalle} (vence {t.vence})</li>)}</ul>
      </ModuloLista>
      <ModuloLista titulo="Asistencia" icono="fas fa-calendar-check">
        <ul>
          <li>Presentes: {m.asistencia.presentes}</li>
          <li>Ausentes: {m.asistencia.ausentes}</li>
          <li>Porcentaje: {m.asistencia.porcentaje}%</li>
        </ul>
      </ModuloLista>
      <ModuloLista titulo="Comunicados" icono="fas fa-bullhorn">
        <ul>{m.comunicados.map((c) => <li key={c.id}>{c.titulo}</li>)}</ul>
      </ModuloLista>
    </div>
  );
}

function PanelPadre({ m }) {
  return (
    <div className="modulo-grid">
      <ModuloLista titulo="Información del estudiante" icono="fas fa-user-graduate">
        <ul>
          <li>Nombre: {m.estudiante.nombre}</li>
          <li>Curso: {m.estudiante.curso}</li>
          <li>Nivel: {m.estudiante.nivel}</li>
        </ul>
      </ModuloLista>
      <ModuloLista titulo="Asistencia" icono="fas fa-calendar-check">
        <ul>
          <li>Presentes: {m.asistencia.presentes}</li>
          <li>Ausentes: {m.asistencia.ausentes}</li>
          <li>Porcentaje: {m.asistencia.porcentaje}%</li>
        </ul>
      </ModuloLista>
      <ModuloLista titulo="Estado de inscripción" icono="fas fa-clipboard-check">
        <p>{m.estadoInscripcion}</p>
      </ModuloLista>
      <ModuloLista titulo="Comunicados" icono="fas fa-bullhorn">
        <ul>{m.comunicados.map((c) => <li key={c.id}>{c.titulo}</li>)}</ul>
      </ModuloLista>
    </div>
  );
}

function PanelDocente({ m }) {
  return (
    <div className="modulo-grid">
      <ModuloLista titulo="Cursos asignados" icono="fas fa-chalkboard-teacher">
        <ul>{m.cursosAsignados.map((c) => <li key={c}>{c}</li>)}</ul>
      </ModuloLista>
      <ModuloLista titulo="Tareas (carga simulada)" icono="fas fa-tasks">
        <ul>{m.tareas.map((t, i) => <li key={i}>{t.materia}: {t.detalle}</li>)}</ul>
      </ModuloLista>
      <ModuloLista titulo="Asistencia" icono="fas fa-calendar-check">
        <ul>
          <li>Presentes: {m.asistencia.presentes}</li>
          <li>Ausentes: {m.asistencia.ausentes}</li>
          <li>Porcentaje: {m.asistencia.porcentaje}%</li>
        </ul>
      </ModuloLista>
      <ModuloLista titulo="Comunicados" icono="fas fa-bullhorn">
        <ul>{m.comunicados.map((c) => <li key={c.id}>{c.titulo}</li>)}</ul>
      </ModuloLista>
    </div>
  );
}

function PanelAdmin({ m, tabs }) {
  const [tab, setTab] = useState(tabs[0].key);
  const activo = tabs.find((t) => t.key === tab);
  return (
    <>
      <div className="tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label} <span className="badge">{(m[t.key] || []).length}</span>
          </button>
        ))}
      </div>
      {activo.render(m[activo.key] || [])}
    </>
  );
}

// --- Página principal ---

export default function Panel() {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.panelResumen().then(setData).catch((e) => setError(e.message));
  }, []);

  const cerrarSesion = () => { logout(); navigate('/'); };

  const tabsAutoridad = [
    { key: 'usuarios', label: 'Usuarios', render: (f) => (
      <Tabla columnas={['Nombre', 'Rol', 'Email', 'Usuario', 'Alta']} filas={f}
        render={(u) => <tr key={u.id}><td>{u.nombre}</td><td><span className="badge">{ETIQUETA_ROL[u.rol]}</span></td><td>{u.email}</td><td>{u.usuario}</td><td>{fecha(u.creado_en)}</td></tr>} />
    ) },
    { key: 'inscripciones', label: 'Inscripciones', render: (f) => (
      <Tabla columnas={['N°', 'Tutor', 'Alumno', 'Nivel', 'Estado']} filas={f}
        render={(i) => <tr key={i.id}><td>{i.numero}</td><td>{i.nombre_tutor}</td><td>{i.nombre_alumno}</td><td>{i.nivel}</td><td>{i.estado}</td></tr>} />
    ) },
    { key: 'opiniones', label: 'Opiniones', render: (f) => (
      <Tabla columnas={['Nombre', 'Comentario', 'Valoración']} filas={f}
        render={(o) => <tr key={o.id}><td>{o.nombre}</td><td>{o.comentario}</td><td>{'★'.repeat(o.valoracion)}</td></tr>} />
    ) },
    { key: 'consultas', label: 'Consultas', render: (f) => (
      <Tabla columnas={['Nombre', 'Email', 'Asunto', 'Mensaje']} filas={f}
        render={(c) => <tr key={c.id}><td>{c.nombre}</td><td>{c.email}</td><td>{c.asunto || '—'}</td><td>{c.mensaje}</td></tr>} />
    ) },
    { key: 'postulaciones', label: 'Postulaciones', render: (f) => (
      <Tabla columnas={['Nombre', 'Email', 'Puesto', 'CV']} filas={f}
        render={(p) => <tr key={p.id}><td>{p.nombre}</td><td>{p.email}</td><td>{p.puesto}</td><td>{p.cv_archivo ? <a href={`/uploads/${p.cv_archivo}`} target="_blank" rel="noreferrer">Ver PDF</a> : '—'}</td></tr>} />
    ) },
    { key: 'noticias', label: 'Noticias', render: (f) => (
      <Tabla columnas={['Título', 'Fecha']} filas={f}
        render={(n) => <tr key={n.id}><td>{n.titulo}</td><td>{fecha(n.fecha)}</td></tr>} />
    ) },
  ];

  const tabsPersonal = [
    tabsAutoridad.find((t) => t.key === 'consultas'),
    tabsAutoridad.find((t) => t.key === 'inscripciones'),
    tabsAutoridad.find((t) => t.key === 'postulaciones'),
    { key: 'comunicados', label: 'Comunicados', render: (f) => (
      <Tabla columnas={['Título', 'Fecha']} filas={f}
        render={(n) => <tr key={n.id}><td>{n.titulo}</td><td>{fecha(n.fecha)}</td></tr>} />
    ) },
  ];

  const renderModulos = () => {
    if (!data) return null;
    const m = data.modulos;
    switch (data.rol) {
      case 'estudiante': return <PanelEstudiante m={m} />;
      case 'padre': return <PanelPadre m={m} />;
      case 'docente': return <PanelDocente m={m} />;
      case 'autoridad': return <PanelAdmin m={m} tabs={tabsAutoridad} />;
      case 'personal': return <PanelAdmin m={m} tabs={tabsPersonal} />;
      default: return null;
    }
  };

  return (
    <div className="panel-container">
      <div className="panel-header">
        <h1><i className="fas fa-tachometer-alt" /> Mi Panel</h1>
        <Link to="/" className="panel-back"><i className="fas fa-arrow-left" /> Volver al inicio</Link>
      </div>

      <div className="user-welcome">
        <div>
          <h2>Bienvenido, {usuario?.nombre}</h2>
          <p>{ETIQUETA_ROL[usuario?.rol] || usuario?.rol}</p>
        </div>
        <button className="btn-logout" onClick={cerrarSesion}>
          <i className="fas fa-sign-out-alt" /> Cerrar Sesión
        </button>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><i className="fas fa-calendar-alt" /><div className="value">2026</div><div className="label">Ciclo Lectivo</div></div>
        <div className="stat-card"><i className="fas fa-envelope" /><div className="value">0</div><div className="label">Mensajes Nuevos</div></div>
        <div className="stat-card"><i className="fas fa-bell" /><div className="value">3</div><div className="label">Notificaciones</div></div>
        <div className="stat-card"><i className="fas fa-check-circle" /><div className="value">Activo</div><div className="label">Estado</div></div>
      </div>

      <div className="panel-section">
        <h3><i className="fas fa-layer-group" /> Panel de {ETIQUETA_ROL[data?.rol] || ''}</h3>
        {error && <div className="alert alert-error">{error}</div>}
        {!data && !error && <div className="loading">Cargando tu panel…</div>}
        {renderModulos()}
      </div>
    </div>
  );
}
