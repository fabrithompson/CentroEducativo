# Despliegue y operación

Cómo se despliega el sistema, qué quedó automatizado y qué sigue dependiendo del
panel de Railway. El servicio corre en `transformar-para-educar.up.railway.app` (el dominio
anterior, `backend-production-7a0d.up.railway.app`, ya no responde).

---

## 1. Migraciones automáticas

**Antes:** cada vez que cambiaba el esquema había que acordarse de correr
`prisma migrate deploy` a mano contra producción. Si alguien no se acordaba, el
código nuevo salía a servir contra una base con el esquema viejo. Eso no falla
al desplegar: falla más tarde, en la primera consulta que toca una columna que
no existe, y para entonces la versión anterior ya no está.

**Ahora:** [`.railway/railway.ts`](../.railway/railway.ts) declara el ciclo completo.
Hasta el 21/09/2026 esto vivía en un `railway.json` en la raíz, con la forma que
se muestra abajo; la migración a Infrastructure as Code está explicada en §1.1.

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

### 1.1 La migración a Infrastructure as Code

**Hecha el 21/09/2026.** Railway declaró obsoleto el formato de `railway.json`
—la CLI avisaba en cada despliegue que Config as Code funcionaba hasta el
01/12/2026—, así que la configuración pasó a
[`.railway/railway.ts`](../.railway/railway.ts) y el `railway.json` se eliminó.

**Por qué el primer intento se había frenado, que es lo que vale la pena
recordar.** Se probó con `railway config migrate`, que traduce el `railway.json`
automáticamente, y el archivo que generó declaraba un servicio llamado
`"CentroEducativo"`. El servicio real de este proyecto se llama **`backend`**.
Aplicar ese archivo no habría migrado nada: habría intentado crear un servicio
nuevo al lado del que está sirviendo. Por eso se hizo con `config pull`, que
importa la configuración real del proyecto en lugar de traducir un archivo que
puede estar equivocado.

El camino que se siguió:

```bash
# La CLI va instalada global, nunca como dependencia del repositorio: agregarla
# al package.json de la raíz rompió el workspace de pnpm una vez. Y el paquete
# de npm es sólo un envoltorio que descarga el binario en un `postinstall`, que
# pnpm bloquea por defecto: sin `--allow-build` se instala un shim vacío.
pnpm add -g @railway/cli --allow-build=@railway/cli
railway login
railway link
railway config pull     # importa la configuración REAL del proyecto
railway config plan     # muestra qué cambiaría, sin aplicar nada
railway config apply
```

`config pull` y no `config migrate`: el primero lee lo que el proyecto tiene
configurado de verdad; el segundo sólo traduce un archivo que puede estar
equivocado, que es exactamente lo que pasó acá.

Y el orden importa: **el `railway.json` no se borra hasta que `config plan` no
informe diferencias** y un despliegue nuevo muestre las migraciones aplicadas.
Borrarlo antes deja los despliegues sin `preDeployCommand`, que es justamente la
pieza que este apartado intenta asegurar.

**Un detalle que se corrigió después de migrar.** Los `watchPatterns` que trajo
el `config pull` seguían vigilando `/railway.json`, un archivo que la propia
migración eliminaba, y no incluían `.railway/`. Con eso, un cambio en la
configuración de infraestructura no habría disparado despliegue y Railway lo
habría salteado en silencio —el mismo modo de fallar que ya se había cobrado
varios despliegues del frontend, descrito en §1.4—. Ahora vigila `/.railway/**`.

> **Editar `.railway/railway.ts` no cambia nada por sí solo.** El archivo es la
> fuente declarada, pero el servicio sólo cambia cuando corre `railway config
> apply`. La corrección de los `watchPatterns` de arriba viajó en un commit y
> estuvo un rato en el repositorio mientras Railway seguía vigilando el archivo
> borrado. Un cambio de infraestructura no está hecho hasta que `config plan`
> deje de listarlo (siempre queda la línea de `restartPolicyType`, que se
> explica abajo).

**Dos rarezas de la herramienta, para no perder la tarde con ellas.**

`config plan` y `config apply` fallan con `This version of railway/iac requires
Railway CLI 5.42.1 or newer` aunque la CLI esté muy por encima de ese mínimo. El
SDK comprueba la versión con `execFileSync(process.env._)`, y los shims que
instala pnpm —`railway`, `railway.CMD`, `railway.ps1`— no son ejecutables para
Node en Windows. Hay que invocar el `railway.exe` real, que vive dentro del store
de pnpm. El mensaje de error no tiene nada que ver con la causa.

