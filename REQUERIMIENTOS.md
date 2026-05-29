# REQUERIMIENTOS

Trazabilidad de cada consigna del enunciado contra su estado y el archivo o
componente donde se implementa.

**Estado:** Implementado / Parcial / Pendiente

## 1. Migración a React

| Requerimiento | Estado | Archivo o componente |
|---------------|--------|----------------------|
| Componentes reutilizables | Implementado | `frontend/src/components/*` |
| Separar secciones públicas, formularios, autenticación y panel | Implementado | `frontend/src/sections/*`, `frontend/src/components/LoginModal.jsx`, `RegisterModal.jsx`, `frontend/src/pages/Panel.jsx` |
| React Router para navegación | Implementado | `frontend/src/App.jsx`, `frontend/src/main.jsx` |
| Diseño responsive | Implementado | `frontend/src/styles/styles.css` (media queries) |

## 2. Corrección del formulario de registro

| Requerimiento | Estado | Archivo o componente |
|---------------|--------|----------------------|
| Modal con scroll correcto en pantallas pequeñas | Implementado | `frontend/src/styles/styles.css` (`.modal` / `.modal-content`: `max-height` + `overflow-y`) |
| Registro y login usables en mobile y desktop | Implementado | `frontend/src/components/RegisterModal.jsx`, `LoginModal.jsx` |

## 3. Backend con Express (API REST)

| Requerimiento | Estado | Archivo o componente |
|---------------|--------|----------------------|
| Registro de usuarios | Implementado | `backend/src/routes/auth.js`, `controllers/authController.js` |
| Login | Implementado | `backend/src/controllers/authController.js` |
| Opiniones | Implementado | `backend/src/routes/public.js`, `controllers/publicController.js` |
| Solicitudes de inscripción | Implementado | `backend/src/controllers/publicController.js` |
| Consultas de contacto | Implementado | `backend/src/controllers/publicController.js` |
| Postulaciones laborales | Implementado | `backend/src/controllers/publicController.js`, `middleware/upload.js` |
| Noticias | Implementado | `backend/src/controllers/publicController.js` |
| Panel privado por rol | Implementado | `backend/src/routes/panel.js`, `controllers/panelController.js` |

## 4. Base de datos PostgreSQL

| Requerimiento | Estado | Archivo o componente |
|---------------|--------|----------------------|
| Tablas con atributos (usuarios, opiniones, inscripciones, contactos, postulaciones, noticias) | Implementado | `backend/db/schema.sql` |
| Conexión y migración | Implementado | `backend/src/db.js`, `src/migrate.js` |

## 5. Registro y login

| Requerimiento | Estado | Archivo o componente |
|---------------|--------|----------------------|
| Cinco roles separados (sin agrupar) | Implementado | `backend/db/schema.sql` (enum `rol_usuario`), `frontend/src/components/RegisterModal.jsx` |
| Validar usuario único | Implementado | `backend/src/controllers/authController.js`, `db/schema.sql` (UNIQUE) |
| Validar email | Implementado | `backend/src/utils/validators.js` |
| Contraseña mínima de 8 caracteres | Implementado | `backend/src/utils/validators.js`, `frontend/src/components/RegisterModal.jsx` |
| Guardar contraseña con bcrypt (sin texto plano) | Implementado | `backend/src/controllers/authController.js` (bcryptjs) |
| Sesión / token JWT | Implementado | `backend/src/controllers/authController.js`, `middleware/auth.js` |
| Proteger rutas privadas | Implementado | `backend/src/middleware/auth.js` (`autenticar`, `permitirRoles`) |

## 6. Panel privado por rol

