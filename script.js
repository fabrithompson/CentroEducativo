// ==========================================
// 1. UTILIDADES VISUALES Y ANIMACIONES
// ==========================================

// Hero Slider
let slideIndex = 0;
const slides = document.querySelectorAll('.slide');
const dots = document.querySelectorAll('.dot');
const totalSlides = slides ? slides.length : 0;

if (totalSlides > 0) {
    function showSlide(n) {
        slides.forEach(s => s.classList.remove('active'));
        dots.forEach(d => d.classList.remove('active'));

        slideIndex = n;
        if (slideIndex >= totalSlides) slideIndex = 0;
        if (slideIndex < 0) slideIndex = totalSlides - 1;

        slides[slideIndex].classList.add('active');
        dots[slideIndex].classList.add('active');
    }

    function moveSlide(n) {
        showSlide(slideIndex + n);
    }

    function currentSlide(n) {
        showSlide(n);
    }

    setInterval(() => moveSlide(1), 5000);
}

// Menu Hamburguesa (Mobile)
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');

if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
        navLinks.style.display = navLinks.style.display === 'flex' ? 'none' : 'flex';
        navLinks.style.flexDirection = 'column';
        navLinks.style.position = 'absolute';
        navLinks.style.top = '70px';
        navLinks.style.left = '0';
        navLinks.style.width = '100%';
        navLinks.style.background = 'white';
        navLinks.style.padding = '20px';
        navLinks.style.boxShadow = '0 5px 10px rgba(0,0,0,0.1)';
        navLinks.style.zIndex = '1000';
    });
}

// ==========================================
// 2. GESTIÓN DE MODALES
// ==========================================

function openLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

function openRegisterModal() {
    closeModal();
    const regModal = document.getElementById('registerModal');
    if (regModal) {
        regModal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

function closeRegisterModal() {
    const regModal = document.getElementById('registerModal');
    if (regModal) {
        regModal.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
}

function switchToLogin() {
    closeRegisterModal();
    openLoginModal();
}

// Cerrar modales al hacer clic afuera
window.addEventListener('click', function (e) {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
});

function updateRegisterFields() {
    const tipo = document.getElementById('reg-tipo').value;
    const dniInput = document.getElementById('dni-group');
    const cursoInput = document.getElementById('curso-group');

    if (dniInput && cursoInput) {
        if (tipo === 'estudiante') {
            dniInput.style.display = 'block';
            cursoInput.style.display = 'block';
        } else if (tipo === 'docente' || tipo === 'padre') {
            dniInput.style.display = 'block';
            cursoInput.style.display = 'none';
        } else {
            dniInput.style.display = 'none';
            cursoInput.style.display = 'none';
        }
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
    const user = JSON.parse(localStorage.getItem('usuarioActual'));
    const userMenu = document.getElementById('userMenu');
    const loginLink = document.getElementById('loginLink');
    const userName = document.getElementById('userName');

    if (userMenu && loginLink && userName) {
        if (user) {
            userMenu.style.display = 'block';
            loginLink.style.display = 'none';
            userName.textContent = user.nombre.split(' ')[0];
        } else {
            userMenu.style.display = 'none';
            loginLink.style.display = 'block';
        }
    }
}

function logout() {
    localStorage.removeItem('usuarioActual');
    window.location.href = 'index.html';
}

// Enrutador de Paneles por Rol
function showUserPanel() {
    const user = JSON.parse(localStorage.getItem('usuarioActual'));
    if (!user) {
        openLoginModal();
        return;
    }

    if (user.tipo === 'estudiante') {
        window.location.href = 'panel_estudiante.html';
    } else if (user.tipo === 'docente' || user.tipo === 'autoridad' || user.tipo === 'personal') {
        window.location.href = 'panel_docente.html';
    } else if (user.tipo === 'padre') {
        window.location.href = 'panel_padre.html';
    } else {
        window.location.href = 'index.html';
    }
}

// Enviar formulario de Login al PHP
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const usuario = document.getElementById('username').value;
        const password = document.getElementById('password').value;

        fetch('login.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ usuario: usuario, password: password })
        })
            .then(response => response.json())
            .then(data => {
                if (data.exito) {
                    localStorage.setItem('usuarioActual', JSON.stringify(data.usuario));
                    closeModal();
                    this.reset();
                    showUserPanel(); // Redirige al panel correcto
                } else {
                    alert('Error: ' + data.mensaje);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Error al conectar con la base de datos.');
            });
    });
}

// Enviar formulario de Registro al PHP
const registerForm = document.getElementById('registerForm');
if (registerForm) {
    registerForm.addEventListener('submit', function (e) {
        e.preventDefault();

        const datosRegistro = {
            tipo: document.getElementById('reg-tipo').value,
            nombre: document.getElementById('reg-nombre').value,
            email: document.getElementById('reg-email').value,
            usuario: document.getElementById('reg-usuario').value,
            password: document.getElementById('reg-password').value,
            dni: document.getElementById('reg-dni') ? document.getElementById('reg-dni').value : null,
            curso: document.getElementById('reg-curso') ? document.getElementById('reg-curso').value : null
        };

        fetch('registro.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datosRegistro)
        })
            .then(response => response.json())
            .then(data => {
                if (data.exito) {
                    alert('¡Registro exitoso! Ya puedes iniciar sesión.');
                    closeRegisterModal();
                    this.reset();
                    openLoginModal();
                } else {
                    alert('Error: ' + data.mensaje);
                }
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Ocurrió un error al registrar en el servidor.');
            });
    });
}