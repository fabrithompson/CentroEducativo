/**
 * campus.js — helpers compartidos por los 3 paneles
 * (auth headers, fetch wrappers, notification bell, formatos)
 */
(function () {
    function token() { return sessionStorage.getItem('token'); }

    window.authHeaders = function () {
        return {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token()
        };
    };

    window.authHeadersNoCT = function () {
        return { 'Authorization': 'Bearer ' + token() };
    };

    let refreshing = null;
    async function tryRefresh() {
        if (refreshing) return refreshing;
        refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
            .then(r => r.json())
            .then(data => {
                if (data.exito && data.usuario && data.usuario.token) {
                    sessionStorage.setItem('token', data.usuario.token);
                    localStorage.setItem('usuarioActual', JSON.stringify(data.usuario));
                    return true;
                }
                return false;
            })
            .catch(() => false)
            .finally(() => { setTimeout(() => refreshing = null, 0); });
        return refreshing;
    }

    async function authedFetch(url, init) {
        const opts = Object.assign({ credentials: 'include' }, init || {});
        opts.headers = Object.assign({}, opts.headers || {});
        const tk = token();
        if (tk) opts.headers['Authorization'] = 'Bearer ' + tk;
        let res = await fetch(url, opts);
        if (res.status === 401 && url !== '/api/auth/refresh' && url !== '/api/auth/login') {
            const ok = await tryRefresh();
            if (ok) {
                const ntk = token();
                if (ntk) opts.headers['Authorization'] = 'Bearer ' + ntk;
                res = await fetch(url, opts);
            }
        }
        return res;
    }

    /**
     * El backend responde `mensaje` cuando sale bien y `message` cuando falla
     * (middleware/errorHandler.ts), con el detalle de validación en `details`.
     * Los paneles leen `r.mensaje` en todos lados, así que hasta acá ningún
     * error real llegaba a verse: "Ese email ya está registrado" salía como
     * "No se pudo actualizar". Se copia el motivo real a `mensaje` una vez.
     */
    function normalizarRespuesta(data) {
        if (data && typeof data === 'object' && !data.mensaje && data.message) {
            const detalles = data.details
                ? Object.values(data.details).flat().filter(Boolean)
                : [];
            data.mensaje = detalles.length > 0 ? detalles.join(' ') : data.message;
        }
        return data;
    }
    window.normalizarRespuesta = normalizarRespuesta;

    window.apiGet = function (url) {
        return authedFetch(url).then(r => r.json()).then(normalizarRespuesta);
    };

    window.apiPost = function (url, body) {
        return authedFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        }).then(r => r.json()).then(normalizarRespuesta);
    };

    window.apiPatch = function (url, body) {
        return authedFetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body || {})
        }).then(r => r.json()).then(normalizarRespuesta);
    };

    window.apiUpload = function (url, formData) {
        return authedFetch(url, { method: 'POST', body: formData }).then(r => r.json()).then(normalizarRespuesta);
    };

    window.apiDelete = function (url) {
        return authedFetch(url, { method: 'DELETE' }).then(r => r.json()).then(normalizarRespuesta);
    };

    window.formatFecha = function (iso) {
        if (!iso) return '—';
        // Una fecha sin hora ("2026-10-10") se lee como medianoche UTC, que en
        // Argentina es el día anterior: se arma a mano en lugar de convertirla.
        const soloFecha = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
        if (soloFecha) return soloFecha[3] + '/' + soloFecha[2] + '/' + soloFecha[1];
        return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    window.formatFechaHora = function (iso) {
        if (!iso) return '—';
        return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    window.escapeHtml = function (s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };

    /* ============================================================
       Notification bell — usa el contenedor con id="bellContainer"
       Polling cada 30s + actualización local al marcar leídas.
       ============================================================ */
    let _bellTimer = null;

    function renderBell(data) {
        const cont = document.getElementById('bellContainer');
        if (!cont) return;
        const count = (data && data.noLeidas) || 0;
        const items = (data && data.notificaciones) || [];

        const badge = count > 0
            ? `<span class="bell-badge">${count > 9 ? '9+' : count}</span>`
            : '';

        const itemsHtml = items.length === 0
            ? `<li class="bell-empty">Sin notificaciones</li>`
            : items.slice(0, 8).map(n => `
                <li class="bell-item ${n.isRead ? '' : 'bell-unread'}${n.link ? ' bell-item--enlace' : ''}" data-id="${n.id}" data-link="${window.escapeHtml(n.link || '')}">
                    <div class="bell-item-title">${window.escapeHtml(n.titulo)}</div>
                    <div class="bell-item-body">${window.escapeHtml(n.contenido)}</div>
                    <div class="bell-item-date">${window.formatFechaHora(n.createdAt)}</div>
                </li>
            `).join('');

        const estabaAbierto = document.getElementById('bellDropdown')?.style.display === 'block';

        cont.innerHTML = `
            <button class="bell-button" id="bellButton" aria-label="Notificaciones">
                <i class="fas fa-bell"></i>
                ${badge}
            </button>
            <div class="bell-dropdown" id="bellDropdown" style="display:none;">
                <div class="bell-header">
                    <strong>Notificaciones</strong>
                    ${count > 0 ? '<button class="bell-mark-all" id="bellMarkAll">Marcar todo</button>' : ''}
                </div>
                <ul class="bell-list">${itemsHtml}</ul>
            </div>
        `;

        const btn = document.getElementById('bellButton');
        const dd = document.getElementById('bellDropdown');
        if (estabaAbierto) dd.style.display = 'block';
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
        });

        cont.querySelectorAll('.bell-item').forEach(li => {
            li.addEventListener('click', () => {
                const id = li.getAttribute('data-id');
                const link = li.getAttribute('data-link');
                window.apiPost('/api/notifications/' + id + '/read').then(() => {
                    li.classList.remove('bell-unread');
                    refreshBell();
                });
                if (link) {
                    dd.style.display = 'none';
                    seguirEnlace(link);
                }
            });
        });

        const markAllBtn = document.getElementById('bellMarkAll');
        if (markAllBtn) {
            markAllBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.apiPost('/api/notifications/read-all').then(() => refreshBell());
            });
        }
    }

    document.addEventListener('click', (e) => {
        const cont = document.getElementById('bellContainer');
        const dd = document.getElementById('bellDropdown');
        if (cont && dd && !cont.contains(e.target)) dd.style.display = 'none';
    });

    function refreshBell() {
        if (!token()) return;
        window.apiGet('/api/notifications')
            .then(renderBell)
            .catch(err => console.error('bell fetch', err));
    }

    window.initBell = function () {
        refreshBell();
        if (_bellTimer) clearInterval(_bellTimer);
        _bellTimer = setInterval(refreshBell, 30000);
    };

    window.refreshBell = refreshBell;

    /* ============================================================
       Dark mode toggle
       ============================================================ */
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }
    const stored = localStorage.getItem('et_theme');
    if (stored === 'dark' || stored === 'light') applyTheme(stored);

    function syncThemeButton() {
        const btn = document.getElementById('themeToggle');
        if (!btn) return;
        const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        btn.innerHTML = cur === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
    }

    window.toggleTheme = function () {
        const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        const next = current === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem('et_theme', next);
        syncThemeButton();
    };

    document.addEventListener('DOMContentLoaded', syncThemeButton);

    /* ============================================================
       Navegación de los paneles
       La sección visible queda en el hash (panel_admin.html#m-alumnos):
       recargar, abrir un enlace del menú en otra pestaña o seguir el de
       una notificación vuelve a la misma sección.
       ============================================================ */
    function vistaDelEnlace(a) {
        const m = /switchView\('([^']+)'/.exec(a.getAttribute('onclick') || '');
        return m ? m[1] : null;
    }

    // Los enlaces del menú no tenían href: no se llegaba a ellos con Tab ni
    // se podían abrir en otra pestaña. Reciben el de su sección.
    function prepararMenu() {
        document.querySelectorAll('.sidebar .nav-link').forEach((a) => {
            if (a.dataset.vista) return;
            const vista = vistaDelEnlace(a);
            if (!vista) return;
            a.dataset.vista = vista;
            if (!a.hasAttribute('href')) a.setAttribute('href', '#' + vista);
        });
    }
    document.addEventListener('DOMContentLoaded', prepararMenu);

    // En fase de captura: corre antes que el onclick del enlace.
    document.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('.sidebar .nav-link[data-vista]');
        if (!a) return;
        if (e.ctrlKey || e.metaKey || e.shiftKey) {
            // Otra pestaña o ventana: la abre el navegador y esta no cambia.
            e.stopPropagation();
            return;
        }
        // La sección la cambia switchView; sin esto el navegador además
        // saltaría hasta el ancla.
        e.preventDefault();
    }, true);

    // replaceState y no pushState: "atrás" sale del panel en lugar de
    // recorrer cada sección visitada.
    window.recordarVista = function (id) {
        if (!id || location.hash === '#' + id) return;
        history.replaceState(history.state, '', '#' + id);
    };

    // Activa la sección como si se hubiera tocado su enlace del menú, así
    // corre el mismo cargador.
    window.irAVista = function (id) {
        prepararMenu();
        const a = document.querySelector('.sidebar .nav-link[data-vista="' + CSS.escape(id) + '"]');
        if (!a) return false;
        a.click();
        return true;
    };

    // Cada panel la llama al final de su DOMContentLoaded, ya pasado el
    // control de sesión.
    window.restaurarVista = function () {
        const id = decodeURIComponent(location.hash.slice(1));
        if (!id) return false;
        const seccion = document.getElementById(id);
        if (!seccion || !seccion.classList.contains('view-section')) return false;
        if (seccion.classList.contains('active')) return true;
        return window.irAVista(id);
    };
    window.addEventListener('hashchange', () => window.restaurarVista());

    // Las notificaciones traen un enlace a su sección
    // ("/panel_padre.html#finanzas").
    function seguirEnlace(link) {
        let url;
        try { url = new URL(link, location.href); } catch (_) { return; }
        if (url.origin !== location.origin) return;
        if (url.pathname === location.pathname && url.hash) {
            window.irAVista(decodeURIComponent(url.hash.slice(1)));
            return;
        }
        location.href = url.href;
    }

    /* ============================================================
       Diálogos modales
       ============================================================
       Todos los modales usan el <dialog> nativo con el formato de "Editar
       usuario". El navegador lo pone en la capa superior —por encima de
       cualquier otro diálogo abierto, sin pelear con z-index—, encierra el foco
       adentro y lo cierra con Escape. Lo que el nativo no hace se agrega acá:
       cerrarlo al tocar afuera y devolver el foco a quien lo abrió.

       El div #uxModal que había antes tenía z-index 5000: si se abría desde un
       <dialog>, quedaba detrás y no se podía tocar. */

    function prepararDialogo(dlg) {
        if (!dlg || dlg._preparado) return;
        dlg._preparado = true;

        // En un <dialog> modal, un clic sobre el fondo llega con target = el
        // propio <dialog>, porque la tarjeta lo cubre entero. Se exige además
        // que el mousedown haya empezado afuera: si no, seleccionar texto en un
        // campo arrastrando hasta afuera cerraba el formulario a medio llenar.
        let empezoAfuera = false;
        dlg.addEventListener('mousedown', (e) => { empezoAfuera = e.target === dlg; });
        dlg.addEventListener('click', (e) => {
            if (e.target === dlg) {
                if (empezoAfuera) dlg.close('afuera');
            } else if (e.target.closest && e.target.closest('[data-cerrar-dialogo]')) {
                dlg.close('cancelar');
            }
            empezoAfuera = false;
        });

        dlg.addEventListener('close', () => {
            const origen = dlg._origenFoco;
            dlg._origenFoco = null;
            if (origen && document.contains(origen) && typeof origen.focus === 'function') {
                origen.focus();
            }
        });
    }

    function primerCampo(dlg) {
        return dlg.querySelector(
            '.modal-body input:not([type="hidden"]):not([disabled]),' +
            '.modal-body select:not([disabled]),' +
            '.modal-body textarea:not([disabled])'
        );
    }

    /** Abre un <dialog> (elemento o id) y enfoca su primer campo o `opciones.foco`. */
    window.abrirDialogo = function (dlg, opciones) {
        if (typeof dlg === 'string') dlg = document.getElementById(dlg);
        if (!dlg) return null;
        prepararDialogo(dlg);
        dlg._origenFoco = document.activeElement;
        if (!dlg.open) dlg.showModal();
        const foco = opciones && opciones.foco ? dlg.querySelector(opciones.foco) : primerCampo(dlg);
        if (foco) setTimeout(() => foco.focus(), 30);
        return dlg;
    };

    window.cerrarDialogo = function (dlg) {
        if (typeof dlg === 'string') dlg = document.getElementById(dlg);
        if (dlg && dlg.open) dlg.close();
    };

    const ICONOS_UX = {
        question: 'fa-circle-question',
        info: 'fa-circle-info',
        warning: 'fa-triangle-exclamation',
        danger: 'fa-triangle-exclamation',
        success: 'fa-circle-check',
        baja: 'fa-user-slash',
    };

    function campoUx(c, i) {
        const esc = window.escapeHtml;
        const id = 'ux-campo-' + Date.now() + '-' + i;
        const req = c.requerido ? ' required' : '';
        const icono = c.icono ? '<i class="fas ' + esc(c.icono) + '" aria-hidden="true"></i> ' : '';
        const etiqueta = '<label for="' + id + '">' + icono + esc(c.etiqueta) + (c.requerido ? ' *' : '') + '</label>';

        let control;
        if (c.tipo === 'select') {
            control = '<select id="' + id + '" name="' + esc(c.nombre) + '" class="form-select"' + req + '>' +
                (c.opciones || []).map(o =>
                    '<option value="' + esc(o.valor) + '"' +
                    (String(o.valor) === String(c.valor == null ? '' : c.valor) ? ' selected' : '') +
                    '>' + esc(o.texto) + '</option>'
                ).join('') +
                '</select>';
        } else if (c.tipo === 'textarea') {
            control = '<textarea id="' + id + '" name="' + esc(c.nombre) + '" class="form-input" rows="3"' +
                ' maxlength="' + (c.maxlength || 500) + '" placeholder="' + esc(c.placeholder || '') + '"' + req + '>' +
                esc(c.valor || '') + '</textarea>';
        } else {
            control = '<input id="' + id + '" name="' + esc(c.nombre) + '" type="' + esc(c.tipo || 'text') + '"' +
                ' class="form-input" value="' + esc(c.valor || '') + '" placeholder="' + esc(c.placeholder || '') + '"' +
                (c.maxlength ? ' maxlength="' + c.maxlength + '"' : '') + req + '>';
        }

        const ayuda = c.ayuda ? '<small class="form-ayuda">' + esc(c.ayuda) + '</small>' : '';
        return '<div class="form-group">' + etiqueta + control + ayuda + '</div>';
    }

    /**
     * Diálogo de confirmación con el formato de la referencia. Devuelve una
     * Promise: `null` si se cancela —con el botón, la cruz, Escape o tocando
     * afuera— y, si se acepta, un objeto con el valor de cada campo.
     */
    function abrirUx(opts) {
        return new Promise((resolve) => {
            const esc = window.escapeHtml;
            const dlg = document.createElement('dialog');
            dlg.className = 'dialogo dialogo--angosto';
            const idTitulo = 'ux-titulo-' + Date.now();
            dlg.setAttribute('aria-labelledby', idTitulo);

            const icono = opts.icono || ICONOS_UX[opts.variante] || ICONOS_UX.question;
            const consecuencias = opts.consecuencias && opts.consecuencias.length
                ? '<div class="modal-consecuencias' + (opts.peligro ? '' : ' modal-consecuencias--neutra') + '"><strong>Qué pasa si confirmás:</strong><ul>' +
                  opts.consecuencias.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul></div>'
                : '';

            dlg.innerHTML =
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<button type="button" class="close" data-cerrar-dialogo aria-label="Cerrar">&times;</button>' +
                        '<h2 id="' + idTitulo + '"><i class="fas ' + esc(icono) + '" aria-hidden="true"></i> ' +
                            esc(opts.titulo || 'Confirmar') + '</h2>' +
                        (opts.subtitulo ? '<p class="modal-subtitle">' + esc(opts.subtitulo) + '</p>' : '') +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<form novalidate>' +
                            (opts.mensaje ? '<p class="modal-mensaje">' + esc(opts.mensaje) + '</p>' : '') +
                            (opts.campos || []).map(campoUx).join('') +
                            consecuencias +
                            '<p class="campo__error" role="alert" hidden></p>' +
                            '<div class="modal-pie">' +
                                (opts.ocultarCancelar ? '' :
                                    '<button type="button" class="btn-cancelar" data-cerrar-dialogo>' +
                                    esc(opts.cancelar || 'Cancelar') + '</button>') +
                                '<button type="submit" class="' + (opts.peligro ? 'btn-peligro' : 'btn-guardar') + '">' +
                                    (opts.okIcono ? '<i class="fas ' + esc(opts.okIcono) + '" aria-hidden="true"></i> ' : '') +
                                    esc(opts.aceptar || 'Aceptar') +
                                '</button>' +
                            '</div>' +
                        '</form>' +
                    '</div>' +
                '</div>';
            document.body.appendChild(dlg);

            const form = dlg.querySelector('form');
            const error = dlg.querySelector('.campo__error');
            let resultado = null;

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                const valores = {};
                for (const el of form.elements) {
                    if (el.name) valores[el.name] = typeof el.value === 'string' ? el.value.trim() : el.value;
                }
                // Validación propia en lugar de la del navegador: el globo nativo
                // queda tapado por el fondo en algunos navegadores, y así el
                // mensaje sale siempre en el mismo lugar.
                for (const c of (opts.campos || [])) {
                    if (c.requerido && !valores[c.nombre]) {
                        error.textContent = c.mensajeRequerido || ('Completá "' + c.etiqueta + '".');
                        error.hidden = false;
                        form.elements[c.nombre].focus();
                        return;
                    }
                }
                resultado = valores;
                dlg.close('ok');
            });

            dlg.addEventListener('close', () => {
                resolve(dlg.returnValue === 'ok' ? resultado : null);
                // Se saca del DOM después de que se devolvió el foco.
                setTimeout(() => dlg.remove(), 0);
            });

            // Sin campos, el foco va al botón de aceptar; si la acción es
            // destructiva, a Cancelar: un Enter distraído no debería borrar nada.
            const sinCampos = !(opts.campos && opts.campos.length);
            const foco = sinCampos ? (opts.peligro ? '.btn-cancelar' : 'button[type="submit"]') : null;
            window.abrirDialogo(dlg, foco ? { foco } : undefined);
        });
    }

    window.uxConfirm = function (message, opts = {}) {
        return abrirUx({
            titulo: opts.title || 'Confirmar',
            subtitulo: opts.subtitle,
            mensaje: message,
            variante: opts.variant || (opts.danger ? 'danger' : 'question'),
            aceptar: opts.okLabel || 'Aceptar',
            cancelar: opts.cancelLabel,
            peligro: !!opts.danger,
            consecuencias: opts.consecuencias,
        }).then(r => r !== null);
    };

    window.uxPrompt = function (message, opts = {}) {
        return abrirUx({
            titulo: opts.title || 'Ingresar dato',
            subtitulo: opts.subtitle,
            variante: opts.variant || 'info',
            campos: [{
                tipo: opts.multiline ? 'textarea' : (opts.inputType || 'text'),
                nombre: 'valor',
                // La pregunta es la etiqueta del campo: así el lector de pantalla
                // la anuncia al entrar al campo.
                etiqueta: opts.label || message,
                icono: 'fa-pen',
                valor: opts.defaultValue || '',
                placeholder: opts.placeholder || '',
                requerido: !!opts.required,
            }],
            aceptar: opts.okLabel || 'Guardar',
            cancelar: opts.cancelLabel,
            peligro: !!opts.danger,
        }).then(r => (r === null ? null : r.valor));
    };

    window.uxAlert = function (message, opts = {}) {
        return abrirUx({
            titulo: opts.title || 'Aviso',
            mensaje: message,
            variante: opts.variant || 'info',
            aceptar: opts.okLabel || 'Entendido',
            ocultarCancelar: true,
        }).then(() => true);
    };

    /**
     * Baja de una entidad —alumno, profesor, curso, comprobante—. Muestra el
     * estado a elegir, lo que implica confirmar y, si se pide, un motivo.
     * Devuelve `null` si se cancela, o `{ estado, motivo }`.
     */
    window.uxBaja = function (opts = {}) {
        const campos = [];
        if (opts.opciones && opts.opciones.length) {
            campos.push({
                tipo: 'select',
                nombre: 'estado',
                etiqueta: opts.etiquetaEstado || 'Motivo de la baja',
                icono: 'fa-tag',
                opciones: opts.opciones,
                valor: opts.valor,
                requerido: true,
            });
        }
        if (opts.pedirMotivo) {
            campos.push({
                tipo: 'textarea',
                nombre: 'motivo',
                etiqueta: opts.etiquetaMotivo || 'Detalle',
                icono: 'fa-comment',
                placeholder: opts.placeholderMotivo || '',
                ayuda: opts.ayudaMotivo,
                requerido: !!opts.motivoObligatorio,
                mensajeRequerido: opts.mensajeMotivoObligatorio,
            });
        }
        return abrirUx({
            titulo: opts.titulo || 'Dar de baja',
            subtitulo: opts.subtitulo,
            mensaje: opts.mensaje,
            variante: 'baja',
            icono: opts.icono || 'fa-user-slash',
            campos,
            consecuencias: opts.consecuencias,
            aceptar: opts.aceptar || 'Dar de baja',
            okIcono: opts.okIcono || 'fa-ban',
            peligro: opts.peligro !== false,
        }).then(r => (r === null ? null : {
            estado: r.estado == null ? null : r.estado,
            motivo: r.motivo == null ? '' : r.motivo,
        }));
    };

    /* ============================================================
       Auto-grow para textareas (se queda en el tamaño del contenido)
       ============================================================ */
    function autoGrowTextarea(ta) {
        if (!ta || ta.classList.contains('ux-no-grow')) return;
        ta.style.height = 'auto';
        const min = parseInt(getComputedStyle(ta).minHeight, 10) || 80;
        const next = Math.max(min, ta.scrollHeight);
        ta.style.height = next + 'px';
    }
    window.attachAutoGrow = function (ta) {
        if (!ta || ta._autoGrowBound) return;
        ta._autoGrowBound = true;
        ta.addEventListener('input', () => autoGrowTextarea(ta));
        autoGrowTextarea(ta);
    };
    function applyAutoGrowAll() {
        document.querySelectorAll('textarea').forEach(window.attachAutoGrow);
    }
    document.addEventListener('DOMContentLoaded', applyAutoGrowAll);
    // Cuando se inserta nuevo HTML dinámico, también se pueden auto-grow:
    const _mo = new MutationObserver((muts) => {
        muts.forEach(m => {
            m.addedNodes.forEach(n => {
                if (n.nodeType !== 1) return;
                if (n.tagName === 'TEXTAREA') window.attachAutoGrow(n);
                else if (n.querySelectorAll) n.querySelectorAll('textarea').forEach(window.attachAutoGrow);
            });
        });
    });
    _mo.observe(document.documentElement, { childList: true, subtree: true });

    /* ============================================================
       Socket.io para tiempo real (chat + bell)
       ============================================================ */
    let _socket = null;
    window.connectSocket = function () {
        const tk = token();
        if (!tk) return;
        if (_socket && _socket.connected) return _socket;
        if (typeof io === 'undefined') {
            console.warn('socket.io client no cargado');
            return;
        }
        _socket = io({ auth: { token: tk } });
        _socket.on('connect', () => console.debug('socket connected'));
        _socket.on('disconnect', () => console.debug('socket disconnected'));
        _socket.on('new-message', (msg) => {
            window.refreshBell && window.refreshBell();
            if (typeof window.onIncomingMessage === 'function') window.onIncomingMessage(msg);
        });
        return _socket;
    };

    /* ============================================================
       Foros (compartido docente + estudiante + admin)
       Requiere en la página: #forosLista, #foroDetalle.
       Y opcionalmente: form con id foroNuevo (campos materia/titulo/contenido).
       ============================================================ */
    const FORO_ROLE_COLOR = { ESTUDIANTE: '#10b981', DOCENTE: '#3498db', PADRE: '#f59e0b', ADMIN: '#8b5cf6' };

    window.cargarForos = async function () {
        const cont = document.getElementById('forosLista');
        const det = document.getElementById('foroDetalle');
        if (det) det.innerHTML = '';
        if (!cont) return;
        const data = await window.apiGet('/api/forum');
        if (!data.exito || !data.posts.length) {
            cont.innerHTML = '<p style="color:#94a3b8; text-align:center;">Sin temas todavía. Abrí el primero.</p>';
            return;
        }
        cont.innerHTML = data.posts.map(p => `
            <div class="campus-card" style="cursor:pointer; border-left: 4px solid ${FORO_ROLE_COLOR[p.autorRol] || '#3498db'};" onclick="window.abrirForo(${p.id})">
                <h4 class="campus-card-title">${p.isPinned ? '<i class="fas fa-thumbtack" style="color:#f59e0b;"></i> ' : ''}${window.escapeHtml(p.titulo)}</h4>
                <div class="campus-card-meta">
                    <span><i class="fas fa-book"></i> ${window.escapeHtml(p.materia)}</span>
                    <span><i class="fas fa-user"></i> ${window.escapeHtml(p.autor)}</span>
                    <span><i class="fas fa-comments"></i> ${p.replies} respuestas</span>
                    <span><i class="fas fa-clock"></i> ${window.formatFecha(p.createdAt)}</span>
                </div>
                <div class="campus-card-body" style="max-height:60px; overflow:hidden; text-overflow:ellipsis;">${window.escapeHtml(p.contenido)}</div>
            </div>
        `).join('');
    };

    window.abrirForo = async function (id) {
        const det = document.getElementById('foroDetalle');
        const lista = document.getElementById('forosLista');
        if (!det) return;
        const data = await window.apiGet('/api/forum/' + id);
        if (!data.exito) { window.toastError && window.toastError(data.mensaje || 'Error'); return; }
        const me = JSON.parse(localStorage.getItem('usuarioActual') || 'null');
        const puedoPin = me && (me.tipo === 'docente' || me.tipo === 'admin');
        if (lista) lista.style.display = 'none';
        det.innerHTML = `
            <button onclick="window.cerrarForo()" style="background:#64748b; color:#fff; border:none; padding:6px 14px; border-radius:4px; cursor:pointer; margin-bottom:14px;"><i class="fas fa-arrow-left"></i> Volver</button>
            <div class="campus-card" style="border-left: 4px solid ${FORO_ROLE_COLOR[data.post.autorRol] || '#3498db'};">
                <h3 class="campus-card-title">${data.post.isPinned ? '<i class="fas fa-thumbtack" style="color:#f59e0b;"></i> ' : ''}${window.escapeHtml(data.post.titulo)}</h3>
                <div class="campus-card-meta">
                    <span><i class="fas fa-book"></i> ${window.escapeHtml(data.post.materia)}</span>
                    <span><i class="fas fa-user"></i> ${window.escapeHtml(data.post.autor)} (${data.post.autorRol})</span>
                    <span><i class="fas fa-clock"></i> ${window.formatFechaHora(data.post.createdAt)}</span>
                </div>
                <div class="campus-card-body">${window.escapeHtml(data.post.contenido)}</div>
                ${puedoPin ? `<button onclick="window.pinForo(${data.post.id})" style="background:#f59e0b; color:#fff; border:none; padding:5px 11px; border-radius:4px; cursor:pointer; font-size:0.82rem; margin-top:10px;"><i class="fas fa-thumbtack"></i> ${data.post.isPinned ? 'Desfijar' : 'Fijar'}</button>` : ''}
            </div>

            <h4 style="margin: 20px 0 10px; color:#475569;">Respuestas (${data.respuestas.length})</h4>
            ${data.respuestas.length === 0 ? '<p style="color:#94a3b8;">Sé el primero en responder.</p>' : ''}
            ${data.respuestas.map(r => `
                <div class="campus-card" style="margin-bottom:10px; border-left: 3px solid ${FORO_ROLE_COLOR[r.autorRol] || '#3498db'};">
                    <div class="campus-card-meta" style="margin-bottom:6px;">
                        <span><b>${window.escapeHtml(r.autor)}</b> (${r.autorRol})</span>
                        <span>${window.formatFechaHora(r.createdAt)}</span>
                    </div>
                    <div>${window.escapeHtml(r.contenido)}</div>
                </div>
            `).join('')}

            <form onsubmit="window.responderForo(event, ${data.post.id})" style="margin-top:18px;">
                <textarea id="foroRespuesta" placeholder="Escribí tu respuesta..." rows="3" required style="width:100%; padding:10px; border:1px solid #cbd5e1; border-radius:6px;"></textarea>
                <button type="submit" class="btn-action" style="margin-top:10px;"><i class="fas fa-paper-plane"></i> Responder</button>
            </form>
        `;
    };

    window.cerrarForo = function () {
        const det = document.getElementById('foroDetalle');
        const lista = document.getElementById('forosLista');
        if (det) det.innerHTML = '';
        if (lista) lista.style.display = '';
    };

    window.responderForo = async function (e, id) {
        e.preventDefault();
        const text = document.getElementById('foroRespuesta').value.trim();
        if (!text) return;
        const r = await window.apiPost('/api/forum/' + id + '/reply', { contenido: text });
        if (r.exito) { window.toastSuccess && window.toastSuccess('Respuesta publicada.'); window.abrirForo(id); }
        else window.toastError && window.toastError(r.mensaje || 'Error.');
    };

    window.pinForo = async function (id) {
        const r = await window.apiPost('/api/forum/' + id + '/pin');
        if (r.exito) { window.toastSuccess && window.toastSuccess(r.isPinned ? 'Tema fijado.' : 'Tema desfijado.'); window.abrirForo(id); }
        else window.toastError && window.toastError(r.mensaje || 'Error.');
    };

    window.crearTemaForo = async function (e) {
        e.preventDefault();
        const body = {
            materia: document.getElementById('foroMateria').value,
            titulo: document.getElementById('foroTitulo').value,
            contenido: document.getElementById('foroContenido').value,
        };
        const r = await window.apiPost('/api/forum', body);
        if (r.exito) { window.toastSuccess && window.toastSuccess('Tema publicado.'); e.target.reset(); window.cargarForos(); }
        else window.toastError && window.toastError(r.mensaje || 'Error.');
    };
})();
