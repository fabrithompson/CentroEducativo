import { useState } from 'react';
import { api } from '../api/client.js';

const INICIAL = { nombre: '', email: '', telefono: '', asunto: '', mensaje: '' };

const TARJETAS = [
  ['fas fa-map-marker-alt', 'Dirección', 'Av. Educación 1234\nCABA, Argentina'],
  ['fas fa-phone', 'Teléfono', '(011) 1234-5678\n(011) 9876-5432'],
  ['fas fa-envelope', 'Email', 'info@centromixto.edu\nadmisiones@centromixto.edu'],
];

export default function Contacto() {
  const [form, setForm] = useState(INICIAL);
  const [errores, setErrores] = useState([]);
  const [ok, setOk] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const validar = () => {
    const e = [];
    if (!form.nombre.trim()) e.push('El nombre es obligatorio.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.push('El email no es válido.');
    if (!form.mensaje.trim()) e.push('El mensaje es obligatorio.');
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
      await api.crearContacto(form);
      setForm(INICIAL);
      setOk(true);
    } catch (err) {
      setErrores([err.message]);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <section id="contacto" className="section">
      <div className="container">
        <h2 className="section-title">Contacto</h2>
        <div className="contact-grid">
          {TARJETAS.map(([icono, titulo, texto]) => (
            <div className="contact-info-card" key={titulo}>
              <i className={icono} />
              <h3>{titulo}</h3>
              <p>{texto.split('\n').map((l, i) => <span key={i}>{l}<br /></span>)}</p>
            </div>
          ))}
          <div className="contact-info-card">
            <i className="fab fa-whatsapp" />
            <h3>WhatsApp</h3>
            <p>+54 11 1234-5678</p>
            <a href="https://wa.me/541112345678" className="btn-whatsapp" target="_blank" rel="noreferrer">
              Enviar mensaje
            </a>
          </div>
        </div>

        <form className="form-contact" onSubmit={enviar}>
          <h3>Envíanos un mensaje</h3>
          {ok && <div className="alert alert-success">¡Mensaje enviado! Te responderemos a la brevedad.</div>}
          {errores.length > 0 && (
            <ul className="field-errors">{errores.map((m, i) => <li key={i}>{m}</li>)}</ul>
          )}

          <div className="form-group">
            <label htmlFor="ct-nombre">Nombre *</label>
            <input id="ct-nombre" name="nombre" value={form.nombre} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label htmlFor="ct-email">Email *</label>
            <input id="ct-email" name="email" type="email" value={form.email} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label htmlFor="ct-tel">Teléfono</label>
            <input id="ct-tel" name="telefono" value={form.telefono} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label htmlFor="ct-asunto">Asunto</label>
            <input id="ct-asunto" name="asunto" value={form.asunto} onChange={cambiar} />
          </div>
          <div className="form-group">
            <label htmlFor="ct-msg">Mensaje *</label>
            <textarea id="ct-msg" name="mensaje" rows="4" value={form.mensaje} onChange={cambiar} />
          </div>
          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
      </div>
    </section>
  );
}
