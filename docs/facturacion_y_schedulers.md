# Facturación y Tareas Programadas

**Proyecto:** Centro Educativo "TRANSFORMAR PARA EDUCAR"
**Versión de la API:** 0.4.0
**Migración asociada:** `20260915223000_facturacion_y_tareas_programadas`
**Fecha:** 15/09/2026

---

## 1. Generación de cuotas mensuales

`modules/facturacion/facturacion.service.ts` arma una factura por alumno activo,
con un `ItemFactura` por cada concepto:

| Concepto | Origen | Detalle |
|---|---|---|
| **Cuota base** | `NivelEducativo.cuotaMensual` | Según el nivel del curso del alumno |
| **Transporte** | `InscripcionTransporte` del período | Arancel del recorrido contratado |
| **Comedor** | `InscripcionComedor` del período | Arancel del plan contratado |
| **Deportes** | `InscripcionDeporte` activas | **Un ítem por deporte** |

Decisiones que conviene conocer antes de tocar este servicio:

- **El cálculo está separado del alta.** `calcularFacturaDeAlumno()` no escribe
  nada, así que el backoffice puede previsualizar la facturación del mes antes de
  emitirla (`GET /api/facturacion/previsualizar`) y el cálculo es testeable por sí
  solo.
- **Es idempotente.** `@@unique([alumnoId, anio, mes])` impide duplicar la factura
  de un período, y el proceso saltea a los alumnos que ya la tienen. Una corrida
  que quedó a medias se puede repetir sin miedo.
- **Cada alumno va en su propia transacción.** Si uno falla, los demás se emiten
  igual y el error queda en `resultado.errores`. Facturar es una operación mensual
  masiva: emitir 119 de 120 y reportar el faltante es mejor que caerse entera por
  un caso puntual.
- **Un alumno sin cargos no genera factura en cero.** Sería ruido para la familia
  y para el reporte de cobranza.
- **El transporte de sólo ida o sólo vuelta paga la mitad**: es medio servicio.
- **La factura copia los importes en sus ítems**, así que cambiar un arancel no
  altera el histórico ya emitido.

### Numeración

Formato `0001-00000001`, correlativa, calculada dentro de la transacción del alta
con aislamiento `Serializable`. Dos facturas concurrentes no pueden tomar el mismo
número.

### Fechas

- **Emisión:** último día hábil del período facturado.
- **Vencimiento:** día 10 del mes siguiente, **corrido al próximo día hábil** si
  cae fin de semana o feriado.

Ejemplo real: la cuota de septiembre de 2026 vence el **martes 13 de octubre**,
porque el 10 es sábado, el 11 domingo y el lunes 12 es feriado (Respeto a la
Diversidad Cultural).

---

## 2. Tarea programada 1 — Último día hábil del mes

`cron: 0 20 * * *` (20:00, huso `America/Argentina/Buenos_Aires`).

**"El último día hábil del mes" no se puede expresar en sintaxis cron**, porque
depende de fines de semana y feriados. Por eso el cron corre todos los días y el
job comprueba `esUltimoDiaHabilDelMes(hoy)` antes de trabajar. Esa función tiene
tests que recorren 2026 y 2027 completos y verifican que dispare exactamente
12 veces por año.

Qué hace, en orden:

1. Genera las facturas del período.
2. Recupera **todas** las facturas del período, incluidas las de corridas previas.
3. **Agrupa por tutor**, no por alumno: una familia con tres hijos recibe un mail
   con los tres desgloses, no tres mails.
4. Envía a cada tutor el desglose detallado, con la factura simulada de cada hijo
   adjunta, y le deja una notificación dentro del campus.

### Los feriados

`periodos.ts` trae los feriados nacionales de 2026 y 2027 cargados. Se pueden
agregar más en caliente con `registrarFeriado('2026-09-16')` — para puentes
turísticos o asuetos provinciales del Chaco, que se publican año a año.

**Al llegar a 2028 hay que cargar el calendario de ese año**, o el cálculo del
último día hábil va a ignorar los feriados.

### Si un alumno no tiene tutor con correo

La factura **se emite igual** y el caso queda contado en `alumnosSinTutor`. La
deuda existe aunque no se haya podido avisar; Administración lo ve en el resultado
de la corrida y en el reporte de morosidad.

---

## 3. Tarea programada 2 — Día 20 de cada mes

`cron: 0 9 * * *` (09:00), con la condición `hoy.getDate() === 20`.

Revisa las facturas del período con saldo pendiente y avisa a cada tutor.

Detalles deliberados:

