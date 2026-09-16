# Informe de Auditoría Técnica

**Proyecto:** Centro Educativo "TRANSFORMAR PARA EDUCAR"
**Fecha de auditoría:** 15/09/2026
**Commit auditado:** `29354aa` (rama `main`, árbol limpio)
**Auditor:** Arquitectura / Liderazgo técnico

---

## 1. Resumen ejecutivo

El repositorio contiene un **campus virtual funcional y de buena factura técnica**, pero que
responde a un alcance distinto del que pide la consigna. Lo construido cubre con solidez la
operación académica (calificaciones, asistencia, actividades, foro, mensajería, moderación de
inscripciones), mientras que **el núcleo económico y de servicios del colegio — deportes,
transporte, comedor, facturación, comprobantes y automatizaciones — no existe**, y la aplicación
móvil no ha sido iniciada.

En términos de porcentaje sobre el alcance exigido:

| Componente de la consigna | Avance estimado |
|---|---|
| 1. Página web institucional | ~75 % |
| 2. Sistema de gestión (backoffice) | ~45 % |
| 3. Aplicación móvil | 0 % |
| 4. Automatizaciones y tareas programadas | 0 % |
| Reglas de negocio críticas (8) | 2 de 8 cubiertas |

**Conclusión:** la base técnica es reutilizable casi en su totalidad. No corresponde reescribir
nada; corresponde **extender el modelo de dominio y reorganizar las capas**. Ningún archivo
existente se propone para borrado.

---

## 2. Stack detectado

### 2.1 Monorepo

- Gestor: **pnpm 11.1.1** con workspaces (`pnpm-workspace.yaml`).
- Node requerido: **>= 22.13**.
- Paquetes declarados: `backend`, `frontend`.
- `allowBuilds` correctamente configurado para binarios nativos (`prisma`, `bcrypt`, `esbuild`).

### 2.2 Backend — `web/backend/`

| Capa | Tecnología |
|---|---|
| Runtime | Node.js + TypeScript 5.7 (`strict: true`) |
| Framework HTTP | Express 4.21 |
| ORM | Prisma 6.1 |
| Base de datos | **PostgreSQL** |
| Autenticación | JWT (access + refresh) con `bcrypt` |
| Validación | Zod (incluida la validación del `.env` al arrancar) |
| Tiempo real | Socket.IO 4.8 |
| Archivos | Multer, con estáticos servidos desde `/uploads` |
| Correo | Nodemailer (configurado, **sin uso productivo**) |
| Seguridad HTTP | Helmet + CORS con `credentials` |
| Dev | `tsx watch` |

**Volumen:** 3.187 líneas entre `src/` y `prisma/`. 16 modelos, 7 enums, 4 migraciones aplicadas,
14 routers, 54 endpoints.

### 2.3 Frontend — `web/frontend/`

**HTML, CSS y JavaScript planos servidos como estáticos por Express.** No hay React, Vite ni
Tailwind, pese a que el `package.json` raíz los anuncia en su campo `description`.

| Archivo | Líneas | Contenido |
|---|---|---|
| `index.html` | 612 | Landing con 11 secciones |
| `panel_admin.html` | 1.003 | Backoffice |
| `panel_docente.html` | 921 | Panel del docente |
| `panel_padre.html` | 608 | Panel del tutor |
| `panel_estudiante.html` | 505 | Panel del alumno |
| `styles.css` | 1.756 | Estilos, incluido modo oscuro |
| `script.js` | 633 | Lógica de la landing y del login |
| `campus.js` | 495 | Cliente HTTP compartido, refresh de token, notificaciones |
| `toast.js` | 70 | Notificaciones de interfaz |

### 2.4 Base de datos

PostgreSQL vía Prisma. Cuatro migraciones: `init`, `campus_full`, `forum`, `moderation_flows`.
Existe `prisma/seed.ts` (325 líneas) con datos de demostración.

### 2.5 Móvil

**No existe.** No hay directorio, ni dependencias, ni prueba de concepto.

---

## 3. Qué está implementado

