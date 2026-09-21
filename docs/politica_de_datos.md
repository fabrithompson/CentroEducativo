# Política de tratamiento de datos personales

**RNF-09 — Ley Nacional N° 25.326 de Protección de Datos Personales**

Este documento describe **qué datos personales trata el sistema hoy, dónde
viven, quién puede verlos y qué falta para cumplir formalmente con la ley**. Lo
primero es un relevamiento verificado contra el código y el esquema de la base;
lo último es una lista de obligaciones que la institución tiene que resolver y
que no se resuelven programando.

> **Alcance.** Esto describe el comportamiento del sistema y las obligaciones
> que la ley impone. **No es asesoramiento legal.** Antes de publicarlo como
> política institucional tiene que revisarlo un profesional: hay datos de
> menores de edad de por medio, que la ley trata con especial cuidado.

---

## 1. Qué datos trata el sistema

### 1.1 De los alumnos — la categoría más sensible, porque son menores

| Dato | Dónde | Para qué |
|---|---|---|
| DNI, apellido, nombres, fecha de nacimiento | `Alumno` | Identificación e inscripción (RF-01) |
| Domicilio, localidad, provincia, teléfono, correo | `Alumno` | Contacto y asignación de recorrido de transporte |
| Observaciones | `Alumno` | Campo libre de la ficha |
| Calificaciones | `Grade` | Seguimiento académico |
| Asistencia diaria | `Attendance` | Control de presentismo |
| Secreto criptográfico del carnet | `CredencialDigital` | Generar el código QR de acceso |
| Ingresos y egresos con fecha, hora y punto de control | `RegistroAcceso` | Control de acceso al establecimiento, al comedor y al transporte |

`RegistroAcceso` merece atención aparte: es un **historial de movimientos de un
menor** —a qué hora entró, a qué hora subió al micro, si comió en el comedor—.
Es el dato más delicado del sistema.

### 1.2 De las familias

| Dato | Dónde |
|---|---|
| Nombre, usuario, DNI, correo, teléfono | `User` |
| Contraseña | `User.password`, **cifrada con bcrypt**; nunca se guarda en claro ni se puede revertir |
| Vínculo con cada hijo y quién es responsable de facturación | `TutorAlumno` |
| Comprobantes bancarios: importe, banco, número de operación y **el archivo subido** | `ComprobantePago` |
| Correos enviados: destinatario, asunto y estado | `EmailLog` |
| Teléfonos a los que se mandó un aviso | `MensajeEnviado` |

### 1.3 Del personal

`Profesor` guarda DNI, apellido, nombres, especialidad, correo, teléfono y
domicilio. Por eso **el listado de profesores no es accesible para tutores ni
estudiantes**: no hay motivo para que vean el domicilio del personal.

### 1.4 De personas que no son usuarias del sistema

Esto es lo que más se pasa por alto. Los formularios públicos del portal
guardan datos de gente que nunca creó una cuenta:

| Formulario | Qué guarda | Modelo |
|---|---|---|
| Solicitud de inscripción | Nombre, correo y teléfono del tutor, y nombre del estudiante | `Inscription` |
| Postulación de empleo | Nombre, correo, puesto y **el CV subido** | `EmploymentApplication` |
| Muro de opiniones | Nombre (opcional) y el texto de la opinión | `OpinionPublica` |

### 1.5 Geolocalización

`PosicionTransporte` guarda latitud, longitud, velocidad y precisión de cada
micro, con su fecha y hora. No identifica personas por sí solo, pero **cruzado
con `InscripcionTransporte` y `RegistroAcceso` permite reconstruir por dónde
anduvo un alumno**. Conviene tratarlo como dato personal.

---

## 2. Dónde viven los datos

