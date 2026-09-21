# Plan de Trabajo

**Proyecto:** Sistema integral de gestión — Centro Educativo "TRANSFORMAR PARA EDUCAR"
**Materia:** Metodología de Sistemas II — Tecnicatura Universitaria en Programación (TUP 2026)
**Equipo:** **Naft** — Nahuel Alem · Fabricio Ceniquel Thompson
**Localidad:** Resistencia, Chaco · Inicio previsto de actividades de la institución: marzo de 2027
**Repositorio:** monorepo pnpm — `web/backend/` · `web/frontend/` · `mobile/`
**Versión de este documento:** 2.1 — 19/09/2026 (reemplaza la 2.0 del 16/09 y la 1.0 del 24/08/2026)

---

## 1. Objetivo y alcance

### 1.1 Objetivo general

Desarrollar e implementar, entre el **24 de agosto y el 22 de noviembre de 2026**,
un sistema de gestión integrado que centralice la información académica,
deportiva y de servicios del Centro Educativo en una única base de datos,
automatice los controles que hoy se realizan en forma manual y habilite canales
de consulta diferenciados para administradores, profesores, alumnos y padres,
cubriendo el 100 % de los ocho requerimientos funcionales y eliminando los
registros duplicados de alumnos.

### 1.2 Alcance comprometido

Los ocho requerimientos funcionales del relevamiento (RF-01 a RF-08) y los nueve
requerimientos no funcionales (RNF-01 a RNF-09).

### 1.3 Alcance ampliado

Durante el relevamiento surgieron necesidades de la Dirección que no quedaron
formuladas como requerimiento numerado pero que el equipo asumió como parte del
producto, porque sin ellas el sistema no resuelve el circuito completo de la
institución. Se incorporan al plan con el mismo tratamiento que el alcance
comprometido:

| Módulo | Motivo de su incorporación |
|---|---|
| **Facturación y cuotas** | Deportes, transporte y comedor tienen arancel diferenciado. Sin facturación, inscribir a un servicio no tiene consecuencia administrativa |
| **Comprobantes de transferencia** | La institución no acepta efectivo. Una factura admite varios comprobantes (relación 1:N) y su estado se deriva de los aprobados |
| **Comedor** | Es el tercer servicio opcional mensual, junto con transporte y deportes |
| **Tareas programadas** | Envío del resumen el último día hábil del mes y del recordatorio de deuda el día 20 |
| **Portal público institucional** | Quiénes somos, niveles, bienestar, noticias, solicitud de inscripción, empleo, galería y opiniones sin necesidad de login |
| **Aplicación móvil de tutores** | Canal de consulta de cuotas, deuda discriminada por ítem y carga de comprobantes |
| **Carnet digital con QR dinámico** | Valor agregado adicional: control de acceso a transporte y comedor con aviso inmediato a la familia |

### 1.4 Fuera de alcance

Pasarela de pago en línea, facturación electrónica ante AFIP, integración con
sistemas provinciales de gestión educativa y aplicación móvil para docentes.

---

## 2. Requerimientos funcionales

| RF | Requerimiento | Responsable | Sprint |
|---|---|---|---|
| **RF-01** | **Gestión de Alumnos.** Registrar los datos personales de los alumnos (legajo, DNI, nombre, apellido, nivel, curso) evitando registros duplicados | Nahuel | 1 |
| **RF-02** | **Gestión Deportiva.** Controlar que cada alumno pueda inscribirse a un máximo de dos deportes simultáneos, verificando que no existan conflictos de horarios | Nahuel | 2 |
| **RF-03** | **Acceso de Padres.** Permitir a los padres consultar los profesores por materia, restringiendo el acceso únicamente a la información de sus propios hijos | Nahuel | 3 |
| **RF-04** | **Gestión Docente.** Registrar las materias que un profesor tiene a su cargo y los cursos en los que desarrolla sus actividades | Fabricio | 1 |
| **RF-05** | **Servicio de Transporte.** Inscribir a un alumno al servicio de transporte seleccionando uno de los cuatro recorridos disponibles | Fabricio | 3 |
| **RF-06** | **Generación de Reportes.** Generar un listado de alumnos por materia, mostrando nivel educativo, curso, materia, profesor a cargo, nombre del alumno y legajo | Fabricio | 4 |
| **RF-07** | **Desafío — Valor agregado.** Integrar una API de mensajería para enviar notificaciones automáticas a los teléfonos de los padres ante cambios de horario o avisos importantes | Nahuel | 5 |
| **RF-08** | **Desafío — Valor agregado 2.** Integrar un servicio de geolocalización que permita a los padres rastrear la ubicación del transporte escolar en tiempo real desde la aplicación móvil | Fabricio | 5 |

