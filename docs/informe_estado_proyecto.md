# Informe de estado del proyecto

**Proyecto:** Sistema Integral de Gestión — Centro Educativo «Educar para Transformar»

**Materia:** Metodología de Sistemas II — TUP 2026 · **Equipo Naft:** Nahuel Alem · Fabricio Ceniquel Thompson

**Fecha del relevamiento:** 26/10/2026 · **Fuentes:** el repositorio, `git`, la CLI de GitHub (`gh`), la CLI de Railway y Lighthouse.

> Lo que no se pudo averiguar desde el repositorio está marcado **NO ENCONTRADO** y figura en la sección 6.
> El relevamiento se hizo antes y después de las mejoras de los TP 4 y 5, que se aplicaron el mismo día. Cuando un dato cambió, se indican los dos valores.

---

## 1. Datos generales

### Stack

| Capa | Tecnología | Versión (manifiesto) |
| --- | --- | --- |
| Lenguaje backend | TypeScript (modo estricto) sobre Node.js | TypeScript ^5.7.2 · Node 22.13 (`.nvmrc`, `engines: >=22.13`) |
| Framework backend | Express | ^4.21.2 |
| Validación | Zod | ^3.24.1 |
| ORM | Prisma | ^6.1.0 (instalado 6.19.3) |
| Base de datos | PostgreSQL | 18 en producción (Railway); 15.18 embebido en desarrollo; 18 en el CI desde el 26/10 |
| Tiempo real | Socket.IO | ^4.8.1 |
| Autenticación | jsonwebtoken + bcrypt + cookie-parser | ^9.0.2 · ^5.1.1 · ^1.4.7 |
| Correo / tareas programadas | nodemailer · node-cron | ^6.9.16 · ^4.6.0 |
| Frontend web | HTML5, CSS3 y JavaScript con módulos ES, **sin framework ni build** | — |
| App móvil | Expo + React Native + React | ~57.0.23 · 0.86.3 · 19.2.3 |
| Gestor de paquetes | pnpm (monorepo con workspaces) | 11.1.1 |
| Pruebas | Ejecutor nativo de Node (`node --test`) + tsx; Selenium WebDriver (desde el 26/10) | tsx ^4.19.2 · selenium-webdriver ^4 |
| Calidad (desde el 26/10) | ESLint + typescript-eslint, Husky + lint-staged | ^9.39 · ^8.72 · ^9.1 · ^16.4 |

> El `package.json` de la raíz decía «frontend (React/Vite/Tailwind)», pero el frontend es JavaScript plano. Se corrigió el 26/10.

### Estructura de carpetas

```
CentroEducativo/
├── .github/            workflows (ci.yml, respaldo.yml), plantillas de issue y PR, CODEOWNERS
├── .railway/           infraestructura como código de Railway (railway.ts)
├── .husky/             hooks de pre-commit y commit-msg
├── docs/               13 documentos técnicos + bitácora de IA + entregas de los TP
├── mobile/             app Expo para tutores (src/: pantallas, api, auth, dominio)
├── scripts/            métricas de entrega y Lighthouse, hook de commit-msg
└── web/
    ├── backend/        API Express + Prisma
    │   ├── src/modules/   15 módulos de dominio
    │   ├── prisma/        schema, 12 migraciones, seeds
    │   ├── scripts/       arneses de prueba, carga de matrícula, servidor de QA
    │   └── e2e/           pruebas con Selenium
    └── frontend/       portal público + 4 paneles (admin, docente, padre, estudiante)
```

### Repositorio

- **Remoto:** GitHub — <https://github.com/fabrithompson/CentroEducativo> — **público**.
- **Rama por defecto:** `main`. Rama de integración: `developer` (el plan de trabajo la llamaba `develop`).
- **Colaboradores:** `fabrithompson`, `Nehuelsito`, `FacuMJ`, `LauOporto`, `fbarrabino`.

### Despliegue

