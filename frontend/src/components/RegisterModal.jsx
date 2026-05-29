import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const ROLES = [
  ['estudiante', 'Estudiante'],
  ['padre', 'Padre / Tutor'],
  ['docente', 'Docente'],
  ['autoridad', 'Autoridad'],
  ['personal', 'Personal'],
];

const INICIAL = { rol: '', nombre: '', email: '', usuario: '', password: '', dni: '', curso: '' };

export default function RegisterModal({ onCerrar, onIrALogin }) {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(INICIAL);
  const [errores, setErrores] = useState([]);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  // Validación en el cliente (el backend revalida igualmente).
  const validar = () => {
    const e = [];
    if (!form.rol) e.push('Seleccioná un tipo de usuario.');
    if (!form.nombre.trim()) e.push('El nombre es obligatorio.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.push('El email no es válido.');
    if (!form.usuario.trim()) e.push('El usuario es obligatorio.');
    if (form.password.length < 8) e.push('La contraseña debe tener al menos 8 caracteres.');
    return e;
  };

  const enviar = async (e) => {
    e.preventDefault();
    const errs = validar();
    setErrores(errs);
    if (errs.length) return;

    setEnviando(true);
    try {
      await register(form);
      onCerrar();
      navigate('/panel');
    } catch (err) {
      setErrores([err.message]);
    } finally {
      setEnviando(false);
    }
  };

  const clickFondo = (e) => { if (e.target.classList.contains('modal')) onCerrar(); };

  // Campos condicionales según rol.
  const muestraDni = ['estudiante', 'docente'].includes(form.rol);
  const muestraCurso = form.rol === 'estudiante';

  return (
    <div className="modal" onClick={clickFondo}>
      <div className="modal-content">
        <button className="close" onClick={onCerrar} aria-label="Cerrar">&times;</button>
        <h2>Registrarse</h2>

        {errores.length > 0 && (
          <ul className="field-errors">
            {errores.map((m, i) => <li key={i}>{m}</li>)}
          </ul>
        )}

        <form onSubmit={enviar}>
          <div className="form-group">
            <label htmlFor="rol">Tipo de usuario *</label>
            <select id="rol" name="rol" value={form.rol} onChange={cambiar}>
              <option value="">Seleccionar…</option>
              {ROLES.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="nombre">Nombre completo *</label>
            <input id="nombre" name="nombre" value={form.nombre} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label htmlFor="email">Email *</label>
            <input id="email" name="email" type="email" value={form.email} onChange={cambiar} />
          </div>
          {muestraDni && (
            <div className="form-group">
              <label htmlFor="dni">DNI</label>
              <input id="dni" name="dni" value={form.dni} onChange={cambiar} />
            </div>
          )}
          {muestraCurso && (
            <div className="form-group">
              <label htmlFor="curso">Curso / Año</label>
              <input id="curso" name="curso" value={form.curso} onChange={cambiar} />
            </div>
          )}
          <div className="form-group">
            <label htmlFor="reg-usuario">Usuario *</label>
            <input id="reg-usuario" name="usuario" value={form.usuario} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label htmlFor="reg-password">Contraseña * (mín. 8 caracteres)</label>
            <input id="reg-password" name="password" type="password" value={form.password} onChange={cambiar} />
          </div>
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Registrando…' : 'Registrarse'}
          </button>
        </form>

        <p className="register-link">
          ¿Ya tenés cuenta? <a onClick={onIrALogin}>Iniciar sesión</a>
        </p>
      </div>
    </div>
  );
}
