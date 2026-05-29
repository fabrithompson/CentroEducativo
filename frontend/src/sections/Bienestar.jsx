const ITEMS = [
  ['fas fa-heart', 'Acompañamiento Psicológico', 'Profesionales de psicología educativa para apoyar el desarrollo emocional de los estudiantes.'],
  ['fas fa-users', 'Trabajo Social', 'Programa de contención familiar y apoyo a familias en situación de vulnerabilidad.'],
  ['fas fa-basketball-ball', 'Actividades Deportivas', 'Club deportivo escolar con múltiples disciplinas y competencias intercolegiales.'],
  ['fas fa-palette', 'Actividades Culturales', 'Talleres de arte, música, teatro y danzas para desarrollar la creatividad.'],
];

export default function Bienestar() {
  return (
    <section id="bienestar" className="section">
      <div className="container">
        <h2 className="section-title">Bienestar Estudiantil</h2>
        <div className="wellbeing-content">
          {ITEMS.map(([icono, titulo, desc]) => (
            <div className="wellbeing-item" key={titulo}>
              <i className={icono} />
              <div>
                <h3>{titulo}</h3>
                <p>{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