### 2.1 Cómo se hace cumplir cada requerimiento

La decisión de diseño más relevante del proyecto es que **las reglas críticas se
hacen cumplir en el motor de base de datos**, no solamente en el código de la
aplicación. Una regla escrita únicamente en un servicio se puede eludir con una
consulta directa, con una carga masiva o con un error de programación en un
camino alternativo; una restricción del motor no.

| RF | Mecanismo | Verificación |
|---|---|---|
| RF-01 | `Alumno.dni @unique`, legajo autogenerado, `cursoId` obligatorio | El motor rechaza el segundo alta con el mismo DNI |
| RF-02 | Índice único parcial sobre las inscripciones activas (cupos 1 y 2) más un disparador que compara horarios en minutos desde medianoche | El motor rechaza el tercer deporte y el cruce de horarios |
| RF-03 | Tabla `TutorAlumno` y matriz de autorización en `shared/authz.ts` | 15 pruebas de la matriz de acceso por rol |
| RF-04 | Módulo `profesores/`: asignación y baja de materias y cursos | Pruebas del módulo |
| RF-05 | Enumeración `CodigoRecorrido` R1–R4 y restricción que impide dar de alta un quinto recorrido | El motor rechaza el quinto recorrido |
| RF-06 | `GET /api/reportes/alumnos-por-materia`, que parte de las materias y no de los alumnos para poder informar las materias con cero inscriptos | Pruebas del reporte |
| RF-07 | Patrón *Strategy* con proveedor intercambiable; normalización de teléfonos argentinos a E.164; registro de cada envío (enviado / fallido / sin teléfono) y correo de respaldo | Pruebas de normalización y de resolución de destinatarios |
| RF-08 | Histórico de posiciones, validación de franja horaria con margen de 20 minutos, detección de señal perdida a los 5 minutos y verificación de que el recorrido consultado sea el contratado | Pruebas de estado de rastreo, distancia y cobertura |

---

## 3. Requerimientos no funcionales

