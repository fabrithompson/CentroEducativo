import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Noticias() {
  const [noticias, setNoticias] = useState([]);

  useEffect(() => {
    api.listarNoticias()
      .then(({ noticias }) => setNoticias(noticias))
      .catch(() => setNoticias([]));
  }, []);

  return (
    <section id="noticias" className="section bg-light">
      <div className="container">
        <h2 className="section-title">Noticias</h2>
        <div className="news-grid">
          {noticias.length === 0 && (
            <p className="subtitle">No hay noticias disponibles por el momento.</p>
          )}
          {noticias.map((n) => (
            <article className="news-card" key={n.id}>
              <div className="news-date">
                {new Date(n.fecha).toLocaleDateString('es-AR')}
              </div>
              <h3>{n.titulo}</h3>
              <p>{n.cuerpo}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
