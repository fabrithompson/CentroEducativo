# Aplicación Móvil — Portal de Familias

**Proyecto:** Centro Educativo "EDUCAR PARA TRANSFORMAR"
**Paquete:** `mobile/` (workspace pnpm)
**Fecha:** 16/09/2026 · actualizado el 09/11/2026
**Plan de lo que falta:** `docs/plan_de_trabajo_mobile.md`

---

## 1. Stack

| Elemento | Elección |
|---|---|
| Framework | **Expo SDK 57** (`~57.0.23`) + React Native 0.86.3 · React 19.2.3 |
| Lenguaje | TypeScript estricto, con `noUncheckedIndexedAccess` |
| Almacenamiento de sesión | `expo-secure-store` |
| Cámara y archivos | `expo-image-picker`, `expo-document-picker` |
| Comprobante en PDF | `expo-print` (vista previa de impresión del sistema) |
| Navegación | **Estado propio, sin React Navigation** |

Expo era la recomendación de la auditoría (decisión #1): comparte TypeScript con
el resto del monorepo y produce un build instalable para la defensa.

**Sobre la navegación:** son cinco pantallas con una barra inferior. React Navigation
arrastra `react-native-gesture-handler`, `reanimated` y `screens`, todas con
código nativo. Para este alcance no se justifica. Si el flujo crece, migrar es
un cambio acotado a `App.tsx`.

---

## 2. Estructura

```
mobile/
  App.tsx                       Raíz: sesión, selector de hijo, barra inferior
  index.ts                      Punto de entrada de Expo
  app.json                      Configuración y permisos
  src/
    api/
      client.ts                 HTTP, sesión segura, refresh token
      endpoints.ts              Contrato tipado con el backend
    auth/
      SesionContext.tsx         Estado de sesión
    dominio/
      pagos.ts                  Selección de ítems y clasificación   ← testeado
      formato.ts                Importes, fechas, horarios           ← testeado
      rango.ts                  Período del filtro de cuotas         ← testeado
      totp.ts                   Código del carnet (HMAC-SHA256)      ← testeado
    pantallas/
      Ingreso.tsx
      Dashboard.tsx
      Finanzas.tsx
      PagoTransferencia.tsx
      Carnet.tsx                QR rotativo y últimos accesos
    ui/
      tema.ts                   Tokens visuales
      componentes.tsx           Tarjeta, Estado, Botón, Progreso…
```

---

## 3. Autenticación segura

### Dónde se guarda el token

El access token va a **`expo-secure-store`**: Keychain en iOS,
EncryptedSharedPreferences en Android. **No se usa AsyncStorage**, que guarda en
texto plano y en un dispositivo con root queda expuesto.

El refresh token nunca toca JavaScript: el backend lo deja en una cookie
`httpOnly` y en React Native el manejo de cookies lo hace la capa nativa
(NSURLSession en iOS, OkHttp en Android). Viaja solo.

Desde el 30/09 el backend deja **una cookie por cuenta** (`et_refresh_<id>`),
para que la web admita varias cuentas abiertas a la vez. La app manda su
`usuarioId` al renovar y al cerrar sesión, así renueva siempre la suya.

### Qué más hace la pantalla de ingreso

- **Filtra por rol.** Si entra un docente o un alumno, la app cierra la sesión
  —también en el servidor, para no dejar su cookie de refresco viva— y lo manda
  al campus web. Esta app es de tutores.
- **Opción de mostrar la contraseña.** En un teclado de teléfono equivocarse es
  la norma; esconderla siempre genera más errores que los que evita.
- `autoCapitalize="none"` y `autoCorrect={false}` en el usuario: el autocorrector
  de Android convierte "mmedina" en cualquier cosa.
- `KeyboardAvoidingView`: sin eso, en iOS el teclado tapa el botón.
- **Recuperación de contraseña** integrada con `POST /api/auth/forgot-password`.

### Cuando la sesión se cae

El cliente HTTP reintenta una vez con refresh token. Si tampoco funciona, borra
la sesión y avisa por `alCaerLaSesion`; el contexto vuelve al ingreso. **No queda
una pantalla mostrando datos de una sesión que ya no existe.**

Las llamadas concurrentes al refresh comparten una sola promesa: si tres
pantallas reciben 401 a la vez, se refresca una vez, no tres.

---

## 4. Dashboard del estudiante

Resume lo que una madre o un padre quiere ver al abrir la app:

- Ficha del alumno: nombre, curso, nivel, legajo y estado.
- **Estado de cuenta**: deuda total, avisos de cuotas vencidas y de comprobantes
  esperando validación, y acceso directo a Finanzas.
- **Servicios activos del mes**: transporte con recorrido y horarios, comedor con
  días y horario, y el costo mensual estimado desglosado.
- **Deportes**: cada uno con su grilla semanal, sede, profesor y arancel, más el
  cupo usado sobre el máximo de 2.
- **Asistencia**: porcentaje, presentes, ausentes y llegadas tarde.

Los cuatro pedidos van en paralelo con `Promise.allSettled`. **Si el de
asistencia falla, el resto igual se muestra**: en una red móvil, que una pantalla
entera se caiga porque una consulta no respondió es inaceptable. Sólo si fallan
los cuatro se muestra el error de conexión.

Tirar hacia abajo recarga (`RefreshControl`), que es el gesto que la gente ya
conoce.

---

## 5. Pagos y finanzas

### Listado de cuotas

Tres solapas —**pendientes, vencidas, pagadas**— con contador en cada una.

La clasificación usa el **`estado` que calculó el backend**, no una regla propia.
Si la app decidiera por su cuenta qué está vencido, tarde o temprano mostraría
algo distinto de lo que dice el sistema. Hay un test que fija ese criterio.

Las facturas `ANULADA` no aparecen en ninguna solapa: no son deuda ni son un pago.

Cada cuota muestra total, pagado, saldo, barra de progreso si hubo pago parcial,
y texto de vencimiento en lenguaje natural ("Vence en 5 días", "Venció hace 6
días"). El detalle desplegable trae los conceptos y las transferencias cargadas
con su estado. **Si un comprobante fue rechazado, se muestra el motivo**.

### Filtro por período

La consigna pide, por alumno, el "listado de factura y comprobantes asociados en
un período de fechas". Arriba de las solapas hay una tarjeta **Período**: por
defecto muestra todas las cuotas, y con **Filtrar** aparecen dos selectores,
*Desde* y *Hasta*, que se corren de a un mes con flechas. Abre con los últimos
tres meses, contando el actual.

El filtro lo resuelve el backend: la app manda `desde` y `hasta` (AAAA-MM-DD) a
`GET /api/padres/mis-hijos/:id/facturas`, que ya los aceptaba y filtra por
`fechaEmision`. La app no filtra nada por su cuenta.

**Se elige por mes, no por día.** La factura de un mes se emite el último día
hábil de ese mes (`fechaEmision` en `facturacion/periodos.ts`), así que "de
marzo a mayo" viaja como `2027-03-01` a `2027-05-31` y trae exactamente esas
tres cuotas. Con un selector de días, "del 5 al 20 de abril" devolvería una
lista vacía sin que la familia pudiera saber por qué. La traducción de meses a
fechas está en `dominio/rango.ts`, con 20 tests: fin de año, febrero bisiesto y
meses de 30 y 31 días.

Dos decisiones más:

- **El filtro achica el listado, no el resumen.** La deuda total y la deuda por
  concepto siguen sumando todas las cuotas. Si no, una familia que mira "marzo a
  mayo" leería "Al día" aunque deba junio.
- **Con filtro, los mensajes de lista vacía hablan del período** ("No hay cuotas
  vencidas en marzo a mayo 2027"). El "No tenés cuotas vencidas" de siempre
  sería falso si la vencida quedó fuera del rango.

Cada toque en una flecha pide la lista de nuevo. Si las respuestas llegan
desordenadas, solo cuenta la del último pedido. Así, tocar rápido no deja en
pantalla la lista de un rango que ya no es el elegido.

### Historial de deuda por ítem

Sale tal cual de `GET /api/padres/mis-hijos/:id/deuda`, con los cinco conceptos
que pide la consigna: cuota escolar, deporte 1, deporte 2, transporte y comedor.

La nota del backend —que el reparto es **prorrateado** sobre el saldo— se muestra
en pantalla. Si el tutor suma los ítems y no le da exacto, tiene que saber por qué.

### Formulario de pago por transferencia

Tres bloques:

1. **Datos bancarios del colegio**, con botón para copiar CBU y alias al
   portapapeles. Coinciden con los de la factura que emite el backend.
2. **Selector de ítems**, con el monto recalculándose al tocar y anunciándose por
   `accessibilityLiveRegion`. Si el monto elegido es menor que el saldo, avisa
   cuánto va a quedar pendiente.
3. **Carga del comprobante**: cámara, galería o PDF. Con validación previa de
   formato antes de gastar una subida.

### Comprobante de pago

La consigna pide que el sistema "emita un comprobante de pago". Cada cuota tiene
un botón **Ver comprobante**. Abre el documento que emite el backend
(`GET /api/facturacion/facturas/:id/comprobante`): el mismo que abre la web y
que va adjunto en el mail mensual. La app no arma su propia versión.

El documento trae los conceptos, el total, lo pagado, el saldo, el estado y una
sección **Transferencias acreditadas** con la fecha, el banco, el número de
operación y el importe de cada transferencia aprobada. Una cuota saldada en dos
transferencias muestra las dos. Las pendientes o rechazadas no figuran, porque
todavía no son plata acreditada. Por eso, recién después de que Administración
valida el pago, el comprobante funciona como constancia.

Se abre con `expo-print`, en la vista previa de impresión del teléfono. Desde
ahí se guarda como PDF, se comparte o se imprime, sin que la app tenga que
escribir archivos. En iOS, cerrar esa hoja sin imprimir rechaza la promesa con
"Printing did not complete". `dominio/errores.ts` lo reconoce
(`esImpresionCancelada`, con pruebas) para no mostrarlo como un error.

En la web, el botón **Ver** de "Estado de cuenta" tampoco funcionaba. Era un
enlace común a la ruta, y la ruta exige el token en el header `Authorization`,
que un enlace no manda: la pestaña mostraba `{"message":"Falta el token de
acceso."}`. Ahora el HTML se pide con el cliente de la API y se escribe en la
pestaña nueva. Si el navegador bloquea esa pestaña, el comprobante se descarga
como archivo.

---

## 6. Integración sin duplicar lógica de negocio

Este era un requisito explícito. Cómo se cumple:

| Regla | Quién la resuelve |
|---|---|
| Máximo 2 deportes | Backend. La app muestra `cupo.usado / cupo.maximo` |
| Estado de la factura | Backend (trigger). La app clasifica **por ese estado** |
| Deuda por ítem | Backend (prorrateo). La app la muestra y cita la nota |
| Acreditación del pago | Backend. La app manda el comprobante y espera |
| Comprobante duplicado, factura saldada, importe inválido | Backend. La app muestra **su** mensaje |

**Lo único que calcula la app** es la suma de los ítems marcados, y está en
`dominio/pagos.ts` con 27 tests.

La validación del formulario reproduce a propósito **sólo las reglas de formato**
—importe positivo, fecha no futura, campos obligatorios— para no gastar una
subida en algo que va a fallar. Las reglas de negocio no se replican.

### Una aclaración importante sobre el selector de ítems

La consigna pide "selector de ítems a pagar". **El backend asocia cada
comprobante a una factura entera, no a ítems sueltos**: `montoPagado` acumula y
el estado lo deriva un trigger.

Se optó por **no falsear una imputación por ítem que el backend no hace**. El
selector arma el importe, y la pantalla lo dice con todas las letras:

> *El pago se registra sobre la cuota completa. Elegir conceptos te ayuda a
> calcular cuánto transferir; Administración aplica el importe al saldo.*

Si se quiere imputación real por concepto, hay que cambiar el modelo de datos
—`ComprobantePago` tendría que referenciar ítems— y eso es una decisión de
negocio, no de la app.

---

## 7. Accesibilidad

En un teléfono, TalkBack y VoiceOver son el modo normal de uso para mucha gente.

| Medida | Dónde |
|---|---|
| Objetivos táctiles de 48dp | Todos los controles (`ALTO_TOCABLE`) |
| `accessibilityRole` y `accessibilityLabel` | Botones, casillas, solapas, barra |
| `accessibilityState` | Casillas marcadas, solapa activa, botón deshabilitado |
| `accessibilityLiveRegion` | Errores de ingreso y monto a transferir |
| `accessibilityValue` | Barra de progreso de pago |
| Datos agrupados | `Dato` lee "Saldo, $120.000" junto, no en dos partes |
| Estados con texto | Los badges nunca comunican sólo por color |

---

## 8. Configuración

La URL de la API sale de `app.json` → `extra.apiUrl`, que apunta al backend de
producción (`https://transformar-para-educar.up.railway.app`): la app abierta con
Expo Go en un teléfono funciona sin levantar nada en la computadora. Hasta el
27/10/2026 apuntaba a `backend-production-7a0d.up.railway.app`, el dominio
anterior, que ya no responde: la app no podía conectarse.

**Para desarrollar contra el backend local** hay que cambiar ese valor. En el
emulador de Android `localhost` es el propio emulador: se usa
`http://10.0.2.2:4000`, que es como el emulador ve a la máquina. En un teléfono
real, la IP de la red local (por ejemplo `http://192.168.0.15:4000`), con el
backend escuchando en `0.0.0.0`.

```bash
pnpm --filter mobile start     # o: pnpm mobile:dev
pnpm --filter mobile test
pnpm --filter mobile typecheck
```

---

## 9. Estado de verificación

| Elemento | Estado |
|---|---|
| Typecheck contra los tipos reales de React Native y Expo | ✅ `tsc --noEmit` sin errores |
| Cálculo de monto y selección de ítems | ✅ **27 tests** |
| Formato de importes, fechas y vencimientos | ✅ **19 tests** |
| Rango de meses del filtro por período | ✅ **20 tests** |
| Mensajes de error del cliente y cancelación de la impresión | ✅ **6 tests** |
| Código TOTP del carnet contra `node:crypto` | ✅ **24 tests** |
| Validación del comprobante | ✅ incluida arriba |
| Clasificación en solapas | ✅ incluida arriba |
| Suite del paquete móvil | ✅ **96 tests en verde**, todos de dominio |
| Cliente HTTP (`api/client.ts`) | ❌ **Sin pruebas automáticas** |
| Suite del monorepo | ✅ **405 tests** (309 backend + 96 móvil, al 09/11/2026) |
| Bundle de Android armado por Metro | ✅ sin errores, con `expo-print` (09/11/2026) |
| Comprobante con transferencias acreditadas | ✅ Probado en la web contra el servidor de QA local: la cuota de agosto del seed lista sus dos transferencias |
| "Ver comprobante" en el teléfono | ❌ **No verificado** |
| Render en emulador o dispositivo | ❌ **No verificado** |
| Llamadas contra el backend en ejecución | ❌ **No verificado** |
| Subida real de un comprobante | ❌ **No verificado** |
| Manejo de la cookie de refresh en iOS/Android | ❌ **No verificado** |

El typecheck no es un trámite: los tipos de React Native son estrictos, así que
cada prop de estilo, cada `accessibilityRole` y cada componente fue validado
contra las definiciones reales de la librería.

**Lo que no está probado es todo lo que necesita un dispositivo:** que las
pantallas se vean bien, que la cámara devuelva lo esperado, que el
`multipart/form-data` de React Native llegue como el backend lo espera, y que la
cookie de refresh sobreviva entre sesiones. Nada de eso se puede verificar sin
emulador.

---

## 10. Pendientes

| Pendiente | Nota |
|---|---|
| Probar en emulador Android y en un dispositivo real | Lo primero al retomar |
| Verificar el `multipart` de RN contra multer | Es donde suelen aparecer sorpresas |
| Rastreo del transporte (RF-08) | El backend está listo (`GET /api/transporte/seguimiento/:alumnoId`); falta la pantalla y un simulador de posiciones |
| Materias y profesores del hijo (RF-03) | `GET /api/padres/mis-hijos/:id` ya los devuelve; falta mostrarlos |
| Notificaciones push | La consigna las pide para el QR; en Android requieren un build de desarrollo, no Expo Go |
| Íconos e imagen de splash | `app.json` tiene los colores; faltan los assets |
| Pantalla de calificaciones | El endpoint existe y está tipado; falta la pantalla |
| Pruebas del cliente HTTP | Refresco único, oyentes de sesión caída y errores, con un `fetch` simulado |
| Modo oscuro | El tema está en tokens; falta la variante |

El orden y los responsables de cada pendiente están en
`docs/plan_de_trabajo_mobile.md`. El carnet digital con QR dinámico, que figuraba
acá como pendiente, ya está construido (`pantallas/Carnet.tsx`).