- **Plataforma:** **Railway**. Servicio `backend` (API + frontend estático en la misma imagen) y servicio `Postgres`, región `us-east4`.
- **Configuración:** `.railway/railway.ts` (infraestructura como código: build `pnpm build`, start `pnpm start`, pre-deploy con migraciones, volúmenes, variables). No hay `vercel.json`, `render.yaml`, `Dockerfile` ni `Procfile`; Railway construye con Railpack. Existe un `docker-compose.yml` sólo para levantar PostgreSQL en local.
- **URL de producción:** <https://transformar-para-educar.up.railway.app>. El dominio `backend-production-7a0d.up.railway.app` que figuraba en `docs/despliegue.md` ya no responde («Application not found»).
- **¿Automático o manual?** **Automático**: cada push a `main` despliega, después de que el CI termina en verde (`checkSuites: true`).
- **App móvil:** no está publicada; se abre con Expo Go desde la máquina de desarrollo.

### Scripts disponibles

| Dónde | Script | Qué hace |
| --- | --- | --- |
| raíz | `build` | `pnpm -r build` → en el backend, `prisma generate && tsc` (genera `web/backend/dist/`) |
| raíz | `start` | `node dist/index.js` del backend |
| raíz | `dev` | todos los paquetes en modo desarrollo (`tsx watch` en el backend) |
| raíz | `lint` / `lint:fix` | ESLint sobre todo el repositorio (antes del 26/10 apuntaba a scripts que no existían) |
| raíz | `test` · `typecheck` | pruebas y `tsc --noEmit` de cada paquete |
| raíz | `metricas:entrega` | métricas de GitHub, Actions y Railway |
| backend | `test:integracion` | PostgreSQL real + migraciones + seed + reglas en el motor + suite completa |
| backend | `test:e2e` | pila completa + Selenium |
| backend | `test:humo` | circuitos por HTTP (académico, auth, retención, web) |
| backend | `qa` | levanta la pila completa en el puerto 4599 para probar a mano |
| backend | `prisma:*`, `db:*`, `matricula:*` | migraciones, seed, base de pruebas y carga de 5000 alumnos |
| mobile | `start` · `test` · `typecheck` | Expo, pruebas del dominio y tipos |

---

## 2. Arquitectura

### Comunicación

```
 Portal público ─┐
 Backoffice     ─┼──  HTTPS · JSON · JWT  ──►  API REST (Express)  ──►  Prisma  ──►  PostgreSQL
 App móvil      ─┘                               │
                                                 └── Socket.IO (cambios en tiempo real)
```

- **API REST** bajo `/api/*`, con 27 routers montados desde `web/backend/src/routes/index.ts`. Respuestas JSON y errores con formato común.
- **Autenticación:** `POST /api/auth/login` devuelve un **JWT de acceso** (el frontend lo guarda en `sessionStorage`) y deja un **token de refresco en una cookie `httpOnly`**, una por cuenta. El refresco tiene revocación: cambiar la contraseña sube `tokenVersion` y cierra todas las sesiones.
- **Autorización:** RBAC con cuatro roles (`ADMIN`, `DOCENTE`, `PADRE`, `ESTUDIANTE`) y una matriz en `shared/authz.ts`. Los tutores sólo acceden a alumnos vinculados en `TutorAlumno` (RF-03).
- **Frontend:** lo sirve el mismo Express con `express.static` (caché de 1 h). No hay CORS entre frontend y API en producción.
- **Reglas de negocio en la base:** índice único parcial (máximo dos deportes), disparadores PL/pgSQL (sin cruce de horarios, cuatro recorridos fijos, tutor con rol PADRE, comprobante obligatorio y recálculo del estado de la factura) y restricciones `CHECK`.

### Módulos y estado

