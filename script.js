// Hero Slider
let slideIndex = 0;
const slides = document.querySelectorAll('.slide');
const dots = document.querySelectorAll('.dot');
const totalSlides = slides.length;

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

// Mobile Menu Toggle
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');

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
});

// Smooth Scroll
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
            if (window.innerWidth <= 768) {
                navLinks.style.display = 'none';
            }
        }
    });
});

// Animaciones de scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate-in');
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

document.querySelectorAll('.section, .level-card, .wellbeing-item, .news-card, .gallery-item, .mv-card, .contact-info-card').forEach(el => {
    el.classList.add('animate-element');
    observer.observe(el);
});

// ========== SISTEMA DE USUARIOS ==========

document.addEventListener('DOMContentLoaded', function() {
    checkUserStatus();
    console.log('Centro Educativo - Pagina cargada correctamente');
});

// Modal Functions
function updateFileName(input) {
    const fileNameSpan = document.getElementById('fileName');
    if (input.files && input.files[0]) {
        fileNameSpan.textContent = input.files[0].name;
    }
}

function openLoginModal() {
    document.getElementById('loginModal').style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    document.getElementById('loginModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function openRegisterModal() {
    closeModal();
    document.getElementById('registerModal').style.display = 'block';
}

function closeRegisterModal() {
    document.getElementById('registerModal').style.display = 'none';
    document.body.style.overflow = 'auto';
}

function switchToLogin() {
    closeRegisterModal();
    openLoginModal();
}

// Cerrar modal al hacer click fuera
window.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal')) {
        e.target.style.display = 'none';
        document.body.style.overflow = 'auto';
    }
});

// Update register fields based on user type
function updateRegisterFields() {
    const tipo = document.getElementById('reg-tipo').value;
    const dniInput = document.getElementById('dni-group');
    const cursoInput = document.getElementById('curso-group');
    
    if (tipo === 'estudiante') {
        dniInput.style.display = 'block';
        cursoInput.style.display = 'block';
    } else if (tipo === 'docente') {
        dniInput.style.display = 'block';
        cursoInput.style.display = 'none';
    } else {
        dniInput.style.display = 'none';
        cursoInput.style.display = 'none';
    }
}

// Registro de usuarios
document.getElementById('registerForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const tipo = document.getElementById('reg-tipo').value;
    const nombre = document.getElementById('reg-nombre').value;
    const email = document.getElementById('reg-email').value;
    const usuario = document.getElementById('reg-usuario').value;
    const password = document.getElementById('reg-password').value;
    const dni = document.getElementById('reg-dni').value;
    const curso = document.getElementById('reg-curso').value;
    
    let users = JSON.parse(localStorage.getItem('usuarios')) || [];
    
    if (users.some(u => u.usuario === usuario)) {
        alert('El nombre de usuario ya esta en uso. Por favor elige otro.');
        return;
    }
    
    if (users.some(u => u.email === email)) {
        alert('El email ya esta registrado.');
        return;
    }
    
    const nuevoUsuario = {
        id: Date.now(),
        tipo: tipo,
        nombre: nombre,
        email: email,
        usuario: usuario,
        password: password,
        dni: dni,
        curso: curso,
        fechaRegistro: new Date().toLocaleDateString()
    };
    
    users.push(nuevoUsuario);
    localStorage.setItem('usuarios', JSON.stringify(users));
    
    alert('Registro exitoso! Bienvenido a tu panel.');
    closeRegisterModal();
    this.reset();
    
    loginUser(usuario, password);
    setTimeout(() => showUserPanel(), 500);
});

// Login de usuarios
document.getElementById('loginForm').addEventListener('submit', function(e) {
    e.preventDefault();
    
    const usuario = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    
    loginUser(usuario, password);
});

function loginUser(usuario, password) {
    const users = JSON.parse(localStorage.getItem('usuarios')) || [];
    const user = users.find(u => u.usuario === usuario && u.password === password);
    
    if (user) {
        localStorage.setItem('usuarioActual', JSON.stringify(user));
        checkUserStatus();
        closeModal();
        document.getElementById('loginForm').reset();
        alert('Bienvenido, ' + user.nombre + '!');
        showUserPanel();
    } else {
        alert('Usuario o contrasena incorrectos.');
    }
}

