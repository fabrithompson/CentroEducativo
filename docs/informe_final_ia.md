# Informe Final sobre el Uso de Inteligencia Artificial

**Trabajo Práctico Integrador**
**Cátedra:** Metodología de Sistemas II
**Carrera:** Tecnicatura Universitaria en Programación — TUP 2026
**Proyecto:** Sistema integral del Centro Educativo "TRANSFORMAR PARA EDUCAR"
**Equipo:** **Naft** — Nahuel Alem · Fabricio Ceniquel Thompson
**Herramienta de IA utilizada:** Claude Code — modelo Opus 5
**Fecha de cierre del informe:** 16 de septiembre de 2026

---

## Resumen ejecutivo

Este informe documenta el uso de inteligencia artificial generativa en el
desarrollo del Trabajo Práctico Integrador, sobre un sistema compuesto por tres
aplicaciones —portal web institucional, sistema de gestión y aplicación móvil—
que comparten un backend y una base de datos únicos.

El trabajo se organizó en **nueve intervenciones asistidas por IA**, todas
registradas en `docs/bitacora_ia.md`. El producto resultante comprende 40
modelos de datos, 140 endpoints REST, 9 migraciones y 327 pruebas automatizadas,
**validadas contra una instancia real de PostgreSQL 15**.

La tesis central del informe es la siguiente: **la inteligencia artificial
demostró una productividad notable en la generación de estructura, y una
incapacidad sistemática para inferir reglas de negocio que no estuvieran
explicitadas**. Esa asimetría no es un defecto accidental de la herramienta sino
una consecuencia de su naturaleza, y determina cómo debe organizarse el trabajo
alrededor de ella.

---

## 1. Relación entre la Aplicación Web y la Aplicación Móvil

### 1.1 Arquitectura general

El sistema adopta una arquitectura de **cliente-servidor con backend único y
múltiples clientes**. Tres aplicaciones cliente consumen una misma API REST y
una misma base de datos relacional:

```
        ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐
        │  Portal público  │   │    Backoffice    │   │  App móvil       │
        │  (HTML/CSS/JS)   │   │  (módulos ES)    │   │  (Expo + RN)     │
        │  visitantes      │   │  admin/docentes  │   │  tutores         │
        └────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
                 │                      │                      │
                 └──────────────┬───────┴──────────────────────┘
                                │ HTTPS · JSON · JWT
                     ┌──────────▼───────────┐
                     │   API REST v0.5.0    │
                     │  Node + Express + TS │
                     │  ┌────────────────┐  │
                     │  │ routes         │  │  ← validación (Zod) y permisos
                     │  │ services       │  │  ← reglas de negocio
                     │  │ Prisma         │  │  ← persistencia
                     │  └────────────────┘  │
                     └──────────┬───────────┘
                                │
                     ┌──────────▼───────────┐
                     │     PostgreSQL       │
                     │  40 modelos · 6      │
                     │  triggers · 12 CHECK │
                     └──────────────────────┘
```

La decisión de fondo es que **las reglas de negocio residen exclusivamente en el
servidor y en el motor de base de datos**. Ningún cliente las reimplementa. Esta
elección se sostuvo de manera deliberada a lo largo de todo el desarrollo y es
la que permite que tres clientes heterogéneos —dos web y uno nativo— produzcan
resultados coherentes entre sí.

### 1.2 Comunicación mediante API REST

La comunicación se realiza sobre HTTP con cuerpos JSON. Ambos clientes
implementan un cliente HTTP propio pero funcionalmente equivalente:

| Aspecto | Web (`web/frontend/js/api.js`) | Móvil (`mobile/src/api/client.ts`) |
|---|---|---|
| Autenticación | `Authorization: Bearer` | `Authorization: Bearer` |
| Renovación de sesión | Reintento único ante 401 | Reintento único ante 401 |
| Concurrencia de refresh | Promesa compartida | Promesa compartida |
| Errores | Clase `ApiError` con status y detalles | Clase `ApiError` con status y detalles |
| Tiempo máximo | (heredado del navegador) | 15 s con `AbortController` |

La coincidencia no es casual: ambos clientes resuelven el mismo problema y por
lo tanto convergen en la misma solución. La diferencia del tiempo máximo
responde a una condición del medio: en una red móvil una petición puede quedar
suspendida indefinidamente, situación que el navegador de escritorio gestiona
por sí mismo.

**Endpoints compartidos.** El portal de tutores (`/api/padres/mis-hijos/...`) es
consumido tanto por el panel web del padre como por la aplicación móvil, sin
ninguna variante. Un mismo endpoint sirve a ambos porque devuelve datos, no
presentación.

### 1.3 Persistencia compartida

Existe una única base de datos PostgreSQL. No hay replicación, sincronización
diferida ni almacenamiento local de datos de negocio en los clientes.

Esta decisión merece justificación, porque la alternativa —una base local en el
dispositivo, sincronizada periódicamente— es frecuente en aplicaciones móviles:

1. **Coherencia inmediata.** Si Administración aprueba un comprobante, el saldo
   cambia para todos los clientes en la misma consulta. Con sincronización
   diferida, una familia podría ver durante horas una deuda ya saldada.
2. **Autoridad única sobre el estado.** El estado de una factura lo deriva un
   *trigger* de PostgreSQL a partir de los comprobantes aprobados. Replicar esa
   lógica en un cliente significaría admitir que dos sistemas puedan discrepar
   sobre si una cuota está paga.
3. **Superficie de exposición reducida.** Datos financieros y personales de
   menores no se almacenan en el dispositivo.

**La única excepción es deliberada y acotada:** el secreto criptográfico del
carnet digital se guarda en el almacenamiento seguro del teléfono
(`expo-secure-store`).

Esta excepción merece detenimiento, porque es la que sostiene el Desafío de Valor
Agregado y la que determinó buena parte de su diseño. Los cuatro recorridos de
transporte cubren zonas suburbanas del Gran Resistencia —Fontana, Puerto Vilelas,
Barranqueras, Villa Río Negro— donde **la cobertura de datos móviles es
intermitente**. Un alumno que espera el micro a las 6:10 de la mañana en Villa
Don Andrés puede no tener señal.

Si la credencial requiriera conexión para generarse, el sistema fallaría
exactamente en el escenario para el que fue construido. Por eso el secreto vive
en el dispositivo y el código se deriva localmente: **el teléfono no necesita red
para mostrar el carnet**. El que sí necesita conexión es el lector, que está en
manos del chofer o del personal del comedor, y para el que una falla es
recuperable mediante la entrada manual del código de ocho dígitos.

Esta asimetría —cliente sin conexión, lector conectado— es el núcleo de la
arquitectura del módulo y no habría surgido de un análisis abstracto: surge de
conocer la geografía y la conectividad reales del Gran Resistencia.

