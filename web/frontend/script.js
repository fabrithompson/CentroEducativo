// ==========================================
// 1. UTILIDADES VISUALES Y ANIMACIONES
// ==========================================

// Hero Slider
let slideIndex = 0;
const slides = document.querySelectorAll('.slide');
const dots = document.querySelectorAll('.dot');
const totalSlides = slides ? slides.length : 0;

if (totalSlides > 0) {
    // Las diapositivas 2 a 5 traen su foto en `data-fondo` y no en el estilo:
    // se piden recién cuando la página terminó de cargar, para no competir
    // con la primera, que es la única visible. La primera rotación es a los
    // 5 s, así que llegan antes de mostrarse. Si alguien toca un punto del
    // slider antes de eso, `showSlide` las pide en ese momento.
    function cargarFondosDiferidos() {
        slides.forEach(s => {
            if (s.dataset.fondo) {
                s.style.backgroundImage = `url('${s.dataset.fondo}')`;
                delete s.dataset.fondo;
            }
        });
    }

    if (document.readyState === 'complete') cargarFondosDiferidos();
    else window.addEventListener('load', cargarFondosDiferidos);

    function showSlide(n) {
        cargarFondosDiferidos();
        slides.forEach(s => s.classList.remove('active'));
        dots.forEach(d => {
            d.classList.remove('active');
            d.removeAttribute('aria-current');
        });

        slideIndex = n;
        if (slideIndex >= totalSlides) slideIndex = 0;
        if (slideIndex < 0) slideIndex = totalSlides - 1;

        slides[slideIndex].classList.add('active');
        dots[slideIndex].classList.add('active');
        dots[slideIndex].setAttribute('aria-current', 'true');
    }

    function moveSlide(n) {
        showSlide(slideIndex + n);
    }

    // Se llama desde el onclick de los puntos del slider (index.html).
    // eslint-disable-next-line no-unused-vars
    function currentSlide(n) {
        showSlide(n);
    }

    setInterval(() => moveSlide(1), 5000);
}

// Menú hamburguesa (teléfono)
// Se abre con una clase y no con estilos inline: los inline sobrevivían al
// agrandar la ventana y dejaban el menú de escritorio en columna, con fondo
// blanco fijo que en modo oscuro escondía el texto (también blanco).
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');

function abrirMenu(abrir) {
    if (!hamburger || !navLinks) return;
    navLinks.classList.toggle('abierto', abrir);
    hamburger.setAttribute('aria-expanded', String(abrir));
    hamburger.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú');
}

if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => abrirMenu(!navLinks.classList.contains('abierto')));
    // Al elegir una sección el menú se cierra: si no, quedaba tapando la página.
    navLinks.addEventListener('click', (e) => {
        if (e.target.closest('a[href^="#"]:not(.dropbtn), .login-link a')) abrirMenu(false);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navLinks.classList.contains('abierto')) {
            abrirMenu(false);
            hamburger.focus();
        }
    });
}

// Toggle de tema (dark/light) para la landing — usa misma clave que campus.js
function syncThemeToggleIcon() {
    const btn = document.getElementById('themeToggleLanding');
    if (!btn) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.innerHTML = isDark
        ? '<i class="fas fa-sun" aria-hidden="true"></i>'
        : '<i class="fas fa-moon" aria-hidden="true"></i>';
    btn.setAttribute('aria-label', isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
}

function toggleLandingTheme() {
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('et_theme', next); } catch (e) { /* ignore */ }
    syncThemeToggleIcon();
}

document.addEventListener('DOMContentLoaded', syncThemeToggleIcon);

// Auto-grow para textareas del landing (queda al tamaño del contenido)
function autoGrowTextarea(ta) {
    if (!ta) return;
    ta.style.height = 'auto';
    const min = parseInt(getComputedStyle(ta).minHeight, 10) || 80;
    ta.style.height = Math.max(min, ta.scrollHeight) + 'px';
}
function attachAutoGrow(ta) {
    if (!ta || ta._autoGrowBound) return;
    ta._autoGrowBound = true;
    ta.addEventListener('input', () => autoGrowTextarea(ta));
    autoGrowTextarea(ta);
}
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('textarea').forEach(attachAutoGrow);
});

