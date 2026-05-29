import { useState, useEffect, useCallback } from 'react';

const SLIDES = [
  'https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1920&q=80',
  'https://images.unsplash.com/photo-1509062522246-3755977927d7?w=1920&q=80',
  'https://images.unsplash.com/photo-1562774053-701939374585?w=1920&q=80',
  'https://images.unsplash.com/photo-1577896851231-70ef18881754?w=1920&q=80',
  'https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=1920&q=80',
];

export default function HeroSlider() {
  const [actual, setActual] = useState(0);

  const mover = useCallback((delta) => {
    setActual((prev) => (prev + delta + SLIDES.length) % SLIDES.length);
  }, []);

  // Auto-avance cada 5 segundos.
  useEffect(() => {
    const id = setInterval(() => mover(1), 5000);
    return () => clearInterval(id);
  }, [mover]);

  return (
    <section id="inicio" className="hero">
      <div className="hero-slider">
        {SLIDES.map((url, i) => (
          <div
            key={url}
            className={`slide ${i === actual ? 'active' : ''}`}
            style={{ backgroundImage: `url('${url}')` }}
          />
        ))}

        <div className="hero-content">
          <h2>Educando para el futuro</h2>
          <p>Formando personas integrales con valores y conocimientos</p>
          <a href="#inscripcion" className="btn-primary">Solicitar Inscripción</a>
        </div>

        <button className="sliderprev" onClick={() => mover(-1)} aria-label="Anterior">&#10094;</button>
        <button className="slidernext" onClick={() => mover(1)} aria-label="Siguiente">&#10095;</button>

        <div className="dots-container">
          {SLIDES.map((url, i) => (
            <span
              key={url}
              className={`dot ${i === actual ? 'active' : ''}`}
              onClick={() => setActual(i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