### 1.4 Sincronización

Al no existir réplica, no hay sincronización en sentido estricto. Existen, en
cambio, tres mecanismos de actualización:

| Mecanismo | Dónde | Propósito |
|---|---|---|
| Consulta bajo demanda | Ambos clientes | Cada pantalla pide sus datos al montarse |
| Gesto de recarga | Móvil (`RefreshControl`) | Actualización explícita del usuario |
| Notificaciones | Ambos | Avisos de cobranza y de acceso por QR |

Un cuarto mecanismo, **Socket.IO**, existe en el backend y lo utiliza la
mensajería del campus web. La aplicación móvil no lo consume: sostener una
conexión persistente consume batería y no aporta valor a un caso de uso que se
abre para consultar y se cierra. El aviso móvil llega por correo y por
notificación interna.

**Consistencia de reloj.** El carnet digital depende de que el teléfono y el
servidor coincidan en la hora. El protocolo TOTP tolera un desfasaje de ±1
ventana (90 segundos efectivos). Adicionalmente, la aplicación resincroniza su
reloj al regresar del segundo plano, porque mientras estuvo suspendida el
temporizador pudo no ejecutarse y el código mostrado quedaría vencido.

### 1.5 Modificaciones realizadas en el backend

El repositorio contaba, al iniciar el trabajo, con un campus virtual funcional
de 16 modelos y 54 endpoints. Las modificaciones se organizaron en cuatro
migraciones sucesivas, **todas puramente aditivas**:

| Migración | Incorpora | Líneas SQL |
|---|---|---|
| `20260915201500` | Estructura académica, deportes, transporte, comedor, facturación | 811 |
| `20260915213000` | Vínculo tutor–alumno y recuperación de contraseña | 90 |
| `20260915223000` | Auditoría de tareas programadas y de correos | 60 |
| `20260916150000` | Carnet digital y registro de accesos | 79 |

Ninguna contiene sentencias `DROP`, `TRUNCATE` ni `ALTER ... DROP COLUMN`. Esta
restricción fue autoimpuesta y se verificó en cada migración: el código
preexistente debía seguir funcionando mientras se construía el nuevo.

**Consecuencia asumida:** el sistema mantiene temporalmente dos modelos
paralelos para algunos conceptos —`Payment` junto a `Factura`,
`ParentStudentLink` junto a `TutorAlumno`—. Los modelos antiguos están marcados
como obsoletos en el esquema y su retiro está planificado, pero eliminarlos
habría requerido migrar simultáneamente el frontend existente, multiplicando el
riesgo. Se privilegió la continuidad operativa sobre la elegancia del esquema.

**Cambios de contrato que afectaron a los clientes.** Uno solo: el modelo
`Opinion` se renombró a `OpinionPublica`. Se utilizó `@@map("Opinion")`, de modo
que **la tabla física no cambió y no hubo migración de datos**; sólo se
actualizaron siete referencias en el código. Es un ejemplo del criterio general:
cuando un cambio de nomenclatura puede resolverse sin tocar los datos, se
resuelve sin tocar los datos.

---

## 2. Bitácora de IA consolidada por fases

La tabla íntegra, con prompts completos y comandos ejecutados, obra en
`docs/bitacora_ia.md`. Se presenta aquí su síntesis cronológica.

### Fase 0 — Diagnóstico (15/09/2026)

**Intervención 1 — Auditoría del repositorio.**
Se solicitó a la IA auditar el estado real del proyecto antes de escribir código.
El diagnóstico fue determinante para todo lo que siguió: el repositorio contenía
un campus virtual sólido pero que **respondía a un alcance distinto del que pedía
la consigna**. De las ocho reglas de negocio declaradas críticas, sólo dos
tenían representación en el sistema.

Se identificaron además dos defectos de seguridad graves en el código
preexistente, analizados en detalle en la sección 3.

*Productos:* `plan_de_trabajo.md`, `bitacora_ia.md`, `informe_auditoria.md`.

### Fase 1 — Núcleo de dominio (15/09/2026)

**Intervención 2 — Modelo de datos y migraciones.**
Quince tablas nuevas, diez enumeraciones, y la traducción de las reglas de
negocio a restricciones del motor: 12 `CHECK`, 6 funciones y 5 disparadores.

*Decisión técnica de mayor impacto:* representar los horarios como minutos desde
medianoche (entero 0–1439) en lugar de tipos temporales. Esto vuelve la
detección de solapamiento una comparación exacta de enteros, idéntica en SQL y
en TypeScript, y elimina toda ambigüedad de zona horaria.

### Fase 2 — Capa de servicios (15/09/2026)

**Intervención 3 — Servicios y controladores REST.**
Veinte archivos organizados en capas `routes → services → Prisma`, con la matriz
de autorización centralizada en un único módulo.

*Hallazgo emergente:* el módulo `config/env.ts` ejecuta `process.exit(1)` durante
su importación si falta una variable de entorno. En consecuencia, **todo módulo
que lo arrastre transitivamente resulta imposible de probar**. Se resolvió
aislando las primitivas criptográficas en un módulo sin dependencias.

### Fase 3 — Circuito de cobranza (15/09/2026)

**Intervención 4 — Facturación y tareas programadas.**

*Problema no anticipado:* la expresión «último día hábil del mes» **no es
representable en sintaxis cron**, porque depende de fines de semana y feriados.
La solución fue invertir la responsabilidad: el cron se ejecuta diariamente y la
tarea evalúa si corresponde actuar. Esa evaluación está cubierta por pruebas que
recorren los calendarios completos de 2026 y 2027 y verifican que se dispare
exactamente doce veces por año.

*Segunda decisión relevante:* la idempotencia. La tabla `EjecucionTarea` con
restricción única `(tarea, año, mes)` impide que un reinicio del servidor el
último día del mes envíe los correos dos veces.

### Fase 4 — Interfaces de usuario (16/09/2026)

**Intervención 5 — Vistas web.** El diagnóstico reveló que **ninguna vista
consumía la API construida en las fases anteriores**, y que los tres paneles del
backoffice carecían por completo de reglas de medios (`@media`), resultando
inutilizables en teléfono.

Se incorporó además una suite de 26 verificaciones automáticas de accesibilidad
que opera sobre los archivos HTML reales. Esa suite detectó defectos
preexistentes que nadie había advertido, entre ellos una etiqueta `<label
for="foroFechaEntrega">` que apuntaba a un identificador inexistente.

**Intervención 6 — Aplicación móvil.** Paquete Expo + React Native, con la
lógica de cálculo aislada en un módulo puro y probado.

*Discrepancia de diseño detectada:* la consigna solicita un «selector de ítems a
pagar», pero el modelo de datos asocia cada comprobante a una factura completa.
Se optó por no simular una imputación inexistente. Este caso se analiza en la
sección 3.4.