| Módulo | Qué cubre | Estado |
| --- | --- | --- |
| `auth` | registro, ingreso, refresco, recuperación de contraseña, límite de intentos | ✅ completo |
| `alumnos` | ABM con legajo automático, DNI único, vínculos con tutores (RF-01) | ✅ completo, con prueba de humo de punta a punta |
| `profesores` | ABM, materias y cursos a cargo (RF-04) | ✅ completo |
| `administrador` | usuarios, roles, aprobación de docentes, moderación, ABM académico | ✅ completo |
| `padres` | portal de tutores restringido a sus hijos (RF-03) | ✅ completo, con E2E |
| `deportes` | catálogo, horarios, inscripción con máximo 2 y sin cruces (RF-02) | ✅ en API y base; **sin pantalla de inscripción en la web** |
| `transporte` / `servicios` | 4 recorridos, comedor, cupos (RF-05); rastreo del transporte (RF-08) | ✅ API y reportes |
| `facturacion` | facturas con ítems, comprobantes de transferencia (1:N), estado derivado | ✅ completo |
| `scheduler` | mail del último día hábil con la factura; recordatorio del día 20 | ✅ implementado; envío real por SMTP **no verificado** |
| `avisos` | notificaciones a teléfonos de tutores (RF-07), patrón Strategy | ✅ implementado; proveedor real **no verificado** |
| `credenciales` | carnet digital con QR dinámico (TOTP) y escáner de acceso | ✅ completo; cámara en hardware real **no verificada** |
| `reportes` | alumnos por materia (RF-06), por deporte, por transporte, morosidad | ✅ completo, medido con 5012 alumnos |
| `comunicacion` | anuncios, mensajes, notificaciones, foro, tiempo real | ✅ completo |

### Endpoints principales

| Método y ruta | Acceso |
| --- | --- |
| `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/refresh` · `POST /api/auth/logout` · `GET /api/auth/me` | público / cookie / autenticado |
| `GET/POST /api/alumnos` · `GET/PATCH/DELETE /api/alumnos/:id` | lectura filtrada por rol; escritura ADMIN |
| `POST /api/alumnos/:id/tutores` · `DELETE /api/alumnos/tutores/:id` | ADMIN |
| `GET/POST /api/profesores` · `PATCH/DELETE /api/profesores/:id` · `POST /api/profesores/:id/materias` | ADMIN (lectura también DOCENTE) |
| `GET/POST/PATCH/DELETE /api/academico/{niveles,cursos,materias}` | lectura autenticada; escritura ADMIN |
| `GET /api/deportes` · `POST /api/deportes/inscripciones` · `GET /api/deportes/alumno/:id/disponibles` | autenticado; inscripción ADMIN o PADRE vinculado |
| `GET /api/servicios/transporte/recorridos` · `POST /api/servicios/transporte` · `POST /api/servicios/comedor` | autenticado; alta ADMIN o PADRE vinculado |
| `GET /api/padres/mis-hijos` · `GET /api/padres/mis-hijos/:id/{deportes,servicios,facturas,deuda,calificaciones,asistencia}` | PADRE, sólo sus hijos (404 si no) |
| `/api/facturacion/*` | facturas, comprobantes y validación |
| `GET /api/reportes/{alumnos-por-materia,alumnos-por-deporte,alumnos-por-transporte,morosidad}` | ADMIN |
| `/api/credenciales/*` · `POST /api/accesos/escanear` | carnet QR y escáner |
| `/api/announcements` · `/api/messages` · `/api/notifications` · `/api/forum` · `/api/grades` · `/api/attendance` | campus |
| `/api/admin/*` | usuarios, docentes pendientes, cuotas, moderación |
| `GET /health` | health check público |

El detalle de los 67 endpoints documentados está en `docs/api_rest.md`.

---

## 3. CI/CD y herramientas