// ==========================================
// 2. GESTIÓN DE MODALES
// ==========================================

// Al abrir un modal el foco entra a su primer campo. Antes quedaba en el
// enlace que lo abrió: lo que se tipeaba no iba a ningún lado, Tab recorría
// la página de atrás, y Enter volvía a abrir el modal en vez de ingresar.
let origenFocoModal = null;
let clicEmpezoAfuera = false;

function modalAbierto() {
    return [...document.querySelectorAll('.modal')].find((m) => m.style.display === 'flex') || null;
}

function abrirModal(id, foco) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (!origenFocoModal) origenFocoModal = document.activeElement;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    const campo = modal.querySelector(foco);
    if (campo) setTimeout(() => campo.focus(), 0);
}

function cerrarModal(id, { devolverFoco = true } = {}) {
    const modal = document.getElementById(id);
    if (!modal || modal.style.display !== 'flex') return;
    modal.style.display = 'none';
    // '' y no 'auto': vuelve a lo que diga la hoja de estilos.
    document.body.style.overflow = '';
    if (devolverFoco) {
        if (origenFocoModal && document.contains(origenFocoModal)) origenFocoModal.focus();
        origenFocoModal = null;
    }
}

function openLoginModal() {
    abrirModal('loginModal', '#username');
}

function closeModal() {
    cerrarModal('loginModal');
}

function openRegisterModal() {
    cerrarModal('loginModal', { devolverFoco: false });
    abrirModal('registerModal', '#reg-tipo');
}

function closeRegisterModal() {
    cerrarModal('registerModal');
}

function switchToLogin() {
    cerrarModal('registerModal', { devolverFoco: false });
    openLoginModal();
}

function openForgotModal() {
    cerrarModal('loginModal', { devolverFoco: false });
    abrirModal('forgotModal', '#forgot-email');
}

function closeForgotModal() {
    cerrarModal('forgotModal');
}

function switchForgotToLogin() {
    cerrarModal('forgotModal', { devolverFoco: false });
    openLoginModal();
}

// Cerrar al tocar afuera, salvo que el clic haya empezado adentro: al
// seleccionar texto de un campo es fácil soltar el mouse fuera del recuadro.
window.addEventListener('mousedown', function (e) {
    clicEmpezoAfuera = e.target.classList && e.target.classList.contains('modal');
});
window.addEventListener('click', function (e) {
    if (e.target.classList.contains('modal') && clicEmpezoAfuera) cerrarModal(e.target.id);
});

// Escape cierra, y Tab no se escapa a la página de atrás.
document.addEventListener('keydown', function (e) {
    const modal = modalAbierto();
    if (!modal) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        cerrarModal(modal.id);
        return;
    }
    if (e.key !== 'Tab') return;
    const enfocables = [...modal.querySelectorAll('a[href], button, input, select, textarea')]
        .filter((el) => !el.disabled && el.offsetParent !== null);
    if (enfocables.length === 0) return;
    const primero = enfocables[0];
    const ultimo = enfocables[enfocables.length - 1];
    if (!modal.contains(document.activeElement)) {
        e.preventDefault();
        primero.focus();
    } else if (e.shiftKey && document.activeElement === primero) {
        e.preventDefault();
        ultimo.focus();
    } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
    }
});

function updateRegisterFields() {
    const tipo = document.getElementById('reg-tipo').value;
    const cursoGroup = document.getElementById('curso-group');
    const cursoInput = document.getElementById('reg-curso');
    
    // Si eligen "estudiante", mostramos el curso y lo hacemos obligatorio
    if (tipo === 'estudiante') {
        cursoGroup.hidden = false;
        cursoInput.required = true;
    } else {
        // Para docentes o padres, lo volvemos a ocultar
        cursoGroup.hidden = true;
        cursoInput.required = false;
        cursoInput.value = ''; // Limpiamos lo que haya escrito por error
    }
}

// ==========================================
// 3. SISTEMA DE AUTENTICACIÓN (LOGIN/REGISTRO)
// ==========================================