### Fase 5 — Valor agregado (16/09/2026)

**Intervención 7 — Carnet digital con QR dinámico.**
Implementación de TOTP (RFC 6238) con rotación cada 30 segundos, verificación en
seis controles, y notificación inmediata al tutor.

*Obstáculo técnico principal:* React Native no expone HMAC. Se implementaron
SHA-256 y HMAC-SHA256 en JavaScript puro y **se demostró su equivalencia con
`node:crypto` en 300 casos aleatorios**, incluidos los bordes del relleno de
bloque donde habitualmente fallan las implementaciones propias.

### Fase 6 — Consolidación y validación contra PostgreSQL (16/09/2026)

**Intervención 8 — Ejecución real de la base de datos.**
Hasta esta instancia, las 8 migraciones, 7 funciones PL/pgSQL, 6 disparadores y
12 restricciones `CHECK` **nunca habían sido ejecutados por un motor**. La
máquina de desarrollo carece de Docker y de PostgreSQL, lo que había convertido
esa verificación en una deuda arrastrada durante todo el proyecto.

Se resolvió incorporando `embedded-postgres` fijado en la versión 15.18, que
descarga y ejecuta las binarias oficiales de PostgreSQL —no es un emulador— y
levanta una instancia en seis segundos sin requerir Docker. Se creó además el
`docker-compose.yml` con `postgres:15-alpine` para las máquinas que sí lo tengan.

*Resultado:* las 8 migraciones aplicadas, el seed cargado, **15 pruebas nuevas
sobre las reglas del motor** en verde y los **205 tests del backend** en verde.

*Defecto detectado, invisible hasta la ejecución:* la quinta migración abortó por
un carácter matemático (`∈`) en un comentario SQL, que la base creada con el
locale de Windows no podía representar. Se detalla en la conclusión del informe.

### Síntesis cuantitativa

| Métrica | Valor |
|---|---|
| Intervenciones registradas | 8 |
| Modelos de datos | 37 |
| Enumeraciones | 22 |
| Endpoints REST | 134 |
| Migraciones | 8 (4 propias del TP), aplicadas con éxito |
| Funciones y disparadores en PostgreSQL | 7 y 6 (verificados en ejecución) |
| Restricciones `CHECK` | 12 |
| Pruebas automatizadas | 290 (205 backend, 70 móvil, 15 sobre el motor) |
| Archivos de prueba | 16 |
| Líneas de código (backend) | 14 262 |
| Líneas de código (frontend) | 10 154 |
| Líneas de código (móvil) | 4 461 |
| Líneas de documentación técnica | 3 354 (10 documentos) |
| Líneas de SQL en migraciones | 1 428 |
| Archivos fuente (backend / frontend / móvil) | 73 / 16 / 18 |

---

## 3. Inteligencia Artificial frente al Conocimiento del Sistema

### 3.1 Formulación del problema

Un modelo de lenguaje produce código a partir de regularidades estadísticas
observadas en grandes volúmenes de código previo. Esa capacidad explica su
notable desempeño en la **dimensión sintáctica**: el código generado compila,
respeta las convenciones del lenguaje y aplica patrones idiomáticos correctos.

Pero la **dimensión semántica** del software de gestión no es estadística. Que un
alumno pueda inscribirse a un máximo de dos deportes no se deduce de ningún
corpus: es una decisión institucional, arbitraria y específica. La IA no puede
inferirla porque no hay nada que inferir.

El resultado es una categoría de error particularmente peligrosa: **código
sintácticamente impecable y semánticamente inválido**. No falla en compilación,
no falla en ejecución, y no llama la atención en una revisión superficial. Falla
recién cuando el sistema está en producción y un alumno se anota en cinco
deportes.

A continuación se analizan cuatro casos concretos de este proyecto.

### 3.2 Caso 1 — El límite de dos deportes por alumno

**Representación ingenua.** Un modelo de inscripción deportiva generado sin
conocimiento del dominio tendría esta forma:

```prisma
model InscripcionDeporte {
  id        Int     @id @default(autoincrement())
  alumnoId  Int
  deporteId Int
  alumno    Alumno  @relation(fields: [alumnoId], references: [id])
  deporte   Deporte @relation(fields: [deporteId], references: [id])
}
```

Este código es correcto en todo sentido técnico. Las claves foráneas son
apropiadas, los nombres son claros, Prisma lo valida sin objeciones. **Y permite
que un alumno se inscriba en los ocho deportes de la institución.**

**Representación adoptada.** La regla se expresó mediante una combinación de
restricciones:

```prisma
model InscripcionDeporte {
  alumnoId  Int
  deporteId Int
  slot      Int                              // CHECK: slot IN (1, 2)
  estado    EstadoInscripcion @default(ACTIVA)
  @@unique([alumnoId, deporteId])
}
```

```sql
CREATE UNIQUE INDEX "ux_inscripcion_deporte_slot_activo"
  ON "InscripcionDeporte" ("alumnoId", "slot")
  WHERE "estado" = 'ACTIVA';
```

El razonamiento es el siguiente: si el campo `slot` sólo admite los valores 1 y 2,
y no pueden existir dos inscripciones activas del mismo alumno con el mismo
`slot`, entonces **una tercera inscripción activa carece de posición donde
ubicarse**. La restricción la hace cumplir el motor de base de datos, no la
aplicación.

**Por qué esta diferencia es significativa.** Una validación en capa de
aplicación —«contar inscripciones activas y rechazar si son dos o más»— es
vulnerable a una condición de carrera: dos peticiones simultáneas pueden leer
ambas «tiene una inscripción» y escribir ambas, dejando al alumno con tres. El
índice único parcial elimina esa posibilidad por construcción.

La IA generó la implementación una vez explicitada la estrategia. **Lo que no
podía hacer era concebir que hiciera falta una estrategia.**

### 3.3 Caso 2 — Los cuatro recorridos fijos

**Representación ingenua.** Un catálogo de recorridos de transporte se modela
naturalmente así:

```prisma
model RecorridoTransporte {
  id     Int    @id @default(autoincrement())
  nombre String
  zonas  String
}
```

Nuevamente: código correcto, que admite cuarenta y siete recorridos.

La consigna establece que existen **exactamente cuatro**. Ese «exactamente» tiene
implicancias operativas concretas: los itinerarios están diseñados, los micros
contratados y los aranceles diferenciados por distancia. No es un catálogo
abierto sino un conjunto cerrado.

**Representación adoptada.**

```prisma
enum CodigoRecorrido { R1  R2  R3  R4 }

model RecorridoTransporte {
  codigo CodigoRecorrido @unique
  // ...
}
```

