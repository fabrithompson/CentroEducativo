export default function Footer() {
  return (
    <footer>
      <div className="container">
        <div className="footer-content">
          <div className="footer-section">
            <h3>Educar Para Transformar</h3>
            <p>Formando personas integrales para un futuro mejor.</p>
          </div>
          <div className="footer-section">
            <h3>Enlaces rápidos</h3>
            <ul>
              <li><a href="/#nosotros">Quiénes Somos</a></li>
              <li><a href="/#niveles">Niveles Educativos</a></li>
              <li><a href="/#inscripcion">Inscripción</a></li>
              <li><a href="/#empleo">Empleo</a></li>
            </ul>
          </div>
          <div className="footer-section">
            <h3>Contacto</h3>
            <p><i className="fas fa-phone" /> (011) 1234-5678</p>
            <p><i className="fas fa-envelope" /> info@centromixto.edu</p>
            <div className="social-links">
              <a href="#"><i className="fab fa-facebook" /></a>
              <a href="#"><i className="fab fa-instagram" /></a>
              <a href="#"><i className="fab fa-whatsapp" /></a>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <p>&copy; 2026 Educar Para Transformar. Todos los derechos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