// Verificar estado al cargar cualquier página
document.addEventListener('DOMContentLoaded', function () {
    checkUserStatus();
});

function checkUserStatus() {
    const user = window.usuarioSesion();
    const userMenu = document.getElementById('userMenu');
    const loginLink = document.getElementById('loginLink');
    const userName = document.getElementById('userName');

    if (userMenu && loginLink && userName) {
        userMenu.hidden = !user;
        loginLink.hidden = Boolean(user);
        if (user) userName.textContent = user.nombre.split(' ')[0];
    }
}

function logout() {
    window.cerrarSesion();
}

// Enrutador de Paneles por Rol
function showUserPanel() {
    const user = window.usuarioSesion();
    if (!user) {
        // Una pestaña nueva no tiene sesión propia: si en el navegador hay una
        // sola cuenta abierta, se recupera; si no, se pide ingresar.
        window.renovarSesion().then((ok) => (ok ? showUserPanel() : openLoginModal()));
        return;
    }

    if (user.tipo === 'estudiante') {
        window.location.href = 'panel_estudiante.html';
    } else if (user.tipo === 'docente' || user.tipo === 'autoridad' || user.tipo === 'personal') {
        window.location.href = 'panel_docente.html';
    } else if (user.tipo === 'padre') {
        window.location.href = 'panel_padre.html';
    } else if (user.tipo === 'admin') {
        window.location.href = 'panel_admin.html';
    } else {
        window.location.href = 'index.html';
    }
}

/**
 * El backend devuelve `mensaje` cuando la operación sale bien y `message`
 * cuando falla (middleware/errorHandler.ts). Los errores de validación viajan
 * siempre con el texto genérico "Datos inválidos" y el motivo real campo por
 * campo en `details`. Leer sólo `mensaje` descartaba las tres cosas: la
 * persona no se enteraba de si su cuenta de docente estaba pendiente de
 * aprobación, de si el usuario era demasiado corto o de si la contraseña
 * estaba mal.
 */
function mensajeDeError(data, porDefecto) {
    if (data && data.details) {
        const detalles = Object.values(data.details).flat().filter(Boolean);
        if (detalles.length > 0) return detalles.join(' ');
    }
    return (data && (data.mensaje || data.message)) || porDefecto;
}

/**
 * Envía un formulario al backend con el botón deshabilitado mientras espera:
 * antes un doble clic mandaba la misma inscripción o el mismo CV dos veces.
 * Devuelve el JSON de la respuesta, o lanza si no hubo respuesta legible.
 */
async function enviarFormulario(form, url, opciones) {
    const boton = form.querySelector('button[type="submit"]');
    if (boton) boton.disabled = true;
    form.setAttribute('aria-busy', 'true');
    try {
        const res = await fetch(url, opciones);
        // Un 429 del limitador o un 502 del proxy no traen JSON: se informa
        // el problema real en lugar de "Error al conectar con el servidor".
        const tipo = res.headers.get('content-type') || '';
        if (!tipo.includes('application/json')) {
            return { exito: false, message: res.status === 429
                ? 'Hiciste demasiados intentos seguidos. Esperá unos minutos y volvé a probar.'
                : 'El servidor no respondió como se esperaba. Probá de nuevo en unos minutos.' };
        }
        return await res.json();
    } finally {
        if (boton) boton.disabled = false;
        form.removeAttribute('aria-busy');
    }
}

const enviarJson = (form, url, body) => enviarFormulario(form, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
});

// Formulario de ingreso
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            const data = await enviarJson(loginForm, '/api/auth/login', {
                usuario: document.getElementById('username').value.trim(),
                password: document.getElementById('password').value,
            });
            if (data.exito) {
                window.guardarSesion(data.usuario);
                closeModal();
                loginForm.reset();
                showUserPanel();
            } else {
                toastError(mensajeDeError(data, 'No se pudo iniciar sesión.'));
            }
        } catch (error) {
            console.error('Error:', error);
            toastError('Error al conectar con el servidor.');
        }
    });
}

