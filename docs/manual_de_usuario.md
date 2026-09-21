# Manual de usuario

Para el personal de la escuela, las familias y los estudiantes. No hace falta
saber nada de informática para seguirlo.

Este manual describe **qué se puede hacer y en qué orden**. Si algo no aparece
acá, o aparece distinto en pantalla, avisá en secretaría antes de improvisar:
casi todo lo que el sistema rechaza, lo rechaza por una regla de la
institución, no por un error.

---

## 1. Entrar al sistema

Desde el portal, botón **Iniciar sesión** arriba a la derecha. Se entra con
**nombre de usuario** (no con el correo) y contraseña.

Según quién seas, el sistema te lleva solo al panel que te corresponde:

| Si sos… | Vas a parar a | Podés |
|---|---|---|
| Administración | Panel de administración | Todo lo de este manual |
| Docente, autoridad o personal | Panel del docente | Tus materias, notas, asistencia |
| Madre, padre o tutor | Panel del tutor | Sólo los datos de tus propios hijos |
| Estudiante | Panel del estudiante | Sólo tus propios datos |

### Crear una cuenta

Botón **Crear cuenta**, en la misma ventana. Pedí siempre el DNI sin puntos ni
espacios. Tres cosas a tener en cuenta:

- El **usuario tiene que tener al menos 3 caracteres** y la contraseña, 6.
- **DNI, correo y usuario no se pueden repetir.** Si ya están tomados, el
  sistema te dice cuál de los tres es, para que no tengas que adivinar.
- Si elegís **Docente / Autoridad / Personal**, la cuenta queda **esperando que
  administración la apruebe**. Hasta entonces no vas a poder entrar, y el
  sistema te lo va a decir con esas palabras cuando lo intentes. No está roto:
  es a propósito, para que nadie se dé de alta como docente por su cuenta.

Las cuentas de estudiante y de tutor quedan activas al instante.

> **Si no podés entrar**, leé el mensaje que aparece: dice el motivo exacto
> —contraseña incorrecta, usuario inexistente, cuenta pendiente de aprobación—.
> Después de varios intentos fallidos el sistema te hace esperar unos minutos;
> es una protección contra quien prueba contraseñas al azar.

---

## 2. Administración

### 2.1 Lo primero: armar la estructura académica

**Esto va antes que todo lo demás.** Un alumno pertenece a un curso, y un curso
a un nivel: si no existen, no hay dónde inscribirlo.

Menú **Niveles, cursos y materias**. Tiene tres solapas y se completan en este
orden:

1. **Niveles** — Inicial, Primario, Secundario. Cada uno lleva un *orden* (en
   qué posición se muestra) y una *cuota base mensual*. Cambiar la cuota no
   altera las facturas ya emitidas: cada factura se quedó con el importe que
   regía cuando se generó.
2. **Cursos** — dentro de un nivel: nombre, división, turno, ciclo lectivo y
   cupo máximo.
3. **Materias** — dentro de un curso, con su carga horaria. El profesor a cargo
   se puede dejar para después.

**Bajas.** Nada se borra: se da de baja, y queda en el historial. El sistema se
niega a dar de baja un nivel que todavía tiene cursos activos, o un curso que
todavía tiene alumnos activos, y te dice cuántos son. Reubicalos primero.

Tampoco te deja bajar el cupo de un curso por debajo de la cantidad de alumnos
que ya tiene inscriptos.

### 2.2 Dar de alta un alumno

Menú **Alumnos** → botón **Nuevo alumno**.

- **El legajo no se escribe: lo pone el sistema.** Es la identidad
  administrativa del alumno y no puede depender de que alguien no se equivoque
  al tipear.
- El **DNI no se puede repetir**. Si ya existe, el sistema te dice con qué
  legajo choca, así podés fijarte si es la misma persona cargada dos veces.
- El **curso es obligatorio** y la lista muestra cuántos lugares quedan
  (por ejemplo `3° grado "A" — 24/30`). Si el curso está lleno, el alta se
  rechaza.

Para **modificar**, botón *Editar* en la fila. El DNI no se puede cambiar desde
ahí: si está mal cargado, avisá antes de tocarlo, porque hay notas, cuotas y
asistencias colgando de ese alumno.

Para **dar de baja**, botón *Dar de baja*, y elegí el motivo: `INACTIVO`,
`EGRESADO` o `SUSPENDIDO`. La baja **también da de baja sus inscripciones a
deportes, transporte y comedor**; si no, seguiría ocupando cupo y generando
cargos todos los meses.

### 2.3 Dar de alta un profesor y asignarle materias

Menú **Profesores** → **Nuevo profesor**. El legajo también lo pone el sistema.

Después, botón **Materias** en la fila del profesor. Ahí ves lo que tiene a
cargo y podés sumarle materias de la lista de las que todavía no tienen
profesor. Asignar una materia ya dice el curso, porque cada materia pertenece a
un curso: no hace falta cargar las dos cosas por separado.

La baja de un profesor **se niega si es responsable de algún deporte activo**.
Primero hay que reasignar ese deporte.

### 2.4 Aprobar docentes

Menú **Docentes pendientes**. Aparecen las personas que se registraron
eligiendo el perfil de docente y esperan autorización. Al aprobarlas reciben una
notificación y recién ahí pueden entrar.

Si alguien se registró por error o no corresponde, *Rechazar* elimina la
solicitud.

### 2.5 Vincular una familia con sus hijos

