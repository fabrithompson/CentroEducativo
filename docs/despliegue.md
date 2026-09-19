# Despliegue y operación

Cómo se despliega el sistema, qué quedó automatizado y qué sigue dependiendo del
panel de Railway. El servicio corre en `backend-production-7a0d.up.railway.app`.

---

## 1. Migraciones automáticas

**Antes:** cada vez que cambiaba el esquema había que acordarse de correr
`prisma migrate deploy` a mano contra producción. Si alguien no se acordaba, el
código nuevo salía a servir contra una base con el esquema viejo. Eso no falla
al desplegar: falla más tarde, en la primera consulta que toca una columna que
no existe, y para entonces la versión anterior ya no está.

**Ahora:** `railway.json`, en la raíz del repositorio, declara el ciclo completo.

```json
{
  "build":  { "builder": "NIXPACKS", "buildCommand": "pnpm build" },
  "deploy": {
    "preDeployCommand": "pnpm --filter backend prisma:deploy",
    "startCommand": "pnpm start"
  }
}
```

`preDeployCommand` es el *release command* de Railway. Corre sobre la imagen ya
construida y **antes** de que la versión nueva reciba tráfico. La propiedad que
importa es qué pasa cuando falla: el despliegue se detiene y la versión anterior
sigue sirviendo. Es lo contrario de romper en silencio — una migración que no
aplica se ve como un despliegue en rojo, no como errores 500 media hora después.

Al estar en el repositorio, la configuración viaja con el código y no hay que
reconfigurar nada a mano si se recrea el servicio.

> **No funcionó, y hay que cambiarlo.** Al ir a cargar la matrícula (19/09/2026)
> se descubrió que **este `preDeployCommand` nunca se ejecutó**: la base de
> producción tenía cero tablas y ninguna de las 9 migraciones aplicada, tres días
> después del despliegue que lo introdujo. No fue el problema del binario de
> Prisma que se anticipaba arriba. La CLI lo avisa apenas se la invoca:
>
> ```
> Config as Code (railway.json / railway.toml) is deprecated.
> Prefer Infrastructure as Code (.railway/railway.ts).
> Existing files keep working until 2026-12-01.
> ```
>
> Mientras `railway.json` se siga leyendo, conviene confirmar en el panel que el
> servicio tenga efectivamente un *pre-deploy command* configurado: lo del panel
> y lo del archivo pueden no coincidir, y gana el panel. Esa es la primera
> sospecha a descartar, porque explicaría por qué el archivo no tuvo efecto.

### 1.1 El archivo de Infrastructure as Code

`.railway/railway.ts` ya está en el repositorio, generado con
`railway config migrate` a partir del `railway.json`. Declara lo mismo: build,
start y el `preDeploy` que aplica las migraciones.

**Los dos archivos conviven a propósito, y todavía no se puede borrar el
viejo.** La diferencia está en cómo los toma Railway:

| Archivo | Cómo se aplica |
|---|---|
| `railway.json` | Lo lee Railway solo, en cada despliegue |
| `.railway/railway.ts` | Hay que aplicarlo con `railway config apply`, con sesión iniciada |

Si se retira el `railway.json` antes de esa primera aplicación, los despliegues
se quedan sin `preDeployCommand` — es decir, se rompe justamente lo que este
apartado intenta arreglar. El orden correcto es aplicar primero y borrar
después:

```bash
npx @railway/cli login
npx @railway/cli link
npx @railway/cli config plan     # muestra qué cambiaría, sin aplicar nada
npx @railway/cli config apply
```

