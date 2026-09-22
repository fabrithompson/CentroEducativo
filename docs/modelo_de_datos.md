# Modelo de Datos y Reglas de Negocio

**Proyecto:** Centro Educativo "TRANSFORMAR PARA EDUCAR"
**Migración:** `20260915201500_dominio_academico_deportes_facturacion`
**Fecha:** 15/09/2026

---

## 1. Qué incorpora esta migración

15 tablas nuevas, agrupadas en cuatro bloques. La migración es **puramente aditiva**:
no contiene ningún `DROP`, `TRUNCATE` ni `ALTER ... DROP COLUMN`, y no toca las 16 tablas
que ya existían.

| Bloque | Tablas |
|---|---|
| Estructura académica | `NivelEducativo`, `Curso`, `Materia` |
| Personas | `Alumno`, `Profesor` |
| Deportes | `Deporte`, `HorarioDeporte`, `InscripcionDeporte` |
| Servicios | `RecorridoTransporte`, `InscripcionTransporte`, `Comedor`, `InscripcionComedor` |
| Facturación | `Factura`, `ItemFactura`, `ComprobantePago` |

Además: 10 enums, 46 índices, 22 claves foráneas, 14 restricciones `CHECK`,
6 funciones y 5 triggers.

---

## 2. Decisiones de diseño

### 2.1 `Alumno` y `Profesor` son entidades propias, no campos de `User`

`User` queda como **identidad y credenciales**. `Alumno` y `Profesor` son entidades de
negocio con su propio legajo, DNI, domicilio y estado.

La relación con `User` es **1:1 opcional** (`userId Int? @unique`). Que sea opcional no es
un descuido: en Nivel Inicial el alumno no tiene cuenta de campus, opera el tutor. Un
alumno debe poder existir, facturarse y viajar en el micro sin credenciales.

### 2.2 Los horarios se guardan como minutos desde medianoche

`HorarioDeporte.horaInicio` y `horaFin` son `Int` en el rango `[0, 1440]`. 7:30 es `450`.

El motivo: con `time` o `timestamp` la detección de solapamiento arrastra zonas horarias y
conversiones del driver. Con enteros, el predicado de intersección es exacto y idéntico en
SQL y en TypeScript:

```
seSolapan(a, b)  ⟺  a.dia = b.dia  ∧  a.inicio < b.fin  ∧  b.inicio < a.fin
```

Los extremos son **semiabiertos**: una actividad que termina 18:30 y otra que empieza 18:30
no se solapan. Es como lo entiende cualquier preceptor, y permite encadenar dos deportes.

### 2.3 `Opinion` pasó a llamarse `OpinionPublica` sin migrar datos

El modelo se renombró para alinearlo con la nomenclatura del dominio, pero lleva
`@@map("Opinion")`: **la tabla física no cambia de nombre y los datos existentes quedan
intactos**. Sólo se actualizaron las 7 referencias `prisma.opinion` → `prisma.opinionPublica`
en `moderation.routes.ts`.

### 2.4 Qué se conservó deliberadamente

| Elemento | Por qué no se tocó |
|---|---|
| `Payment` | `payments.routes.ts` y el panel de padres lo consumen. Queda marcado `@deprecated`; lo reemplaza `Factura` en Sprint 3 |
| `User.curso` (String) | Los paneles todavía lo leen. Marcado `@deprecated`; se elimina cuando migren a `Alumno.cursoId` |
| `Grade.materia`, `Activity.materia`, etc. (String) | Migrarlos a FK contra `Materia` toca 6 routers y 4 paneles. Es tarea de Sprint 2, no de esta migración |

---

## 3. Cómo se hace cumplir cada regla

La consigna llama "estrictas" a estas reglas. Por eso ninguna depende solamente de que la
capa de aplicación se acuerde de validar: **el motor las rechaza igual**. Un `INSERT` por
consola, un script de migración o un endpoint nuevo escrito con prisa fallan.