| Qué | Dónde | Protección |
|---|---|---|
| Base de datos | PostgreSQL 15 gestionado en Railway | Credenciales por variable de entorno, nunca en el repositorio |
| Archivos subidos (comprobantes bancarios, CV) | Disco del contenedor, en la ruta de `UPLOAD_DIR` | Servidos bajo `/uploads` |
| Respaldos | Artifact privado del repositorio, 90 días | **Cifrados con AES256**, porque el volcado contiene domicilios y teléfonos de menores y los hashes de contraseña |
| Sesiones | Token de acceso de 15 minutos y token de refresco en cookie `httpOnly` | La cookie no es legible desde JavaScript |

**Los clientes no almacenan datos personales.** Ni el navegador ni la
aplicación móvil guardan datos del alumno más allá de la sesión. La única
excepción es el secreto del carnet en la app móvil, que vive en el almacén
seguro del teléfono (`expo-secure-store`), no en almacenamiento común.

---

## 3. Quién puede ver qué

El control no está repartido en condicionales sueltos por cada ruta: está
centralizado en `shared/authz.ts`, con **criterio de lista blanca** —se parte de
"no puede" y sólo se habilita lo explícitamente permitido—.

| Rol | Alcance |
|---|---|
| Administración | Todos los alumnos |
| Docente | Todos los alumnos (los tiene en clase) |
| Madre, padre o tutor | **Únicamente los alumnos vinculados en `TutorAlumno`** |
| Estudiante | Únicamente sus propios datos |

Dos decisiones que sostienen esto:

- **El vínculo lo crea sólo un administrador**, y queda registrado quién lo
  hizo. Un tutor no puede agregarse hijos por su cuenta. Un disparador en la
  base verifica además que quien figura como tutor tenga efectivamente ese rol.
- Cuando un tutor pide un alumno ajeno, la respuesta es **404 y no 403**. Un 403
  confirmaría que ese alumno existe, y eso ya es información que no le
  corresponde.

---

## 4. Cuánto tiempo se conservan

La política vive en `src/modules/shared/retencion.ts` y la aplica una tarea
programada a la 01:00, después del respaldo nocturno —si purgara antes, el
respaldo de esa noche sería el primero sin esos datos y no quedaría ninguna
copia con ellos—.

| Qué | Plazo | Por qué ese número |
|---|---|---|
| Posiciones del transporte | 90 días | Telemetría pura: el rastreo sólo mira los últimos minutos. Es además lo que más volumen acumula |
| Registros de acceso | 400 días | Un ciclo lectivo más margen. Es el historial de movimientos de un menor: lo justo para resolver un reclamo del año en curso |
| Correos enviados | 365 días | Evidencia de que se notificó una deuda |
| Avisos por mensajería | 365 días | Constancia de que el aviso salió |
| Postulaciones de empleo **resueltas** | 365 días | CV de alguien que no entró a la institución |
| Solicitudes de inscripción **resueltas** | 365 días | Solicitud que no prosperó |
| Opiniones **rechazadas** | 180 días | No se publican ni se van a publicar |

Dos salvaguardas, y la segunda es la que importa:

- **Arranca en modo informe.** Sin `RETENCION_ACTIVA=true` cuenta qué borraría y
  no borra. El informe se ve en el panel de administración, en *Tareas
  programadas*. Los plazos de arriba son una propuesta razonada, no una
  decisión de la institución: hay que mirarlos unos días con números reales,
  ajustarlos y recién entonces activar la purga.
- **Sólo se purga lo que ya terminó su ciclo.** Una postulación pendiente, una
  inscripción sin resolver o una opinión aprobada no se tocan por más viejas
  que sean. Que lleven un año sin resolverse es un problema de gestión, no una
  autorización para borrarlas.

**Lo que la política no alcanza, a propósito:** alumnos, calificaciones,
asistencias y facturas. Tienen obligación de conservación documental y sus
bajas son lógicas. Borrarlos requiere una decisión caso por caso, no una tarea
automática — y hay una prueba que falla si alguien los agrega.

