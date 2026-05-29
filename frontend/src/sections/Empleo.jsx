import { useState } from 'react';
import { api } from '../api/client.js';

const INICIAL = { nombre: '', email: '', telefono: '', puesto: '', mensaje: '' };

export default function Empleo() {
  const [form, setForm] = useState(INICIAL);
  const [cv, setCv] = useState(null);
  const [nombreArchivo, setNombreArchivo] = useState('Seleccionar archivo');
  const [errores, setErrores] = useState([]);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const elegirArchivo = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCv(file);
    setNombreArchivo(file.name);
  };

  const validar = () => {
    const e = [];
    if (!form.nombre.trim()) e.push('El nombre es obligatorio.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.push('El email no es válido.');
    if (!form.puesto) e.push('Seleccioná un puesto.');
    if (cv && cv.type !== 'application/pdf') e.push('El CV debe ser un archivo PDF.');
    return e;
  };

  const enviar = async (e) => {
    e.preventDefault();
    setOk(false);
    const errs = validar();
    setErrores(errs);
    if (errs.length) return;

    setEnviando(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (cv) fd.append('cv', cv);
      await api.crearPostulacion(fd);
      setForm(INICIAL);
      setCv(null);
      setNombreArchivo('Seleccionar archivo');
      setOk(true);
    } catch (err) {
      setErrores([err.message]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section id="empleo" className="section">
      <div className="container">
        <h2 className="section-title">Empleo</h2>
        <form className="form-employment" onSubmit={enviar}>
          {ok && <div className="alert alert-success">¡CV enviado! Te contactaremos si hay una posición disponible.</div>}
          {errores.length > 0 && (
            <ul className="field-errors">{errores.map((m, i) => <li key={i}>{m}</li>)}</ul>
          )}

          <div className="form-group">
            <label htmlFor="cv-nombre">Nombre completo *</label>
            <input id="cv-nombre" name="nombre" value={form.nombre} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label htmlFor="cv-email">Email *</label>
            <input id="cv-email" name="email" type="email" value={form.email} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label htmlFor="cv-tel">Teléfono</label>
            <input id="cv-tel" name="telefono" value={form.telefono} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label htmlFor="cv-puesto">Puesto de interés *</label>
            <select id="cv-puesto" name="puesto" value={form.puesto} onChange={cambiar}>
              <option value="">Seleccionar puesto</option>
              <option value="docente">Docente</option>
              <option value="preceptor">Preceptor</option>
              <option value="admin">Personal Administrativo</option>
              <option value="auxiliar">Auxiliar</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="cv-msg">Mensaje</label>
            <textarea id="cv-msg" name="mensaje" rows="3" value={form.mensaje} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label>Adjuntar CV (PDF)</label>
            <div className="file-upload">
              <input type="file" id="cv-archivo" accept="application/pdf" onChange={elegirArchivo} />
              <label htmlFor="cv-archivo" className="file-label">
                <i className="fas fa-cloud-upload-alt" />
                <span>{nombreArchivo}</span>
              </label>
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar CV'}
          </button>
        </form>
      </div>
    </section>
  );
}
