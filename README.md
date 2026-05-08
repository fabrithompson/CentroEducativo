# Proyecto Web: Centro Educativo "Educar para Transformar"

**Equipo de Desarrollo:** FL Code  
**Materia:** Metodología de Sistemas I  

---

## Descripción General
Esta plataforma web es la cara digital del Centro Educativo "Educar para Transformar". Está diseñada bajo una arquitectura front-end interactiva (HTML, CSS, JavaScript) que simula la interacción real de distintos tipos de usuarios con el sistema de la escuela. El objetivo principal es facilitar la comunicación institucional, gestionar consultas/inscripciones y proveer un acceso diferenciado según el rol del usuario.

---

## Flujo de Navegación del Usuario

El sistema está dividido principalmente en dos grandes áreas: el **Área Pública** (abierta a cualquier visitante) y el **Portal Privado** (requiere inicio de sesión).

### 1. Área Pública (Visitantes Anónimos)
Cualquier usuario que ingrese a la página principal (`index.html`) podrá explorar libremente las siguientes secciones a través del menú de navegación (que es 100% *responsive*):

* **Inicio & Carrusel (Slider):** Una vista de bienvenida atractiva con imágenes destacadas de la institución.
* **Quiénes Somos:** Información sobre la visión, misión y valores del colegio.
* **Niveles Educativos:** Detalle de la oferta académica (Inicial, Primario y Secundario).
* **Bienestar Estudiantil y Noticias:** Novedades sobre la comunidad educativa, tutorías y soporte al alumno.
* **Galería:** Un espacio visual para conocer las instalaciones y actividades.

### 2. Acciones Públicas (Sin necesidad de cuenta)
El visitante tiene a su disposición varias herramientas interactivas que no requieren registrarse:
* **Dejar una Opinión:** Mediante un formulario con sistema de calificación por estrellas, los usuarios pueden dejar reseñas públicas.
* **Formulario de Contacto:** Para consultas generales, permitiendo enviar mensajes directos a la administración.
* **Bolsa de Empleo:** Los profesionales interesados pueden postularse seleccionando el puesto deseado y adjuntando su CV.
* **Solicitud de Inscripción:** Los padres o tutores pueden iniciar el proceso de admisión llenando un formulario detallado con los datos del ingresante. (Simula el envío de datos a la base central).

### 3. Registro e Inicio de Sesión (Sistema de Roles)
En la parte superior, el usuario encontrará el botón **"Ingresar"**, el cual despliega una ventana modal interactiva:
* **Crear Cuenta (Registro):** El usuario debe elegir qué tipo de perfil le corresponde:
    * 🎓 *Estudiante*
    * 👨‍👩‍👧 *Padre/Tutor*
    * 👩‍🏫 *Docente*
    *(Nota: El sistema captura estos datos y los guarda en el almacenamiento local del navegador - `localStorage` - para simular una base de datos real).*
* **Iniciar Sesión:** Ingresando su usuario y contraseña, el sistema valida los datos y autentica al usuario.

### 4. Portal Privado (Usuarios Logueados)
Una vez que el usuario inicia sesión correctamente, el flujo lo redirige de forma automática a una nueva pantalla: `panel.html`.
* **Panel de Control (Dashboard):** Esta página detecta la sesión activa y da una bienvenida personalizada mostrando el nombre y el rol del usuario.
* **Cierre de Sesión:** El usuario puede cerrar su sesión de forma segura, lo que limpia sus datos temporales de acceso y lo devuelve a la página de inicio pública.

---

## Tecnologías y Funcionamiento Técnico
* **Front-end:** HTML5 semántico, CSS3 (con Flexbox/Grid y variables para mantener la coherencia visual) y Vanilla JavaScript.
* **Simulación de Base de Datos:** Se utiliza `localStorage` de JavaScript para guardar los registros de los usuarios y mantener la persistencia de la sesión al cambiar de página (de `index.html` a `panel.html`). No requiere servidor backend para esta instancia de demostración.
* **Validaciones:** Los formularios cuentan con alertas dinámicas (`alert` y validaciones HTML) que informan al usuario si los datos fueron cargados con éxito.