Recién cuando `config plan` no informe diferencias y un despliegue nuevo muestre
las nueve migraciones aplicadas, corresponde eliminar `railway.json`. La fecha
límite para hacerlo es el **01/12/2026**.
>
> **Cómo verificar que ya corre, sin esperar al próximo cambio de esquema.**
> Después de un despliegue, `railway ssh --service backend -- sh -c 'cd
> web/backend && ./node_modules/.bin/prisma migrate status'` tiene que informar
> las 9 migraciones aplicadas. Si dice "have not yet been applied", el pre-deploy
> sigue sin correr y hay que aplicarlas a mano — sección 6.
>
> **Un detalle que costó horas.** `railway ssh` entra al despliegue *más
> reciente*, que no es necesariamente el que está sirviendo tráfico. Durante el
> diagnóstico la aplicación respondía consultas con normalidad mientras
> `prisma migrate status`, corrido por SSH con la misma `DATABASE_URL`, informaba
> la base vacía: eran dos contenedores distintos. Antes de sacar conclusiones de
> algo leído por SSH, conviene confirmar contra qué despliegue se está hablando.

### 1.2 El build fallaba, y por eso el pre-deploy no podía correr

**Diagnóstico del 19/09/2026.** Los despliegues venían cortándose en el paso de
instalación, antes de construir nada:

```
RUN npm install -g corepack@0.24.1 && corepack enable
RUN pnpm i --frozen-lockfile
  TypeError [ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING]:
    A dynamic import callback was not specified.
      at .../corepack/pnpm/11.1.1/bin/pnpm.cjs:3:1
  Node.js v24.10.0
```

Nixpacks fija **corepack 0.24.1**, de principios de 2024, y elegía **Node
24.10**. Ese corepack ejecuta el `pnpm.cjs` que descarga compilándolo con el
módulo `vm`, sin registrar el callback de import dinámico que Node 24 exige. El
build moría ahí.

**Esto explica el apartado anterior.** El `preDeployCommand` no es que se
ejecutara y fallara: nunca llegó a ejecutarse, porque el despliegue no pasaba
del install. El contenedor viejo siguió sirviendo tráfico con normalidad, que es
exactamente por qué el problema no se notó desde afuera.

**La causa de fondo no es corepack.** Es que el build de producción corría sobre
una combinación que ninguna prueba cubría:

| | Node | Cómo se instala pnpm |
|---|---|---|
| CI (`.github/workflows/ci.yml`) | 22.13 | `pnpm/action-setup` con la versión fija |
| Producción (antes) | 24.10 | corepack 0.24.1 |
| Producción (ahora) | 22.13 | `npm install -g pnpm@11.1.1` |

Las 344 pruebas pasaban en verde sobre una configuración distinta de la que se
desplegaba. Se corrige alineando las dos, con dos archivos en el repositorio:

- **`.nvmrc`** fija Node en `22.13`, la misma versión que el CI verifica. Sin
  esto, Nixpacks resuelve `engines.node: ">=22.13"` al Node más nuevo que haya
  disponible, y el build cambia solo de un día para el otro sin que nadie toque
  nada. Fue lo que pasó.
- **`nixpacks.toml`** reemplaza el paso de instalación por `npm install -g
  pnpm@11.1.1` más `pnpm install --frozen-lockfile`, que es lo que hace el CI.
  Corepack deja de intervenir en el build.

El `packageManager` de `package.json` se conserva: sigue siendo lo correcto para
el desarrollo local y es lo que mantiene a todos en la misma versión. Lo que se
evita es que el **build** dependa de corepack.

> **Nota.** `railway.json` declara `"builder": "NIXPACKS"` y conviene que siga
> así mientras exista `nixpacks.toml`, porque ese archivo sólo lo lee Nixpacks.
> Si se cambiara el builder a Railpack, esta configuración quedaría ignorada y
> habría que rehacerla en el formato del builder nuevo.

### 1.3 La advertencia de secretos en el log del build

El build informa, como advertencia y no como error:

```
SecretsUsedInArgOrEnv: Do not use ARG or ENV instructions for sensitive data
  (ARG "JWT_ACCESS_SECRET") · (ENV "JWT_REFRESH_SECRET")
```

Es correcta y conviene entenderla en lugar de ignorarla. Railway expone las
variables del servicio al build, y Nixpacks las traduce a instrucciones `ARG` y
`ENV` del Dockerfile que genera. Un `ENV` queda escrito en la capa de la imagen,
así que **los secretos de JWT terminan dentro de la imagen construida**, no sólo
en el entorno de ejecución. Quien pueda leer esa imagen puede leerlos.

