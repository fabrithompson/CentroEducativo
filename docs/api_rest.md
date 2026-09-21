# API REST — Servicios y Controladores

**Proyecto:** Centro Educativo "TRANSFORMAR PARA EDUCAR"
**Versión de la API:** 0.3.0
**Migración asociada:** `20260915213000_vinculo_tutor_alumno_y_password_reset`
**Fecha:** 15/09/2026

---

## 1. Arquitectura

El código nuevo sigue la separación por capas que fijó el plan de trabajo, en
`src/modules/<dominio>/`:

```
routes (controlador)  →  service (reglas de negocio)  →  Prisma
         ↓
    shared/authz   ← autorización centralizada
    shared/pagination
    shared/rateLimit
```

Los routers validan la entrada con Zod, resuelven permisos y delegan. No arman
queries: eso vive en los servicios. Los servicios no conocen Express: reciben
`PrismaClient` como parámetro, que es lo que permite testearlos con un doble de
prueba y sin base de datos.

Todo router vive dentro de su módulo. `src/routes/` quedó sólo con el `index.ts`
que compone la API: importa cada router y lo cuelga de su prefijo, agrupados por
el recorte de la consigna (Alumnos, Profesores, Administrador), más Padres y las
dos agrupaciones transversales.

| Módulo | Servicio | Controlador |
|---|---|---|
| Auth / contraseñas | `modules/auth/password.service.ts` + `tokens.ts` | `password.routes.ts` |
| Alumnos | `modules/alumnos/alumnos.service.ts` | `alumnos.routes.ts` |
| Profesores | `modules/profesores/profesores.service.ts` | `profesores.routes.ts` |
| Deportes | `modules/deportes/deportes.service.ts` + `horarios.ts` | `deportes.routes.ts` |
| Transporte y comedor | `modules/servicios/servicios.service.ts` | `servicios.routes.ts` |
| Portal de tutores | — | `modules/padres/padres.routes.ts` |
| Reportes | `modules/reportes/reportes.service.ts` | `reportes.routes.ts` |
| Académico (niveles, cursos, materias) | `modules/administrador/academico.service.ts` | `academico.routes.ts` |
| Alumnos (heredado) | — | `modules/alumnos/`: `estudiantes`, `calificaciones`, `asistencia` |
| Profesores (heredado) | — | `modules/profesores/`: `planes`, `actividades` |
| Administrador | — | `modules/administrador/`: `administrador`, `moderacion`, `comunicados`, `pagos` |
| Comunicación | — | `modules/comunicacion/`: `foro`, `mensajes`, `notificaciones` |

---

## 2. Autenticación

JWT con dos tokens, como ya estaba: access token de 15 minutos en el header
`Authorization: Bearer`, y refresh token de 7 días en cookie `httpOnly`.