El tipo enumerado acota el universo de códigos posibles a cuatro; la restricción
de unicidad impide repetirlos. **La existencia de un quinto recorrido es
imposible a nivel de motor.** El extremo inferior se protegió con un disparador
que impide el borrado: para discontinuar un recorrido se utiliza `activo = false`.

Esta es una diferencia conceptual que ningún modelo estadístico puede inferir:
distinguir un catálogo extensible de un conjunto cerrado requiere conocer la
operación real de la institución.

### 3.4 Caso 3 — La relación 1:N entre facturas y comprobantes

Este caso es el más instructivo porque el error posible no está en la estructura
sino en su interpretación.

**La regla de negocio.** Una factura puede liquidarse con varias transferencias.
Una familia que no puede abonar la cuota completa transfiere una parte, y días
después el resto.

**La estructura correcta** —que la IA generó sin dificultad una vez enunciada—
es una relación uno a muchos:

```prisma
model Factura {
  total        Decimal
  montoPagado  Decimal @default(0)
  estado       EstadoFactura
  comprobantes ComprobantePago[]
}
```

**Dónde aparece el error semántico.** Una implementación razonable haría que el
servicio de validación de comprobantes actualizara `montoPagado` y `estado`
directamente. Es lo natural, es lo que sugiere la estructura, y compila
perfectamente. Sin embargo introduce dos defectos:

1. **La aplicación se vuelve autoridad sobre un valor derivado.** Si alguien
   corrige un comprobante mediante SQL directo, o si se agrega un segundo camino
   de código que apruebe comprobantes, los valores se desincronizan silenciosamente.
2. **El estado de una factura queda a merced de que quien programe recuerde
   recalcularlo.**

**Solución adoptada.** `montoPagado` y `estado` **no los escribe la aplicación**.
Los recalcula un disparador ante cualquier alta, aprobación, rechazo o baja de un
comprobante:

```
pagado ≥ total              → PAGADA
hay comprobantes PENDIENTE  → EN_REVISION
pagado > 0                  → PARCIAL
vencimiento < hoy           → VENCIDA
```

El estado es **consecuencia**, no declaración.

**El corolario inesperado.** Esta decisión, correcta en el backend, produjo una
tensión al llegar a la aplicación móvil. La consigna solicita un «selector de
ítems a pagar» —cuota, deporte 1, deporte 2, transporte, comedor—, lo que sugiere
que el pago se imputa a conceptos determinados. Pero el modelo no imputa por
ítem: acumula sobre la factura y prorratea la deuda por concepto.

Existían dos caminos: simular una imputación por ítem en la interfaz, o
explicitar la diferencia. **Se optó por lo segundo.** El selector sirve para
componer el importe, y la pantalla lo declara textualmente: *«El pago se registra
sobre la cuota completa. Elegir conceptos te ayuda a calcular cuánto transferir;
Administración aplica el importe al saldo»*.

Simular la imputación habría sido informar a una familia que su dinero se aplicó
a un concepto al que no se aplicó. La documentación consigna qué modificación del
modelo haría falta para imputar realmente, y señala que esa es una decisión de
negocio, no de interfaz.

### 3.5 Caso 4 — El QR dinámico: cuando la semántica correcta define la arquitectura

El Desafío de Valor Agregado ofrece el ejemplo inverso a los anteriores: aquí la
comprensión del dominio no corrigió un error de la IA, sino que **determinó la
arquitectura entera antes de escribir código**.

**La solución sintácticamente obvia.** Pedir «un carnet con QR» produce, de
manera natural, un código que identifica al alumno: `{"alumnoId": 42}` o
similar. Es correcto, es simple, funciona. **Y se clona con una captura de
pantalla**, exactamente igual que una credencial plástica fotocopiada.

**Por qué esa solución es semánticamente inválida en este contexto.** El carnet
no es un identificador: es una *prueba de presencia*. Afirma que este alumno,
ahora, está frente a este lector. Un dato estático no puede probar eso.

**La solución adoptada.** TOTP según RFC 6238: el código se deriva del secreto y
de la ventana temporal, y **rota cada 30 segundos**. Una foto de la pantalla deja
de servir casi de inmediato.

**Y aquí aparece la restricción del contexto real.** La implementación estándar
de un control de acceso consultaría al servidor en cada validación. Pero los
cuatro recorridos cubren zonas suburbanas de Resistencia con conectividad
intermitente. Se resolvió dividiendo responsabilidades:

| Componente | Conexión | Fundamento |
|---|---|---|
| Teléfono del alumno | **No requiere** | Genera el código localmente con el secreto guardado |
| Lector del personal | Requiere | Está en el micro o en el colegio; ante falla, entrada manual |

**Validación semántica en el punto de control.** El lector no se limita a
verificar el código: comprueba que el alumno tenga el servicio contratado en el
mes en curso y —en transporte— **que sea ese recorrido y no otro**. Un alumno del
R1 no sube al R3 aunque su credencial sea perfectamente válida.

Esa última regla es la que ningún modelo habría inferido. «Validar el acceso al
transporte» no implica «validar contra el recorrido contratado»; lo implica
únicamente si se sabe que hay cuatro recorridos con itinerarios distintos y que
subir al equivocado deja a un chico a veinte cuadras de su casa.

**Conclusión del caso.** La IA implementó TOTP sin un solo error, y la
equivalencia entre su implementación en JavaScript puro y `node:crypto` se
demostró en 300 casos. Pero si se le hubiera pedido un QR estático, también lo
habría implementado sin errores. **La herramienta no cuestiona el requerimiento.**
Decidir que hacía falta rotación, que el cliente debía funcionar sin conexión y
que el recorrido debía validarse, fue trabajo de comprensión del problema.

### 3.6 Caso 5 — Los defectos preexistentes en el código heredado

Los tres casos anteriores son hipotéticos: describen errores que la IA *habría*
cometido sin instrucción explícita. El cuarto es real y estaba en el repositorio
antes de esta etapa del trabajo.

**Defecto A.** El endpoint `POST /api/payments/:id/pay` marcaba una cuota como
pagada de inmediato, sin comprobante ni validación administrativa. El código es
correcto, legible y está bien estructurado. Y contradice frontalmente la regla
«no se acepta efectivo, únicamente transferencias con comprobante adjunto»: es,
funcionalmente, declarar un pago sin respaldo.

**Defecto B.** El endpoint `POST /api/parent/vincular` creaba el vínculo
padre–hijo aceptando un DNI, **sin verificación alguna**. Conociendo el DNI de un
alumno, cualquier usuario con rol PADRE accedía a sus calificaciones, asistencia,
cuotas y mensajería. El resto del sistema respeta el aislamiento entre familias
correctamente; la falla se concentraba en ese único punto de entrada.