| # | Regla | Dónde se hace cumplir |
|---|---|---|
| 1 | Cada alumno pertenece a un único curso | `Alumno.cursoId` **NOT NULL** + FK `ON DELETE RESTRICT` |
| 2 | Cada curso pertenece a un único nivel | `Curso.nivelId` **NOT NULL** + FK `ON DELETE RESTRICT` |
| 3 | **Máximo 2 deportes por alumno** | ① `CHECK slot IN (1,2)` ② índice único parcial `(alumnoId, slot) WHERE estado='ACTIVA'` ③ trigger `trg_inscripcion_deporte_max2` ④ servicio `inscribirEnDeporte` |
| 4 | **Sin solapamiento de horarios** | ① trigger `trg_inscripcion_deporte_sin_solapamiento` ② `detectarConflictos()` en el servicio |
| 5 | **Exactamente 4 recorridos** | ① enum `CodigoRecorrido` (R1..R4) ② `@unique` sobre `codigo` → imposible un quinto ③ trigger `trg_recorrido_no_eliminar` → imposible bajar de 4 ④ el seed crea los 4 |
| 6 | Deporte con profesor, arancel y grupos por nivel | `Deporte.profesorResponsableId` NOT NULL, `arancelMensual`, `HorarioDeporte.nivelId` |
| 7 | **Sólo transferencia con comprobante** | `ComprobantePago.archivoUrl` NOT NULL + `CHECK length(btrim(archivoUrl)) > 0 AND monto > 0`. La factura no tiene forma de pasar a `PAGADA` sin comprobantes aprobados |
| 8 | Una factura, varias transferencias (1:N) | FK `ComprobantePago.facturaId` + trigger `trg_comprobante_recalcula_factura` |

### 3.1 El máximo de 2 deportes, en detalle

La defensa real es el **índice único parcial**:

```sql
CREATE UNIQUE INDEX "ux_inscripcion_deporte_slot_activo"
  ON "InscripcionDeporte" ("alumnoId", "slot")
  WHERE "estado" = 'ACTIVA';
```

Con `slot ∈ {1,2}` y unicidad de `(alumnoId, slot)` entre las inscripciones activas, **una
tercera inscripción activa no tiene dónde ubicarse**. No hay condición de carrera posible:
lo resuelve el motor, no la aplicación. Dos requests concurrentes no pueden dejar al alumno
con 3 deportes.

El trigger existe para otra cosa: convertir el `duplicate key value violates unique
constraint` —que no le dice nada a un tutor— en *"El alumno Medina, Mateo ya tiene 2
deportes activos. El máximo permitido es 2."*

### 3.2 El estado de la factura es derivado, nunca declarado

`Factura.montoPagado` y `Factura.estado` **no los escribe la aplicación**. Los recalcula el
trigger `fn_recalcular_estado_factura` ante cualquier alta, validación, rechazo o baja de un
comprobante:

```
pagado ≥ total            → PAGADA
hay comprobantes PENDIENTE → EN_REVISION
pagado > 0                 → PARCIAL
vencimiento < hoy          → VENCIDA
resto                      → PENDIENTE
```

Una factura anulada nunca vuelve sola a circulación. Esto es lo que impide reproducir el
defecto que tiene hoy `POST /api/payments/:id/pay`, que marca una cuota como pagada sin
ningún respaldo (ver `docs/informe_auditoria.md`, hallazgo 5.1).

---

## 4. Estado de verificación

Conviene ser preciso sobre qué está probado y qué no.

| Elemento | Estado |
|---|---|
| `schema.prisma` válido | ✅ `prisma validate` |
| Cliente Prisma genera | ✅ `prisma generate` |
| Typecheck `src/` y `prisma/` | ✅ `tsc --noEmit`, sin errores |
| Lógica de solapamiento y slots | ✅ **44 tests en verde** (`pnpm --filter backend test`) |
| Coherencia del dataset del seed | ✅ 23 de esos tests auditan el seed contra las reglas |
| SQL de la migración ejecutado | ✅ **PostgreSQL 15.18, 16/09/2026** |
| Triggers y CHECKs en ejecución | ✅ **17 pruebas sobre el motor** |
| Seed corrido contra PostgreSQL | ✅ Verificado |