| RNF | Enunciado | Cómo se aborda | Estado |
|---|---|---|---|
| **RNF-01** Usabilidad | Interfaces claras; un administrativo sin conocimientos técnicos registra un alumno tras 30 minutos de capacitación | Formularios con etiquetas asociadas, mensajes de error en lenguaje llano, enlaces de salto, foco visible y objetivos táctiles de 44/48 px | Construido · **validación con la usuaria pendiente** |
| **RNF-02** Seguridad | Usuario y contraseña, contraseñas cifradas, funciones habilitadas por rol | Contraseñas con bcrypt, sesión con JWT y refresco, control de rol en cada ruta y restricción de los tutores a sus propios hijos | ✅ Cubierto y probado |
| **RNF-03** Rendimiento | Consultas habituales en menos de 3 s; reportes en menos de 10 s con la matrícula completa | Paginación obligatoria, índices sobre las claves de búsqueda y agregaciones resueltas en el motor | ✅ **Medido y cumplido.** 5012 alumnos activos en producción, peor de tres corridas: listado 2,40 s y búsqueda 0,66 s contra el umbral de 3 s; alumnos por materia 4,93 s, deportes 4,15 s y morosidad 3,60 s contra el de 10 s |
| **RNF-04** Disponibilidad | Disponible en horario escolar y de recorridos; mantenimiento fuera de esa franja | Depende del entorno de despliegue | Pendiente (fase de implementación) |
| **RNF-05** Compatibilidad | Chrome, Firefox y Edge vigentes, con diseño adaptable; móvil en Android e iOS | HTML y CSS estándar sin dependencias de navegador; tablas que se convierten en tarjetas en pantalla angosta; aplicación móvil en React Native | ✅ **Navegadores verificados** en los tres motores vigentes —Chromium, que es el de Chrome y el de Edge; Gecko; y WebKit—, sobre las 5 páginas públicas a 1280 y a 375 px, y en Chromium sobre los 4 paneles del backoffice a 1366 y a 375 px. Encontró y se corrigieron dos desbordes horizontales: uno en el portal y otro en los paneles, donde el `<style>` propio de cada uno pisaba el CSS adaptable compartido. Queda **pendiente el dispositivo físico** |
| **RNF-06** Integridad y respaldo | Copias de seguridad diarias e integridad referencial | Integridad garantizada por claves foráneas, restricciones CHECK y disparadores; el respaldo automático se define en el despliegue | Integridad ✅ · respaldo pendiente |
| **RNF-07** Escalabilidad | Crecimiento de la matrícula e incorporación de módulos sin rediseño | Módulos de dominio independientes bajo `src/modules/`; agregar uno no obliga a tocar los demás | ✅ Cubierto |
| **RNF-08** Mantenibilidad | Código modular y documentado, versionado en Git | 15 módulos de dominio, documentación técnica en `docs/` y repositorio Git con *pull requests* revisados | ✅ Cubierto |
| **RNF-09** Legal | Ley Nacional N° 25.326 de Protección de Datos Personales | Minimización: los clientes no almacenan datos personales ni financieros de menores. La única excepción es el secreto criptográfico del carnet, que vive en el almacén seguro del teléfono | Construido · **política formal de tratamiento pendiente** |

---

## 4. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Node.js 24 · Express 4 · TypeScript 5.9 en modo estricto |
| Acceso a datos | Prisma 6 (ORM) |
| Base de datos | PostgreSQL 15 |
| Frontend web | HTML5 · CSS3 · JavaScript con módulos ES |
| Aplicación móvil | Expo SDK 57 · React Native 0.87 |
| Pruebas | Ejecutor nativo de Node (`node --test`) contra PostgreSQL real mediante `embedded-postgres` |
| Repositorio | Monorepo pnpm · Git · GitHub |
| Gestión | Jira (tablero Kanban) |

### 4.1 Justificación del stack

El anteproyecto presentado en agosto proponía Java 17 con Spring Boot y
Microsoft SQL Server. La implementación se realizó sobre Node.js con TypeScript
y PostgreSQL. **Este cambio requiere la aprobación de la cátedra; el equipo la
solicita expresamente y no la da por concedida.** Los fundamentos son los
siguientes:

**1. Los principios de arquitectura del anteproyecto se cumplen igual.** El
apartado de principios exige abstracción, modularidad, ocultamiento de la
información, separación de intereses, alta cohesión con bajo acoplamiento y
reutilización. La solución los satisface: las capas `rutas → servicios →
persistencia` separan presentación, reglas y datos; ningún cliente consulta las
tablas directamente; y una misma API REST sirve a la aplicación web y a la móvil
sin duplicar reglas, que es exactamente el criterio de reutilización enunciado.

**2. La arquitectura en tres capas sobre cliente-servidor se mantiene.** Es
independiente del lenguaje: se cumple con Spring Boot y se cumple con Express.

**3. Los conectores coinciden.** HTTPS/REST con cuerpos JSON, tokens JWT que
transportan identidad y rol, y un ORM entre la lógica de negocio y la base.
Cambia la implementación del ORM —Prisma en lugar de JDBC o Hibernate—, no el
conector.