Las bajas del sistema son **lógicas**: un alumno dado de baja deja de estar
activo pero sus datos siguen en la base, porque tiene calificaciones,
asistencias y facturas asociadas. Eso es razonable mientras dure la obligación
de conservar documentación académica y contable, pero **no es lo mismo que una
supresión**, y hay que poder distinguirlas cuando alguien la solicite.

---

## 5. Los derechos de la ley, en la práctica

| Derecho | Cómo se ejerce hoy | Qué falta |
|---|---|---|
| **Acceso** — saber qué datos hay sobre uno | El tutor ve la ficha completa de sus hijos desde el panel o la app; el estudiante ve la suya | Un mecanismo para pedir el legajo completo en un archivo, y para quien no sea usuario del sistema |
| **Rectificación** — corregir un dato erróneo | Administración edita la ficha desde el panel | Un canal formal para pedirlo y un plazo de respuesta |
| **Supresión** — que se borren | Automática para lo que superó su plazo (ver §4), aunque todavía en modo informe. Para el resto la baja es lógica | Confirmar los plazos con la institución y activar la purga; y un canal para pedir la supresión de un dato puntual |
| **Consentimiento informado** | Los cuatro formularios públicos —inscripción, empleo, opiniones y contacto— avisan para qué se usan los datos, quién los ve y a dónde escribir para pedir la baja | El consentimiento expreso de los responsables legales para los datos de menores, que es otra cosa y hoy no se pide |

---

## 6. Lo que falta para cumplir formalmente

Ninguno de estos se resuelve programando: el primero necesita que la
institución confirme unos plazos, y el resto son obligaciones formales.

1. **Confirmar los plazos de retención y activar la purga.** El mecanismo ya
   está y corre todas las noches, pero en modo informe: lo que falta es que la
   institución mire los números del panel, ajuste los plazos de §4 si
   corresponde y confirme. Recién ahí se pone `RETENCION_ACTIVA=true`.
2. **Inscripción de la base ante la AAIP.** La Agencia de Acceso a la
   Información Pública lleva el registro de bases de datos personales. Es un
   trámite de la institución.
3. **Designar responsable de la base.** Una persona identificable a la que
   dirigir los reclamos de acceso, rectificación y supresión.
4. **Consentimiento de los responsables legales para los datos de menores**, y
   en particular para el historial de accesos y la geolocalización del
   transporte, que son los dos tratamientos menos evidentes para una familia.
5. **Contrato con los proveedores.** Railway aloja la base y el proveedor de
   correo recibe direcciones de las familias. La ley trata esto como cesión de
   datos a un tercero.

---

## 7. Qué ya está bien resuelto

Para no dejar sólo la lista de deudas:

- **Contraseñas con bcrypt.** No se guardan en claro y no hay forma de
  revertirlas. Ni siquiera administración puede leer la contraseña de alguien.
- **Cambiar la contraseña cierra las sesiones abiertas.** Cada token de
  refresco lleva la versión que tenía la cuenta al emitirse, y al cambiar la
  contraseña esa versión sube: los tokens anteriores dejan de servir. Sin eso,
  quien hubiera robado una sesión seguiría entrando durante siete días aunque
  la víctima cambiara la clave.
- **Minimización en los clientes.** El navegador y la app no guardan datos
  personales; los piden cuando los muestran.
- **Aislamiento entre familias verificado por pruebas**, no sólo por revisión:
  la matriz de acceso tiene pruebas automatizadas propias.
- **Respaldos cifrados.** El volcado diario no queda en claro en ningún lado.
- **Las reglas las hace cumplir el motor de base de datos**, con disparadores y
  restricciones. Un error de programación en una ruta nueva no alcanza para
  saltear el aislamiento entre familias.
- **Se retiró un endpoint que permitía a cualquier tutor vincularse a cualquier
  alumno** conociendo sólo su DNI. Era la vía por la que se podía acceder a los
  datos de un menor ajeno, y ya no existe.