| Requerimiento | Estado | Archivo o componente |
|---------------|--------|----------------------|
| Estudiante: cursos, horarios, tareas, asistencia, comunicados | Parcial (datos académicos simulados) | `backend/src/controllers/panelController.js`, `frontend/src/pages/Panel.jsx` |
| Padre/Tutor: info estudiante, comunicados, asistencia, estado inscripción | Parcial (datos académicos simulados) | `backend/src/controllers/panelController.js`, `frontend/src/pages/Panel.jsx` |
| Docente: cursos asignados, carga de tareas, comunicados, asistencia | Parcial (datos académicos simulados) | `backend/src/controllers/panelController.js`, `frontend/src/pages/Panel.jsx` |
| Autoridad: usuarios, inscripciones, opiniones, consultas, postulaciones, noticias | Implementado (datos reales de la BD) | `backend/src/controllers/panelController.js`, `frontend/src/pages/Panel.jsx` |
| Personal: consultas, inscripciones, postulaciones, comunicados internos | Implementado (datos reales de la BD) | `backend/src/controllers/panelController.js`, `frontend/src/pages/Panel.jsx` |

## 7. Opiniones sin login

| Requerimiento | Estado | Archivo o componente |
|---------------|--------|----------------------|
| Formulario público (nombre, identificación, comentario, 1–5 estrellas) | Implementado | `frontend/src/sections/Opiniones.jsx`, `components/StarRating.jsx` |
| Persistir en PostgreSQL y mostrar dinámicamente | Implementado | `backend/src/controllers/publicController.js`, `frontend/src/sections/Opiniones.jsx` |

## 8. Solicitud de inscripción

| Requerimiento | Estado | Archivo o componente |
|---------------|--------|----------------------|
| Formulario público completo | Implementado | `frontend/src/sections/Inscripcion.jsx` |
| Persistir y generar número de solicitud | Implementado | `backend/src/controllers/publicController.js` (formato `INS-AÑO-#####`) |

## 9. Formulario de contacto

| Requerimiento | Estado | Archivo o componente |
|---------------|--------|----------------------|
| Guardar nombre, email, teléfono, asunto, mensaje | Implementado | `frontend/src/sections/Contacto.jsx`, `backend/src/controllers/publicController.js` |

## 10. Empleo

| Requerimiento | Estado | Archivo o componente |
|---------------|--------|----------------------|
| Formulario (nombre, email, teléfono, puesto, mensaje, CV) | Implementado | `frontend/src/sections/Empleo.jsx` |
| Validar que el archivo sea PDF | Implementado | `backend/src/middleware/upload.js` (fileFilter), validación también en el frontend |
| Guardar nombre del archivo + subida real a `uploads/` | Implementado | `backend/src/middleware/upload.js`, `controllers/publicController.js` |

## 11. Validaciones

| Requerimiento | Estado | Archivo o componente |
|---------------|--------|----------------------|
| Campos obligatorios | Implementado | `backend/src/utils/validators.js` + validación en cada formulario |
| Email válido | Implementado | `backend/src/utils/validators.js` |
| Contraseña mínima 8 caracteres | Implementado | `backend/src/utils/validators.js` |
| Usuario único | Implementado | `backend/src/controllers/authController.js` |
| Valoración entre 1 y 5 | Implementado | `backend/src/utils/validators.js`, `db/schema.sql` (CHECK) |
| Archivo CV en PDF | Implementado | `backend/src/middleware/upload.js` |
| Mensajes de error visibles (no solo `alert()`) | Implementado | Componentes de formulario (estado de errores + `.alert` / `.field-error`) |

## 12. Documentación

| Requerimiento | Estado | Archivo o componente |
|---------------|--------|----------------------|
| README.md actualizado | Implementado | `README.md` |
| REQUERIMIENTOS.md con tabla | Implementado | `REQUERIMIENTOS.md` (este archivo) |
| `.env.example` (DATABASE_URL, JWT_SECRET, PORT) | Implementado | `backend/.env.example` |

## Criterios de aceptación

| Criterio | Estado |
|----------|--------|
| El proyecto corre en React | Implementado |
| Backend funcional con Express | Implementado |
| Base de datos PostgreSQL | Implementado |
| Contraseñas guardadas con bcrypt | Implementado (bcryptjs, compatible con bcrypt) |
| El registro permite scrollear correctamente | Implementado |
| El login funciona | Implementado |
| El panel varía según el rol | Implementado |
| Opiniones, inscripciones, consultas y postulaciones persisten en PostgreSQL | Implementado |
| La web es responsive | Implementado |
| Código ordenado, simple y defendible | Implementado |
