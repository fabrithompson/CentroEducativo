# Métricas de entrega — línea base (antes de las mejoras)

Medido el 26/10/2026, 15:53:39. Ventana: 2026-01-01 → 2026-10-25.

## Pull requests

| Métrica | Valor |
| --- | --- |
| PR mergeados | 25 |
| Tiempo de PR abierto a merge (mediana) | 27 s |
| Tiempo de PR abierto a merge (promedio) | 1 min 48 s |
| Tamaño del PR, líneas cambiadas (mediana) | 150 |
| Tamaño del PR, archivos (mediana) | 4 |
| PR con al menos una revisión | 0 de 25 |
| PR que cierran un issue | 0 de 25 |

## Commits que llegaron a `main`

| Mes | Commits | Sin pasar por PR |
| --- | --- | --- |
| 2026-05 | 12 | 7 (58 %) |
| 2026-06 | 15 | 0 (0 %) |
| 2026-09 | 71 | 45 (63 %) |
| **Total** | **98** | **52 (53 %)** |

## GitHub Actions — CI

| Métrica | Valor |
| --- | --- |
| Corridas en la ventana | 50 |
| Exitosas | 49 (98 %) |
| Duración (mediana de las últimas 20) | 67 s |
| Duración (promedio) | 68 s |
| Duración (máxima) | 76 s |
| Jobs por corrida | 1 |
| Corridas sobre commits de sólo documentación | 21 (42 %) |

| Paso | Promedio |
| --- | --- |
| Typecheck y pruebas de integración › Initialize containers | 21.3 s |
| Typecheck y pruebas de integración › Pruebas de integración contra PostgreSQL | 11.6 s |
| Typecheck y pruebas de integración › Instalar Node | 9.2 s |
| Typecheck y pruebas de integración › Typecheck | 8.7 s |
| Typecheck y pruebas de integración › Instalar dependencias | 5.5 s |
| Typecheck y pruebas de integración › Generar el cliente de Prisma | 2.2 s |
| Typecheck y pruebas de integración › Stop containers | 2.0 s |
| Typecheck y pruebas de integración › Run actions/checkout@v4 | 1.1 s |

## Railway — despliegues

| Métrica | Valor |
| --- | --- |
| Despliegues registrados | 60 |
| Construidos | 34 |
| Salteados (SKIPPED) | 26 |
| Fallidos (FAILED / CRASHED) | 0 |
| Builds repetidos sobre el mismo commit | 16 |

| Commit | Fecha | Espera del CI | Build | Arranque | Push → responde | Imagen |
| --- | --- | --- | --- | --- | --- | --- |
| 8979101 | 2026-09-30 15:27 | 88 s | 86 s | 50 s | 3 min 44 s | 431 MB |
| cb18da8 | 2026-09-29 15:27 | 9 min 39 s | 28 s | 17 min 52 s | 27 min 59 s | 427 MB |
| ee065d3 | 2026-09-29 15:11 | 16 min 60 s | 67 s | 16 min 26 s | 34 min 33 s | 427 MB |
| a829916 | 2026-09-29 14:59 | 14 min 06 s | 58 s | 14 min 07 s | 29 min 11 s | 431 MB |
| 4b76a17 | 2026-09-29 14:45 | 19 min 26 s | 56 s | 12 min 21 s | 32 min 43 s | 431 MB |
| b8bd47c | 2026-09-29 14:10 | 2 min 31 s | 65 s | 1 min 56 s | 5 min 32 s | 431 MB |
| 0a3a200 | 2026-09-22 02:55 | 81 s | 65 s | — | — | 417 MB |
| 32dad6b | 2026-09-21 21:01 | 86 s | 77 s | — | — | 417 MB |
| ea87921 | 2026-09-21 20:54 | 78 s | 79 s | — | — | 417 MB |
| 403433d | 2026-09-21 20:40 | 25 s | 1 min 39 s | — | — | 417 MB |
| **Mediana** |  | 9 min 39 s | 58 s | 12 min 21 s | 27 min 59 s |  |