Para el alcance de este trabajo el riesgo es acotado —la imagen no se publica en
ningún registro público—, pero conviene dejarlo asentado:

1. No se resuelve desde el repositorio: depende de cómo Railway pasa las
   variables al build.
2. La aplicación **no necesita** los secretos de JWT en tiempo de build; sólo los
   usa al ejecutarse. Si Railway permite marcar variables como exclusivas de
   runtime, corresponde hacerlo con `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`.
3. Si alguna vez esa imagen se hiciera accesible, los dos secretos se consideran
   comprometidos y hay que rotarlos. Rotarlos invalida las sesiones abiertas, que
   es justamente lo que se busca en ese caso.

---

## 2. Backups de la base (RNF-06)

**Pendiente, y no se puede resolver desde el repositorio.** Railway ofrece
backups administrados, pero se habilitan desde el panel y no hay forma de
declararlos en `railway.json`.

Pasos, en el panel de Railway:

1. Servicio **Postgres** → pestaña **Backups**.
2. Habilitar los backups programados y elegir la frecuencia. Diaria alcanza para
   el volumen de este sistema: la facturación se genera una vez por mes y el
   resto del movimiento diario son inscripciones y accesos.
3. Anotar la retención que ofrece el plan contratado. El RNF-06 pide que exista
   un backup recuperable; sin conocer la ventana de retención no se puede
   afirmar que se cumple.
4. **Probar una restauración.** Un backup que nunca se restauró no es un backup
   verificado, es un archivo. Conviene restaurar sobre un servicio nuevo y
   descartable, no sobre producción.

Hasta que eso esté hecho y probado, el RNF-06 va declarado como pendiente.

---

## 3. Variables de entorno

Las obligatorias están en `web/backend/.env.example`. Dos notas para producción:

- **`TRUST_PROXY`** no hace falta declararla. Vale 1 sola en producción, que es
  lo que corresponde detrás del edge de Railway. Sólo hay que tocarla si en
  algún momento se mete un CDN delante, porque ahí serían dos saltos.
- **`CORS_ORIGIN`** tiene que apuntar al dominio real del portal.

Por qué importa `TRUST_PROXY`: sin ella, Express toma como IP del cliente la del
socket, que detrás de un proxy es siempre la misma. Todos los limitadores de
intentos del sistema —registro, login, recuperación de contraseña, reemisión de
credenciales— cuentan por IP, así que pasarían a contar a todos los visitantes
como si fueran una sola persona. El primero que se pasa del límite deja afuera a
los demás. Ver `web/backend/src/config/env.ts`.

---

## 4. Integración continua

`.github/workflows/ci.yml` corre en cada push y cada PR contra `main` y
`developer`: typecheck, las 9 migraciones sobre PostgreSQL 15 real, el seed, las
17 verificaciones de reglas en el motor, las 253 pruebas del backend y las 70 de
la aplicación móvil.

Usa un *service container* de PostgreSQL y no `embedded-postgres`, porque las
variantes de Linux de ese paquete están deshabilitadas a propósito en
`pnpm-workspace.yaml` para no cargar unos 100 MB de binarias en la imagen que se
despliega. `scripts/test-integracion.ts` acepta `DATABASE_URL_TEST` justamente
para ese caso; sin esa variable levanta la instancia embebida, que es el camino
de la máquina de desarrollo.

---

## 5. Lo que sigue sin verificarse

| Qué | Por qué no se hizo | Qué hace falta |
|---|---|---|
| RNF-05 — Firefox, Edge y Android físico | No hay forma de abrir un navegador ni un teléfono desde el entorno de desarrollo usado | Abrir el portal en Firefox y Edge, y la app desde Expo Go en un Android real, y anotar lo que rompa |
| RNF-06 — backups | Se habilitan desde el panel de Railway | Sección 2 de este documento |
| Contraste efectivo con Lighthouse | Requiere un navegador | La paleta ya está medida y verificada en `frontend.contraste.test.ts`; falta el contraste real de cada elemento pintado |