`config plan` anuncia además, en cada corrida, un cambio de `restartPolicyType`
de `null` a `ON_FAILURE` que no es real: el `config pull` original nunca capturó
ese campo, así que el motor lo ve vacío y lo vuelve a proponer siempre. La API
confirma que está puesto. No hay que confundirlo con una configuración que se
revierte sola.

> **Nunca `config pull --include-variables`.** Esa bandera descifra los valores
> de las variables no selladas y los escribe en texto plano dentro de
> `.railway/railway.ts`, que es un archivo versionado. Sin ella quedan como
> `preserve()`, que conserva lo que ya está configurado sin exponerlo.

> **Cómo verificar que ya corre, sin esperar al próximo cambio de esquema.**
> Después de un despliegue, `railway ssh --service backend -- sh -c 'cd
> web/backend && ./node_modules/.bin/prisma migrate status'` tiene que informar
> las 11 migraciones aplicadas. Si dice "have not yet been applied", el pre-deploy
> sigue sin correr y hay que aplicarlas a mano — sección 6.
>
> **Un detalle que costó horas.** `railway ssh` entra al despliegue *más
> reciente*, que no es necesariamente el que está sirviendo tráfico. Durante el
> diagnóstico la aplicación respondía consultas con normalidad mientras
> `prisma migrate status`, corrido por SSH con la misma `DATABASE_URL`, informaba
> la base vacía: eran dos contenedores distintos. Antes de sacar conclusiones de
> algo leído por SSH, conviene confirmar contra qué despliegue se está hablando.

### 1.2 El build se rompió al forzar el builder, y se arregló sacándolo

**19/09/2026.** Al integrar `railway.json` a `main`, los despliegues empezaron a
fallar en el paso de instalación, antes de construir nada:

```
RUN npm install -g corepack@0.24.1 && corepack enable
RUN pnpm i --frozen-lockfile
  TypeError [ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING]:
    A dynamic import callback was not specified.
      at .../corepack/pnpm/11.1.1/bin/pnpm.cjs:3:1
  Node.js v24.10.0
```

**La causa fue `"builder": "NIXPACKS"`.** Railway venía construyendo este
proyecto con **Railpack**, que es su builder actual, y funcionaba. El
`railway.json` traía ese campo y, al llegar a `main`, forzó el builder viejo.
Nixpacks fija corepack en la versión 0.24.1, de principios de 2024, y resolvía
`engines.node: ">=22.13"` a Node 24.10. Ese corepack ejecuta el `pnpm.cjs` que
descarga compilándolo con el módulo `vm`, sin registrar el callback de import
dinámico que Node 24 exige, y el build moría ahí.

La línea de tiempo no deja lugar a dudas:

| Despliegue | Resultado | Qué había en `main` |
|---|---|---|
| 18/09 23:36 | ✅ SUCCESS | sin `railway.json` → Railpack |
| 19/09 17:10 | ❌ FAILED | con `railway.json` → Nixpacks |
| 19/09 17:30 | ❌ FAILED | ídem |

El log del despliegue fallido lo confirma: compila contra
`/nix/store/...-nodejs-24.10.0`, que es Nixpacks; los exitosos anteriores
reportan `[railpack]`.

**La corrección es quitar el campo `builder`**, no hacer funcionar a Nixpacks.
Sin ese campo, Railway usa el builder que el servicio tiene configurado —
Railpack—, que es exactamente lo que venía funcionando. El resto de
`railway.json` se conserva: `buildCommand`, `startCommand` y el
`preDeployCommand`, que es la pieza que importa.

> **Lección, y es la que conviene recordar.** El campo se copió de un ejemplo sin
> verificar contra qué builder estaba corriendo el servicio. Un valor que parece
> documentar lo que ya pasa —"usamos Nixpacks"— puede en realidad estar
> cambiándolo. Antes de fijar un builder en el archivo hay que mirar el log de un
> despliegue que haya funcionado y ver cuál dice.

**Lo que sí se conserva del intento.** `.nvmrc` fija Node en `22.13`, la misma
versión que verifica el CI (`.github/workflows/ci.yml`). Railpack también lo
respeta. Sin eso, la versión de Node del build la elige el builder y puede
cambiar sola de un día para el otro, que es la clase de deriva que provocó este
episodio. Que producción compile sobre la misma versión que las pruebas no es un
detalle: las pruebas no dicen nada sobre una versión que nunca se probó.