**Actualización del 16/09/2026.** La validación se completó. Como la máquina de desarrollo no
tiene Docker ni PostgreSQL, se utilizó `embedded-postgres` con las binarias oficiales de
PostgreSQL 15.18. Se ejecutan con `pnpm --filter backend test:integracion`.

**La primera corrida falló:** un carácter `∈` en un comentario de la migración del dominio la
volvía dependiente del encoding, y en una base creada con locale de Windows (WIN1252) abortó
con `has no equivalent in encoding WIN1252`. Se corrigieron los 4 caracteres fuera de Latin-1 y
se forzó `--encoding=UTF8` en la base de pruebas. Tras eso pasó todo en verde: en la última
corrida, las 11 migraciones, el seed, las 17 pruebas del motor y los 271 tests del backend.

---

## 5. Cómo aplicar la migración

```bash
# 1. Configurar el entorno
cp backend/.env.example backend/.env
#    editar DATABASE_URL y los dos secretos JWT (>= 32 caracteres)

# 2. Crear la base en PostgreSQL
createdb educar_transformar_db

# 3. Aplicar todas las migraciones
pnpm --filter backend prisma:deploy

# 4. Cargar los datos de demostración
pnpm --filter backend prisma:seed

# 5. Verificar
pnpm --filter backend test
```

### 5.1 Verificación automatizada

```bash
# Sin Docker: levanta PostgreSQL 15 embebido, migra, siembra y prueba todo
pnpm --filter backend test:integracion

# Con Docker: el mismo motor definido en docker-compose.yml
docker compose up -d
```

### 5.2 Advertencia sobre `prisma migrate dev`

Prisma no puede expresar en su DSL los índices parciales, los triggers ni las funciones. Al
correr `prisma migrate dev` para generar la **próxima** migración, es posible que el motor de
diff no reconozca `ux_inscripcion_deporte_slot_activo` —porque no sabe leer la cláusula
`WHERE`— y proponga eliminarlo.

**Antes de aceptar cualquier migración nueva, revisar el SQL generado.** Si aparece un
`DROP INDEX "ux_inscripcion_deporte_slot_activo"`, hay que borrar esa línea a mano: estaría
desarmando la garantía del máximo de 2 deportes. Los triggers y funciones no corren ese
riesgo, porque Prisma los ignora por completo.

Conviene confirmar este comportamiento la primera vez que se genere una migración sobre esta
base, y dejar el resultado asentado acá.

---

## 6. Casos de prueba manuales

Para la defensa conviene poder mostrar los rechazos en vivo. El seed está armado para eso.

### 6.1 Máximo 2 deportes — debe fallar

`A-0001` (Mateo Medina) ya cursa Fútbol y Ajedrez.

```sql
INSERT INTO "InscripcionDeporte" ("alumnoId", "deporteId", "slot", "estado")
VALUES (
  (SELECT id FROM "Alumno" WHERE legajo = 'A-0001'),
  (SELECT id FROM "Deporte" WHERE nombre = 'Natación'),
  1, 'ACTIVA'
);
```

**Esperado:** `El alumno Medina, Mateo Nicolás ya tiene 2 deportes activos. El máximo permitido es 2.`

### 6.2 Solapamiento de horarios — debe fallar

`A-0005` (Sofía Rodríguez, Secundario) cursa Hockey, que va miércoles y viernes 17:00-18:30.
Vóley también va miércoles 17:00-18:30.

```sql
INSERT INTO "InscripcionDeporte" ("alumnoId", "deporteId", "slot", "estado")
VALUES (
  (SELECT id FROM "Alumno" WHERE legajo = 'A-0005'),
  (SELECT id FROM "Deporte" WHERE nombre = 'Vóley'),
  2, 'ACTIVA'
);
```

**Esperado:** `Conflicto de horarios: Vóley (MIERCOLES de 17:00 a 18:30) se superpone con Hockey sobre césped...`

### 6.3 Caso límite que SÍ debe permitirse

