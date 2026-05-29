import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginModal({ onCerrar, onIrARegistro }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ usuario: '', password: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.usuario || !form.password) {
      setError('Completá usuario y contraseña.');
      return;
    }
    setEnviando(true);
    try {
      await login(form);
      onCerrar();
      navigate('/panel');
    } catch (err) {
      setError(err.message);
    } finally {
      setEnviando(false);
    }
  };

  // Cierra el modal al hacer clic en el fondo (no en el contenido).
  const clickFondo = (e) => { if (e.target.classList.contains('modal')) onCerrar(); };

  return (
    <div className="modal" onClick={clickFondo}>
      <div className="modal-content">
        <button className="close" onClick={onCerrar} aria-label="Cerrar">&times;</button>
        <h2>Iniciar Sesión</h2>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={enviar}>
          <div className="form-group">
            <label htmlFor="usuario">Usuario</label>
            <input id="usuario" name="usuario" value={form.usuario} onChange={cambiar} autoFocus />
          </div>
          <div className="form-group">
            <label htmlFor="password">Contraseña</label>
            <input id="password" name="password" type="password" value={form.password} onChange={cambiar} />
          </div>
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Ingresando…' : 'Iniciar Sesión'}
          </button>
        </form>

        <p className="register-link">
          ¿No tenés cuenta? <a onClick={onIrARegistro}>Registrate aquí</a>
        </p>
      </div>
    </div>
  );
}
