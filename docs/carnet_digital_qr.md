# Carnet Digital Escolar con QR Dinámico

**Desafío de valor agregado** — Centro Educativo "TRANSFORMAR PARA EDUCAR"
**Migración:** `20260916150000_carnet_digital_qr_y_accesos`
**Versión de la API:** 0.5.0
**Fecha:** 16/09/2026

---

## 1. Justificación pedagógica

### El problema real que resuelve

Hoy, en la mayoría de las escuelas, el control de quién sube al micro y quién
entra al comedor se hace con una lista impresa y una lapicera. Eso tiene tres
consecuencias concretas:

**1. La familia no sabe si el chico subió.** Entre que el micro sale del colegio
y llega a la casa pasan cuarenta minutos. Si el chico no subió —se quedó
charlando, se fue caminando, alguien lo pasó a buscar— nadie se entera hasta que
no aparece. Ese lapso de incertidumbre es exactamente donde se vuelve grave un
problema que podría haber sido menor.

**2. El servicio se presta sin verificar que esté contratado.** Un chico que se
dio de baja del comedor en marzo puede seguir almorzando en abril sin que nadie
lo note, porque el que sirve no tiene la lista de bajas. Eso es plata que el
colegio pierde y, peor, un chico cuya familia cree que no está usando el
servicio.

**3. El micro equivocado.** Con cuatro recorridos y cincuenta chicos, que alguien
suba al que no le corresponde es cuestión de tiempo. Y un chico en el recorrido
equivocado termina a veinte cuadras de su casa.

### Qué aporta el carnet digital

| Antes | Con el carnet |
|---|---|
| Lista en papel, marcada a mano | Registro automático con hora exacta |
| La familia se entera al llegar | **Aviso en el momento en que sube** |
| No se verifica el servicio contratado | Se verifica contra la inscripción del mes |
| Cualquiera sube a cualquier micro | Sólo al recorrido que contrató |
| No queda rastro de los rechazos | Todo intento queda auditado |

La tranquilidad de la familia es el aporte central. Una madre que trabaja recibe
una notificación a las 12:05 que dice *"Franco ingresó al comedor"* y sigue con
su día. No es un dato administrativo: es saber dónde está tu hijo.

### Por qué digital y no una tarjeta plástica

Una credencial plástica se presta, se pierde y se falsifica con una
fotocopiadora. Además tiene costo de emisión, y reponerla lleva días durante los
cuales el chico no puede usar el servicio.

El carnet digital vive en un teléfono que la familia ya tiene, se reemite en
segundos, y —esto es lo que lo hace superior— **no se puede clonar con una foto**.

### Por qué también sirve para el aprendizaje institucional

El registro de accesos genera datos que hoy no existen: qué recorridos están
sobrecargados, qué días falta más gente al comedor, en qué franjas se concentran
los rechazos. Es información para decidir con evidencia en vez de con intuición.

---

## 2. Justificación técnica

### El problema: un QR estático se clona con una captura de pantalla

Si el carnet mostrara un código fijo, alcanzaría con que un chico le sacara una
foto a la pantalla de un compañero y la mostrara en el micro. Un QR impreso en
una credencial plástica tiene exactamente el mismo problema.

### La solución: TOTP (RFC 6238)

Cada alumno tiene un **secreto de 256 bits** guardado en el servidor y en el
almacenamiento seguro de su teléfono. El código se deriva así:

```
codigo = truncar( HMAC-SHA256( secreto, ⌊ tiempo / 30s ⌋ ) )  →  8 dígitos
```

Consecuencias:

- **El código cambia cada 30 segundos.** Una captura de pantalla queda inservible
  casi de inmediato.
- **El teléfono lo genera sin conexión.** Un chico esperando el micro en Fontana
  puede no tener señal. Lo único que necesita red es el lector, que está en el
  colegio o en manos del chofer.
- **El secreto nunca viaja en el QR.** Sólo viaja el resultado de la función, que
  no permite reconstruirlo.

### Las cinco defensas

| Defensa | Contra qué | Dónde |
|---|---|---|
| Rotación cada 30 s | Captura de pantalla | TOTP |
| Ventana de tolerancia ±1 | Desfasaje de reloj sin ampliar la exposición | Servidor |
| Contador cruzado con el código | Reenviar un código viejo declarando ventana nueva | Servidor |
| `@@unique(credencial, punto, contador)` | Usar el mismo código dos veces | **Motor de base de datos** |
| Reemisión con `version` | Teléfono perdido o credencial compartida | Servidor |

La cuarta merece detalle: **la protección contra repetición no depende de que la
aplicación se acuerde de verificarla.** Es una restricción única en PostgreSQL.
Si dos lectores escanean el mismo código en el mismo instante, el motor rechaza
al segundo; no hay condición de carrera posible.

