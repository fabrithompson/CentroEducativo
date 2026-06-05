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

    window.apiGet = function (url) {
        return fetch(url, { headers: window.authHeadersNoCT() }).then(r => r.json());
    };

    window.apiPost = function (url, body) {
        return fetch(url, {
            method: 'POST',
            headers: window.authHeaders(),
            body: JSON.stringify(body || {})
        }).then(r => r.json());
    };

    window.apiUpload = function (url, formData) {
        return fetch(url, {
            method: 'POST',
            headers: window.authHeadersNoCT(),
            body: formData
        }).then(r => r.json());
    };

    window.apiDelete = function (url) {
        return fetch(url, {
            method: 'DELETE',
            headers: window.authHeadersNoCT()
        }).then(r => r.json());
    };

    window.formatFecha = function (iso) {
        if (!iso) return '—';
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
                <li class="bell-item ${n.isRead ? '' : 'bell-unread'}" data-id="${n.id}">
                    <div class="bell-item-title">${window.escapeHtml(n.titulo)}</div>
                    <div class="bell-item-body">${window.escapeHtml(n.contenido)}</div>
                    <div class="bell-item-date">${window.formatFechaHora(n.createdAt)}</div>
                </li>
            `).join('');

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
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
        });
        document.addEventListener('click', (e) => {
            if (dd && !cont.contains(e.target)) dd.style.display = 'none';
        });

        cont.querySelectorAll('.bell-item').forEach(li => {
            li.addEventListener('click', () => {
                const id = li.getAttribute('data-id');
                window.apiPost('/api/notifications/' + id + '/read').then(() => {
                    li.classList.remove('bell-unread');
                    refreshBell();
                });
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
})();
