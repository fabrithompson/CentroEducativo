# Vistas y Componentes de la Aplicación Web

**Proyecto:** Centro Educativo "TRANSFORMAR PARA EDUCAR"
**Fecha:** 16/09/2026

---

## 1. Qué había y qué se hizo

El frontend ya existía: 6.600 líneas repartidas en el landing y cuatro paneles.
Las seis secciones del portal público que pide la consigna estaban, y también el
muro de opiniones sin login. **Lo que faltaba era otra cosa:**

| Situación encontrada | Qué se hizo |
|---|---|
| Ninguna vista consumía la API v0.3/v0.4 — seguían contra los endpoints del bloque 1 | Cliente `js/api.js` y tres vistas nuevas sobre los endpoints actuales |
| La galería mostraba fotos genéricas ("Instalaciones", "Aula") | Ocho instalaciones reales con descripción: natatorio, pista, canchas, polideportivo, comedor, laboratorios, biblioteca y aulas |
| **Los tres paneles no tenían una sola media query** | `css/componentes.css` con cuatro puntos de quiebre |
| Sin estilos de foco: navegar con teclado era a ciegas | `:focus-visible` con contorno de 3px en todo control |
| Sin enlace para saltar la navegación | Skip link en las cinco páginas |
| 10 controles del panel de admin sin etiqueta accesible | 5 conectados a su `<label>` existente, 5 con `aria-label` |
| Un `<label for="foroFechaEntrega">` apuntaba a un id inexistente | Corregido a `for="actFecha"` |
| Radios de asistencia sin nombre: un lector sólo decía "botón de opción" | `aria-label` con estado y nombre del alumno |

Nada del código existente se reescribió. Las vistas nuevas conviven con las
viejas bajo la misma navegación.

---

## 2. Arquitectura del frontend

Módulos ES, que era la tarea 2.8 del plan de trabajo:

```
frontend/
  js/
    api.js              Cliente de la API v0.4
    ui.js               Componentes: tabla, badge, filtros, indicadores, estados
    vistas/
      admin-alumnos.js    Panel de admin — ABM de alumnos (RF-01)
      admin-profesores.js Panel de admin — ABM de profesores y materias a cargo (RF-04)
      admin-academico.js  Panel de admin — niveles, cursos y materias
      admin-comprobantes.js Panel de admin — cola de comprobantes de transferencia
      admin-tareas.js     Panel de admin — estado y disparo de las tareas programadas
      reportes.js         Panel de admin — 5 reportes con filtros
      escaner.js          Panel de admin — lectura del carnet con QR
      docente-cursos.js   Panel del docente — materias y alumnos
      padre-hijos.js      Panel del tutor — ficha, deportes, servicios, cuenta
  css/
    componentes.css     Sistema de componentes + responsive + accesibilidad
```

Los paneles siguen usando `onclick` inline en su navegación, así que cada módulo
expone su punto de entrada en `window` desde un `<script type="module">`. Es un
puente deliberado: permite sumar vistas modulares sin reescribir la navegación
existente.

### `js/api.js`

Centraliza tres cosas que estaban duplicadas en cada panel:

- El header `Authorization`.
- **El reintento con refresh token ante un 401**, compartiendo una sola promesa:
  si cinco widgets reciben 401 a la vez, se refresca una vez, no cinco.
- El manejo de errores, devolviendo un `ApiError` con status y detalles de Zod.

Los filtros vacíos no se mandan: el backend aplica sus valores por defecto.

### `js/ui.js`

Componentes que aplican cuatro reglas en todo lo que renderizan:

1. **Todo texto del servidor se escapa.** Los nombres y los motivos de rechazo
   los escriben personas; sin escapar, un apellido con `<` rompe la tabla.
2. **Las tablas llevan `<caption>` y `scope="col"`.** Es lo que permite que un
   lector de pantalla anuncie "columna Saldo, fila Pérez".
3. **Carga y errores se anuncian con `aria-live` y `role="alert"`.**
4. **Los estados no se comunican sólo por color**: cada badge lleva su texto.