> **Sobre el archivo de Infrastructure as Code.** Se había generado un
> `.railway/railway.ts` con `railway config migrate` y se retiró. El comando
> deriva el nombre del servicio del `railway.json` y había quedado
> `"CentroEducativo"`, cuando el servicio real se llama **`backend`**. Aplicar
> ese archivo no habría migrado nada: habría intentado crear un servicio nuevo.
> Cuando llegue el momento de migrar —antes del 01/12/2026— corresponde generarlo
> con `railway config pull`, que importa la configuración real del proyecto ya
> vinculado, y revisarlo con `railway config plan` antes de aplicar.


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

### 1.4 Los despliegues se saltaban sin avisar

El servicio tenía configurado en el panel un único patrón de vigilancia:

```
/web/backend/**
```

Railway sólo construye cuando un commit toca alguno de esos archivos. El resto
se registra como un despliegue en estado **SKIPPED**, con
`skippedReason: "No changes to watched files"`. No falla, no avisa: simplemente
no pasa nada, y el servicio sigue sirviendo la versión anterior.

**Eso dejaba afuera al portal entero.** `web/frontend/` no entra en
`/web/backend/**`, y el backend es quien lo sirve, con `express.static`. Una
corrección de accesibilidad, un texto, un color: nada de eso llegaba a
producción. Tampoco entraban `package.json`, `pnpm-lock.yaml` ni el propio
`railway.json`, así que un cambio de dependencias o de configuración del
despliegue quedaba igual de invisible.

Los patrones pasan a declararse en `railway.json`, que es donde se pueden
versionar y revisar:

| Patrón | Por qué |
|---|---|
| `/web/**` | Backend **y** frontend: los dos viajan en la misma imagen |
| `/package.json`, `/pnpm-lock.yaml`, `/pnpm-workspace.yaml` | Un cambio de dependencias cambia la imagen |
| `/railway.json` | Si cambia cómo se construye o arranca, hay que reconstruir |
| `/.nvmrc` | Fija la versión de Node del build |

Queda afuera a propósito lo que no entra en la imagen del backend: `mobile/`,
`docs/` y `.github/`. Un cambio ahí no necesita redesplegar nada.

> **Cómo se ve el síntoma.** `railway deployment list --service backend` muestra
> el despliegue en `SKIPPED` en lugar de `SUCCESS`. Conviene mirar esa lista
> después de un push importante: un `SKIPPED` inesperado significa que lo que se
> acaba de subir **no está corriendo**, aunque el servicio figure como Online y
> responda con normalidad.

### 1.5 El build instala sólo el backend (#38)

Railpack detecta el workspace de pnpm y, por defecto, corre
`pnpm install --frozen-lockfile` en la raíz: instala también la app móvil
(Expo, React Native, Metro), que el servicio nunca ejecuta. La imagen pesaba
431 MB y subirla llevaba unos 20 s de cada despliegue.

`railpack.json`, en la raíz, reemplaza los comandos del paso de instalación:

```json
"install": {
  "commands": ["PATH:/opt/pnpm/bin", "pnpm add -g node-gyp", "pnpm install --frozen-lockfile --prefer-offline --filter backend..."],
  "deployOutputs": []
}
```

La lista reemplaza **todos** los comandos que Railpack genera para ese paso,
incluidos los que no muestra en el plan del log. Uno de ellos agrega
`/opt/pnpm/bin` al `PATH` (la carpeta de binarios globales de pnpm 11; con pnpm
10 o anterior es `/opt/pnpm`): sin él, `pnpm add -g` falla porque esa carpeta no
está en el `PATH`. Así falló el primer build después del merge del #50, el
27/10/2026; producción siguió con el despliegue anterior. Si se actualiza pnpm
o Railpack, conviene revisar contra `core/providers/node/package_manager.go` del
repositorio de Railpack qué comandos genera.

`"deployOutputs": []` es igual de necesario, por una razón menos visible.
Railpack arma la imagen final con el `node_modules` y el código del paso
`build`; un paso definido en `railpack.json` sin `deployOutputs` se agrega
además, entero, encima de esas capas. El `/app` del paso de instalación
tiene el cliente de Prisma sin generar (se genera en `build`, con
`prisma generate`), así que al superponerse lo pisaba: la imagen se
construía bien y el servidor caía al arrancar con «@prisma/client did not
initialize yet». Así quedó producción caída el 27/10/2026, después del
arreglo del `PATH`. La lista vacía le dice a Railpack que no copie nada de
ese paso a la imagen (`core/generate/context.go`, al aplicar los pasos de la
configuración).

`node-gyp` se mantiene porque lo necesita `bcrypt`; `backend...` instala el
backend con sus dependencias (y las de la raíz, que pnpm agrega igual). Medido
el 27/10/2026 en dos clones limpios del repositorio: la instalación completa
trae **807 paquetes** —los mismos que informa el build de Railway— y la filtrada
**397**, sin ninguno de Expo ni de React Native; `pnpm build` genera
`web/backend/dist/index.js` igual.