**Qué demuestran estos casos.** Ninguno es un error de programación en sentido
estricto. Ambos son errores de *comprensión del dominio* materializados en código
impecable. Y ambos sobrevivieron a las revisiones previas justamente porque el
código no daba señales de estar mal.

Fueron detectados al confrontar sistemáticamente cada endpoint contra el
enunciado de la consigna — una tarea que requiere haber leído y entendido la
consigna, no analizar el código.

### 3.7 Un error propio, para no exagerar la asimetría

Sería deshonesto presentar a la IA como la única fuente de error semántico.

Durante la implementación de las tareas programadas se escribió una prueba que
afirmaba que la cuota de septiembre de 2026 vencía el **12 de octubre**. La
prueba falló: la implementación devolvía el **13**.

El primer impulso —corregir el código para que pasara la prueba— habría
introducido un defecto. La verificación del calendario mostró que el 10 de
octubre de 2026 es sábado, el 11 domingo, y el **lunes 12 es feriado** por el Día
del Respeto a la Diversidad Cultural. El vencimiento correcto es el martes 13.

**El código tenía razón; la prueba estaba mal.** Se corrigió la prueba.

Este episodio ilustra algo que matiza toda la sección: el error semántico no es
privativo de la IA. Es privativo de *cualquier agente que no tenga presente el
contexto completo*. La ventaja del ser humano no es ser inmune, sino poder
detenerse a verificar el calendario.

---

## 4. Tabla comparativa: desarrollo tradicional frente a desarrollo asistido por IA

Los diez aspectos se evalúan sobre la experiencia concreta de este proyecto. La
escala es cualitativa: **Alto / Medio / Bajo**.

| # | Aspecto | Desarrollo tradicional | Desarrollo asistido por IA | Evidencia en el proyecto | Conclusión |
|---|---|---|---|---|---|
| 1 | **Generación de código** | Medio. Velocidad limitada por la escritura y la consulta de documentación. | **Alto.** Estructura completa y convencional en minutos. | 20 archivos de la capa de servicios en una intervención; 13 700 líneas de backend en siete sesiones. | Ventaja clara de la IA en volumen y velocidad de andamiaje. |
| 2 | **Tiempo** | Medio. Distribuido de forma pareja entre diseño, escritura y depuración. | **Alto, pero redistribuido.** La escritura casi desaparece; la revisión crece. | El tiempo se concentró en verificar reglas de negocio y en diseñar restricciones de base de datos. | El tiempo total baja; su composición cambia radicalmente. |
| 3 | **Comprensión del problema** | **Alto.** Escribir obliga a entender. | **Bajo, si no se interviene.** Produce soluciones plausibles sin comprender el dominio. | Las 8 reglas críticas debieron explicitarse una por una; ninguna se infirió. | Insustituible el conocimiento humano del negocio. |
| 4 | **Detección de errores** | Medio. Depende de la experiencia y de la atención del revisor. | **Alto en lo sintáctico, bajo en lo semántico.** | La IA detectó `label for` roto y controles sin etiqueta; no habría detectado el fallo del vínculo padre–hijo sin leer la consigna. | Complementarios: la herramienta ve patrones, la persona ve propósito. |
| 5 | **Documentación** | Bajo. Es lo primero que se posterga. | **Alto.** Genera documentación extensa y consistente sin costo marginal. | 3 100 líneas de documentación técnica en nueve archivos, más comentarios que explican el *porqué* de cada decisión. | Ventaja significativa, con la reserva de que la documentación debe verificarse. |
| 6 | **Aprendizaje del equipo** | **Alto.** El error propio enseña. | **Medio, y condicionado.** Enseña si se revisa; si se acepta sin leer, no enseña nada. | Conceptos incorporados: índices únicos parciales, TOTP, niveles de aislamiento transaccional. | Depende enteramente de la disciplina de revisión. |
| 7 | **Integración** | Medio. Los contratos entre componentes se documentan mal y se rompen seguido. | **Alto.** Mantiene coherencia entre capas y clientes. | El mismo endpoint sirve a web y móvil sin variantes; los tipos de Prisma validan cada consulta en compilación. | Ventaja de la IA, potenciada por el tipado estricto. |
| 8 | **Seguridad** | Medio. Se aplican buenas prácticas conocidas. | **Alto en mecanismos, bajo en criterio.** Implementa correctamente lo que se le pide; no advierte lo que falta. | Implementó TOTP y hash de tokens sin errores; los dos defectos graves del sistema fueron de *autorización*, es decir, de reglas. | La criptografía se delega; la política de acceso, no. |
| 9 | **Mantenimiento** | Medio. Código escrito por quien lo mantiene, pero poco documentado. | **Alto, si el código se entiende.** Bien estructurado y comentado; peligroso si nadie lo leyó. | Separación en capas, módulos puros sin dependencias, advertencias explícitas sobre parámetros que deben coincidir entre paquetes. | El mantenimiento mejora sólo si la revisión fue real. |
| 10 | **Calidad general** | Medio. Homogénea y previsible. | **Alto en forma, variable en fondo.** | 275 pruebas, tipado estricto sin errores; pero ninguna verificación contra base de datos real. | La calidad formal es superior; la funcional permanece sin demostrar. |

### Lectura global

La tabla muestra un patrón consistente. **La IA es marcadamente superior en todo
lo que puede derivarse de la forma del problema** —estructura, convenciones,
documentación, integración entre capas— **y marcadamente inferior en todo lo que
requiere conocer el propósito** —reglas de negocio, política de autorización,
distinción entre catálogo abierto y conjunto cerrado.

La consecuencia práctica es que el rol humano se desplaza de *escribir código* a
*definir semántica y verificar cumplimiento*. Es un trabajo distinto, no menor, y
exige más comprensión del dominio que antes, no menos.

---

## 5. Reflexión crítica

Las respuestas que siguen se apoyan en hechos verificables del repositorio y de
la bitácora. Hemos procurado sostener un tono autocrítico: un informe que sólo
enumera aciertos no informa nada.

### 5.1 ¿En qué tareas la IA resultó genuinamente más eficiente que nuestro trabajo manual?

Identificamos tres tipos de tarea donde la ventaja fue inequívoca.

**Andamiaje estructural.** Generar veinte archivos con la misma organización de
capas, los mismos esquemas de validación y el mismo tratamiento de errores es
trabajo mecánico en el que nos cansamos y cometemos inconsistencias. La
herramienta no se cansa, y esa es toda su ventaja aquí.

**Documentación técnica.** Reconocemos que las más de 3 300 líneas de documentación no
las habríamos escrito. Es el primer entregable que posponemos bajo presión de
entrega, y su ausencia es exactamente lo que vuelve inmantenible un proyecto seis
meses más tarde.

