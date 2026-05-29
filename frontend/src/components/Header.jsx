import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const ENLACES = [
  ['inicio', 'Inicio'],
  ['nosotros', 'Quiénes Somos'],
  ['niveles', 'Niveles'],
  ['bienestar', 'Bienestar'],
  ['noticias', 'Noticias'],
  ['galeria', 'Galería'],
  ['contacto', 'Contacto'],
];

export default function Header({ onAbrirLogin }) {
  const { usuario, logout } = useAuth();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const navigate = useNavigate();

  const cerrarSesion = () => {
    logout();
    navigate('/');
  };

  return (
    <header>
      <div className="header-top">
        <div className="container">
          <div className="contact-info">
            <span><i className="fas fa-phone" /> (011) 1234-5678</span>
            <span><i className="fas fa-envelope" /> info@centromixto.edu</span>
          </div>
          <div className="social-links">
            <a href="#"><i className="fab fa-facebook" /></a>
            <a href="#"><i className="fab fa-instagram" /></a>
            <a href="#"><i className="fab fa-whatsapp" /></a>
          </div>
        </div>
      </div>

      <nav className="main-nav">
        <div className="container">
          <Link to="/" className="logo">
            <span className="logo-icon">🎓</span>
            <h1>Educar Para Transformar</h1>
          </Link>

          <ul className={`nav-links ${menuAbierto ? 'open' : ''}`} onClick={() => setMenuAbierto(false)}>
            {ENLACES.map(([id, texto]) => (
              <li key={id}><a href={`/#${id}`}>{texto}</a></li>
            ))}

            {usuario ? (
              <li className="user-menu">
                <a className="dropbtn">
                  <i className="fas fa-user" /> {usuario.nombre.split(' ')[0]}{' '}
                  <i className="fas fa-chevron-down" />
                </a>
                <div className="dropdown-content">
                  <Link to="/panel"><i className="fas fa-tachometer-alt" /> Mi Panel</Link>
                  <a className="logout-btn" onClick={cerrarSesion}>
                    <i className="fas fa-sign-out-alt" /> Cerrar Sesión
                  </a>
                </div>
              </li>
            ) : (
              <li>
                <a onClick={onAbrirLogin} style={{ cursor: 'pointer' }}>
                  <i className="fas fa-sign-in-alt" /> Iniciar sesión
                </a>
              </li>
            )}
          </ul>

          <button
            className="hamburger"
            aria-label="Abrir menú"
            onClick={() => setMenuAbierto((v) => !v)}
          >
            <span /><span /><span />
          </button>
        </div>
      </nav>
    </header>
  );
}