También trae `render()`, que muestra el estado de carga y **captura el error**.
Evita el patrón de dejar un "Cargando…" colgado para siempre cuando la petición
falla, que es lo que hacen las vistas viejas.

---

## 3. Portal público

### Secciones

Las seis que pide la consigna, más opiniones y galería: `#nosotros`, `#niveles`,
`#bienestar`, `#noticias`, `#inscripcion`, `#empleo`, `#opiniones`, `#galeria`.

### Muro de opiniones

Ya funcionaba sin autenticación contra `POST /api/public/opinions`, con
moderación posterior. Hay un test que verifica que la sección no exija login.

### Galería de instalaciones

Ocho instalaciones, cada una con `<figure>` y `<figcaption>`. Coinciden con las
sedes que usan los deportes y el comedor en el seed:

| Instalación | Se usa para |
|---|---|
| Natatorio climatizado | Natación, los tres niveles |
| Pista de atletismo | Atletismo |
| Canchas | Fútbol 11 y hockey sobre césped |
| Polideportivo techado | Vóley, básquet, handball |
| Comedor | Servicio de 2, 3 o 5 días |
| Laboratorios | Ciencias naturales e informática |
| Biblioteca, aulas | Uso general |

Se usa `<ul>` de `<figure>` y no divs sueltos: un lector anuncia "lista de 8
elementos" y cada imagen queda asociada a su leyenda. Los `alt` describen la
instalación con detalle — hay un test que **rechaza los `alt` genéricos** de
menos de 25 caracteres o del tipo "Foto", "Aula", "Instalaciones".

Las imágenes llevan `width`, `height` y `loading="lazy"`: sin las dimensiones la
página salta mientras cargan las fotos.

---

## 4. Backoffice

### Panel de Administrador — Reportes

Nueva vista con cinco reportes en pestañas:

| Reporte | Filtros |
|---|---|
| Alumnos por deporte | deporte, nivel, **día de la semana**, docente a cargo |
| Alumnos por recorrido | recorrido (R1–R4), año, mes |
| Pagos completos e incompletos | año, mes, nivel, curso |
| Ingresos por período | **rango de fechas**, nivel |
| Morosidad | nivel, año |

Cada uno muestra indicadores arriba, tablas abajo, y **exporta a CSV**. El CSV
lleva BOM para que Excel en español abra bien los acentos, y usa `;` como
separador, que es lo que espera el Excel configurado en español.

El reporte de transporte incluye la ocupación de los cuatro recorridos aunque no
tengan pasajeros, con una barra de progreso que lleva `role="img"` y
`aria-label` con el porcentaje.

Los catálogos se cargan una vez y se cachean, con `Promise.allSettled`: si uno
falla, el reporte igual se muestra y sólo queda vacío ese filtro.

### Panel del Docente — Mis cursos y materias

Muestra la ficha del profesor, sus materias como tarjetas seleccionables, y el
**listado de alumnos del curso de la materia elegida** con legajo, DNI, fecha de
nacimiento y contacto.

Un docente puede tener cuenta de campus sin ficha de `Profesor` cargada todavía
—pasa mientras Administración completa los legajos—. Ese caso **se explica en
pantalla** en vez de mostrar un error.

### Panel del Padre — Ficha de mis hijos

Selector de hijo y cuatro pestañas:

1. **Ficha y materias** — datos del alumno, curso, nivel, y la tabla de materias
   con el docente a cargo de cada una y su contacto.
2. **Deportes** — los que cursa, con horarios, sede, profesor y arancel. Arriba,
   el cupo usado sobre el máximo de 2.
3. **Servicios** — transporte y comedor del mes, con el costo mensual estimado.
4. **Estado de cuenta** — facturas con total, pagado, saldo y estado; deuda
   discriminada por concepto; detalle desplegable de las últimas tres facturas
   con sus transferencias; y **carga de comprobantes**.