// Recuperar contraseña: el servidor responde lo mismo exista o no la cuenta,
// así que el aviso tampoco distingue.
const forgotForm = document.getElementById('forgotForm');
if (forgotForm) {
    forgotForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            const data = await enviarJson(forgotForm, '/api/auth/forgot-password', {
                email: document.getElementById('forgot-email').value.trim(),
            });
            if (data.exito) {
                toastSuccess(data.mensaje || 'Si el correo corresponde a una cuenta, te enviamos el enlace.', 8000);
                forgotForm.reset();
                closeForgotModal();
            } else {
                toastError(mensajeDeError(data, 'No se pudo enviar el enlace.'));
            }
        } catch {
            toastError('Error al conectar con el servidor.');
        }
    });
}

// Formulario de registro
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const tipo = document.getElementById('reg-tipo').value;
        try {
            const data = await enviarJson(registerForm, '/api/auth/register', {
                tipo,
                nombre: document.getElementById('reg-nombre').value.trim(),
                email: document.getElementById('reg-email').value.trim(),
                usuario: document.getElementById('reg-usuario').value.trim(),
                password: document.getElementById('reg-password').value,
                dni: document.getElementById('reg-dni').value.trim(),
                curso: tipo === 'estudiante' ? document.getElementById('reg-curso').value : null,
            });
            if (!data.exito) {
                toastError(mensajeDeError(data, 'No se pudo completar el registro.'));
                return;
            }
            closeRegisterModal();
            registerForm.reset();
            updateRegisterFields();
            if (data.pendingApproval) {
                toastSuccess(data.mensaje || 'Cuenta de docente creada. Un administrador debe aprobarla antes del primer ingreso.', 7000);
            } else {
                toastSuccess('¡Registro exitoso! Ya podés iniciar sesión.');
                openLoginModal();
            }
        } catch (error) {
            console.error('Error:', error);
            toastError('Ocurrió un error al registrar en el servidor.');
        }
    });
}

// ==========================================
// 4. FORMULARIOS DE LA LANDING (toast feedback)
// ==========================================

// Noticias: "Leer más" despliega el resto de la nota en la misma tarjeta.
document.querySelectorAll('.news-card .read-more').forEach((boton) => {
    boton.addEventListener('click', () => {
        const mas = document.getElementById(boton.getAttribute('aria-controls'));
        if (!mas) return;
        const abrir = mas.hidden;
        mas.hidden = !abrir;
        boton.setAttribute('aria-expanded', String(abrir));
        boton.textContent = abrir ? 'Leer menos' : 'Leer más';
    });
});

// El backend corta en 10 MB los CV (ver moderacion.routes.ts): se avisa
// antes de subirlo, no después de esperar la subida entera.
const CV_MAX_MB = 10;

// Helper para el input de archivo del CV
function updateFileName(input) {
    const el = document.getElementById('fileName');
    if (!el) return;
    const archivo = input.files && input.files[0];
    if (!archivo) {
        el.textContent = 'Seleccionar archivo';
        return;
    }
    const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name);
    if (!esPdf || archivo.size > CV_MAX_MB * 1024 * 1024) {
        toastWarning(!esPdf
            ? 'El CV tiene que ser un archivo PDF.'
            : `El CV pesa más de ${CV_MAX_MB} MB. Probá con una versión más liviana.`);
        input.value = '';
        el.textContent = 'Seleccionar archivo';
        return;
    }
    el.textContent = archivo.name;
}


// A) Solicitud de Inscripción
const CURSOS_POR_NIVEL = {
    inicial: ['Sala de 3', 'Sala de 4', 'Sala de 5'],
    primaria: ['1° grado', '2° grado', '3° grado', '4° grado', '5° grado', '6° grado'],
    secundaria: ['1° año', '2° año', '3° año', '4° año', '5° año'],
};

function actualizarCursosInscripcion() {
    const nivel = document.getElementById('nivel').value;
    const cursoSel = document.getElementById('curso');
    if (!cursoSel) return;
    cursoSel.innerHTML = '';
    const opciones = CURSOS_POR_NIVEL[nivel];
    if (!opciones) {
        cursoSel.innerHTML = '<option value="">Primero seleccioná un nivel</option>';
        cursoSel.disabled = true;
        return;
    }
    cursoSel.disabled = false;
    cursoSel.add(new Option('Seleccionar curso...', ''));
    opciones.forEach(c => cursoSel.add(new Option(c, c)));
}

