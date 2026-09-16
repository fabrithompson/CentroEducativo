/**
 * Sistema de toasts (notificaciones visuales).
 *
 * Uso:
 *   showToast('Calificación guardada');                     // tipo 'info' por defecto
 *   showToast('Bienvenido, María', 'success');
 *   showToast('Contraseña incorrecta', 'error');
 *   showToast('Atención: queda 1 minuto', 'warning', 6000); // duración custom
 */
(function () {
    function ensureContainer() {
        let c = document.getElementById('toast-container');
        if (!c) {
            c = document.createElement('div');
            c.id = 'toast-container';
            document.body.appendChild(c);
        }
        return c;
    }

    const ICONS = {
        success: 'fa-circle-check',
        error: 'fa-circle-exclamation',
        warning: 'fa-triangle-exclamation',
        info: 'fa-circle-info'
    };

    const TITLES = {
        success: 'Listo',
        error: 'Error',
        warning: 'Atención',
        info: 'Aviso'
    };

    window.showToast = function (message, type = 'info', duration = 4000) {
        const container = ensureContainer();
        const toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        toast.innerHTML = `
            <div class="toast-icon"><i class="fas ${ICONS[type] || ICONS.info}"></i></div>
            <div class="toast-body">
                <div class="toast-title">${TITLES[type] || TITLES.info}</div>
                <div class="toast-message"></div>
            </div>
            <button class="toast-close" aria-label="Cerrar">&times;</button>
        `;
        toast.querySelector('.toast-message').textContent = message;

        const close = () => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 250);
        };
        toast.querySelector('.toast-close').addEventListener('click', close);

        container.appendChild(toast);
        // forzar reflow para que la animación dispare
        void toast.offsetWidth;
        toast.classList.add('toast-in');

        if (duration > 0) {
            setTimeout(close, duration);
        }
    };

    // Atajos cómodos
    window.toastSuccess = (m, d) => window.showToast(m, 'success', d);
    window.toastError = (m, d) => window.showToast(m, 'error', d);
    window.toastWarning = (m, d) => window.showToast(m, 'warning', d);
    window.toastInfo = (m, d) => window.showToast(m, 'info', d);
})();