| Herramienta | ¿Se usa? | Evidencia |
| --- | --- | --- |
| **Integración continua** | **Sí** | `.github/workflows/ci.yml`, en cada push y PR a `main` y `developer`. Hasta el 25/10: un job (`Typecheck y pruebas de integración`). Desde el 26/10: 6 jobs paralelos (Typecheck, Pruebas de integración (PostgreSQL), Pruebas de la app móvil, Lint (ESLint), Pruebas E2E (Selenium) —sólo en PR— y SonarCloud) y `paths-ignore` de documentación en los push. 56 corridas, 55 exitosas. |
| **Despliegue continuo** | **Sí** | Railway conectado al repositorio: cada push a `main` construye y despliega. Espera al CI (`checkSuites: true`), aplica migraciones en el pre-deploy (`pnpm --filter backend predespliegue`) y reintenta hasta 3 veces si el proceso cae. |
| **Build** | **Sí** | `pnpm build` → `prisma generate && tsc`. Genera el cliente de Prisma y `web/backend/dist/`. Corre en Railway (Railpack, Node 22.13) y produce una imagen de 431 a 451 MB. |
| **Pipelines** | **Sí** | **CI**: checkout → pnpm → Node con caché → `pnpm install --frozen-lockfile` → `prisma generate` → typecheck / pruebas / lint / E2E. **Respaldo** (`respaldo.yml`, todos los días a las 03:15 UTC): detectar versión → `pg_dump` → verificar → cifrar con AES-256 → artifact (90 días) → restaurar en una base limpia → contar tablas. 37 corridas, todas exitosas. **Railway**: build → pre-deploy → deploy. |
| **Variables de entorno** | **Sí** | `web/backend/.env.example` con: `NODE_ENV`, `PORT`, `CORS_ORIGIN`, `DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`, `UPLOAD_DIR`, `MAX_UPLOAD_SIZE_MB`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `RETENCION_ACTIVA`. **`.env` está en `.gitignore`.** En producción se cargan en Railway (en la IaC como `preserve()`, sin valores). En GitHub: secretos `DATABASE_URL_RESPALDO`, `RESPALDO_PASSPHRASE` y, a futuro, `SONAR_TOKEN`. |
| **Gestión de artefactos** | **Parcial** | Los respaldos de la base se guardan como artifacts de Actions (cifrados, 90 días). Las imágenes de cada despliegue quedan en Railway (permiten *rollback*). El build no se guarda como release versionada. |
| **Integración del repo con CI/CD** | **Sí** | App de GitHub de Railway (despliegue + lectura de *check suites*); GitHub Actions nativo; SonarCloud configurado, falta activarlo. |
| **Pull Requests** | **Sí, con salvedades** | 25 PR mergeados hasta el 25/10, más 3 el 26/10 (28 en total). Ramas por funcionalidad o por persona (`feat/…`, `fix/…`, `fabri`, `facu`, `developer`, `prueba-claude`). **Revisión de otra persona: 0 de 28.** Hasta el 25/10, el 53 % de los commits llegó a `main` sin PR. Desde el 26/10 `main` está protegida: sólo por PR y con los 6 chequeos en verde. |
| **Issues** | **No → Sí (26/10)** | Hasta el 25/10: 0. Desde el 26/10: 14 issues (#26 a #39), 8 cerrados; etiquetas de tipo, área, prioridad y TP; plantillas en `.github/ISSUE_TEMPLATE/` (historia de usuario, defecto, tarea). |
| **Wiki** | **No** | Está habilitada en GitHub pero vacía (el repositorio `.wiki.git` no existe). La documentación vive en `docs/`. |
| **Tablero Kanban** | **No** | No existe en GitHub Projects. El plan de trabajo dice «Jira», pero el equipo confirmó que **nunca se usó**. Pendiente de crear (ver sección 6). |
| **ESLint / Prettier** | ESLint sí (26/10); Prettier no | `eslint.config.mjs`; `.vscode/` con corrección al guardar; `.editorconfig`. |
| **Husky / pre-commit** | **Sí (26/10)** | `.husky/pre-commit` (lint-staged + `git diff --check`), `.husky/commit-msg` (Conventional Commits). |
| **Tests** | **Sí** | `node --test` + tsx: 295 del backend, 17 de reglas en el motor, 70 de la app móvil, 3 E2E con Selenium y 4 circuitos de humo por HTTP. |
| **Health check** | **Sí** | `GET /health`. Railway todavía no lo consulta (`healthcheckPath` sin configurar). |
| **Seeds** | **Sí** | `prisma/seed.ts` (16 usuarios de prueba, contraseña `123456`), `seed-dominio.ts`, `seed-sin-usuarios.ts` (para producción). |
| **Migraciones** | **Sí** | 12 en `prisma/migrations/`, aplicadas en el pre-deploy de Railway. |
| **SonarQube / SonarCloud** | **Configurado (26/10), sin activar** | `sonar-project.properties` + job del CI; falta el token. |
| **Cypress / Selenium** | **Selenium (26/10)** | `web/backend/e2e/`, job E2E en el CI. |

---

## 4. Métricas reales (medidas el 26/10/2026)

### Commits

| Mes | Commits en `main` (sin merges) |
| --- | --- |
| 2026-05 | 13 |
| 2026-06 | 15 |
| 2026-07 / 2026-08 | 0 |
| 2026-09 | 71 |
| 2026-10 | 8 |
| **Total** | **107** (+ 30 merges) |

| Autor (según `git`) | Commits |
| --- | --- |
| Nahuel Alem | 43 |
| Fabricio Thompson / fabrithompson (misma persona, dos configuraciones de git) | 36 + 16 = 52 |
| Facum / FacuMJ | 8 + 1 = 9 |
| Franco Barrabino | 3 |

> GitHub (*Insights → Contributors*) muestra además a **«claude»** con 42 commits: son commits de septiembre que llevan la línea `Co-Authored-By: Claude`. Desde el 26/10 los commits se hacen sin esa línea; el uso de IA se documenta en `docs/bitacora_ia.md`.

### Pull requests

| Métrica | Hasta el 25/10 (25 PR) | 26/10 (3 PR) |
| --- | --- | --- |
| Tiempo abierto → merge | mediana 27 s · promedio 1 min 48 s · **máximo 17 min 37 s** (#22) | mediana 3 min 38 s · máximo 5 min 52 s |
| Tamaño (líneas agregadas + borradas) | mediana 150 · promedio 2414 · **máximo 32 547** (#16) | mediana 632 · máximo 1677 (#41, incluye el lockfile) |
| Con revisión de otra persona | 0 | 0 |
| Que cierran un issue | 0 | 3 |
| Commits que llegaron a `main` sin PR | 52 de 98 (53 %) | 0 de 8 |

### GitHub Actions

| Métrica | Antes (50 corridas) | Después (6 corridas, 26/10) |
| --- | --- | --- |
| Duración de una corrida | mediana 67 s · máx. 76 s | push a `main`: 45–51 s · PR: 46–80 s |
| Jobs | 1 secuencial | 6 en paralelo |
| Paso más lento | Initialize containers: 21,3 s | E2E (Selenium): 27 s en los PR; Initialize containers del job de integración: 10,2 s |
| Exitosas | 98 % | 100 % |
| Corridas sobre commits de sólo documentación | 42 % | 0 % |

Duración promedio por paso en la línea base: Initialize containers 21,3 s · pruebas de integración 11,6 s · instalar Node 9,2 s · typecheck 8,7 s · instalar dependencias 5,5 s · `prisma generate` 2,2 s · stop containers 2,0 s · checkout 1,1 s. Respaldo diario: 48 s a 1 min 2 s.

### Despliegues (Railway)

| Métrica | Valor |
| --- | --- |
| Despliegues registrados (21/06 → 26/10) | 63: 36 construidos, 27 salteados (cambios que no tocan la imagen), 0 fallidos visibles en la CLI |
| Builds repetidos sobre el mismo commit | 16 hasta el 25/10 (redespliegues manuales de junio y septiembre); 0 desde el 26/10 |
| Duración push → aplicación respondiendo | 30/09: 3 min 44 s · 29/09: entre 5 min 32 s y 34 min 33 s (despliegues encolados) · 26/10: 4 min 53 s y 3 min 25 s |
| Desglose del 26/10 (último) | espera del CI 54 s · build 2 min 00 s · arranque 31 s · imagen 447 MB |

Los informes completos están en `docs/tp4/metricas_antes.md` y `docs/tp4/metricas_despues.md`, y se regeneran con `node scripts/metricas/entrega.mjs`.

---

## 5. Para las pruebas (TP Unidad 5)

### Dos funcionalidades candidatas para el caso de prueba

> La del TP de la Unidad 4 es el alta de alumnos (RF-01); éstas son distintas.

**A. Acceso de padres (RF-03) — elegida.** Requerimiento verificable: *un tutor sólo ve a sus propios hijos.*

1. Abrir el portal → clic en **«Iniciar sesión»** (barra superior).
2. Modal «Iniciar Sesión»: campo **Usuario** = `mgomezp`, campo **Contraseña** = `123456` → botón **«Ingresar al Campus»**.
3. Redirige a **panel_padre.html**. Desplegar el selector **«Alumno a cargo»**.
4. Esperado: exactamente **«Gómez, María Paz (6to Grado "A")»** y **«Flores, Ignacio Tomás (6to Grado "A")»**.
5. Cerrar sesión, ingresar como `pmedina` / `123456` → esperado: sólo **«Medina, Mateo Nicolás (1er Año "A")»**.
6. Con la sesión de `mgomezp`, pedir `/api/padres/mis-hijos/{id de Mateo}/deportes` → esperado: **404** «Recurso no disponible en el portal de tutores.»

**B. Ingreso al campus (RNF-02, seguridad).** Requerimiento verificable: *con una contraseña incorrecta no se ingresa, y el sistema lo informa sin revelar datos.*

1. Abrir el portal → **«Iniciar sesión»**.
2. **Usuario** = `mlopez`, **Contraseña** = `incorrecta1` → **«Ingresar al Campus»**.
3. Esperado: no hay redirección y aparece un aviso rojo (toast) con el mensaje **«Contraseña incorrecta.»**
4. Repetir con **Usuario** = `noexiste` → esperado: aviso **«El usuario no existe.»**
5. Repetir 10 intentos fallidos con el mismo usuario → esperado: aviso **«Demasiados intentos fallidos. Esperá unos minutos antes de reintentar.»** (límite de 10 intentos en 15 minutos por IP y usuario).
6. Con la contraseña correcta (`123456`) → esperado: redirige a **panel_docente.html**.

### Pruebas existentes

- **Sí.** Herramienta: ejecutor nativo de Node (`node --test`) con `tsx`, contra **PostgreSQL real** (embebido en local, service container en el CI): 295 pruebas del backend, 17 de reglas en el motor y 70 de la app móvil.
- **Pruebas de humo** por HTTP (scripts `humo-*.ts`).
- **E2E con Selenium WebDriver** desde el 26/10: 3 pruebas de RF-03.

### Herramienta E2E recomendada: Selenium

Para este stack conviene **Selenium WebDriver**: usa el mismo ejecutor (`node --test`) y el mismo TypeScript que el resto de las pruebas; es un paquete liviano (Selenium Manager descarga el driver solo); corre igual con Edge en Windows y con Chrome en el CI; y permite abrir dos navegadores en una misma prueba, que es lo que necesita RF-03 (un tutor obtiene un id y otro intenta usarlo). Cypress tiene mejor depuración visual, pero suma su propio ejecutor y un binario de ~500 MB que con pnpm 11 obliga a habilitar scripts de instalación. Ya está configurado y corriendo en el CI.

### Linter

- **Hasta el 25/10: no había** (el script `lint` existía, pero apuntaba a scripts que ningún paquete definía).
- **Desde el 26/10:** ESLint 9 (`eslint.config.mjs`). Reglas: `@eslint/js` recomendadas y `typescript-eslint` recomendadas. Como **errores**: `eqeqeq` (permite `== null`), `no-var`, `prefer-const` y `no-unused-expressions` (permite ternarios). Como **advertencias**: `no-explicit-any` y `no-unused-vars` (ignora nombres que empiezan con `_`). Estado: 0 errores, 27 advertencias en 136 archivos.

### Historias de usuario documentadas

En el repositorio **no hay historias en formato «Como / quiero / para»** (**NO ENCONTRADO** en ese formato). El plan de trabajo (§7) las nombra HU1 a HU8, asociadas a los requerimientos RF-01 a RF-08, y los define así (`docs/plan_de_trabajo.md`, §2):

| HU | RF | Requerimiento | Responsable |
| --- | --- | --- | --- |
| HU1 | RF-01 | **Gestión de Alumnos.** Registrar los datos personales de los alumnos (legajo, DNI, nombre, apellido, nivel, curso) evitando registros duplicados | Nahuel |
| HU2 | RF-02 | **Gestión Deportiva.** Controlar que cada alumno pueda inscribirse a un máximo de dos deportes simultáneos, verificando que no existan conflictos de horarios | Nahuel |
| HU3 | RF-03 | **Acceso de Padres.** Permitir a los padres consultar los profesores por materia, restringiendo el acceso únicamente a la información de sus propios hijos | Nahuel |
| HU4 | RF-04 | **Gestión Docente.** Registrar las materias que un profesor tiene a su cargo y los cursos en los que desarrolla sus actividades | Fabricio |
| HU5 | RF-05 | **Servicio de Transporte.** Inscribir a un alumno al servicio de transporte seleccionando uno de los cuatro recorridos disponibles | Fabricio |
| HU6 | RF-06 | **Generación de Reportes.** Generar un listado de alumnos por materia, mostrando nivel educativo, curso, materia, profesor a cargo, nombre del alumno y legajo | Fabricio |
| HU7 | RF-07 | **Desafío — Valor agregado.** Integrar una API de mensajería para enviar notificaciones automáticas a los teléfonos de los padres ante cambios de horario o avisos importantes | Nahuel |
| HU8 | RF-08 | **Desafío — Valor agregado 2.** Integrar un servicio de geolocalización que permita a los padres rastrear la ubicación del transporte escolar en tiempo real desde la aplicación móvil | Fabricio |

La HU3 completa, con criterios de aceptación, está redactada en `docs/tp5/TP5_Unidad5_Parte2.md` (§4.1).

---

## 6. Preguntas para el equipo

1. **Tablero Kanban.** No existe todavía: crear el tablero en GitHub Projects necesita el permiso `project` en la CLI de GitHub. Hay que correr `gh auth refresh -h github.com -s project,read:project`. Sin eso, el tablero —una de las dos mejoras del TP4— no se puede armar desde acá.
2. **Capturas que tiene que sacar un integrante con sesión iniciada:**
   - *Insights → Pulse* de GitHub, que sin sesión se ve vacío.
   - La página de despliegues de Railway (<https://railway.com> → proyecto CentroEducativo → servicio backend → *Deployments*).
   - Opcional: *Settings → Branches* en GitHub, mostrando la regla de protección de `main`.
3. **SonarCloud.** Falta activarlo con la cuenta de GitHub de `fabrithompson` y cargar el secreto `SONAR_TOKEN`. Los pasos están en `docs/tp5/calidad.md`.
4. **Autoría del caso de prueba (TP5).** Se completó «diseñada por» y «ejecutada por» Fabricio Ceniquel Thompson, el 26/10/2026. La ejecución fue **automatizada** (Selenium en local y en el CI). Si alguno de los dos la corre además a mano, conviene agregarlo con su nombre y fecha.
5. **TP5 Parte 1.** Uno de los archivos recibidos (`TP Unidad 5- 2026- Parte1.docx`) dice «Rios Lucas, Godoy Marco»: parece de otro equipo. El del equipo es `TPUnidad5 Calidad Software.docx`.
6. **TP4 Parte 1.** La consigna la pide individual y con fecha 6/10. Las respuestas están en `docs/tp4/TP4_Unidad4.md`: confirmar si todavía se entrega y que cada integrante la adapte.
7. **Aprobación obligatoria en los PR.** Se dejó en 0 para la entrega. ¿Se pasa a 1 (Nahuel aprueba lo de Fabricio y viceversa) después del 27/10?
8. **Colaboradores del repositorio.** `LauOporto` y `fbarrabino` tienen acceso, y `Franco Barrabino` aparece con 3 commits. ¿Son docentes de la cátedra? Para el informe no hace falta, pero conviene saberlo antes de exigir revisiones de `CODEOWNERS`.
