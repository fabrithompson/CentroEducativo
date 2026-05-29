import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import LoginModal from './components/LoginModal.jsx';
import RegisterModal from './components/RegisterModal.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';
import Panel from './pages/Panel.jsx';

export default function App() {
  // 'login' | 'register' | null  -> controla qué modal está abierto.
  const [modal, setModal] = useState(null);

  return (
    <>
      <Header onAbrirLogin={() => setModal('login')} />

      <Routes>
        <Route path="/" element={<Home />} />
        <Route
          path="/panel"
          element={
            <ProtectedRoute>
              <Panel />
            </ProtectedRoute>
          }
        />
      </Routes>

      <Footer />

      {modal === 'login' && (
        <LoginModal
          onCerrar={() => setModal(null)}
          onIrARegistro={() => setModal('register')}
        />
      )}
      {modal === 'register' && (
        <RegisterModal
          onCerrar={() => setModal(null)}
          onIrALogin={() => setModal('login')}
        />
      )}
    </>
  );
}