- **El período por defecto es el mes anterior al de la corrida.** El día 20 de
  octubre se reclama la cuota de septiembre, que venció el 10 de octubre. Reclamar
  la de octubre —que todavía no se emitió— no tendría sentido.
- **Incluye las facturas en `EN_REVISION`.** El comprobante está cargado pero
  todavía no acreditado, así que la deuda sigue viva. **El correo lo aclara
  explícitamente** para que una familia que ya pagó no reciba un reclamo seco: hay
  un test que verifica que esa aclaración esté en el texto.
- **Filtra por el importe real, no sólo por el estado.** Una factura puede figurar
  con saldo cero si el trigger todavía no corrió.
- El asunto del mail cambia según haya o no facturas vencidas.

### Tarea auxiliar — marcado de vencimientos

`cron: 30 0 * * *`, diaria. El trigger de base sólo recalcula el estado cuando se
toca un comprobante; **una factura que nadie pagó nunca pasa sola de `PENDIENTE` a
`VENCIDA`**. Esta pasada lo corrige.

---

## 4. Idempotencia de las tareas

Ambas registran su corrida en `EjecucionTarea`, con `@@unique([tarea, anio, mes])`.
Antes de trabajar consultan si ya hay una corrida `COMPLETADA` para ese período y,
si la hay, no hacen nada.

Sin esto, **un reinicio del servidor el último día del mes mandaría los mails dos
veces**, que es exactamente el tipo de error que las familias notan.

La restricción única también evita que dos procesos concurrentes arranquen la
misma tarea: el segundo falla al crear el registro y se retira.

Para repetir una corrida a propósito —en la defensa, o para reintentar una que
falló— está el parámetro `forzar`.

---

## 5. Circuito de comprobantes

```
  Tutor sube comprobante  →  PENDIENTE  →  Administración valida
                                              ├── APROBADO  → trigger recalcula la factura
                                              └── RECHAZADO → se notifica el motivo
```

### Subida (tutor)

`POST /api/facturacion/comprobantes` — multipart, campo `comprobante`.

- **Sin archivo adjunto se rechaza con 400.** Es la regla de negocio: no se acepta
  efectivo, todo pago necesita respaldo.
- Valida que la factura exista, no esté anulada ni saldada.
- Valida que la fecha de transferencia no sea futura.
- Rechaza el mismo número de operación dos veces (salvo que el anterior haya sido
  rechazado).
- **Si el importe supera el saldo, avisa pero no bloquea.** Pagar de más puede ser
  legítimo — un adelanto, o un error que Administración después concilia.
- Notifica a todos los administradores para que no quede esperando.
- Verifica el vínculo tutor–alumno antes de aceptar nada.

### Validación (administración)

`POST /api/facturacion/comprobantes/:id/validar` con `{ aprobar, motivoRechazo }`.

- Para rechazar **es obligatorio el motivo** (lo exige el schema Zod y además un
  trigger en la base).
- Un comprobante ya resuelto no se puede volver a validar.
- Al aprobar, **el trigger `fn_recalcular_estado_factura` actualiza `montoPagado`
  y el estado**. El servicio relee la factura después: el valor que tenía antes ya
  no sirve.
- Se notifica por mail y dentro del campus a quien subió el comprobante y al tutor
  responsable, si son distintos.

`GET /api/facturacion/comprobantes/pendientes` devuelve la cola para el
backoffice, con una señal `coincideConSaldo` que marca los casos donde el importe
no cuadra con lo adeudado.

---

## 6. La factura electrónica simulada

`plantillas.ts` genera un HTML con el aspecto de un comprobante: encabezado
institucional, datos del alumno, tabla de ítems discriminados, totales, y los datos
bancarios para transferir.

**Se genera como HTML y no como PDF** para no sumar una dependencia de renderizado.
Se adjunta al mail y el navegador la imprime a PDF sin problema. También se puede
abrir desde `GET /api/facturacion/facturas/:id/comprobante`.

El documento **declara explícitamente que no es válido como factura fiscal**, que
no está autorizado por AFIP y que no posee CAE. Emitir algo con aspecto de factura
sin esa aclaración sería un problema serio, así que hay un test que verifica que
el texto esté presente.

Los nombres se escapan antes de insertarse en el HTML: un apellido con `&`, `<` o
comillas no puede romper el documento ni inyectar contenido.

---

## 7. Auditoría

`EmailLog` registra **todo correo del circuito de cobranza**: destino, asunto,
tipo, estado y el error si falló. Sin eso no hay forma de responder *"¿se le avisó
a esta familia y cuándo?"*, que es la primera pregunta cuando alguien reclama que
nunca le llegó la cuota.