Menú **Vínculos Padre-Hijo**. **Este vínculo lo crea únicamente
administración.** Un tutor no puede agregarse hijos por su cuenta, ni sabiendo
el DNI: es lo que garantiza que cada familia vea sólo lo suyo.

Mientras no exista el vínculo, el tutor entra y ve su panel vacío. Si una
familia reclama eso, lo que falta es el vínculo, no la cuenta.

### 2.6 Cuotas y comprobantes

Las cuotas mensuales se generan solas, con la cuota base del nivel más lo que
cada alumno tenga contratado: comedor, transporte según recorrido y deportes.

**No se acepta efectivo.** Las familias transfieren y suben el comprobante, y
administración lo valida. Hasta que alguien lo valide, la cuota queda *en
revisión*, no *pagada*.

Además el sistema manda dos correos por mes, sin que nadie los dispare:

- El **último día hábil del mes**, la factura con el detalle.
- El **día 20**, un recordatorio a quien todavía deba algo.

### 2.7 Reportes

Menú **Reportes**. Seis reportes con filtros por fecha, curso, nivel, recorrido,
deporte, materia y docente, y **botón de exportar a CSV** en cada uno, para
seguir el trabajo en una planilla.

El de **alumnos por materia** muestra también las materias **sin ningún
inscripto**, que suelen ser las que más interesa ver.

### 2.8 Carnet digital

Menú **Escanear carnet**. Abre la cámara para leer el código QR del carnet que
el alumno o el tutor muestran desde el teléfono. El código cambia cada pocos
segundos, así que una captura de pantalla vieja no sirve para entrar.

---

## 3. Docentes

| Menú | Para qué |
|---|---|
| **Mis cursos y materias** | Las materias a tu cargo y, al elegir una, el listado completo de alumnos de ese curso |
| **Cargar Calificaciones** | Nota por alumno, materia e instancia de evaluación |
| **Asistencia Diaria** | Presente, ausente, tarde o justificado, por fecha |
| **Actividades** y **Planes de Estudio** | Material y consignas para tus cursos |
| **Comunicados** | Avisos a las familias |
| **Mensajes** | Conversaciones con tutores |
| **Escanear carnet** | Control de acceso, igual que administración |

Si entrás y no ves ninguna materia, es que administración todavía no te asignó
ninguna. La pantalla te lo dice con esas palabras.

---

## 4. Madres, padres y tutores

Se puede desde la web y desde la aplicación del teléfono. **Siempre ves
únicamente a tus propios hijos.**

### En la web

| Menú | Para qué |
|---|---|
| **Boletín e Historial** | Notas por materia y trimestre, y el historial completo |
| **Ficha de mis hijos** | Datos del alumno, materias, deportes, servicios y estado de cuenta |
| **Asistencias** | Los últimos 30 días |
| **Estado de Cuenta** | Cuotas, vencimientos y carga del comprobante |
| **Anuncios** y **Mensajes** | Comunicados de la escuela y charla con los docentes |

Arriba de todo hay un selector con tus hijos. Si aparece vacío, el vínculo
todavía no está cargado: **avisá en secretaría**, no es algo que puedas
resolver desde tu cuenta.

### En la aplicación del teléfono

Además de lo anterior, la aplicación tiene el **carnet digital con código QR**
para el ingreso, y el **seguimiento del transporte** durante el recorrido
contratado.

### Pagar una cuota

1. **Estado de Cuenta**, y elegí la cuota.
2. Transferí a la cuenta institucional.
3. Subí el comprobante: importe, fecha, banco de origen, número de operación y
   la foto o el PDF del comprobante.
4. La cuota pasa a *en revisión* hasta que administración la valide. Si algo no
   cierra, te llega el motivo del rechazo y podés volver a subirlo.

---

## 5. Estudiantes

Ves sólo tus propios datos: **Boletín Oficial**, **Mis Asistencias**,
**Horarios de Cursado**, **Examen Libre**, **Actividades**, **Planes de
Estudio**, **Anuncios**, **Mensajes** y **Foros**.

---

## 6. Si algo no funciona

| Lo que pasa | Qué suele ser |
|---|---|
| No puedo entrar y dice que la cuenta está pendiente | Te registraste como docente. Administración tiene que aprobarla |
| Dice "Ya existe una cuenta con ese DNI" | Esa persona ya está cargada. Buscala antes de crearla de nuevo |
| Me pide esperar para volver a intentar | Demasiados intentos fallidos seguidos. Esperá unos minutos |
| Soy tutor y no veo a mis hijos | Falta el vínculo, que carga administración |
| Soy docente y no veo materias | Administración todavía no te asignó ninguna |
| No puedo inscribir un alumno: el curso está lleno | Se llegó al cupo. Ampliá el cupo del curso o usá otra división |
| No me deja dar de baja un curso | Todavía tiene alumnos activos. El mensaje dice cuántos |
| El alumno no puede anotarse a un tercer deporte | Son dos como máximo, y no se pueden superponer los horarios |

---

## 7. Dos cosas que conviene saber

**Nada se borra.** Las bajas son lógicas: el alumno, el curso o la materia
dejan de estar activos pero siguen en el historial, porque tienen notas,
asistencias y facturas asociadas.

**Las reglas las hace cumplir el sistema, no la pantalla.** El máximo de dos
deportes, el cupo del curso, el DNI sin repetir y que un tutor sólo vea a sus
hijos están verificados en la base de datos. No se pueden saltear entrando por
otro lado.
