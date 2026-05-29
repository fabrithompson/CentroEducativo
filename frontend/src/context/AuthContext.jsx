import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, getToken, setToken, clearToken } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [cargando, setCargando] = useState(true);

  // Al montar, si hay token guardado intentamos recuperar el perfil.
  useEffect(() => {
    let activo = true;
    (async () => {
      if (!getToken()) {
        setCargando(false);
        return;
      }
      try {
        const { usuario } = await api.me();
        if (activo) setUsuario(usuario);
      } catch {
        clearToken();
      } finally {
        if (activo) setCargando(false);
      }
    })();
    return () => { activo = false; };
  }, []);

  const login = useCallback(async (credenciales) => {
    const { usuario, token } = await api.login(credenciales);
    setToken(token);
    setUsuario(usuario);
    return usuario;
  }, []);

  const register = useCallback(async (datos) => {
    const { usuario, token } = await api.register(datos);
    setToken(token);
    setUsuario(usuario);
    return usuario;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUsuario(null);
  }, []);

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
