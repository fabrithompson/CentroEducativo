const IMAGENES = [
  ['https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=400', 'Instalaciones'],
  ['https://images.unsplash.com/photo-1509062522246-3755977927d7?w=400', 'Aula'],
  ['https://images.unsplash.com/photo-1577896851231-70ef18881754?w=400', 'Biblioteca'],
  ['https://images.unsplash.com/photo-1562774053-701939374585?w=400', 'Laboratorio'],
  ['https://images.unsplash.com/photo-1576267423445-b2e0074d68a4?w=400', 'Deportes'],
  ['https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?w=400&q=80', 'Actividades'],
];

export default function Galeria() {
  return (
    <section id="galeria" className="section">
      <div className="container">
        <h2 className="section-title">Galería de Imágenes</h2>
        <div className="gallery">
          {IMAGENES.map(([src, alt]) => (
            <div className="gallery-item" key={alt} onClick={() => window.open(src, '_blank')}>
              <img src={src} alt={alt} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