**Implementación de algoritmos estándar.** SHA-256, HMAC y TOTP son
especificaciones públicas con vectores de prueba conocidos. Implementarlos
nosotros habría llevado una jornada y probablemente contendría un error en el
relleno de bloque —el propio test lo confirma: es el caso que más veces falla en
implementaciones caseras—. La IA los produjo correctamente y, lo decisivo,
**pudimos demostrar que eran correctos** comparándolos contra `node:crypto`.

Agregamos un cuarto caso que no habíamos anticipado: la **auditoría inicial**.
Revisar 6 600 líneas de frontend y 3 200 de backend confrontándolas contra la
consigna nos habría llevado varias jornadas. Se resolvió en una sesión, y su
resultado reorientó el proyecto entero. Fue, en retrospectiva, la intervención de
mayor impacto.

### 5.2 ¿En qué situaciones generó código que parecía correcto pero violaba una regla del negocio?

De manera sistemática, en toda regla que no hubiéramos enunciado explícitamente.
Los casos de la sección 3 son representativos: sin instrucción, el modelo de
inscripción deportiva admite los ocho deportes de la institución; el catálogo de
recorridos admite cuarenta y siete; el estado de la factura queda a cargo de la
aplicación.

Lo que más nos llamó la atención es un patrón que no esperábamos: **el código
incorrecto era siempre el más natural**. Un `@default(autoincrement())` en la
clave del recorrido es lo que cualquiera de nosotros habría escrito por defecto.
Lo correcto —un tipo enumerado cerrado de cuatro valores— exige saber de antemano
que el conjunto es cerrado.

De ahí que sea tan difícil de detectar en revisión: no se ve como un error, se ve
como código normal. Sólo aparece cuando uno lee la consigna con el código al
lado, línea por línea.

### 5.3 ¿Cómo validamos que el código asistido por IA cumplía la consigna?

Con cuatro mecanismos de rigor creciente, y reconocemos que el cuarto llegó
tarde.

**Primero, trazabilidad explícita.** Mapeamos cada regla de la consigna a su
mecanismo de cumplimiento, documentado en `modelo_de_datos.md`. La pregunta que
guía esa tabla es: *¿dónde está escrito que esto no puede pasar?*

**Segundo, verificación en el motor.** Doce restricciones `CHECK`, siete
funciones, seis disparadores y un índice único parcial. Adoptamos el criterio de
que una regla declarada *estricta* por la cátedra no puede depender de que la
capa de aplicación se acuerde de validarla.

**Tercero, pruebas sobre los datos de ejemplo.** Veintitrés pruebas auditan el
conjunto del *seed* contra las reglas de negocio, de modo que un dato de
demostración inconsistente falle antes de llegar a la base.

**Cuarto, ejecución contra PostgreSQL real.** Este mecanismo lo incorporamos
recién en la octava intervención, y fue el que más nos enseñó. Las ocho
migraciones, el seed y los 205 tests se ejecutaron contra PostgreSQL 15.18, más
quince pruebas nuevas que verifican que el motor **efectivamente rechace** lo que
declaramos imposible.

La primera ejecución falló. Volvemos sobre eso en 5.8 y 5.10, porque es el
hallazgo del que más aprendimos.

### 5.4 ¿Qué nivel de comprensión tenemos sobre el código que no escribimos línea por línea?

Es la pregunta que más nos incomoda, y la respuesta honesta es que **nuestra
comprensión es desigual**. Preferimos describir esa desigualdad antes que
declarar un dominio uniforme que no tenemos.

**Comprendemos a fondo** aquello que discutimos y decidimos: por qué el tope de
dos deportes exige un índice único parcial y no una validación en el servicio;
por qué los horarios se representan en minutos desde medianoche; por qué el
estado de la factura lo deriva un disparador en lugar de escribirlo la
aplicación; por qué el carnet digital debe funcionar sin conexión. De cada una
podemos explicar el fundamento y qué alternativas descartamos.

**Comprendemos el propósito pero no el detalle** de otros tramos. La
implementación de SHA-256 es el caso más claro: sabemos qué hace, por qué está
ahí y cómo verificamos que es correcta, pero ninguno de nosotros podría
reescribirla de memoria ni detectar a simple vista un error en su función de
compresión.

**Y hubo al menos un tramo que creímos comprender y no comprendíamos.** Al
escribir las pruebas contra el motor asumimos que una restricción `CHECK` se
evaluaría antes que un disparador `BEFORE`. En PostgreSQL es al revés. La prueba
falló y nos obligó a leer cómo se ordenan realmente esas evaluaciones. Es un
ejemplo pequeño, pero ilustra el riesgo: la confianza en que entendemos algo no
es evidencia de que lo entendamos.

**El criterio que adoptamos fue la verificabilidad.** Aceptamos código que no
comprendemos línea por línea cuando existe un mecanismo independiente que
demuestra su corrección. Para SHA-256, ese mecanismo es la comparación contra
`node:crypto` en 300 casos. Para las reglas de negocio no aceptamos ese trato:
ahí exigimos comprensión completa, porque no hay un oráculo externo contra el
cual contrastarlas.

Somos conscientes de que este criterio tiene un límite. Si mañana hubiera que
modificar la implementación criptográfica, no estaríamos en condiciones de
hacerlo sin volver a estudiarla.

### 5.5 ¿La IA aceleró el desarrollo o desplazó el esfuerzo hacia la revisión?

Ambas cosas, en proporciones que dependen del tipo de trabajo.

Para código de estructura, la aceleración es neta: escribir una capa de servicios
lleva horas y revisarla lleva minutos, porque los errores posibles son
sintácticos y el compilador los señala.

Para código que encarna reglas de negocio, el esfuerzo se desplaza casi por
completo. Escribir el modelo de inscripción deportiva toma minutos; razonar que
requiere `slot` con índice único parcial, entender por qué la validación en
aplicación es insuficiente ante concurrencia, y verificar que los datos de
ejemplo no lo violen, toma bastante más.

Queremos ser precisos en algo: **ese tiempo de revisión no es tiempo perdido, es
el tiempo que antes gastábamos escribiendo y que ahora gastamos pensando**. El
saldo neto nos resultó favorable. Pero quien espere que la IA reduzca el trabajo
intelectual va a llevarse una decepción, y —esto es lo preocupante— probablemente
va a aceptar código que no debería.

### 5.6 ¿Qué riesgos concretos identificamos al delegar decisiones de arquitectura o seguridad?

Cuatro, todos observados en este proyecto.

**Plausibilidad sin corrección.** Una decisión arquitectónica incorrecta generada
por IA *suena* razonable, porque está redactada con la misma seguridad que una
correcta. No hay señal lingüística que nos permita distinguir una buena
recomendación de una mala: hay que evaluar el contenido.

