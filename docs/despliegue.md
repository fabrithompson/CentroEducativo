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

> **Verificar en el primer despliegue.** Esta configuración no se pudo probar
> desde la máquina de desarrollo: hace falta un despliegue real. Lo que hay que
> mirar en los logs es que el paso de pre-deploy encuentre el binario de Prisma.
> `prisma` es una `devDependency`, así que si el build llegara a podar las
> dependencias de desarrollo, el comando fallaría con "prisma: not found". Si
> pasa eso, la salida es mover `prisma` a `dependencies` en
> `web/backend/package.json`. No debería hacer falta: el build ya ejecuta
> `prisma generate`, de modo que el binario tiene que estar presente igual.

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
| RNF-03 — tiempos con la matrícula completa | La base de desarrollo tiene 12 alumnos; los umbrales (3 s en consultas, 10 s en reportes) no se pueden medir con ese volumen | Cargar una matrícula realista y cronometrar los reportes, sobre todo `alumnos-por-materia` y `morosidad`, que recorren toda la tabla |
| RNF-06 — backups | Se habilitan desde el panel de Railway | Sección 2 de este documento |
| Contraste efectivo con Lighthouse | Requiere un navegador | La paleta ya está medida y verificada en `frontend.contraste.test.ts`; falta el contraste real de cada elemento pintado |
