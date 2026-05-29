import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import StarRating from '../components/StarRating.jsx';

const INICIAL = { nombre: '', identificacion: 'padre', comentario: '' };

export default function Opiniones() {
  const [form, setForm] = useState(INICIAL);
  const [valoracion, setValoracion] = useState(0);
  const [opiniones, setOpiniones] = useState([]);
  const [errores, setErrores] = useState([]);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cargar = () =>
    api.listarOpiniones().then(({ opiniones }) => setOpiniones(opiniones)).catch(() => {});

  useEffect(() => { cargar(); }, []);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const validar = () => {
    const e = [];
    if (!form.nombre.trim()) e.push('El nombre es obligatorio.');
    if (!form.comentario.trim()) e.push('El comentario es obligatorio.');
    if (valoracion < 1 || valoracion > 5) e.push('Elegí una valoración de 1 a 5 estrellas.');
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
      await api.crearOpinion({ ...form, valoracion });
      setForm(INICIAL);
      setValoracion(0);
      setOk(true);
      cargar();
    } catch (err) {
      setErrores([err.message]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section id="opiniones" className="section bg-light">
      <div className="container">
        <h2 className="section-title">Deja tu opinión</h2>
        <p className="subtitle">Tu opinión nos importa (no requiere registro).</p>

        <form className="form-opinion" onSubmit={enviar}>
          {ok && <div className="alert alert-success">¡Gracias por tu opinión!</div>}
          {errores.length > 0 && (
            <ul className="field-errors">{errores.map((m, i) => <li key={i}>{m}</li>)}</ul>
          )}

          <div className="form-group">
            <label htmlFor="op-nombre">Tu nombre *</label>
            <input id="op-nombre" name="nombre" value={form.nombre} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label htmlFor="op-rol">¿Eres?</label>
            <select id="op-rol" name="identificacion" value={form.identificacion} onChange={cambiar}>
              <option value="padre">Padre/Madre</option>
              <option value="estudiante">Estudiante</option>
              <option value="exalumno">Ex alumno</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="op-texto">Tu opinión *</label>
            <textarea id="op-texto" name="comentario" rows="4" value={form.comentario} onChange={cambiar} />
          </div>
          <div className="rating">
            <label>Tu valoración:</label>
            <StarRating value={valoracion} onChange={setValoracion} />
          </div>
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar Opinión'}
          </button>
        </form>

        <div className="opiniones-display">
          <h3>Últimas opiniones</h3>
          {opiniones.length === 0 && <p className="subtitle">Sé el primero en opinar.</p>}
          {opiniones.map((o) => (
            <div className="opinion-card" key={o.id}>
              <div className="opinion-header">
                <span className="opinion-author">{o.nombre}</span>
                <span className="opinion-rating">{'★'.repeat(o.valoracion)}{'☆'.repeat(5 - o.valoracion)}</span>
              </div>
              <p>{o.comentario}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