**Implementar bien lo equivocado.** La IA implementó TOTP correctamente. Si le
hubiéramos pedido un QR estático, también lo habría implementado correctamente.
**No cuestiona el requerimiento.** Que el requerimiento sea el adecuado es
responsabilidad enteramente nuestra.

**Seguridad por omisión.** Los dos defectos graves que encontramos no eran
errores de criptografía sino de *autorización*: reglas sobre quién puede ver qué.
La IA no advierte la ausencia de una regla que nadie enunció.

**Dependencias silenciosas.** El hallazgo de `config/env.ts` es ilustrativo: un
módulo que ejecuta `process.exit(1)` al importarse vuelve intesteable a todo lo
que lo arrastre. No fue advertido al escribir el código que lo importaba; lo
descubrimos cuando una prueba murió sin dejar traza.

**Cómo lo mitigamos:** documentamos toda decisión de arquitectura y de seguridad
con su justificación y las alternativas descartadas, de modo que sea revisable en
lugar de heredada sin discusión.

### 5.7 ¿Cómo influyó el uso de IA en nuestra dinámica de trabajo y en el reparto de roles?

El efecto más marcado fue el **desplazamiento del cuello de botella**. Nuestra
limitación dejó de ser cuánto código podemos escribir y pasó a ser cuánto código
podemos revisar con criterio. Es un cambio incómodo, porque revisar es menos
gratificante que escribir y cuesta más sostener la atención.

Eso tiene una consecuencia directa sobre el reparto. La división clásica por
componentes —uno hace backend, otro frontend, otro móvil— pierde buena parte de
su sentido cuando generar un módulo cuesta una sesión de trabajo. Nos resultó más
útil repartir **dominios de conocimiento y responsabilidad**: quién responde por
que las reglas de facturación sean correctas, quién por que la autorización no
tenga huecos, quién por que las migraciones se puedan aplicar.

Registramos un segundo efecto que nos parece importante señalar, aunque no nos
deje bien parados: **con IA se vuelve mucho más fácil aparentar productividad**.
Cualquiera de nosotros puede generar dos mil líneas en una tarde sin haber
comprendido ninguna, y a simple vista el resultado es indistinguible del de
alguien que las revisó una por una.

La bitácora, con sus columnas «¿Funcionó?» y «Modificaciones realizadas», es en
parte un mecanismo de control sobre eso: obliga a declarar qué se revisó
efectivamente y qué hubo que corregir. Reconocemos que completarla con honestidad
—admitiendo seis «Parcialmente» y un «No» sobre nueve intervenciones— fue
incómodo, y que la tentación de uniformar todo en «Sí» existió.

Un tercer efecto, sobre la revisión entre pares: cuando el código lo escribió una
herramienta, la revisión pierde la carga personal que suele tener. Nadie defiende
el código propio porque no es propio. Eso hizo las discusiones técnicas más
directas y menos incómodas, y lo consideramos una ganancia genuina.

### 5.8 ¿Qué haríamos distinto si tuviéramos que empezar de nuevo?

Tres cosas, en orden de importancia.

**Primero, levantaríamos la base de datos antes de escribir una sola línea.**
Esta es la autocrítica central del proyecto. Durante seis intervenciones
acumulamos ocho migraciones, siete funciones PL/pgSQL, seis disparadores y doce
restricciones `CHECK` **sin ejecutar nunca una sola sentencia**. Lo documentamos
honestamente en cada entrega, pero documentar una deuda no la salda.

Cuando finalmente ejecutamos las migraciones, **la quinta de ocho falló por
completo**: un carácter matemático (`∈`) en un comentario SQL hacía que la
migración dependiera del encoding de la base. Ninguna de nuestras verificaciones
previas —`prisma validate`, `prisma migrate diff`, typecheck, 275 pruebas— podía
detectarlo, porque ninguna ejecutaba SQL. Fue un defecto trivial de corregir y
absolutamente invisible hasta el momento de la ejecución.

Privilegiamos avanzar en alcance sobre consolidar lo construido. En retrospectiva
el orden debió ser exactamente el inverso.

**Segundo, escribiríamos la matriz de trazabilidad antes del código, no después.**
Enunciar las ocho reglas críticas y decidir de antemano dónde se haría cumplir
cada una nos habría evitado descubrirlo regla por regla, con el costo de
rediseñar sobre la marcha.

**Tercero, iniciaríamos la aplicación móvil en la fase de planificación.** La
diagnosticamos como el ítem de mayor riesgo en la auditoría y aun así quedó para
el final. Que haya salido bien no valida la decisión: fue suerte, no método.

Una cuarta, menor pero persistente: **retiraríamos antes el endpoint vulnerable
de vinculación**. Lo mantuvimos por no romper el frontend existente, y esa deuda
se arrastró por cinco fases.

### 5.9 ¿Qué tareas no delegaríamos a una IA bajo ninguna circunstancia?

Tres, con fundamentos distintos.

**La definición de las reglas de negocio.** No por desconfianza sino por
imposibilidad: la IA no tiene acceso a la información necesaria. Que sean dos
deportes y no tres, que los recorridos sean cuatro, que no se acepte efectivo,
son decisiones institucionales. Delegarlas no es arriesgado: es incoherente.

**La política de autorización.** Decidir quién puede ver qué es, en este sistema,
una decisión sobre privacidad de datos de menores. La IA puede implementar la
matriz de permisos —y lo hizo correctamente—, pero definirla exige asumir una
responsabilidad que un sistema no puede asumir.

**La aceptación final de que algo funciona.** Es la más importante y la que este
proyecto nos dejó más clara. La IA puede afirmar que el código es correcto, y
puede tener razón. Pero *decidir que está listo para que una familia lo use* es
un acto de responsabilidad profesional.

Durante seis intervenciones no tomamos esa decisión, y lo declaramos
explícitamente en cada documento. Recién tras ejecutar contra PostgreSQL podemos
afirmar que las reglas críticas se hacen cumplir. Sigue habiendo áreas donde no
podemos afirmarlo: no probamos el escaneo del QR con una cámara real ni la
aplicación móvil en un dispositivo. Eso también lo declaramos.

### 5.10 ¿Qué aprendizaje sobre el uso profesional de IA nos llevamos?

**Primero: la asimetría entre sintaxis y semántica es estructural.** No es una
limitación transitoria que la próxima versión del modelo vaya a resolver. La IA
no puede inferir una regla arbitraria porque no hay nada que inferir. Organizar
el trabajo en torno a esa asimetría —delegar la forma, retener el propósito— no
es una precaución temporal sino el modo correcto de usar la herramienta.

**Segundo: la verificación es la unidad de valor.** El aporte más sólido de este
proyecto no son las casi 16 000 líneas de backend sino las 327 pruebas, y en
particular aquellas que demuestran algo no obvio: que nuestra implementación
criptográfica coincide con la de Node en 300 casos aleatorios; que la tarea de
fin de mes se dispara exactamente doce veces por año; que un tutor sin hijos
vinculados recibe un filtro vacío que no devuelve nada; que el motor rechaza un
tercer deporte, un quinto recorrido y un comprobante sin respaldo.

