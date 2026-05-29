import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import HeroSlider from '../components/HeroSlider.jsx';
import Nosotros from '../sections/Nosotros.jsx';
import Niveles from '../sections/Niveles.jsx';
import Bienestar from '../sections/Bienestar.jsx';
import Noticias from '../sections/Noticias.jsx';
import Galeria from '../sections/Galeria.jsx';
import Inscripcion from '../sections/Inscripcion.jsx';
import Empleo from '../sections/Empleo.jsx';
import Opiniones from '../sections/Opiniones.jsx';
import Contacto from '../sections/Contacto.jsx';

export default function Home() {
  const { hash } = useLocation();

  // Al entrar con un hash (#nosotros, #contacto…) desplaza a esa sección.
  useEffect(() => {
    if (hash) {
      const el = document.querySelector(hash);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [hash]);

  return (
    <main>
      <HeroSlider />
      <Nosotros />
      <Niveles />
      <Bienestar />
      <Noticias />
      <Galeria />
      <Inscripcion />
      <Empleo />
      <Opiniones />
      <Contacto />
    </main>
  );
}