### 2.1 Endpoints

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/api/auth/register` | público | Alta de estudiante, docente o padre |
| POST | `/api/auth/login` | público | Devuelve access token y setea el refresh |
| POST | `/api/auth/refresh` | cookie | Renueva el access token |
| POST | `/api/auth/logout` | público | Limpia la cookie |
| GET | `/api/auth/me` | autenticado | Datos de la sesión |
| **POST** | **`/api/auth/forgot-password`** | público | **Envía el enlace de recuperación** |
| **POST** | **`/api/auth/reset-password`** | público | **Fija la contraseña nueva con el token** |
| **POST** | **`/api/auth/change-password`** | autenticado | **Cambio con la contraseña actual** |

### 2.2 Cómo funciona la recuperación

1. `POST /api/auth/forgot-password` con `{ email }`.
2. Se genera un token de 32 bytes aleatorios (256 bits). **En la base se guarda
   sólo su SHA-256**; el valor en claro viaja únicamente en el mail.
3. El enlace vence en **30 minutos**. Emitir un token nuevo invalida los anteriores.
4. `POST /api/auth/reset-password` con `{ token, password }`. Al consumirlo se
   marca como usado y se invalida cualquier otro pendiente del usuario.

Decisiones que conviene entender antes de tocar este código:

- **La respuesta de `forgot-password` es idéntica exista o no el email.** Si
  contestara distinto sería un oráculo para averiguar qué direcciones están
  registradas en el colegio.
- **Los tres modos de falla del token —inexistente, usado, vencido— devuelven el
  mismo mensaje.** No se le informa al atacante en cuál cayó.
- **La comparación de hashes es en tiempo constante** (`timingSafeEqual`). Con
  `===`, el tiempo de respuesta filtra cuántos caracteres iniciales coinciden.
- **Se usa SHA-256 y no bcrypt** para el token: ya tiene 256 bits de entropía
  aleatoria, así que no hay diccionario que valga, y la búsqueda por `tokenHash`
  necesita ser determinística para poder indexarse.

### 2.3 Política de contraseñas

Mínimo 8 caracteres combinando letras y números, para los endpoints nuevos.
El `register` existente sigue pidiendo 6; unificarlo implica migrar las cuentas
actuales y quedó para Sprint 3.

### 2.4 Límite de intentos

`forgot-password`: 5 pedidos cada 15 minutos por IP.
`reset-password`: 10 intentos cada 15 minutos por IP.

Cubre el hallazgo 5.3 de la auditoría para estos dos endpoints. Es un limitador
en memoria (`shared/rateLimit.ts`), sin dependencias nuevas. **Limitación
conocida:** el estado vive en el proceso, así que con varias instancias detrás de
un balanceador cada una lleva su propia cuenta. Para el alcance del TP alcanza;
en producción esto va a Redis. El `login` todavía no lo tiene: queda pendiente.

---

## 3. Autorización

### 3.1 El vínculo tutor–alumno

`ParentStudentLink` tenía dos problemas: vinculaba `User` con `User` —y un alumno
de Inicial no tiene `User`— y **lo creaba el propio padre informando un DNI, sin
verificación alguna** (hallazgo 5.2 de la auditoría).

El modelo nuevo `TutorAlumno` vincula `User` (rol PADRE) con `Alumno`, y **sólo un
ADMIN puede crearlo**, quedando registrado quién lo hizo. En la base:

- Un trigger verifica que el tutor tenga rol `PADRE`.
- Un índice único parcial garantiza un solo responsable de facturación por alumno.

`POST /api/parent/vincular` **ya se retiró**, junto con todo el router `/api/parent`:
el panel de padres pasó a `GET /api/padres/mis-hijos` y el alta de vínculos quedó
donde corresponde, en el panel de administración.

La tabla `ParentStudentLink` todavía existe porque tres endpoints heredados la usan
para autorizar al tutor —`/api/grades`, `/api/attendance` y `/api/payments`—. Ya no
se puede escribir en ella salvo desde `/api/admin/links`, así que la vía de abuso
está cerrada; lo que queda es unificarlos contra `TutorAlumno`.

### 3.2 La matriz de acceso

Centralizada en `shared/authz.ts`. Ningún router repite la lógica.

| Rol | Alumnos que puede ver |
|---|---|
| ADMIN | todos |
| DOCENTE | todos |
| PADRE | sólo los vinculados por `TutorAlumno` |
| ESTUDIANTE | sólo su propia ficha |
| cualquier otro | ninguno |

Dos detalles deliberados:

- **Un padre que pide un alumno ajeno recibe 404, no 403.** Un 403 confirmaría que
  ese alumno existe, que ya es información que no le corresponde.
- **Un padre sin hijos vinculados recibe el filtro `{ id: { in: [] } }`, nunca
  `{}`.** Un filtro vacío devolvería el padrón completo del colegio. Hay un test
  específico para esto.

### 3.3 El portal de tutores

Todas las rutas de `/api/padres/*` exigen rol PADRE a nivel de router. Las que
reciben `:alumnoId` pasan por el middleware `cargarHijo`, que verifica el vínculo
antes de que el handler vea un solo dato.

Además hay una guarda final: cualquier ruta bajo `/mis-hijos/*` que no esté
explícitamente declarada arriba responde 404. Si alguien agrega un endpoint y se
olvida de `cargarHijo`, la funcionalidad nueva se rompe — que es preferible a
filtrar datos de otra familia.

---

## 4. Endpoints

### 4.1 Alumnos

| Método | Ruta | Roles |
|---|---|---|
| GET | `/api/alumnos` | autenticado (filtrado por rol) |
| GET | `/api/alumnos/:id` | autenticado (validando vínculo) |
| POST | `/api/alumnos` | ADMIN |
| PATCH | `/api/alumnos/:id` | ADMIN |
| DELETE | `/api/alumnos/:id` | ADMIN — baja lógica |
| POST | `/api/alumnos/:id/tutores` | ADMIN |
| DELETE | `/api/alumnos/tutores/:id` | ADMIN |

Filtros de `GET /api/alumnos`: `busqueda` (apellido, nombres, DNI o legajo),
`cursoId`, `nivelId`, `estado`, `page`, `pageSize`.

Notas:

- **El legajo lo asigna el sistema** (`A-0001`), dentro de una transacción
  `Serializable`. Es la identidad administrativa del alumno; no puede depender de
  que alguien no se equivoque al tipearlo.
- El alta valida el **cupo del curso**.
- El `DELETE` es **baja lógica** y además da de baja las inscripciones activas a
  deportes, transporte y comedor: si no, el alumno seguiría ocupando cupo y
  generando cargos. No se borra el registro porque tiene facturas y notas
  asociadas, y la FK `ON DELETE RESTRICT` de `Factura` lo impediría igual.

### 4.2 Profesores

| Método | Ruta | Roles |
|---|---|---|
| GET | `/api/profesores` | ADMIN, DOCENTE |
| GET | `/api/profesores/:id` | ADMIN, DOCENTE |
| POST | `/api/profesores` | ADMIN |
| PATCH | `/api/profesores/:id` | ADMIN |
| DELETE | `/api/profesores/:id` | ADMIN — baja lógica |
| POST | `/api/profesores/:id/materias` | ADMIN |
| DELETE | `/api/profesores/materias/:id` | ADMIN |

Padres y estudiantes no acceden: no hay motivo para que vean DNI, domicilio ni
teléfono del personal.

La baja **se niega si el profesor es responsable de algún deporte activo**. La
regla de negocio exige que cada deporte tenga responsable; primero hay que
reasignarlo.

### 4.3 Estructura académica

| Método | Ruta | Roles |
|---|---|---|
| GET | `/api/academico/niveles` | autenticado |
| POST | `/api/academico/niveles` | ADMIN |
| PATCH | `/api/academico/niveles/:id` | ADMIN |
| DELETE | `/api/academico/niveles/:id` | ADMIN — baja lógica |
| GET | `/api/academico/cursos` | autenticado |
| POST | `/api/academico/cursos` | ADMIN |
| PATCH | `/api/academico/cursos/:id` | ADMIN |
| DELETE | `/api/academico/cursos/:id` | ADMIN — baja lógica |
| GET | `/api/academico/materias` | autenticado |
| POST | `/api/academico/materias` | ADMIN |
| PATCH | `/api/academico/materias/:id` | ADMIN |
| DELETE | `/api/academico/materias/:id` | ADMIN — baja lógica |

Filtros: `activo` en los tres; `nivelId`, `anioLectivo` y `turno` en cursos;
`cursoId`, `nivelId`, `profesorId` y `sinProfesor` en materias.

La lectura queda abierta a cualquier sesión a propósito: es el catálogo con el
que los paneles arman sus desplegables —a qué curso inscribir un alumno, qué
materia asignarle a un profesor— y no contiene ningún dato personal. La
escritura es exclusiva de ADMIN.

Notas:

- **Sin este módulo la API no se podía usar.** `POST /api/alumnos` exige un
  `cursoId` y `POST /api/profesores/:id/materias` un `materiaId`, y no había
  ningún endpoint que los listara: los ids existían en la base y eran
  inalcanzables desde afuera.
- Las bajas son **lógicas** y además **se niegan cuando todavía cuelga algo**:
  un nivel con cursos activos, o un curso con alumnos activos. El mensaje dice
  cuántos son, que es lo que hace falta para saber qué ordenar primero.
- `PATCH /cursos/:id` **rechaza bajar el cupo por debajo de la matrícula ya
  inscripta**: dejaría al curso en un estado que el propio alta de alumnos
  considera inválido.
- El catálogo se devuelve **sin paginar**. Son decenas de filas y los
  desplegables las necesitan completas; el corte natural, si algún día dejara
  de serlo, es `anioLectivo`, que ya es filtro de `GET /cursos`.

### 4.4 Deportes

| Método | Ruta | Roles |
|---|---|---|
| GET | `/api/deportes` | autenticado |
| GET | `/api/deportes/:id` | autenticado |
| POST | `/api/deportes` | ADMIN |
| POST | `/api/deportes/:id/horarios` | ADMIN |
| GET | `/api/deportes/alumno/:alumnoId` | validando vínculo |
| GET | `/api/deportes/alumno/:alumnoId/disponibles` | validando vínculo |
| POST | `/api/deportes/inscripciones` | ADMIN, PADRE (vinculado) |
| DELETE | `/api/deportes/inscripciones/:id` | ADMIN, PADRE (vinculado) |

`/disponibles` devuelve el catálogo anotado: cada deporte trae `inscribible` y,
si no lo es, el `motivo` (ya lo cursa, alcanzó el máximo de 2, o choca de
horario con el mensaje concreto). Permite que la UI muestre la opción
deshabilitada con la explicación, en vez de dejar que el tutor descubra el
rechazo recién al enviar el formulario.

La inscripción corre en transacción `Serializable` y valida, en orden: alumno
activo, deporte activo, no estar ya inscripto, **tope de 2**, **sin choques de
horario**, y cupo. Las dos reglas críticas se revalidan en la base.

### 4.5 Transporte y comedor

| Método | Ruta | Roles |
|---|---|---|
| GET | `/api/servicios/transporte/recorridos` | autenticado |
| POST | `/api/servicios/transporte` | ADMIN, PADRE (vinculado) |
| DELETE | `/api/servicios/transporte/:id` | ADMIN, PADRE (vinculado) |
| GET | `/api/servicios/comedor/planes` | autenticado |
| POST | `/api/servicios/comedor` | ADMIN, PADRE (vinculado) |
| DELETE | `/api/servicios/comedor/:id` | ADMIN, PADRE (vinculado) |
| GET | `/api/servicios/alumno/:alumnoId` | validando vínculo |

Ambos servicios se contratan **por mes calendario**. El recorrido se puede indicar
por `recorridoId` o por `codigo` (`R1` a `R4`). Se valida cupo del recorrido y del
plan para el período, y no se admite contratar para un mes ya cerrado.

Un alumno tiene **un solo recorrido y un solo plan de comedor por mes**: cambiar de
recorrido actualiza la inscripción existente, no crea otra (lo garantiza
`@@unique([alumnoId, anio, mes])`).

`GET /api/servicios/alumno/:id` devuelve la vista consolidada del período con el
costo mensual estimado desglosado.

### 4.6 Portal de tutores

| Método | Ruta |
|---|---|
| GET | `/api/padres/mis-hijos` |
| GET | `/api/padres/mis-hijos/:alumnoId` |
| GET | `/api/padres/mis-hijos/:alumnoId/deportes` |
| GET | `/api/padres/mis-hijos/:alumnoId/servicios` |
| GET | `/api/padres/mis-hijos/:alumnoId/facturas` |
| GET | `/api/padres/mis-hijos/:alumnoId/deuda` |
| GET | `/api/padres/mis-hijos/:alumnoId/calificaciones` |
| GET | `/api/padres/mis-hijos/:alumnoId/asistencia` |

`/deuda` responde al requisito de **historial de deuda discriminado por ítem**
(cuota, transporte, comedor, deportes).

Un detalle que conviene tener presente al leer ese endpoint: el saldo impago de
cada factura **se prorratea entre sus ítems** en proporción al peso de cada uno
sobre el total. Es la única forma honesta de decir "de esta deuda, tanto es
comedor", porque un pago parcial se aplica a la factura entera, no a un concepto
puntual. La respuesta lo aclara en el campo `nota`.

Las calificaciones y la asistencia siguen colgando de `User` (modelo del bloque 1).
Si el alumno no tiene cuenta de campus —caso típico de Inicial— esos endpoints
devuelven lista vacía con una nota, no un error.

### 4.7 Reportes administrativos

Todos exclusivos de ADMIN. Forma de respuesta común: `{ filtros, totales, ... }`.

| Ruta | Filtros | Qué devuelve |
|---|---|---|
| `/api/reportes/alumnos-por-deporte` | `deporteId`, `nivelId`, `diaSemana`, `profesorId`, `incluirBajas` | Listado + `resumenPorDeporte` |
| `/api/reportes/alumnos-por-transporte` | `recorridoId` o `codigo`, `anio`, `mes`, `incluirBajas` | Listado + `ocupacionPorRecorrido` (los 4) |
| `/api/reportes/pagos` | `anio`, `mes`, `nivelId`, `cursoId`, `alumnoId` | `completos`, `incompletos`, `desglosePorEstado`, tasa de cobranza |
| `/api/reportes/ingresos` | `desde`, `hasta`, `alumnoId`, `nivelId` | `porAnio`, `porMes`, `porAlumno`, `porConcepto` |
| `/api/reportes/morosidad` | `nivelId`, `anio` | Deuda viva por alumno con su tutor responsable |

Criterios que hay que conocer para leer bien los números:

- **"Pago completo" = factura `PAGADA`**, es decir, los comprobantes aprobados
  cubren el total. "Incompleto" incluye el pago parcial y el que está esperando
  que Administración valide el comprobante.
- **Los ingresos se computan por fecha de transferencia del comprobante aprobado**,
  no por fecha de emisión de la factura. Una transferencia de septiembre que salda
  la cuota de julio es un ingreso de septiembre. Es criterio de caja, que es el que
  le sirve a Administración. La respuesta lo declara en el campo `criterio`.
- En `alumnos-por-deporte`, el filtro por día y por docente se aplica sobre los
  horarios **del nivel del alumno**. Sin esa acotación, un alumno de Primario
  saldría listado por un horario de Secundario del mismo deporte.
- Los importes salen como `number`. El `Decimal` de Prisma serializa a un objeto
  `{s,e,d}` inservible del lado del cliente; todo pasa por `aNumero()`.

---

## 5. Estado de verificación

| Elemento | Estado |
|---|---|
| Typecheck de los 20 archivos nuevos | ✅ `pnpm typecheck` sin errores |
| Matriz de autorización | ✅ **15 tests** con doble de prueba |
| Primitivas de recuperación de contraseña | ✅ **11 tests** |
| Paginación, rangos de fechas, importes | ✅ **17 tests** |
| Cableo de la API y guards | ✅ **10 tests** — la app arranca y las **34 rutas** exigen autenticación |
| Suite completa | ✅ **97 tests en verde** |
| Migración ejecutada | ✅ **PostgreSQL 15.18, 16/09/2026** |
| Endpoints contra PostgreSQL con datos | ⚠️ Parcial: el seed y las reglas del motor sí; los handlers HTTP no |
| Envío real de mails por SMTP | ❌ **No verificado** |

**Qué significa esto en concreto.** El typecheck no es un trámite: los tipos que
genera Prisma son estrictos, así que cada `include`, `select`, `where` y clave
compuesta de este código fue validado contra el esquema real en tiempo de
compilación. Un nombre de relación mal escrito o un filtro inexistente no
compilan.

Lo que **no** está probado es el comportamiento en ejecución contra datos: que las
queries devuelvan lo esperado, que los triggers se disparen, que los agregados de
los reportes den los números correctos. Para eso hace falta PostgreSQL, que no
está disponible en la máquina de desarrollo.

---

## 6. Pendientes

| Pendiente | Sprint |
|---|---|
| Rate limiting en `POST /api/auth/login` | 2 |
| Migrar `/api/grades`, `/api/attendance` y `/api/payments` de `ParentStudentLink` a `TutorAlumno` | 3 |
| Unificar la política de contraseñas con `register` | 3 |
| Revocación real de refresh tokens (el campo `v` no se contrasta contra nada) | 3 |
| Migrar el limitador de intentos a Redis | fuera de alcance del TP |
| Página `restablecer.html` en el frontend | 2 |
| Tests de integración contra una base real | tras levantar PostgreSQL |