La carga de comprobante abre un `<dialog>` nativo con los campos que pide el
backend. El campo de archivo es obligatorio y lo dice en el texto de ayuda: sin
adjunto no hay pago, que es la regla de negocio.

**Esta vista sólo pide `alumnoId` que hayan salido de `/mis-hijos`.** El backend
verifica el vínculo igual, pero la UI no inventa identificadores.

---

## 5. Responsive

`componentes.css` define cuatro puntos de quiebre. Los relevantes:

### ≤ 900px — los paneles

Este era el problema serio. La sidebar era un flex fijo de 260px con
`body { overflow: hidden }`: en un teléfono se comía media pantalla y el
contenido no se podía desplazar.

Ahora la sidebar pasa a **barra horizontal desplazable** pegada arriba, el
`body` recupera el scroll y el contenido usa el ancho completo.

### ≤ 700px — las tablas

Una tabla de 8 columnas no entra en 360px. Cada fila **se reordena como
tarjeta**, reinyectando el encabezado de columna con `content: attr(data-label)`.

Se conserva el marcado de tabla y el `<thead>` se oculta visualmente pero sigue
en el árbol de accesibilidad: los lectores de pantalla siguen leyendo la
relación fila/columna.

### ≤ 420px — teléfonos chicos

Indicadores y tarjetas a una columna; las celdas apilan etiqueta sobre valor.

### Impresión

Los reportes se llevan a papel en las reuniones, así que `@media print` oculta
navegación, filtros y botones.

---

## 6. Accesibilidad

| Medida | Dónde |
|---|---|
| `lang="es"` y viewport | Las 5 páginas |
| Skip link a `#contenido-principal` | Las 5 páginas |
| Un único `<main>` por página | Las 5 páginas |
| Foco visible (contorno 3px) | Todo control |
| Objetivos táctiles de 44px | Botones, pestañas, enlaces de navegación |
| `prefers-reduced-motion` | Global |
| Tablas con `caption` y `scope` | Todo lo que genera `ui.js` |
| Estados con texto, no sólo color | Badges |
| `aria-live` en carga y errores | `ui.js` |
| Pestañas con `role="tablist"` | Reportes y ficha de hijos |
| `aria-pressed` en selectores | Hijo activo, materia activa |
| Todo control con etiqueta | Las 5 páginas |

**Lo que no se verificó:** el contraste real de colores y el comportamiento con
un lector de pantalla de verdad. Sin navegador no se puede medir. Los colores se
eligieron apuntando a AA (texto oscuro sobre fondos claros suaves), pero **eso
es una intención, no una medición**.

---

## 7. Estado de verificación

| Elemento | Estado |
|---|---|
| Marcado accesible de las 5 páginas | ✅ **26 chequeos automáticos** |
| Sintaxis de los 5 módulos ES | ✅ `node --check` |
| El servidor sirve los 12 archivos | ✅ **5 tests** |
| Content-type correcto de los módulos | ✅ verificado |
| Imports de los paneles resuelven | ✅ verificado |
| Hojas de estilo referenciadas existen | ✅ verificado |
| Suite completa del proyecto | ✅ **184 tests en verde** |
| Render real en un navegador | ❌ **No verificado** |
| Las vistas contra datos reales | ❌ **No verificado** |
| Contraste de color medido | ❌ **No verificado** |
| Prueba con lector de pantalla | ❌ **No verificado** |

El chequeo de accesibilidad corre sobre **los archivos reales**, no sobre una
copia: si alguien agrega una imagen sin `alt` o un `<select>` sin etiqueta, la
suite falla.

Lo que no está probado es lo que necesita un navegador y una base de datos: que
las vistas se vean bien, que los datos lleguen, y que la carga de comprobantes
funcione de punta a punta.

---

## 8. Pendientes

| Pendiente | Nota |
|---|---|
| Probar con lector de pantalla | El contraste ya se midió con Lighthouse sobre el sitio desplegado (100/100) y en Chromium sobre los avisos nuevos; falta NVDA o VoiceOver sobre los formularios |