### Por qué 30 segundos y 8 dígitos

- **30 segundos** es el estándar de RFC 6238 y el punto de equilibrio: bajarlo a
  10 haría que el código venza mientras el chico saca el teléfono del bolsillo;
  subirlo a 120 le daría a una foto dos minutos de utilidad.
- **8 dígitos** hacen que adivinar sea 1 en 100 millones. Con el límite de 120
  escaneos por minuto, probar a ciegas no es viable.
- **±1 ventana** da 90 segundos efectivos: cubre el desfasaje de reloj y el
  tiempo de escaneo sin regalar margen.

### Dos implementaciones del mismo protocolo

El servidor usa `node:crypto`. React Native **no expone HMAC**: `expo-crypto`
sólo hace digest de SHA-256 sobre strings, que no alcanza.

Se escribió SHA-256 y HMAC-SHA256 en JavaScript puro para la app
(`mobile/src/dominio/totp.ts`, ~200 líneas sin dependencias). Sumar una librería
de criptografía por eso no se justificaba, y además es código que conviene poder
auditar entero.

**La contracara es que hay que demostrar que son idénticas.** Por eso
`mobile/src/dominio/totp.test.ts` compara la implementación propia contra
`node:crypto` en **300 casos aleatorios** más los bordes del relleno de bloque
(55, 56, 64 bytes, que es donde se rompen las implementaciones caseras). Si
difirieran en un byte, el teléfono generaría códigos que el servidor rechaza y
el carnet no serviría para nada.

> **Si se cambia un parámetro —período, dígitos, formato del QR— hay que
> cambiarlo en los dos archivos.** Están marcados con esa advertencia.

### Qué protege y qué no

Conviene ser preciso.

**Protege contra:** captura de pantalla, reenvío de un código viejo, uso doble
del mismo código, credencial de un alumno dado de baja, y uso del servicio sin
contratarlo.

**No protege contra:** que alguien extraiga el secreto del teléfono con acceso
físico y privilegios de root. Esa es la limitación inherente de TOTP y la tienen
también los bancos. Las mitigaciones son las mismas: el secreto va en
`expo-secure-store` (Keychain / EncryptedSharedPreferences) y la credencial se
puede revocar, lo que invalida el dispositivo comprometido al instante.

**Tampoco protege contra** que un chico le preste el teléfono desbloqueado a otro.
Eso no lo resuelve la criptografía: lo resuelve que el operador vea en pantalla
el nombre y el curso del alumno, que es precisamente lo que muestra el lector.

---

## 3. Arquitectura

```
  App del tutor                Lector del personal            Servidor
  ─────────────                ───────────────────            ────────
  secreto en                   cámara / entrada
  SecureStore                  manual
       │                              │                          │
       ├─ genera código               │                          │
       │  (sin conexión)              │                          │
       ├─ muestra QR ────────────────►│                          │
       │  ETQ1|id|contador|codigo     ├─ POST /accesos/escanear ►│
       │                              │                          ├─ verifica código
       │                              │                          ├─ verifica servicio
       │                              │                          ├─ registra
       │                              │◄──── permitido/denegado ─┤
       │◄───────────── notificación ──┴──────────────────────────┤
```

### Modelo de datos

**`CredencialDigital`** — una por alumno. Guarda el secreto, la versión y si
está activa. Reemitir genera un secreto nuevo y sube la versión: los códigos del
teléfono anterior dejan de validar en el acto.

**`RegistroAcceso`** — bitácora de escaneos, **permitidos y rechazados**. Un
registro que sólo guarda los éxitos no sirve para auditar: si alguien intenta
subir a un micro que no le corresponde, Administración tiene que poder verlo.

### Los seis controles del escaneo

1. El QR tiene el formato de una credencial del colegio.
2. La credencial existe y está activa.
3. El alumno está activo.
4. El código corresponde a la ventana declarada (TOTP ±1).
5. Ese código no se usó antes en este punto de control.
6. El alumno tiene el servicio contratado este mes — y, en transporte, **en ese
   recorrido**.

---

## 4. Las tres piezas que pedía la consigna

### 4.1 Credencial en la app móvil

`mobile/src/pantallas/Carnet.tsx`. QR de 220 px, el código también en números
grandes, y una **cuenta regresiva** que no es decoración: le dice al chico y al
operador cuánto le queda de vida al código. Si está por vencer, conviene esperar
la ventana siguiente.

Al volver del segundo plano se resincroniza el reloj: mientras la app estuvo
suspendida el temporizador pudo no correr, y el QR quedaría vencido.

Incluye **reemisión que puede pedir el propio tutor**, sin esperar a que abra la
secretaría. Es quien primero se entera de que perdió el teléfono.

### 4.2 Lector para el personal

