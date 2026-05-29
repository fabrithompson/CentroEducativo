# Centro Educativo — Plataforma Web (React + Express + PostgreSQL)

Migración del sitio institucional de HTML/CSS/JS a una arquitectura full-stack
moderna, manteniendo el diseño original y completando las funcionalidades
pendientes: backend REST, base de datos PostgreSQL, autenticación con roles,
panel privado por rol y formularios públicos persistentes.

## Arquitectura

Monorepo con dos aplicaciones independientes:

```
centro-educativo/
├── backend/      API REST en Node.js + Express + PostgreSQL
└── frontend/     SPA en React + React Router (Vite)
```

| Capa       | Tecnología                                   |
|------------|----------------------------------------------|
| Frontend   | React 18 + React Router 6 (Vite)             |
| Backend    | Node.js + Express 4                          |
| Base datos | PostgreSQL                                   |
| Seguridad  | Hash de contraseñas (bcryptjs) + JWT         |
| Subida CV  | multer (almacenamiento en `backend/uploads`) |

> **Nota sobre el hashing:** se utiliza `bcryptjs`, una implementación de bcrypt
> escrita en JavaScript puro. Genera y verifica hashes 100% compatibles con
> bcrypt, pero no requiere compilar binarios nativos, lo que facilita la
> instalación en cualquier entorno (entrega académica). Las contraseñas **nunca**
> se guardan en texto plano.

## Requisitos previos

- Node.js 18 o superior
- PostgreSQL 13 o superior (servicio corriendo localmente)
- npm

## 1. Configurar PostgreSQL

Crear la base de datos vacía (el esquema se crea luego con la migración):

```bash
createdb centro_educativo
# o desde psql:
# CREATE DATABASE centro_educativo;
```

## 2. Backend

```bash
cd backend
npm install
cp .env.example .env        # editar credenciales si hace falta
npm run migrate             # crea tablas y tipos (db/schema.sql)
npm run seed                # carga usuarios de prueba y noticias de ejemplo
npm run dev                 # arranca en http://localhost:4000 (recarga en caliente)
# en producción: npm start
```

### Variables de entorno (`backend/.env`)

| Variable        | Descripción                                  | Ejemplo                                                        |
|-----------------|----------------------------------------------|----------------------------------------------------------------|
| `DATABASE_URL`  | Cadena de conexión a PostgreSQL              | `postgresql://postgres:postgres@localhost:5432/centro_educativo` |
| `JWT_SECRET`    | Clave para firmar los tokens JWT             | `una_clave_larga_y_secreta`                                    |
| `PORT`          | Puerto del backend                           | `4000`                                                         |
| `CLIENT_ORIGIN` | Origen permitido por CORS (URL del frontend) | `http://localhost:5173`                                        |

## 3. Frontend

En otra terminal:

```bash
cd frontend
npm install
npm run dev                 # arranca en http://localhost:5173
# build de producción: npm run build  →  carpeta dist/
```

El frontend tiene un proxy configurado en `vite.config.js`: las llamadas a
`/api` y `/uploads` se redirigen automáticamente al backend en el puerto 4000,
por lo que en desarrollo no hay problemas de CORS.

## Usuarios de prueba

Tras ejecutar `npm run seed`, quedan disponibles cinco usuarios, uno por rol.
**Todos usan la contraseña `password123`.**

| Rol        | Usuario      | Contraseña    |
|------------|--------------|---------------|
| Estudiante | `estudiante` | `password123` |
| Padre/Tutor| `padre`      | `password123` |
| Docente    | `docente`    | `password123` |
| Autoridad  | `autoridad`  | `password123` |
| Personal   | `personal`   | `password123` |

Al iniciar sesión con cada uno, el panel privado muestra contenido distinto
según el rol.

## Endpoints principales de la API

| Método | Ruta                  | Acceso     | Descripción                          |
|--------|-----------------------|------------|--------------------------------------|
| POST   | `/api/auth/register`  | público    | Registro de usuario                  |
| POST   | `/api/auth/login`     | público    | Login, devuelve JWT                  |
| GET    | `/api/auth/me`        | JWT        | Perfil del usuario autenticado       |
| GET    | `/api/opiniones`      | público    | Listar opiniones                     |
| POST   | `/api/opiniones`      | público    | Crear opinión (1–5 estrellas)        |
| POST   | `/api/inscripciones`  | público    | Solicitud de inscripción (nº ticket) |
| POST   | `/api/contacto`       | público    | Consulta de contacto                 |
| POST   | `/api/empleo`         | público    | Postulación + CV en PDF (multipart)  |
| GET    | `/api/noticias`       | público    | Listar noticias                      |
| GET    | `/api/panel/resumen`  | JWT        | Datos del panel según rol            |
| GET    | `/api/health`         | público    | Estado del servicio                  |

## Funcionalidades implementadas

- Migración completa a React con componentes reutilizables, secciones públicas,
  formularios, autenticación y panel privado separados, y navegación con React Router.
- Diseño responsive (se mantuvo la identidad visual original).
- **Corrección del bug de registro:** el modal ahora hace scroll correctamente en
  pantallas pequeñas (`max-height` + `overflow-y`).
- API REST con Express para registro, login, opiniones, inscripciones, contacto,
  postulaciones, noticias y panel por rol.
- Base de datos PostgreSQL con tablas para cada entidad.
- Registro/login con **cinco roles separados** (estudiante, padre/tutor, docente,
  autoridad, personal — sin agrupar), usuario único, email válido, contraseña
  mínima de 8 caracteres, hashing con bcryptjs y JWT.
- Rutas privadas protegidas por middleware de autenticación y autorización por rol.
- Panel privado que cambia su contenido según el rol logueado.
- Opiniones públicas (con valoración de estrellas) que persisten y se muestran
  dinámicamente.
- Solicitud de inscripción pública que genera un número de solicitud.
- Formulario de contacto persistente.
- Formulario de empleo con validación y subida real de CV en PDF a `uploads/`.
- Validaciones en frontend y backend con mensajes de error visibles (sin `alert()`).

## Limitaciones técnicas

- Algunos datos del panel del estudiante, padre y docente (horarios, tareas,
  asistencia) son **simulados** en el backend para fines de demostración
  académica; no provienen de tablas de gestión académica completas.
- No hay recuperación de contraseña ni verificación de email por correo.
- La subida de CV se guarda en disco local (`backend/uploads`); en producción
  convendría usar un servicio de almacenamiento externo.
- El token JWT se guarda en `localStorage` del navegador (sencillo y suficiente
  para la entrega; en producción se evaluarían cookies httpOnly).

## Estado de los requerimientos

Ver el detalle completo en [`REQUERIMIENTOS.md`](./REQUERIMIENTOS.md).