---

## 6. Carga de matrícula y medición del RNF-03

El RNF-03 pide consultas en menos de 3 s y reportes en menos de 10 s. Con los 12
alumnos de la base de desarrollo cualquier consulta entra, y el número no dice
nada. `web/backend/scripts/carga-matricula.ts` genera una matrícula del tamaño de
una escuela real y cronometra **las funciones de servicio que ejecuta la
aplicación**, no consultas reescritas para la ocasión.

### Medición registrada (19/09/2026, producción, 5012 alumnos activos)

| Qué | Peor de 3 | Umbral | |
|---|---|---|---|
| Listado de alumnos paginado (50) | 2.40 s | 3 s | cumple |
| Búsqueda por apellido | 0.66 s | 3 s | cumple |
| `alumnos-por-materia` (RF-06) — 9678 filas, 27 materias | 4.93 s | 10 s | cumple |
| `alumnos-por-deporte` | 4.15 s | 10 s | cumple |
| `morosidad` | 3.60 s | 10 s | cumple |

Dos advertencias, porque estos números solos dicen de más:

- Se tomaron **desde fuera de Railway**, por el proxy TCP público, así que cada
  consulta paga una latencia de internet que la aplicación desplegada no paga:
  habla con `postgres.railway.internal`, en el mismo centro de datos. Son una
  cota pesimista. Las mismas mediciones en local, con la misma carga, dan entre
  0.01 y 0.03 s.
- El listado paginado, con 2.40 s sobre un umbral de 3 s, es el único que queda
  cerca. Si alguna vez aprieta, el lugar donde mirar es el
  `ORDER BY apellido, nombres`: hoy ordena la matrícula activa entera para
  devolver 50 filas, y un índice compuesto sobre esas dos columnas es la salida.

### Cómo correrlo

Los tres modos son explícitos y **ninguno que escriba funciona sin `--confirmar`**.
Antes de escribir, el script informa contra qué base va a trabajar: puede terminar
apuntado a producción con un `railway run`, y ahí la diferencia entre medir y
arruinar la base es una variable de entorno.

```bash
# medir, sin escribir nada
pnpm --filter backend matricula:medir

# cargar
pnpm --filter backend exec tsx scripts/carga-matricula.ts --cantidad=5000 --confirmar

# deshacer
pnpm --filter backend exec tsx scripts/carga-matricula.ts --limpiar --confirmar
```

Contra producción, anteponiendo el entorno de Railway:

```bash
npx @railway/cli run --service Postgres -- sh -c \
  'cd web/backend && DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm exec tsx scripts/carga-matricula.ts --medir'
```

> En PowerShell estos comandos no se pegan de a bloques: usan sintaxis POSIX
> (`sh -c`, `&&`, `$VAR` entre comillas simples). Conviene correrlos desde Git
> Bash y de a uno.

### Por qué el borrado es exacto

Todo lo que el script crea queda marcado: el legajo arranca con `CARGA-` y el DNI
sale de 90.000.000 para arriba, donde el padrón argentino todavía no llega. Eso
permite borrar exactamente lo cargado sin tocar un solo alumno real. Una carga de
prueba que no se puede deshacer con precisión no es una prueba, es una
contaminación.

### Si la base de producción está vacía

Es lo que pasó el 19/09/2026, por lo de la sección 1. El orden es:

```bash
npx @railway/cli run --service Postgres -- sh -c \
  'cd web/backend && DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm exec prisma migrate deploy'

npx @railway/cli run --service Postgres -- sh -c \
  'cd web/backend && DATABASE_URL="$DATABASE_PUBLIC_URL" pnpm exec tsx prisma/seed-sin-usuarios.ts'
```

El seed del dominio no es opcional: sin cursos, la carga no tiene dónde colgar los
alumnos y falla con un mensaje que lo dice.