**4. Los patrones exigidos están presentes.** *Repository* mediante Prisma como
capa única de acceso; *Singleton* en la instancia compartida de conexión;
*Strategy* en el proveedor de mensajería, que se intercambia sin tocar el módulo
de servicios; *Observer* en el disparo de notificaciones ante un evento de
negocio. MVC se resuelve con la separación `rutas / servicios / modelo`, dado
que la presentación queda del lado del cliente.

**5. Una sola tecnología en todo el proyecto.** La aplicación móvil está fijada
en React Native, que es TypeScript. Sostener el backend en el mismo lenguaje
elimina la duplicación de tipos entre cliente y servidor y permite que los dos
integrantes trabajen en cualquier capa sin cambiar de entorno. Con Java, un
equipo de dos personas mantendría dos lenguajes, dos gestores de dependencias y
dos suites de pruebas.

**6. Restricción de licencias.** El anteproyecto exige tecnologías con licencia
libre o de uso académico gratuito. PostgreSQL es software libre sin
restricciones; SQL Server requiere licencia comercial salvo en ediciones
limitadas.

**7. Verificabilidad de las reglas de negocio.** Las reglas críticas se hacen
cumplir con índices parciales, restricciones CHECK y disparadores en PL/pgSQL, y
esa verificación se ejecuta efectivamente contra una instancia real de
PostgreSQL en cada corrida de pruebas.

---

## 5. Arquitectura

```
 ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
 │  Portal público  │  │    Backoffice    │  │   App móvil      │
 │  (HTML/CSS/JS)   │  │   (módulos ES)   │  │  (Expo + RN)     │
 │    visitantes    │  │ admin · docentes │  │     tutores      │
 └────────┬─────────┘  └────────┬─────────┘  └────────┬─────────┘
          └─────────────────────┼─────────────────────┘
                                │ HTTPS · JSON · JWT
                    ┌───────────▼────────────┐
                    │       API REST         │
                    │  Node · Express · TS   │
                    │    rutas → servicios   │
                    │        → Prisma        │
                    └───────────┬────────────┘
                    ┌───────────▼────────────┐
                    │       PostgreSQL       │
                    │ restricciones, índices │
                    │ parciales, disparadores│
                    └────────────────────────┘
```

**Regla de dependencia.** Las capas dependen en un solo sentido:
`HTTP → Aplicación → Dominio → Persistencia`. El dominio no importa Express ni
Prisma, de modo que sus reglas se pueden probar sin levantar un servidor ni una
base de datos.

**Módulos de dominio.** El recorte que pide la consigna son tres —`alumnos`,
`profesores` y `administrador`—, a los que se suma `padres`: es un actor con una
regla propia que atraviesa todo el sistema (RF-03, sólo ve a sus propios hijos)
y por eso no se disuelve dentro de los otros tres.

Alrededor, los servicios que un alumno contrata —`deportes`, `transporte`,
`servicios`, `facturacion`, `credenciales` y `reportes`— y lo transversal a los
cuatro actores: `auth`, `avisos`, `comunicacion`, `scheduler` y `shared`. Quince
en total. Cada router vive dentro de su módulo; `src/routes/` quedó sólo con el
`index.ts` que los cuelga de su prefijo.

---

## 6. Cronograma

### 6.1 Hitos