// Verificar estado del usuario
function checkUserStatus() {
    const user = JSON.parse(localStorage.getItem('usuarioActual'));
    const userMenu = document.getElementById('userMenu');
    const loginLink = document.getElementById('loginLink');
    const userName = document.getElementById('userName');
    
    if (user) {
        userMenu.style.display = 'block';
        loginLink.style.display = 'none';
        userName.textContent = user.nombre.split(' ')[0];
    } else {
        userMenu.style.display = 'none';
        loginLink.style.display = 'block';
    }
}

// Cerrar sesion
function logout() {
    localStorage.removeItem('usuarioActual');
    checkUserStatus();
    window.location.href = 'index.html';
}

function showUserPanel() {
    const user = JSON.parse(localStorage.getItem('usuarioActual'));
    if (!user) {
        openLoginModal();
        return;
    }
    window.location.href = 'panel.html';
}

// Star Rating
const stars = document.querySelectorAll('.stars i');
let ratingValue = 0;

if (stars.length > 0) {
    stars.forEach(star => {
        star.addEventListener('click', function() {
            ratingValue = this.getAttribute('data-value');
            updateStars();
        });
        
        star.addEventListener('mouseover', function() {
            const value = this.getAttribute('data-value');
            highlightStars(value);
        });
        
        star.addEventListener('mouseout', function() {
            updateStars();
        });
    });
}

function highlightStars(value) {
    stars.forEach(star => {
        if (star.getAttribute('data-value') <= value) {
            star.classList.remove('far');
            star.classList.add('fas');
        } else {
            star.classList.remove('fas');
            star.classList.add('far');
        }
    });
}

function updateStars() {
    stars.forEach(star => {
        if (star.getAttribute('data-value') <= ratingValue) {
            star.classList.remove('far');
            star.classList.add('fas');
        } else {
            star.classList.remove('fas');
            star.classList.add('far');
        }
    });
}

// Form Submissions
document.getElementById('inscriptionForm').addEventListener('submit', function(e) {
    e.preventDefault();
    alert('Solicitud de inscripcion enviada exitosamente! Nos pondremos en contacto contigo pronto.');
    this.reset();
});

document.getElementById('employmentForm').addEventListener('submit', function(e) {
    e.preventDefault();
    alert('CV enviado exitosamente! Te contactaremos si hay una posicion disponible.');
    this.reset();
});

document.getElementById('opinionForm').addEventListener('submit', function(e) {
    e.preventDefault();
    alert('Gracias por tu opinion! Sera visible pronto.');
    this.reset();
    ratingValue = 0;
    updateStars();
});

document.getElementById('contactForm').addEventListener('submit', function(e) {
    e.preventDefault();
    alert('Mensaje enviado exitosamente! Te responderemos a la brevedad.');
    this.reset();
});

// Navbar scroll effect
window.addEventListener('scroll', function() {
    const nav = document.querySelector('.main-nav');
    if (window.scrollY > 100) {
        nav.style.boxShadow = '0 2px 20px rgba(0,0,0,0.15)';
    } else {
        nav.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    }
});

// Gallery Lightbox (simple)
const galleryItems = document.querySelectorAll('.gallery-item');
galleryItems.forEach(item => {
    item.addEventListener('click', function() {
        const img = this.querySelector('img');
        if (img) {
            window.open(img.src, '_blank');
        }
    });
});

// Active link highlight
const sections = document.querySelectorAll('section');
const navItems = document.querySelectorAll('.nav-links a');

window.addEventListener('scroll', function() {
    let current = '';
    
    sections.forEach(section => {
        const sectionTop = section.offsetTop;
        if (scrollY >= sectionTop - 200) {
            current = section.getAttribute('id');
        }
    });
    
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('href') === '#' + current) {
            item.classList.add('active');
        }
    });
});

// Form validation visual feedback
const formInputs = document.querySelectorAll('input, select, textarea');
formInputs.forEach(input => {
    input.addEventListener('focus', function() {
        this.style.borderColor = '#3498db';
    });
    
    input.addEventListener('blur', function() {
        if (!this.value) {
            this.style.borderColor = '#ddd';
        } else {
            this.style.borderColor = '#27ae60';
        }
    });
});