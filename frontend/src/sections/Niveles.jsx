const NIVELES = [
  ['fas fa-child', 'Educación Inicial', 'Desde los 45 días hasta los 5 años. Jardín maternal y preescolar.'],
  ['fas fa-school', 'Educación Primaria', '1° a 6° grado. Formación académica integral.'],
  ['fas fa-graduation-cap', 'Educación Secundaria', '1° a 5° año. Orientación en ciencias y humanidades.'],
];

export default function Niveles() {
  return (
    <section id="niveles" className="section bg-light">
      <div className="container">
        <h2 className="section-title">Niveles Educativos</h2>
        <div className="levels-grid">
          {NIVELES.map(([icono, titulo, desc]) => (
            <div className="level-card" key={titulo}>
              <i className={icono} />
              <h3>{titulo}</h3>
              <p>{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