`registrarEnvio()` **nunca lanza**: un fallo de SMTP no puede cortar la corrida
mensual a mitad de camino y dejar a media matrícula sin aviso. Marca el envío como
`FALLIDO` y sigue.

Consultable en `GET /api/facturacion/emails`.

---

## 8. Endpoints

| Método | Ruta | Roles |
|---|---|---|
| GET | `/api/facturacion/facturas` | ADMIN |
| GET | `/api/facturacion/facturas/:id` | ADMIN, PADRE (vinculado) |
| GET | `/api/facturacion/facturas/:id/comprobante` | ADMIN, PADRE (vinculado) |
| POST | `/api/facturacion/facturas/:id/anular` | ADMIN |
| GET | `/api/facturacion/previsualizar` | ADMIN |
| POST | `/api/facturacion/generar` | ADMIN |
| POST | `/api/facturacion/comprobantes` | PADRE (vinculado), ADMIN |
| GET | `/api/facturacion/comprobantes/pendientes` | ADMIN |
| POST | `/api/facturacion/comprobantes/:id/validar` | ADMIN |
| GET | `/api/facturacion/tareas` | ADMIN |
| POST | `/api/facturacion/tareas/:tarea/ejecutar` | ADMIN |
| POST | `/api/facturacion/tareas/marcar-vencidas` | ADMIN |
| GET | `/api/facturacion/emails` | ADMIN |

Anular una factura **se niega si tiene pagos aprobados**: primero hay que revertir
los comprobantes.

---

## 9. Cómo demostrarlo en la defensa

No hace falta esperar al último día hábil del mes. El disparo manual existe
justamente para eso:

```bash
# 1. Ver qué se facturaría, sin emitir nada
GET /api/facturacion/previsualizar?anio=2026&mes=9

# 2. Correr la tarea del último día hábil
POST /api/facturacion/tareas/FACTURACION_MENSUAL/ejecutar
     { "anio": 2026, "mes": 9 }

# 3. Ver los mails que salieron
GET /api/facturacion/emails?tipo=FACTURACION_MENSUAL

# 4. Correr el recordatorio del día 20
POST /api/facturacion/tareas/RECORDATORIO_DEUDA/ejecutar
     { "anio": 2026, "mes": 9 }

# 5. Repetir una corrida ya hecha (demuestra la idempotencia:
#    sin "forzar" responde omitida: true)
POST /api/facturacion/tareas/FACTURACION_MENSUAL/ejecutar
     { "anio": 2026, "mes": 9, "forzar": true }
```

**Sin SMTP configurado los mails no se pierden:** el mailer usa un transport de
tipo *stream* y los imprime por consola. Se puede mostrar el contenido completo
del correo sin configurar una casilla real.

---

## 10. Estado de verificación

| Elemento | Estado |
|---|---|
| Typecheck | ✅ `pnpm typecheck` sin errores |
| Cálculo de días hábiles, feriados y vencimientos | ✅ **28 tests** |
| Contenido de la factura simulada y de los correos | ✅ **22 tests** |
| Registro y condiciones del scheduler | ✅ **6 tests** |
| Cableo de la API | ✅ **46 rutas** exigen autenticación |
| Suite completa | ✅ **153 tests en verde** |
| Esquema de facturación contra PostgreSQL | ✅ **Migrado y probado, 16/09/2026** |
| Trigger de recálculo de factura | ✅ **Verificado: 2 transferencias saldan una factura** |
| Generación masiva de facturas con datos | ❌ **No verificado** |
| Corrida real de las tareas programadas | ❌ **No verificado** |
| Envío real de correos por SMTP | ❌ **No verificado** |


Lo que está probado es el cálculo de fechas, el contenido de los mensajes y el
cableo. **Lo que no está probado es el comportamiento contra datos reales**: que
las facturas salgan con los importes correctos, que el trigger actualice la factura
al aprobar un comprobante, y que los correos efectivamente lleguen. Para eso hace
falta PostgreSQL, que sigue sin estar disponible en la máquina de desarrollo.

---

## 11. Pendientes

| Pendiente | Nota |
|---|---|
| Feriados de 2028 en adelante | Cargar el calendario cuando se publique |
| Recargo por mora | El campo `recargo` existe en `Factura` pero nadie lo calcula todavía |
| Factura en PDF real | Hoy es HTML; requiere sumar una dependencia de renderizado |
| Reintento automático de correos fallidos | Hoy quedan registrados en `EmailLog` pero nadie los reintenta |
| Estado del scheduler en el panel de admin | El endpoint existe; falta la pantalla |
| Migrar `/api/payments` de `ParentStudentLink` a `TutorAlumno` | El endpoint vulnerable del hallazgo 5.2 ya se retiró |
