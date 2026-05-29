import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

// Protege rutas privadas: si no hay sesión, redirige al inicio.
export default function ProtectedRoute({ children }) {
  const { usuario, cargando } = useAuth();

  if (cargando) return <div className="loading">Cargando…</div>;
  if (!usuario) return <Navigate to="/" replace />;
  return children;
}