Sin esas pruebas, todo lo demás sería una afirmación.

**Tercero: hay una diferencia entre verificar y ejecutar, y la aprendimos por las
malas.** Teníamos 275 pruebas en verde, typecheck limpio y el esquema validado.
Y la quinta migración falló apenas tocó un motor real. La verificación estática
es valiosa —detectó decenas de defectos— pero **no sustituye la ejecución**. Todo
artefacto que no se ejecutó es una hipótesis, por bien escrito que esté.

**Cuarto, y el más incómodo: declarar lo que no se verificó es tan parte del
trabajo como lo que sí.** Cada documento de este proyecto tiene una sección de
estado de verificación con filas marcadas como «no verificado». Fue tentador
omitirlas; un informe sin ellas luce mejor.

Pero un sistema del que se afirma más de lo que se probó es un sistema del que no
se sabe nada. La honestidad sobre los límites de lo verificado no es una
concesión a la modestia: es la única condición bajo la cual las afirmaciones
restantes conservan algún valor.

## Conclusión general

El uso de inteligencia artificial en este Trabajo Práctico Integrador nos
permitió construir, en nueve intervenciones, un sistema de tres aplicaciones con
40 modelos de datos, 140 endpoints, 9 migraciones y 327 pruebas automatizadas.
Ese volumen no habría sido alcanzable con desarrollo tradicional en el tiempo
disponible.

Pero el resultado más significativo no es el volumen. Es haber comprobado, con
casos concretos y documentados, **dónde exactamente está el límite de la
herramienta**. Ese límite no está en la complejidad técnica —la IA implementó
TOTP, transacciones serializables e índices únicos parciales sin dificultad—
sino en el acceso al propósito. Las ocho reglas de negocio de la consigna
debimos enunciarlas una por una; ninguna se infirió.

De ahí se sigue el criterio que adoptamos como aprendizaje profesional: **la IA
escribe el cómo; el propósito lo define y lo verifica quien conoce el problema.**
Esa división del trabajo no reduce la exigencia sobre el programador. La desplaza
hacia donde siempre debió estar: entender qué se está construyendo y por qué.

### Estado de la validación contra PostgreSQL

Las entregas anteriores de este informe declaraban como pendiente la ejecución
del sistema contra una base de datos real. **Esa validación se completó el 16 de
septiembre de 2026 y su resultado es el siguiente:**

| Verificación | Resultado |
|---|---|
| Aplicación de las 9 migraciones (`prisma migrate deploy`) | ✅ Correcta |
| Creación de las 40 tablas del modelo | ✅ Verificada por consulta al catálogo |
| Compilación de las 7 funciones PL/pgSQL | ✅ Verificada |
| Registro de los 6 disparadores | ✅ Verificado |
| Índice único parcial del tope de deportes | ✅ Verificado, con su cláusula `WHERE` |
| Carga del seed de demostración | ✅ Correcta |
| Reglas de negocio rechazadas por el motor | ✅ **17 de 17** |
| Suite completa del backend | ✅ **240 de 240** |
| Motor utilizado | PostgreSQL 15.18 |

Las diecisiete pruebas de reglas verifican que el motor **efectivamente rechace** lo
que declaramos imposible: un tercer deporte activo, un `slot` fuera de {1,2}, un
deporte que se superpone en horario, el borrado de un recorrido, un comprobante
sin archivo adjunto, un tutor sin rol PADRE y la reutilización de un código QR.
Verifican además que dos transferencias sucesivas salden una factura y que el
disparador derive su estado de `PARCIAL` a `PAGADA` sin intervención de la
aplicación.

**La primera ejecución falló**, y lo consignamos porque es el hallazgo del que
más aprendimos. La quinta migración abortó con
`character with byte sequence 0xe2 0x88 0x88 has no equivalent in encoding WIN1252`:
un carácter matemático en un comentario SQL volvía la migración dependiente del
encoding de la base. Corregimos los cuatro caracteres fuera de Latin-1 y forzamos
`--encoding=UTF8` en la base de pruebas, para que coincida con la de producción.

Ninguna de nuestras verificaciones previas podía haberlo detectado, porque
ninguna ejecutaba SQL. Es la confirmación empírica de la advertencia que veníamos
anotando en cada documento: **el SQL generado por Prisma es confiable; el escrito
a mano, hasta que un motor no lo ejecuta, es una hipótesis.**

En una máquina sin Docker —como la de desarrollo de este equipo— la validación se
reproduce con `pnpm --filter backend test:integracion`, que levanta PostgreSQL 15
mediante binarias embebidas. Donde haya Docker, `docker compose up -d` levanta el
mismo motor definido en `docker-compose.yml`.

### Lo que sigue pendiente

Con la misma claridad con que informamos lo anterior, declaramos lo que **no**
está verificado:

| Pendiente | Requiere |
|---|---|
| Escaneo del QR con una cámara real | Dispositivo con cámara y soporte de `BarcodeDetector` |
| Aplicación móvil en emulador o teléfono | Emulador Android o dispositivo físico |
| Envío efectivo de correos por SMTP | Casilla configurada |
| Corrida real de las tareas programadas en su fecha | Servidor en producción |
| Contraste de color medido y prueba con lector de pantalla | Navegador con herramientas de auditoría |

Estos puntos están planificados para la fase de estabilización, entre el
congelamiento del 11 de noviembre y la entrega final del 17. Los declaramos aquí
porque un informe que sólo enumera aciertos no informa nada, y porque la
diferencia entre un sistema del que se sabe algo y uno del que no se sabe nada
está justamente en la precisión con que se enuncian sus límites.

---

## Anexos

| Anexo | Documento | Contenido |
|---|---|---|
| A | `docs/bitacora_ia.md` | Bitácora completa: 7 intervenciones con prompts y comandos |
| B | `docs/plan_de_trabajo.md` | Cronograma, hitos y matriz de riesgos |
| C | `docs/informe_auditoria.md` | Estado del repositorio al 15/09/2026 |
| D | `docs/modelo_de_datos.md` | Modelo de datos y trazabilidad de las 8 reglas críticas |
| E | `docs/api_rest.md` | Servicios, controladores y matriz de autorización |
| F | `docs/facturacion_y_schedulers.md` | Circuito de cobranza y tareas programadas |
| G | `docs/frontend.md` | Vistas web, accesibilidad y diseño adaptable |
| H | `docs/aplicacion_movil.md` | Aplicación móvil de familias |
| I | `docs/carnet_digital_qr.md` | Desafío de valor agregado: justificación y diseño |