`web/frontend/js/vistas/escaner.js`, montado en los paneles de Administración y
Docentes. Usa la API `BarcodeDetector` del navegador.

Decisiones tomadas pensando en cómo se usa realmente —de pie, con una tablet,
con chicos haciendo fila:

- **La respuesta ocupa el panel entero y es verde o roja.** El operador la lee
  de reojo; no puede estar buscando un cartelito.
- **Pitido distinto** para permitido (agudo) y rechazado (grave): se distinguen
  sin mirar la pantalla.
- **Entrada manual siempre disponible.** Una pantalla rayada, el sol de frente o
  un teléfono sin batería no pueden dejar a un chico afuera del micro. El
  operador tipea el código de 8 dígitos.
- **Antirrebote de 2 segundos.** La cámara dispara varias veces sobre el mismo
  QR; sin esto, el segundo disparo daría "código reutilizado" y confundiría al
  operador.
- **El punto de control se elige una vez** y queda fijo toda la jornada.
- El endpoint **responde 200 incluso cuando deniega**: un 4xx obligaría al lector
  a distinguir entre "denegado" y "falló la conexión", que para el operador son
  situaciones muy distintas.

### 4.3 Notificación inmediata

Al permitirse el acceso, cada tutor vinculado recibe una notificación en el
campus y un correo con la hora y el detalle (recorrido o servicio).

**El aviso se dispara sin bloquear la respuesta al lector.** El operador no
puede quedarse esperando a que salga un mail con quince chicos haciendo fila
para subir. El acceso ya quedó registrado; el aviso viaja detrás. Si falla, se
loguea y el registro queda con `notificado = false`.

---

## 5. Endpoints

| Método | Ruta | Roles |
|---|---|---|
| GET | `/api/credenciales/alumno/:id` | PADRE (vinculado), ADMIN |
| POST | `/api/credenciales/alumno/:id/reemitir` | PADRE (vinculado), ADMIN |
| POST | `/api/credenciales/alumno/:id/revocar` | ADMIN |
| POST | `/api/accesos/escanear` | DOCENTE, ADMIN |
| GET | `/api/accesos` | DOCENTE, ADMIN |
| GET | `/api/accesos/alumno/:id` | validando vínculo |

`GET /api/credenciales/alumno/:id` **devuelve el secreto**. Por eso exige sesión
y verifica el vínculo tutor–alumno antes de responder: quien lo obtiene puede
generar credenciales válidas hasta que se revoque.

---

## 6. Estado de verificación

| Elemento | Estado |
|---|---|
| SHA-256 y HMAC propios contra `node:crypto` | ✅ **300 casos aleatorios + bordes de bloque** |
| El código del teléfono coincide con el del servidor | ✅ **250 ventanas comparadas** |
| Verificación, tolerancia y rechazo de códigos viejos | ✅ **21 tests** |
| Lectura del QR y rechazo de códigos ajenos | ✅ incluido arriba |
| Typecheck backend y móvil | ✅ sin errores |
| Rutas nuevas protegidas | ✅ **52 rutas** exigen autenticación |
| Suite completa | ✅ **275 tests** (205 backend + 70 móvil) |
| Escaneo real con una cámara | ❌ **No verificado** |
| Esquema y anti-repetición contra PostgreSQL | ✅ **Verificado: el motor rechaza el código repetido** |
| Flujo completo de escaneo con datos | ❌ **No verificado** |
| Notificación efectivamente recibida | ❌ **No verificado** |
| `BarcodeDetector` en el navegador del colegio | ❌ **No verificado** |

**Lo más sólido de este módulo** es que la equivalencia entre las dos
implementaciones criptográficas está demostrada, no supuesta. Es el punto donde
un error habría sido invisible hasta el día de la prueba en el micro.

**Lo que falta** es todo lo que necesita hardware: que la cámara enganche el QR
de una pantalla con brillo, que `BarcodeDetector` esté disponible en el
dispositivo que use el colegio (es API de Chromium; en Safari hay que sumar una
librería), y que la notificación llegue al teléfono de la madre.

---

## 7. Pendientes

| Pendiente | Nota |
|---|---|
| Probar el escaneo con cámara real | Lo primero al retomar |
| Respaldo para Safari / iOS | `BarcodeDetector` es de Chromium |
| Notificaciones push | Hoy el aviso es correo + campus; push llega cuando el teléfono está bloqueado |
| Modo sin conexión en el lector | Encolar escaneos y sincronizar; hoy el lector necesita red |
| Panel de control de accesos en el backoffice | El endpoint existe; falta la pantalla de historial |
| Foto del alumno en el carnet y en el lector | Refuerza el control visual frente al préstamo de teléfono |
| Semillas de credenciales | El seed todavía no emite credenciales de demostración |