| Hito | Fecha | Estado |
|---|---|---|
| Planificación del proyecto | 24/08/2026 | Completado |
| Estudio de requerimientos (8 RF y 9 RNF) | Septiembre 2026 | Completado |
| Modelado: historias de usuario, casos de uso, DER | Septiembre 2026 | Completado |
| Diseño: base de datos, arquitectura, maquetación | Septiembre 2026 | Completado |
| **Entrega del Plan de Trabajo a la cátedra** | **29/09/2026, 14:00 hs** | Pendiente |
| Sprint 1 | 05/10 → 11/10/2026 | Adelantado |
| Sprint 2 | 12/10 → 18/10/2026 | Adelantado |
| Sprint 3 | 19/10 → 25/10/2026 | Adelantado |
| Sprint 4 | 26/10 → 01/11/2026 | Adelantado |
| Sprint 5 | 02/11 → 08/11/2026 | Adelantado |
| Pruebas y aceptación con la usuaria | 09/11 → 15/11/2026 | Pendiente |
| **Congelamiento de código y jornada de testing** | **11/11/2026** | Pendiente |
| **Entrega final: aplicación móvil e informe de IA** | **17/11/2026** | Pendiente |
| Implementación, despliegue y capacitación | 16/11 → 21/11/2026 | Pendiente |
| **CIERRE DEL PROYECTO** | **22/11/2026** | Pendiente |

> **Sobre el estado "Adelantado".** Al 16 de septiembre el equipo lleva
> construida y verificada la totalidad del alcance previsto para los cinco
> sprints. Las semanas del cronograma se conservan y se destinan a revisión
> cruzada, corrección de defectos y preparación de la aceptación, que es donde
> el análisis de riesgos ubica la mayor incertidumbre.

> **Ruta crítica (PERT).** A–B–C–D1–E–F–G, **61 días hábiles**. La maquetación
> (D2) corre en paralelo con el diseño de base de datos (D1) y no extiende la
> duración total. Codificación: **80 de las 170 horas** presupuestadas.

### 6.2 Sprints

Sprints de **una semana**, con planificación los lunes y revisión con
retrospectiva los viernes. Cada sprint avanza en dos líneas: la **troncal**, que
cubre los requerimientos numerados, y la de **valor agregado**, que cubre el
alcance ampliado del apartado 1.3.

| Sprint | Semana | Línea troncal | Línea de valor agregado |
|---|---|---|---|
| **1** | 05/10 → 11/10 | **RF-01** alta de alumnos sin duplicados · **RF-04** materias y cursos por docente | Modelo de datos completo y migraciones · seguridad: ingreso con JWT, roles y recuperación de contraseña |
| **2** | 12/10 → 18/10 | **RF-02** máximo de dos deportes sin cruce de horarios | Comedor como tercer servicio opcional · portal público institucional y muro de opiniones |
| **3** | 19/10 → 25/10 | **RF-03** padres restringidos a sus propios hijos · **RF-05** inscripción a uno de los cuatro recorridos | Facturación: cuotas mensuales, ítems por servicio y comprobantes de transferencia |
| **4** | 26/10 → 01/11 | **RF-06** listado de alumnos por materia | Tareas programadas (último día hábil y día 20) · backoffice: paneles de administración, docente y tutor |
| **5** | 02/11 → 08/11 | **RF-07** avisos por mensajería · **RF-08** rastreo del transporte | Aplicación móvil de tutores · carnet digital con QR dinámico y control de acceso |

### 6.3 Definición de Hecho

Una historia se considera terminada cuando:

1. Cumple sus criterios de aceptación.
2. El usuario sólo accede a las funciones habilitadas para su rol.
3. Las pruebas definidas se ejecutaron y los defectos detectados se corrigieron.
4. No hay errores de tipado ni de lint.
5. El código está en GitHub, revisado por el otro integrante, y la tarea cerrada en Jira.
6. Si intervino inteligencia artificial, la intervención está registrada en `docs/bitacora_ia.md`.

---

## 7. Organización del equipo

Equipo **Naft**, dos integrantes.

| Integrante | Historias a cargo | Rol en el diseño |
|---|---|---|
| **Nahuel Alem** | HU1 (RF-01), HU2 (RF-02), HU3 (RF-03), HU7 (RF-07) | Modelado de esas historias · maquetación: wireframes, mockups y prototipo |
| **Fabricio Ceniquel Thompson** | HU4 (RF-04), HU5 (RF-05), HU6 (RF-06), HU8 (RF-08) | Modelado de esas historias · base de datos y arquitectura |

