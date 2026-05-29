import { useState } from 'react';
import { api } from '../api/client.js';

const INICIAL = {
  nombre_tutor: '', email: '', telefono: '',
  nombre_alumno: '', nivel: '', anio_curso: '', comentario: '',
};

export default function Inscripcion() {
  const [form, setForm] = useState(INICIAL);
  const [errores, setErrores] = useState([]);
  const [numero, setNumero] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const validar = () => {
    const e = [];
    if (!form.nombre_tutor.trim()) e.push('El nombre del tutor es obligatorio.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.push('El email no es válido.');
    if (!form.telefono.trim()) e.push('El teléfono es obligatorio.');
    if (!form.nombre_alumno.trim()) e.push('El nombre del estudiante es obligatorio.');
    if (!form.nivel) e.push('Seleccioná un nivel educativo.');
    return e;
  };

  const enviar = async (e) => {
    e.preventDefault();
    setNumero('');
    const errs = validar();
    setErrores(errs);
    if (errs.length) return;

    setEnviando(true);
    try {
      const { numero } = await api.crearInscripcion(form);
      setNumero(numero);
      setForm(INICIAL);
    } catch (err) {
      setErrores([err.message]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section id="inscripcion" className="section bg-light">
      <div className="container">
        <h2 className="section-title">Solicitud de Inscripción</h2>
        <form className="form-inscription" onSubmit={enviar}>
          {numero && (
            <div className="alert alert-success">
              ¡Solicitud enviada! Tu número de solicitud es <strong>{numero}</strong>. Guardalo para
              hacer el seguimiento.
            </div>
          )}
          {errores.length > 0 && (
            <ul className="field-errors">{errores.map((m, i) => <li key={i}>{m}</li>)}</ul>
          )}

          <div className="form-group">
            <label htmlFor="ins-tutor">Nombre del padre/madre/tutor *</label>
            <input id="ins-tutor" name="nombre_tutor" value={form.nombre_tutor} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label htmlFor="ins-email">Email *</label>
            <input id="ins-email" name="email" type="email" value={form.email} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label htmlFor="ins-tel">Teléfono *</label>
            <input id="ins-tel" name="telefono" type="tel" value={form.telefono} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label htmlFor="ins-alumno">Nombre del estudiante *</label>
            <input id="ins-alumno" name="nombre_alumno" value={form.nombre_alumno} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label htmlFor="ins-nivel">Nivel educativo *</label>
            <select id="ins-nivel" name="nivel" value={form.nivel} onChange={cambiar}>
              <option value="">Seleccionar nivel</option>
              <option value="inicial">Educación Inicial</option>
              <option value="primaria">Educación Primaria</option>
              <option value="secundaria">Educación Secundaria</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="ins-anio">Año/Curso</label>
            <input id="ins-anio" name="anio_curso" value={form.anio_curso} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label htmlFor="ins-msg">Mensaje adicional</label>
            <textarea id="ins-msg" name="comentario" rows="4" value={form.comentario} onChange={cambiar} />
          </div>
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar Solicitud'}
          </button>
        </form>
      </div>
    </section>
  );
}
