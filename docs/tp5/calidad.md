# Controles de calidad del código

Qué controla cada herramienta, dónde corre y cómo se usa. Son cuatro capas, de
la más cercana a quien escribe el código a la más lejana:

| Capa | Herramienta | Cuándo corre | Qué bloquea |
|---|---|---|---|
| Editor | ESLint (extensión de VS Code) | Mientras se escribe | Nada: subraya y corrige al guardar |
| Commit local | Husky + lint-staged | `git commit` | El commit, si hay errores de lint, de formato o un mensaje fuera de Conventional Commits |
| Pull request | GitHub Actions + protección de `main` | Cada push a un PR | El merge, si falla typecheck, lint, integración, móvil o E2E |
| Análisis central | SonarCloud | Cada PR y cada push a `main` | El merge, si no pasa el quality gate (una vez activado) |

---

## 1. Linter: ESLint

Configuración única para todo el monorepo en [`eslint.config.mjs`](../../eslint.config.mjs):
TypeScript en el backend y la app móvil, JavaScript plano en el frontend, y Node
en los scripts.

```bash
pnpm lint          # todo el repositorio
pnpm lint:fix      # corrige lo que se puede corregir solo
```

**Errores** (bloquean): variables sin declarar, `==` en lugar de `===`, `var`,
`let` que nunca se reasigna, expresiones sin efecto. **Advertencias** (no
bloquean): `any` explícito y variables sin usar. Son deuda del código anterior
y se van bajando de a poco.

Al adoptarlo, el 26/10/2026, encontró 36 errores en 132 archivos. Treinta y
tres eran globales que la configuración no conocía (las funciones de `toast.js`
y los scripts `.mjs` de Node). Los otros tres eran reales: un `let` que debía
ser `const` en el TOTP de la app móvil, que se corrigió, y dos `ok ? a++ : b++`
en el scheduler, un modismo válido que se habilitó en la regla.

**En el editor.** Al abrir el repositorio, VS Code sugiere instalar las
extensiones de [`.vscode/extensions.json`](../../.vscode/extensions.json).
[`.vscode/settings.json`](../../.vscode/settings.json) activa la corrección al
guardar. [`.editorconfig`](../../.editorconfig) fija sangría, fin de línea y
codificación para cualquier editor.

## 2. Pre-commit hooks: Husky

Se instalan solos con `pnpm install`, por el script `prepare`.

- **`pre-commit`**: ESLint sobre los archivos en stage (no sobre todo el
  repositorio, para que sea rápido), y `git diff --cached --check`, que
  rechaza espacios al final de línea y marcadores de conflicto olvidados.
- **`commit-msg`**: exige Conventional Commits (`feat(alumnos): …`,
  `fix: …`), la convención del plan de trabajo.

En el build de Railway no hay `.git`; Husky lo detecta, avisa y sigue sin
fallar.

## 3. Políticas de pull request

- **Protección de `main`**: no se puede pushear directo; todo entra por PR y
  sólo se mergea con los chequeos del CI en verde.
- **[`CODEOWNERS`](../../.github/CODEOWNERS)**: GitHub pide revisión a los dos
  integrantes en cada PR.
- **[Plantilla de PR](../../.github/pull_request_template.md)**: obliga a
  vincular el issue (`Closes #N`) y trae la lista de revisión por pares.

## 4. Pruebas E2E: Selenium WebDriver

```bash
pnpm --filter backend test:e2e
```

Levanta PostgreSQL (embebido en la máquina de desarrollo, service container en
el CI), aplica las migraciones, carga el seed, arranca la API con el frontend y
corre [`web/backend/e2e/`](../../web/backend/e2e/) con un navegador real en modo
headless: Edge en Windows y Chrome en el CI. Selenium Manager descarga el driver
que corresponde a la versión del navegador.

En el CI corre sólo en los PR. En el push a `main` no se repite: ya pasó antes
de mergear, y Railway no despliega hasta que el CI termina.

## 5. SonarCloud

El repositorio ya tiene [`sonar-project.properties`](../../sonar-project.properties)
y el job `sonarcloud` en el CI. **Falta activarlo**, porque requiere iniciar
sesión con la cuenta de GitHub del dueño del repositorio:

1. Entrar a <https://sonarcloud.io> → **Log in with GitHub** con `fabrithompson`.
2. **+ → Analyze new project** → elegir `CentroEducativo`. Es gratis para
   repositorios públicos. Si pide crear una organización, usar `fabrithompson`.
3. En el proyecto: **Administration → Analysis Method** → desactivar
   **Automatic Analysis**. Si queda activo, el análisis desde el CI falla.
4. En la misma pantalla, **GitHub Actions** → copiar el token.
5. En GitHub: **Settings → Secrets and variables → Actions → New repository
   secret** → nombre `SONAR_TOKEN`, valor: el token.
6. Volver a correr el CI de cualquier PR. El job `SonarCloud` pasa a analizar,
   y el quality gate aparece como chequeo del PR.

Si la clave del proyecto o la organización que crea SonarCloud no coinciden con
`sonar-project.properties`, hay que corregirlas en ese archivo.
