# Educar para Transformar — Campus Virtual

Plataforma del campus virtual del colegio "Educar para Transformar". Monorepo con backend en Node/Express/Prisma y frontend en React/Vite/Tailwind.

## Estructura

```
.
├── backend/    # API REST (Node + Express + Prisma + PostgreSQL)
└── frontend/   # SPA (React + TypeScript + Vite + Tailwind)
```

## Requisitos

- Node.js >= 20
- pnpm >= 9
- PostgreSQL 16

## Setup

```bash
pnpm install
```

Más instrucciones de setup, variables de entorno y comandos de desarrollo se documentarán a medida que se implementen los módulos.

## Roles

- **Estudiante** — accede a materias, actividades, notas, asistencia, foros y mensajes.
- **Docente** — gestiona materias, planes de estudio, actividades, correcciones, asistencia, calificaciones y comunicación.
- **Padre / Tutor** — visualiza el progreso del/los hijo(s), pagos, mensajes y anuncios.
- **Admin** — administra usuarios, materias, ciclos lectivos y la estructura institucional.

## Estado

En construcción — rama de trabajo: `fabri`.