Medido en Railway el mismo día, con el campo `image push` del log del build
(`railway logs --build <id> --json`), comparando el último build anterior al
cambio con el primero que arrancó después:

| | Paquetes | Imagen | Subida de la imagen |
|---|---|---|---|
| Antes (`75a5c5e5`) | 807 | 468,8 MB | 13,8 s |
| Después (`38008a27`) | 397 | 350,2 MB | 7,7 s |

Son 118,6 MB menos (−25 %) y la subida tarda casi la mitad. Los 431 MB del
issue #38 venían de un build anterior; la comparación válida es la de esta
tabla, con dos builds del mismo día.

`/railpack.json` también se agregó a `watchPatterns` en `.railway/railway.ts`,
para que un cambio sólo en ese archivo dispare el despliegue. Se aplicó con
`railway config apply` el 27/10/2026; hasta entonces los merges del #51 y del
#52 quedaron SKIPPED y hubo que desplegarlos a mano.

> **Aplicar un cambio de `build` o `deploy` redespliega el servicio en el
> acto**, con el último commit de la rama. `config plan` no lo dice; el plan
> fijado con `config plan --out <archivo>` sí, como `"deployEffect": "deploy"`
> en cada cambio. Conviene aplicar con un `main` ya probado, y fijar el plan
> para aplicar exactamente lo que se revisó: `config apply --plan <archivo>`.


---

## 2. Backups de la base (RNF-06)

**Resuelto** en [`.github/workflows/respaldo.yml`](../.github/workflows/respaldo.yml),
que corre todos los días a las 03:15 UTC —00:15 en Argentina, fuera del horario
escolar y después de los schedulers de facturación— y también a mano desde la
pestaña Actions.

Qué hace, en orden:

1. **Pregunta la versión del servidor** antes de nada. `pg_dump` se niega a
   volcar una base más nueva que él, así que la imagen de `postgres` se elige
   según lo que responda `SHOW server_version_num`. El día que Railway
   actualice el motor, esto sigue funcionando solo.
2. **Vuelca y verifica el archivo.** `pg_dump` cierra el volcado con una línea
   conocida; si falta, la conexión se cortó a mitad de camino y el trabajo
   falla ahí, no el día que haya que restaurar.
3. **Cifra con AES256.** El volcado tiene domicilios y teléfonos de menores y
   de sus tutores, más los hashes de contraseña. No queda en claro ni siquiera
   dentro de los artifacts privados del repositorio. Retención: 90 días.
4. **Lo restaura sobre una base limpia y cuenta.** Es un trabajo aparte que
   corre todos los días: descifra, restaura con `ON_ERROR_STOP` —si no, `psql`
   sigue de largo tras un error y declararía exitosa una restauración parcial—
   y exige al menos 30 tablas. Esto es lo que convierte "hicimos backup" en un
   hecho verificado.

Hacen falta dos secretos en el repositorio: `DATABASE_URL_RESPALDO` y
`RESPALDO_PASSPHRASE`.

Los backups administrados de Railway —PITR y snapshots del volumen— siguen
siendo recomendables y se habilitan desde el panel, pero los dos viven dentro
de la cuenta: si se pierde la cuenta o alguien borra el proyecto, se van con
él. El volcado de acá es la copia que queda afuera.

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
`developer`, en seis jobs paralelos desde el 26/10/2026:

| Job | Qué hace |
|---|---|
| Typecheck | `tsc` del backend, las semillas y la app móvil |
| Pruebas de integración (PostgreSQL) | las 12 migraciones sobre PostgreSQL 18 real —la versión de producción—, el seed, las 17 verificaciones de reglas en el motor y las 295 pruebas del backend |
| Pruebas de la app móvil | las 70 pruebas del dominio de la app |
| Lint (ESLint) | las reglas de `eslint.config.mjs` |
| Pruebas E2E (Selenium) | la pila completa con Chrome; **sólo en los PR**, para no demorar el despliegue después del merge |
| SonarCloud | análisis estático; se activa con el secreto `SONAR_TOKEN` |

Los push que sólo tocan `docs/` o archivos `.md` no disparan el CI (en los PR sí,
para que los chequeos obligatorios siempre informen). `main` está protegida: sólo
se modifica por PR y con los seis chequeos en verde. Las mediciones de antes y
después del cambio están en `docs/metricas/`.

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
| RNF-05 — Android físico | Los tres motores de navegador ya se verificaron con Playwright, y los cuatro paneles a 375 px; falta el teléfono real | Abrir la app desde Expo Go en un Android real y anotar lo que rompa |

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