const inscriptionForm = document.getElementById('inscriptionForm');
if (inscriptionForm) {
    inscriptionForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            const data = await enviarJson(inscriptionForm, '/api/public/inscriptions', {
                nombreTutor: document.getElementById('nombre').value.trim(),
                emailTutor: document.getElementById('email').value.trim(),
                telefonoTutor: document.getElementById('telefono').value.trim(),
                nombreEstudiante: document.getElementById('nombre_estudiante').value.trim(),
                nivel: document.getElementById('nivel').value,
                curso: document.getElementById('curso').value,
                mensaje: document.getElementById('mensaje').value.trim() || null,
            });
            if (data.exito) {
                toastSuccess(data.mensaje || 'Solicitud enviada.', 6000);
                inscriptionForm.reset();
                actualizarCursosInscripcion();
            } else {
                toastError(mensajeDeError(data, 'No se pudo enviar la solicitud.'));
            }
        } catch {
            toastError('Error al conectar con el servidor.');
        }
    });
}

// B) Postulación de Empleo (CV)
const employmentForm = document.getElementById('employmentForm');
if (employmentForm) {
    employmentForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const fd = new FormData();
        fd.append('nombre', document.getElementById('cv-nombre').value.trim());
        fd.append('email', document.getElementById('cv-email').value.trim());
        fd.append('puesto', document.getElementById('cv-puesto').value);
        const file = document.getElementById('cv-archivo').files[0];
        if (file) fd.append('cv', file);
        try {
            const data = await enviarFormulario(employmentForm, '/api/public/employment', { method: 'POST', body: fd });
            if (data.exito) {
                toastSuccess(data.mensaje || 'Postulación enviada.', 6000);
                employmentForm.reset();
                updateFileName(document.getElementById('cv-archivo'));
            } else {
                toastError(mensajeDeError(data, 'No se pudo enviar la postulación.'));
            }
        } catch {
            toastError('Error al conectar con el servidor.');
        }
    });
}

// C) Opinión / Valoración
// Las estrellas son radios nativos (ver index.html); acá sólo se pinta
// cuántas quedan llenas, al elegir y al pasar el mouse.
const radiosEstrellas = [...document.querySelectorAll('.stars input[name="rating"]')];

function pintarEstrellas(hasta) {
    radiosEstrellas.forEach((radio) => {
        const icono = document.querySelector(`label[for="${radio.id}"] i`);
        if (!icono) return;
        const llena = Number(radio.value) <= hasta;
        icono.classList.toggle('fas', llena);
        icono.classList.toggle('far', !llena);
    });
}

function estrellasElegidas() {
    const elegida = radiosEstrellas.find((r) => r.checked);
    return elegida ? Number(elegida.value) : 0;
}

radiosEstrellas.forEach((radio) => {
    radio.addEventListener('change', () => pintarEstrellas(estrellasElegidas()));
    const label = document.querySelector(`label[for="${radio.id}"]`);
    if (!label) return;
    label.addEventListener('mouseenter', () => pintarEstrellas(Number(radio.value)));
    label.addEventListener('mouseleave', () => pintarEstrellas(estrellasElegidas()));
});

const opinionForm = document.getElementById('opinionForm');
if (opinionForm) {
    opinionForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const texto = document.getElementById('opinion-texto').value.trim();
        const rating = estrellasElegidas();
        if (!texto) {
            toastWarning('Escribí tu opinión antes de enviar.');
            return;
        }
        if (!rating) {
            toastWarning('Elegí cuántas estrellas le das.');
            return;
        }
        try {
            const data = await enviarJson(opinionForm, '/api/public/opinions', {
                nombre: document.getElementById('opinion-nombre').value.trim() || null,
                rol: document.getElementById('opinion-rol').value,
                texto,
                rating,
            });
            if (data.exito) {
                toastSuccess(data.mensaje || '¡Gracias por compartir tu opinión!', 6000);
                opinionForm.reset();
                pintarEstrellas(0);
            } else {
                toastError(mensajeDeError(data, 'No se pudo enviar la opinión.'));
            }
        } catch {
            toastError('Error al conectar con el servidor.');
        }
    });
}

