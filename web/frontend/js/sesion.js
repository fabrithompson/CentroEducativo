/**
 * sesion.js — la sesión de cada pestaña.
 *
 * Cada pestaña guarda su propia cuenta en sessionStorage, así se puede tener el
 * panel de administración en una y el de un docente en otra. Antes la cuenta
 * vivía en localStorage, que comparten todas las pestañas: ingresar con otra
 * cuenta pisaba la primera, y al recargar, su panel la echaba.
 *
 * El access token también es de la pestaña (sessionStorage 'token'), y el de
 * refresco viaja en una cookie por cuenta (`et_refresh_<id>`): cada pestaña
 * renueva la suya diciendo qué cuenta es, y nunca pasa a ser otra en silencio.
 *
 * Se carga antes que campus.js en los paneles y antes que script.js en el
 * portal. Es un script clásico: expone sus funciones en `window`.
 */
(function () {
    const CLAVE = 'usuarioActual';

    function leer(almacen, clave) {
        try { return almacen.getItem(clave); } catch (_) { return null; }
    }
    function escribir(almacen, clave, valor) {
        try { almacen.setItem(clave, valor); } catch (_) { /* almacenamiento bloqueado */ }
    }
    function borrar(almacen, clave) {
        try { almacen.removeItem(clave); } catch (_) { /* almacenamiento bloqueado */ }
    }

    /** `{ id, nombre, tipo }` de la cuenta de esta pestaña, o `null`. */
    window.usuarioSesion = function () {
        let crudo = leer(sessionStorage, CLAVE);
        if (!crudo) {
            // Migración única desde la versión que usaba localStorage, que
            // además guardaba el access token adentro.
            const viejo = leer(localStorage, CLAVE);
            if (viejo) {
                borrar(localStorage, CLAVE);
                try {
                    const u = JSON.parse(viejo);
                    if (u && u.id) {
                        if (u.token && !leer(sessionStorage, 'token')) escribir(sessionStorage, 'token', u.token);
                        crudo = JSON.stringify({ id: u.id, nombre: u.nombre, tipo: u.tipo });
                        escribir(sessionStorage, CLAVE, crudo);
                    }
                } catch (_) { /* dato corrupto: se descarta */ }
            }
        }
        try { return crudo ? JSON.parse(crudo) : null; } catch (_) { return null; }
    };

    /** Guarda lo que devuelven el login y la renovación. El token no va con el usuario. */
    window.guardarSesion = function (usuario) {
        escribir(sessionStorage, 'token', usuario.token);
        escribir(sessionStorage, CLAVE, JSON.stringify({ id: usuario.id, nombre: usuario.nombre, tipo: usuario.tipo }));
    };

    window.olvidarSesion = function () {
        borrar(sessionStorage, 'token');
        borrar(sessionStorage, CLAVE);
        borrar(localStorage, CLAVE);
    };

    let renovando = null;

    /**
     * Renueva el access token de la cuenta de esta pestaña. Las llamadas
     * concurrentes comparten la promesa: si cinco pedidos reciben 401 a la
     * vez, se renueva una sola vez.
     *
     * Una pestaña nueva todavía no sabe qué cuenta es: pide sin id, y el
     * servidor la recupera si en el navegador hay una sola cuenta abierta. Con
     * varias no adivina, y hay que ingresar.
     */
    window.renovarSesion = function () {
        if (renovando) return renovando;
        const actual = window.usuarioSesion();
        renovando = fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(actual ? { usuarioId: actual.id } : {}),
        })
            .then((r) => r.json())
            .then((data) => {
                if (!data || !data.exito || !data.usuario || !data.usuario.token) return false;
                // Nunca cambiar de cuenta en silencio.
                if (actual && data.usuario.id !== actual.id) return false;
                window.guardarSesion(data.usuario);
                return true;
            })
            .catch(() => false)
            .finally(() => { setTimeout(() => { renovando = null; }, 0); });
        return renovando;
    };

    /**
     * Para el control de acceso de cada panel: la cuenta de esta pestaña, o la
     * que se recupera con la cookie si la pestaña es nueva. `null` si no hay.
     */
    window.sesionDelPanel = async function () {
        const u = window.usuarioSesion();
        if (u && leer(sessionStorage, 'token')) return u;
        if (await window.renovarSesion()) return window.usuarioSesion();
        return null;
    };

    /**
     * Cierra la sesión de esta pestaña. Avisa al servidor para que borre la
     * cookie de refresco de esta cuenta —antes docentes, estudiantes y familias
     * no lo hacían, y la cookie quedaba viva siete días— sin tocar las de las
     * cuentas abiertas en otras pestañas.
     */
    window.cerrarSesion = async function (destino) {
        const u = window.usuarioSesion();
        try {
            await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(u ? { usuarioId: u.id } : {}),
            });
        } catch (_) { /* sin conexión: se cierra igual la sesión local */ }
        window.olvidarSesion();
        window.location.href = destino || 'index.html';
    };
})();