Fútbol termina 18:30 el jueves; Ajedrez empieza 18:30 el jueves. `A-0001` cursa los dos y el
seed carga esa combinación sin error. Es la prueba de que el criterio de extremos
semiabiertos está bien implementado.

### 6.4 Quinto recorrido — debe fallar

```sql
INSERT INTO "RecorridoTransporte" (codigo, nombre, zonas, "arancelMensual", "horaSalida", "horaRegreso", "updatedAt")
VALUES ('R1', 'Recorrido 5', 'Zona sur', 40000, 400, 800, NOW());
```

**Esperado:** violación de unicidad sobre `codigo`. Y no hay un `R5` posible: el enum
`CodigoRecorrido` sólo admite R1..R4.

### 6.5 Borrar un recorrido — debe fallar

```sql
DELETE FROM "RecorridoTransporte" WHERE codigo = 'R3';
```

**Esperado:** `Los 4 recorridos de transporte son fijos por regla de negocio. Para discontinuar el recorrido R3 usá activo = false.`

### 6.6 Comprobante sin archivo adjunto — debe fallar

```sql
INSERT INTO "ComprobantePago" ("facturaId", "subidoPorId", monto, "fechaTransferencia",
                               "bancoOrigen", "numeroOperacion", "archivoUrl", "updatedAt")
VALUES (1, 1, 50000, CURRENT_DATE, 'Banco Nación', 'TEST-1', '   ', NOW());
```

**Esperado:** violación de `chk_comprobante_valido`. No hay forma de registrar un pago sin
respaldo documental.

### 6.7 Relación 1:N en acción

La factura de agosto de `A-0001` se salda con **dos** transferencias (`NAC-7902551` de
$120.000 y `NBCH-334871` por el resto). Al aprobarse la segunda, el trigger lleva la factura
de `PARCIAL` a `PAGADA` sola.

```sql
SELECT f.numero, f.total, f."montoPagado", f.estado, COUNT(c.id) AS comprobantes
FROM "Factura" f
LEFT JOIN "ComprobantePago" c ON c."facturaId" = f.id AND c.estado = 'APROBADO'
GROUP BY f.id ORDER BY f.numero;
```

---

## 7. Datos de demostración

Ambientados en Resistencia y el Gran Resistencia: calles, barrios y localidades reales.

- **3 niveles** — Inicial, Primario, Secundario
- **14 cursos** — Salas de 3/4/5, 1er a 6to grado, 1er a 5to año (ciclo 2026)
- **27 materias** con profesor asignado
- **7 profesores** — 4 vinculados a usuarios existentes + 3 del departamento de Educación Física
- **12 alumnos** — 8 con cuenta de campus, 4 sin credenciales (Inicial y 4to grado)
- **8 deportes oficiales** — Fútbol, Vóley, Básquet, Handball, Natación, Atletismo, Hockey sobre césped, Ajedrez — con **26 horarios** distribuidos por nivel
- **4 recorridos** — Centro/Macrocentro, Zona Norte, Fontana/Oeste, Barranqueras/Puerto Vilelas, con aranceles diferenciados por distancia ($46.000 a $62.000)
- **3 planes de comedor** — 5, 3 y 2 días
- **6 facturas** con items desglosados y **6 comprobantes** en los cuatro estados posibles

El ciclo lectivo del demo es `2026`, definido en la constante `CICLO` de
`prisma/seed-dominio.ts`. Se eligió 2026 por coherencia con las notas, asistencias y anuncios
que ya carga `seed.ts`. La institución inicia actividades en marzo de 2027: para mover el demo
al ciclo real alcanza con cambiar esa constante.

---

## 8. Lo que falta

Esta migración cubre el **modelo**. Falta la capa que lo expone:

| Pendiente | Sprint |
|---|---|
| Routers y controladores de deportes, transporte y comedor | 2 |
| ABM de Alumnos, Profesores, Cursos y Materias en el backoffice | 2 |
| Migrar `Grade.materia` y afines de `String` a FK contra `Materia` | 2 |
| Motor de generación mensual de facturas | 3 |
| Endpoints de carga y validación de comprobantes | 3 |
| Retiro de `Payment` y `User.curso` | 3 |