Cada historia la revisa el otro integrante antes de darla por terminada.

**Reunión diaria.** Al inicio de la jornada ambos informan qué se hizo, qué se
hará y si hay algún bloqueo. Lo acordado se refleja en el tablero de Jira.

### 7.1 Convenciones de trabajo

- **Ramas:** `main` (versión estable) · `develop` (integración) · ramas por funcionalidad con el formato `feat/<módulo>-<detalle>` o `fix/<módulo>-<detalle>`, que entran a `develop` por *pull request* revisado por el otro integrante.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`), referenciando el identificador de la tarea en Jira.
- **Lenguaje:** TypeScript estricto en backend y móvil; JavaScript con módulos ES en el frontend web.
- **Documentación:** cada módulo relevante deja su documento técnico en `docs/`.

---

## 8. Plan de pruebas

| Nivel | Alcance | Cantidad |
|---|---|---|
| Unitarias de dominio | Reglas puras: horarios, importes, fechas de vencimiento, estado de rastreo, criptografía del carnet | Incluidas en las 257 |
| De integración del backend | Servicios, autorización por rol y persistencia contra PostgreSQL real | **257** |
| Del motor de base de datos | Verifican que el motor **rechace efectivamente** el tercer deporte, el cruce de horarios, el quinto recorrido, el comprobante sin archivo, el tutor que no es padre y la reutilización de un código QR | **17** |
| De la aplicación móvil | Cliente HTTP, formateo y equivalencia de la implementación propia de HMAC-SHA256 contra `node:crypto` en 300 casos aleatorios | **70** |
| **Total** | | **344** |

**Entorno de pruebas.** La suite levanta una instancia real de PostgreSQL 15
mediante `embedded-postgres`, aplica las nueve migraciones, carga las semillas y
corre las pruebas contra esa base. No se usan dobles de prueba para la
persistencia: lo que se verifica es el comportamiento del motor, no una
imitación. Existe además un `docker-compose.yml` con `postgres:15-alpine` para
quien prefiera esa vía.

**Jornada de testing (11/11/2026).** Congelamiento del código y prueba manual
cruzada: cada integrante recorre los casos de uso del otro.

---

## 9. Uso de inteligencia artificial

El proyecto utiliza **Claude Code (modelo Opus 5)** como asistente de
desarrollo. Cada intervención que produce cambios se registra en
`docs/bitacora_ia.md` con la estructura exigida por la cátedra: problema, prompt
utilizado, herramienta, respuesta obtenida, si funcionó, modificaciones
realizadas y resultado final.

El criterio de trabajo es que **la IA no decide reglas de negocio**. Las reglas
las fija el equipo a partir del relevamiento; la IA las implementa y el equipo
verifica que la implementación las respete. El informe final
(`docs/informe_final_ia.md`) documenta los casos en los que la herramienta
produjo código que hubo que corregir o reemplazar.

---

## 10. Riesgos y mitigación

| Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|
| La cátedra no aprueba el cambio de stack respecto del anteproyecto | Alto | Media | Justificación documentada en el apartado 4.1 y presentada junto con este plan. El modelo de datos, las reglas ya razonadas y la aplicación móvil sobrevivirían a una eventual migración |
| Equipo de dos personas: la baja de un integrante detiene su línea completa | Alto | Baja | Revisión cruzada obligatoria: ninguna historia la conoce una sola persona |
| Las reglas de negocio quedan sólo en el código y se eluden por otro camino | Alto | Media | Restricciones, índices parciales y disparadores en el motor, con 17 pruebas que verifican el rechazo |
| Aceptación de la usuaria con defectos de usabilidad no detectados | Medio | Media | Semana del 09/11 al 15/11 destinada a la aceptación, con congelamiento el 11/11 |
| Rendimiento no medido con la matrícula completa (RNF-03) | Medio | Media | Cargar semillas con matrícula completa antes de la jornada de testing y medir las consultas de reporte |
| Sin prueba en navegadores reales ni en dispositivo físico (RNF-05) | Medio | Alta | Incluir la verificación en Chrome, Firefox, Edge y en un Android físico dentro de la jornada del 11/11 |
| El proveedor de mensajería de RF-07 exige contrato comercial | Medio | Alta | El proveedor es intercambiable (*Strategy*): se demuestra con un proveedor de consola y se conecta el comercial si la institución lo contrata |
| Migraciones destructivas sobre datos de demostración | Medio | Baja | Migraciones con relleno de datos previo y semillas reproducibles |

---

## 11. Entregables

| Entregable | Fecha | Formato |
|---|---|---|
| Plan de Trabajo | 29/09/2026, 14:00 hs | Este documento |
| Código congelado | 11/11/2026 | Etiqueta en GitHub sobre `main` |
| Aplicación móvil | 17/11/2026 | Proyecto Expo con instrucciones de ejecución |
| Informe de uso de IA | 17/11/2026 | `docs/informe_final_ia.md` |
| Bitácora de IA | 17/11/2026 | `docs/bitacora_ia.md` |
| Documentación técnica | 22/11/2026 | `docs/modelo_de_datos.md`, `docs/api_rest.md`, `docs/frontend.md`, `docs/aplicacion_movil.md`, `docs/facturacion_y_schedulers.md`, `docs/carnet_digital_qr.md` |
| Sistema desplegado y capacitación | 21/11/2026 | Entorno de producción y manual de usuario |

---

## 12. Estado de avance al 19/09/2026

| Métrica | Valor |
|---|---|
| Requerimientos funcionales cubiertos | **8 de 8** |
| Modelos de datos | 40 |
| Enumeraciones | 25 |
| Migraciones aplicadas | 9 |
| Endpoints REST | 141 |
| Módulos de dominio | 15 |
| Líneas de TypeScript en el backend (`src/`, `prisma/`, `scripts/`) | 17 734 |
| Vistas web | 4 paneles (administración, docente, tutor, estudiante) más el portal público |
| Pantallas móviles | 5 (ingreso, dashboard, finanzas, pago por transferencia, carnet) |
| Pruebas automatizadas | **344**, todas en verde |
| Base de datos de verificación | PostgreSQL 15.18 real |

**Verificado desde la versión 2.0 de este documento:**

- **Rendimiento con la matrícula completa (RNF-03).** Medido en producción con
  5012 alumnos. Cumple los cinco casos.
- **Navegadores (RNF-05).** Los tres motores vigentes —Chromium, que es el de
  Chrome y el de Edge; Gecko; y WebKit— sobre las cinco páginas públicas, a
  1280 y a 375 px. Encontró un desborde horizontal reproducible en los tres,
  que se corrigió.
- **Backoffice en pantalla angosta (RNF-05).** Los cuatro paneles en Chromium a
  1366 y a 375 px. Los cuatro se desplazaban en horizontal: el CSS adaptable
  compartido existía, pero el `<style>` propio de cada panel lo pisaba. Los
  cuatro miden ahora 375 px de ancho de desplazamiento.
- **ABM académico y alta de alumnos y profesores.** Recorrido completo por HTTP
  contra PostgreSQL real (`pnpm --filter backend test:humo`): 21 comprobaciones,
  incluidos el rechazo del DNI repetido y las dos guardas de baja.
- **Contraste de color.** Medido con Lighthouse sobre el sitio desplegado: 93/100
  en la primera corrida, con 17 elementos por debajo del mínimo AA y 7 enlaces
  sin nombre accesible. Corregido, da 100/100 sin auditorías fallidas.

**Pendiente de verificación:** prueba en un dispositivo físico, envío real de SMS
y de correo, y lectura del QR con cámara sobre hardware real. Queda asignado a la
semana de pruebas y a la jornada del 11/11.
