/**
 * Estado de sesión de la app.
 *
 * Un solo lugar decide si hay sesión, así que ninguna pantalla tiene que
 * preguntárselo. Si el token se cae y no se puede refrescar, el cliente HTTP
 * avisa por `alCaerLaSesion` y acá se vuelve a la pantalla de ingreso: no queda
 * una pantalla mostrando datos viejos de una sesión que ya no existe.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { alCaerLaSesion, borrarSesion, guardarSesion, leerToken, leerUsuario } from '../api/client';
import api from '../api/endpoints';

export interface Usuario {
  id: number;
  nombre: string;
  tipo: string;
}

interface Sesion {
  usuario: Usuario | null;
  cargandoSesion: boolean;
  ingresar: (usuario: string, password: string) => Promise<void>;
  salir: () => Promise<void>;
}

const SesionContext = createContext<Sesion | null>(null);

export function ProveedorSesion({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargandoSesion, setCargandoSesion] = useState(true);

  // Al abrir la app se busca una sesión guardada, para no pedir la clave cada vez.
  useEffect(() => {
    let vigente = true;

    (async () => {
      try {
        const token = await leerToken();
        if (!token) return;

        const guardado = await leerUsuario();
        if (vigente && guardado) setUsuario(guardado);
      } finally {
        if (vigente) setCargandoSesion(false);
      }
    })();

    return () => {
      vigente = false;
    };
  }, []);

  // El cliente HTTP avisa cuando la sesión no se pudo recuperar.
  useEffect(() => alCaerLaSesion(() => setUsuario(null)), []);

  const ingresar = useCallback(async (nombreUsuario: string, password: string) => {
    const respuesta = await api.auth.login(nombreUsuario.trim(), password);

    // La app es de tutores. Si entra un docente o un alumno, no tiene qué ver acá.
    if (respuesta.usuario.tipo !== 'padre') {
      await borrarSesion();
      throw new Error(
        'Esta aplicación es para madres, padres y tutores. Si sos docente o estudiante, ingresá por el campus web.',
      );
    }

    await guardarSesion(respuesta.usuario);
    setUsuario({
      id: respuesta.usuario.id,
      nombre: respuesta.usuario.nombre,
      tipo: respuesta.usuario.tipo,
    });
  }, []);

  const salir = useCallback(async () => {
    // Se intenta avisar al servidor para que limpie la cookie de refresh, pero
    // si falla igual se cierra la sesión local: el usuario pidió salir.
    try {
      await api.auth.logout();
    } catch {
      /* sin conexión: se cierra igual */
    }
    await borrarSesion();
    setUsuario(null);
  }, []);

  const valor = useMemo<Sesion>(
    () => ({ usuario, cargandoSesion, ingresar, salir }),
    [usuario, cargandoSesion, ingresar, salir],
  );

  return <SesionContext.Provider value={valor}>{children}</SesionContext.Provider>;
}

export function useSesion(): Sesion {
  const ctx = useContext(SesionContext);
  if (!ctx) throw new Error('useSesion debe usarse dentro de <ProveedorSesion>.');
  return ctx;
}
