# Métricas de entrega — después de las mejoras

Medido el 26/10/2026, 16:31:11. Ventana: 2026-10-26 → hoy.

## Pull requests

| Métrica | Valor |
| --- | --- |
| PR mergeados | 3 |
| Tiempo de PR abierto a merge (mediana) | 3 min 38 s |
| Tiempo de PR abierto a merge (promedio) | 3 min 47 s |
| Tamaño del PR, líneas cambiadas (mediana) | 632 |
| Tamaño del PR, archivos (mediana) | 8 |
| PR con al menos una revisión | 0 de 3 |
| PR que cierran un issue | 3 de 3 |

## Commits que llegaron a `main`

| Mes | Commits | Sin pasar por PR |
| --- | --- | --- |
| 2026-10 | 8 | 0 (0 %) |
| **Total** | **8** | **0 (0 %)** |

## GitHub Actions — CI

| Métrica | Valor |
| --- | --- |
| Corridas en la ventana | 6 |
| Exitosas | 6 (100 %) |
| Duración (mediana de las últimas 6) | 48 s |
| Duración (promedio) | 55 s |
| Duración (máxima) | 80 s |
| Jobs por corrida | 6, 3 |
| Corridas sobre commits de sólo documentación | 0 (0 %) |

| Paso | Promedio |
| --- | --- |
| Pruebas E2E (Selenium) › Selenium contra la pila completa (Chrome headless) | 27.0 s |
| Pruebas E2E (Selenium) › Initialize containers | 13.0 s |
| Pruebas de integración (PostgreSQL) › Pruebas de integración contra PostgreSQL | 11.3 s |
| Pruebas de integración (PostgreSQL) › Initialize containers | 10.2 s |
| Typecheck › Typecheck | 9.7 s |
| Lint (ESLint) › Instalar dependencias | 9.5 s |
| Typecheck › Instalar dependencias | 9.2 s |
| Lint (ESLint) › Instalar Node | 9.0 s |

## Railway — despliegues

| Métrica | Valor |
| --- | --- |
| Despliegues registrados | 3 |
| Construidos | 2 |
| Salteados (SKIPPED) | 1 |
| Fallidos (FAILED / CRASHED) | 0 |
| Builds repetidos sobre el mismo commit | 0 |

| Commit | Fecha | Espera (CI y cola) | Build | Arranque | Push → responde | Imagen |
| --- | --- | --- | --- | --- | --- | --- |
| ada96dc | 2026-10-26 19:25 | 54 s | 2 min 00 s | 31 s | 3 min 25 s | 447 MB |
| 342d1d7 | 2026-10-26 19:14 | 61 s | 3 min 14 s | 38 s | 4 min 53 s | 451 MB |
| **Mediana** |  | 54 s | 2 min 00 s | 31 s | 3 min 25 s |  |