### 3.1 Página web institucional — ~75 %

Presentes en `index.html`: `inicio`, `nosotros`, `niveles`, `bienestar`, `noticias`, `galeria`,
`inscripcion`, `empleo`, `opiniones`, `panel-usuario`, `contacto`.

Los tres formularios públicos están cableados contra el backend con moderación posterior:

- `POST /api/public/inscriptions` → modelo `Inscription`
- `POST /api/public/opinions` → modelo `Opinion` (sin login, según consigna)
- `POST /api/public/employment` → modelo `EmploymentApplication` (con adjunto de CV)

Los tres caen en estado `PENDIENTE` y un administrador los aprueba o rechaza desde el backoffice.

### 3.2 Autenticación y RBAC — implementado y correcto

- 4 roles: `ESTUDIANTE`, `DOCENTE`, `PADRE`, `ADMIN`.
- Access token en `sessionStorage`; refresh token en cookie `httpOnly`, `sameSite=lax`,
  `secure` en producción y con `path` acotado a `/api/auth`.
- Renovación transparente en el cliente ante un `401` ([campus.js:36-51](../web/frontend/campus.js#L36-L51)).
- Middlewares `requireAuth` y `requireRole` correctamente aplicados.
- Los docentes se registran inactivos y requieren aprobación de un administrador.

### 3.3 Módulos funcionales operativos

| Módulo | Endpoints | Estado |
|---|---|---|
| Autenticación | 5 | Completo |
| Calificaciones | 3 | Funcional |
| Asistencia (individual y por lote) | 4 | Funcional |
| Actividades y entregas | 5 | Funcional, con adjuntos |
| Anuncios segmentados por rol | 3 | Funcional |
| Notificaciones | 3 | Funcional |
| Mensajería interna | 4 | Funcional, con Socket.IO |
| Foro por materia | 6 | Funcional |
| Planes de estudio | 2 | Funcional |
| Administración | 11 | Parcial (ver sección 4) |
| Moderación | 9 | Funcional |
| Pagos | 2 | **No cumple la consigna** (ver 5.1) |

---

## 4. Qué falta

### 4.1 Brechas contra las reglas de negocio críticas

| # | Regla de la consigna | Estado | Brecha |
|---|---|---|---|
| 1 | Cada alumno pertenece a un único curso; cada curso a un único nivel | ❌ | `curso` es un `String` libre en `User`. No existen las tablas `Nivel` ni `Curso`, ni la integridad referencial que la regla exige |
| 2 | Máximo 2 deportes simultáneos por alumno | ❌ | No existe la entidad `Deporte` ni inscripción deportiva alguna |
| 3 | Validación de conflictos de horarios entre deportes | ❌ | Sin entidad, sin horarios, sin validación |
| 4 | Exactamente 4 recorridos de transporte | ❌ | El término "transporte" no aparece en el código de negocio |
| 5 | Cada deporte con profesor, arancel y grupos por nivel/horario | ❌ | Inexistente |
| 6 | Los padres sólo ven información de sus propios hijos | ⚠️ | El filtrado por vínculo existe y funciona, **pero la vinculación no está controlada** (ver 5.2) |
| 7 | Pagos sólo por transferencia con comprobante adjunto | ❌ | **El endpoint actual marca la cuota como pagada sin comprobante** (ver 5.1) |
| 8 | QR dinámico para transporte y comedor | ❌ | Inexistente |

**Cobertura: 2 de 8** (contando la regla 6 como parcial).

### 4.2 Entidades de dominio ausentes

`Nivel` · `Curso` · `Materia` · `Alumno` (legajo, domicilio, fecha de nacimiento) ·
`Profesor` (legajo, especialidad, materias y cursos a cargo) · `Deporte` · `GrupoDeportivo` ·
`InscripcionDeporte` · `RecorridoTransporte` · `ServicioComedor` · `Factura` · `ItemFactura` ·
`Comprobante` · `RegistroAccesoQR`.

El modelo `User` actual concentra alumno, docente, padre y administrador en una sola tabla con
campos opcionales. Funciona para autenticar, pero no soporta los atributos que la consigna exige
para los módulos Alumnos y Profesores.

### 4.3 Automatizaciones — 0 %

No hay ninguna dependencia de scheduling (`node-cron`, `bullmq`, `agenda` o similar). Faltan:

- Envío del **último día hábil del mes** con desglose y factura adjunta.
- Recordatorio del **día 20** por deuda impaga.

`services/mailer.ts` existe (55 líneas) y está configurado, pero **ningún endpoint lo invoca**.
Es infraestructura sin consumidores.

### 4.4 Aplicación móvil — 0 %

Sin iniciar. Es el ítem de mayor riesgo del cronograma.

### 4.5 Calidad e infraestructura

| Faltante | Impacto |
|---|---|
| Sin tests (0 archivos de prueba) | Alto — no se puede demostrar el cumplimiento de las reglas críticas |
| Sin ESLint ni Prettier | Medio — el script raíz `pnpm lint` falla: ningún paquete lo implementa |
| Sin CI | Alto — 4 ramas paralelas integran sin verificación automática |
| `web/frontend/` sin `package.json` | Medio — `pnpm --filter frontend dev` no puede funcionar |
| Sin Dockerfile ni `docker-compose` | Bajo — dificulta reproducir el entorno en la defensa |
| `CLAUDE.md` está en `.gitignore` | Medio — la especificación de la cátedra no queda versionada |
| `package.json` raíz describe "React/Vite/Tailwind" | Bajo — documentación que contradice el código |

---

## 5. Hallazgos de seguridad y cumplimiento

### 5.1 🔴 Crítico — El flujo de pago contradice la regla de negocio

[payments.routes.ts:69-118](../web/backend/src/routes/payments.routes.ts#L69-L118) expone
`POST /api/payments/:id/pay`, que marca la cuota como `PAGADO` de inmediato, sin adjuntar
comprobante ni requerir validación administrativa.

La consigna es explícita: *"NO se acepta efectivo, únicamente transferencias bancarias con
comprobante adjunto"*. El endpoint actual equivale funcionalmente a declarar un pago sin
respaldo, que es justamente lo que la regla prohíbe.

**Corrección (Sprint 3):** reemplazar por un circuito `Factura → Comprobante(1..N) → EN_REVISION
→ validación de Administración → PAGADO`. El modelo `Payment` actual se conserva y evoluciona
hacia `Factura` + `ItemFactura`; no se descarta.

### 5.2 🔴 Crítico — Cualquier padre puede vincularse a cualquier alumno

[parent.routes.ts:30-54](../web/backend/src/routes/parent.routes.ts#L30-L54): `POST /api/parent/vincular`
acepta un DNI y crea el vínculo padre–hijo **sin ninguna verificación**. Con sólo conocer el DNI de
un alumno, cualquier usuario con rol `PADRE` accede a sus calificaciones, asistencia, cuotas y
mensajería.

Esto rompe directamente la regla *"los padres SOLO pueden ver y gestionar información de sus
propios hijos"*. El resto del código respeta el aislamiento correctamente; la falla está
concentrada en este único punto de entrada.

**Corrección (Sprint 2):** la solicitud de vinculación queda en estado pendiente y la aprueba un
administrador, o bien se crea desde el legajo del alumno en el backoffice.

### 5.3 🟠 Alto — Sin rate limiting

`POST /api/auth/login` y los formularios públicos (inscripción, opiniones, empleo) no tienen
límite de intentos. Quedan expuestos a fuerza bruta y a inundación de registros de moderación.

### 5.4 🟡 Medio — Refresh tokens sin revocación

`verifyRefreshToken` decodifica un campo `v` (versión) que no se contrasta contra nada persistido.
El logout no invalida el token del lado del servidor: un refresh token robado sigue siendo válido
hasta su expiración de 7 días.

### 5.5 🟡 Medio — `contentSecurityPolicy` deshabilitado

[app.ts:16-20](../web/backend/src/app.ts#L16-L20) desactiva CSP. Dado que los paneles construyen HTML
con plantillas de cadena a partir de datos del servidor, conviene revisar el escapado antes de la
entrega.

---

## 6. Fortalezas a preservar

No todo requiere intervención. Lo siguiente está bien resuelto y se conserva tal cual:

- **Validación del entorno con Zod al arrancar** ([config/env.ts](../web/backend/src/config/env.ts)):
  el proceso aborta si falta un secreto o si es más corto que 32 caracteres. Es una práctica que
  muchos proyectos de mayor porte no tienen.
- **Manejo centralizado de errores** con una clase `HttpError` y factorías semánticas.
- **Apagado ordenado** ante `SIGINT`/`SIGTERM` en [index.ts:31-45](../web/backend/src/index.ts#L31-L45).
- **TypeScript en modo estricto** con alias de rutas ya configurados.
- **Índices de base de datos deliberados**, incluidos compuestos (`[userId, isRead]`,
  `[receiverId, isRead]`) y restricciones únicas correctas
  (`[activityId, estudianteId]`, `[padreId, estudianteId]`).
- **Políticas `onDelete` pensadas caso por caso** (`Cascade`, `Restrict`, `SetNull`), no copiadas.
- **Refresh transparente de token en el cliente**, con protección contra llamadas concurrentes.

---

## 7. Plan de ejecución por sprints

El detalle completo, con tareas, responsables y criterios de salida, está en
[`docs/plan_de_trabajo.md`](plan_de_trabajo.md). Síntesis:

| Sprint | Ventana | Foco | Criterio de salida |
|---|---|---|---|
| Fase 0 | 15/09 → 29/09 | Auditoría, DER, arquitectura, PoC móvil | Plan entregado (29/09) |
| Sprint 1 | 30/09 → 09/10 | Dominio real, capas limpias, tests, CI | 8 reglas modeladas y testeadas |
| Sprint 2 | 10/10 → 21/10 | ABM Alumnos/Profesores/Admin, deportes, cierre de 5.2 | Backoffice completo |
| Sprint 3 | 22/10 → 30/10 | Facturación, comprobantes, schedulers, mail | Mes simulado de punta a punta |
| Sprint 4 | 02/11 → 10/11 | App móvil, QR, hardening | Circuito de pago móvil operativo |
| Freeze | **11/11** | Sólo defectos Bloqueante y Alto | — |
| Estabilización | 11/11 → 24/11 | Testing, documentación, ensayo | Entrega lista |

### Principios de ejecución

1. **Extender, no reescribir.** El código existente se conserva; el trabajo de Sprint 1 es
   principalmente aditivo (nuevas tablas y capas) más un refactor de organización que no cambia
   comportamiento.
2. **La regla de negocio primero, la interfaz después.** Cada regla crítica se implementa en el
   servicio con su test antes de tener pantalla.
3. **Nada se da por hecho sin un test.** Las 8 reglas críticas son el criterio de aceptación de
   la materia; deben ser demostrables ejecutando `pnpm test` frente a la cátedra.
4. **El valor agregado es lo último y lo primero en recortarse.** Si el cronograma se comprime,
   el QR cede antes que la facturación.

---

## 8. Decisiones que requieren confirmación del equipo

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| 1 | Stack de la app móvil | React Native (Expo) / Flutter / PWA | **Expo** — comparte TypeScript y el conocimiento del equipo, y produce build instalable para la demo |
| 2 | Alcance del refactor del frontend web | Mantener HTML plano / migrar a Vite + módulos ES | **Vite + módulos ES**, sin framework: elimina duplicación sin costo de aprendizaje |
| 3 | Separar `Alumno`/`Profesor` de `User` | Tablas satélite / campos en `User` | **Tablas satélite** con relación 1:1 — `User` queda sólo como identidad |
| 4 | Scheduler | `node-cron` en proceso / BullMQ con Redis | **`node-cron`** — suficiente para el alcance y no agrega infraestructura |
| 5 | Versionar `CLAUDE.md` | Mantener ignorado / versionar | **Versionar** — es la especificación funcional del proyecto |