// Mostrar opiniones aprobadas en la landing. Se arma con textContent: el
// nombre y el texto los escribe cualquiera, sin cuenta.
function renderOpinionesAprobadas() {
    const display = document.querySelector('.opiniones-display');
    if (!display) return;
    const mostrarAviso = (texto) => {
        display.querySelectorAll(':scope > :not(h3)').forEach((n) => n.remove());
        const p = document.createElement('p');
        p.className = 'opiniones-vacio';
        p.textContent = texto;
        display.appendChild(p);
    };
    fetch('/api/public/opinions')
        .then(r => r.json())
        .then(data => {
            if (!data.exito) {
                mostrarAviso('No se pudieron cargar las opiniones.');
                return;
            }
            if (data.opiniones.length === 0) {
                mostrarAviso('Aún no hay opiniones publicadas.');
                return;
            }
            display.querySelectorAll(':scope > :not(h3)').forEach((n) => n.remove());
            data.opiniones.forEach(o => {
                const card = document.createElement('div');
                card.className = 'opinion-card';
                const cabecera = document.createElement('div');
                cabecera.className = 'opinion-header';
                const autor = document.createElement('span');
                autor.className = 'opinion-author';
                autor.textContent = o.nombre ? String(o.nombre) : 'Anónimo';
                const estrellas = document.createElement('span');
                estrellas.className = 'opinion-rating';
                estrellas.setAttribute('aria-label', `${o.rating} de 5 estrellas`);
                estrellas.textContent = '★'.repeat(o.rating) + '☆'.repeat(5 - o.rating);
                cabecera.append(autor, estrellas);
                const texto = document.createElement('p');
                texto.textContent = `"${o.texto}"`;
                card.append(cabecera, texto);
                display.appendChild(card);
            });
        })
        .catch(() => mostrarAviso('No se pudieron cargar las opiniones.'));
}
document.addEventListener('DOMContentLoaded', renderOpinionesAprobadas);

// D) Contacto
// Antes mostraba "Mensaje enviado" sin mandar nada a ningún lado. Ahora la
// consulta queda guardada y administración la ve en su panel.
const contactForm = document.getElementById('contactForm');
if (contactForm) {
    contactForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        try {
            const data = await enviarJson(contactForm, '/api/public/contact', {
                nombre: document.getElementById('contact-nombre').value.trim(),
                email: document.getElementById('contact-email').value.trim(),
                mensaje: document.getElementById('contact-mensaje').value.trim(),
            });
            if (data.exito) {
                toastSuccess(data.mensaje || 'Recibimos tu mensaje. Te vamos a responder por email.', 6000);
                contactForm.reset();
            } else {
                toastError(mensajeDeError(data, 'No se pudo enviar el mensaje.'));
            }
        } catch {
            toastError('Error al conectar con el servidor.');
        }
    });
}

// =========================================================
// CIERRE DE SESIÓN AUTOMÁTICO POR INACTIVIDAD
// =========================================================

// 30 minutos sin actividad con una sesión abierta en esta pestaña.
const INACTIVIDAD_MS = 30 * 60 * 1000;
let temporizadorInactividad;

function resetearTemporizador() {
    clearTimeout(temporizadorInactividad);
    temporizadorInactividad = setTimeout(cerrarSesionPorInactividad, INACTIVIDAD_MS);
}

function cerrarSesionPorInactividad() {
    if (!window.usuarioSesion()) return;
    toastWarning('Tu sesión caducó por 30 minutos de inactividad. Por tu seguridad, volvé a iniciar sesión.', 5000);
    // Se cierra también en el servidor: si sólo se borraba lo local, la
    // cookie de refresco seguía viva y la sesión se podía recuperar.
    setTimeout(() => { window.cerrarSesion(); }, 2000);
}

// addEventListener y no `document.onclick = …`: asignar la propiedad pisaba
// cualquier otro manejador que se registrara igual.
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((evento) => {
    document.addEventListener(evento, resetearTemporizador, { passive: true });
});
resetearTemporizador();
