-- Grilla horaria de las materias.
--
-- La consigna pide el reporte por docente con los "horarios de cada curso" y
-- que el administrador gestione los horarios. Hasta ahora el curso tenía sólo
-- un turno (mañana o tarde) y las materias, una carga horaria semanal sin días
-- ni horas.

-- CreateTable
CREATE TABLE "HorarioMateria" (
    "id" SERIAL NOT NULL,
    "materiaId" INTEGER NOT NULL,
    "diaSemana" "DiaSemana" NOT NULL,
    "horaInicio" INTEGER NOT NULL,
    "horaFin" INTEGER NOT NULL,
    "aula" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HorarioMateria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HorarioMateria_diaSemana_idx" ON "HorarioMateria"("diaSemana");

-- CreateIndex
CREATE UNIQUE INDEX "HorarioMateria_materiaId_diaSemana_horaInicio_key" ON "HorarioMateria"("materiaId", "diaSemana", "horaInicio");

-- AddForeignKey
ALTER TABLE "HorarioMateria" ADD CONSTRAINT "HorarioMateria_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Minutos desde medianoche: [0, 1440] y fin posterior al inicio. Igual que
-- "chk_horario_deporte_rango": un horario imposible no entra ni por la API ni
-- por un INSERT a mano.
ALTER TABLE "HorarioMateria"
  ADD CONSTRAINT "chk_horario_materia_rango"
  CHECK ("horaInicio" >= 0 AND "horaInicio" < 1440
     AND "horaFin"    > 0 AND "horaFin"   <= 1440
     AND "horaFin"    > "horaInicio");

-- ------------------------------------------------------------------
-- Grilla de las materias que ya existen
-- ------------------------------------------------------------------
-- Producción no corre el seed: sin esto, la tabla llegaría vacía y el reporte
-- por docente no tendría horarios que mostrar. Son los mismos bloques que arma
-- `armarGrilla()` en `prisma/seed-dominio.ts` (generados con esa función), y
-- cada uno se busca por nivel, curso y nombre de materia: si alguna no existe,
-- el SELECT no devuelve filas y no se inserta nada. Con ON CONFLICT, correrla
-- sobre una base que ya tiene la grilla no duplica ni falla.

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'LUNES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Álgebra y Geometría'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MARTES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Álgebra y Geometría'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MIERCOLES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Álgebra y Geometría'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MARTES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Literatura'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MIERCOLES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Literatura'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'JUEVES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Literatura'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MIERCOLES'::"DiaSemana", 630, 710
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Física'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'JUEVES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Física'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'JUEVES'::"DiaSemana", 630, 710
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Química'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'VIERNES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Química'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'VIERNES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Historia'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'LUNES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Historia'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'LUNES'::"DiaSemana", 630, 710
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Geografía'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MARTES'::"DiaSemana", 630, 710
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Geografía'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MARTES'::"DiaSemana", 720, 800
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Inglés'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MIERCOLES'::"DiaSemana", 720, 800
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Inglés'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'JUEVES'::"DiaSemana", 720, 800
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Educación Física'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'VIERNES'::"DiaSemana", 630, 710
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '1er Año' AND m."nombre" = 'Educación Física'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'JUEVES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '2do Año' AND m."nombre" = 'Álgebra y Geometría'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'VIERNES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '2do Año' AND m."nombre" = 'Álgebra y Geometría'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'LUNES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '2do Año' AND m."nombre" = 'Álgebra y Geometría'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'VIERNES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '2do Año' AND m."nombre" = 'Literatura'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'LUNES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '2do Año' AND m."nombre" = 'Literatura'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MARTES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '2do Año' AND m."nombre" = 'Literatura'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'LUNES'::"DiaSemana", 630, 710
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '2do Año' AND m."nombre" = 'Biología'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MARTES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '2do Año' AND m."nombre" = 'Biología'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MIERCOLES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '2do Año' AND m."nombre" = 'Historia'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'JUEVES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '2do Año' AND m."nombre" = 'Historia'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MIERCOLES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '2do Año' AND m."nombre" = 'Educación Física'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'JUEVES'::"DiaSemana", 630, 710
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '2do Año' AND m."nombre" = 'Educación Física'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'JUEVES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '3er Año' AND m."nombre" = 'Matemática Discreta'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'VIERNES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '3er Año' AND m."nombre" = 'Matemática Discreta'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'LUNES'::"DiaSemana", 630, 710
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '3er Año' AND m."nombre" = 'Matemática Discreta'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'VIERNES'::"DiaSemana", 630, 710
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '3er Año' AND m."nombre" = 'Química Orgánica'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'LUNES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '3er Año' AND m."nombre" = 'Química Orgánica'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'LUNES'::"DiaSemana", 720, 800
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '3er Año' AND m."nombre" = 'Geografía'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MARTES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '3er Año' AND m."nombre" = 'Geografía'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MARTES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '3er Año' AND m."nombre" = 'Educación Física'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MIERCOLES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Secundario' AND c."nombre" = '3er Año' AND m."nombre" = 'Educación Física'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MIERCOLES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '5to Grado' AND m."nombre" = 'Matemáticas'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'JUEVES'::"DiaSemana", 630, 710
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '5to Grado' AND m."nombre" = 'Matemáticas'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'VIERNES'::"DiaSemana", 630, 710
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '5to Grado' AND m."nombre" = 'Matemáticas'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'JUEVES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '5to Grado' AND m."nombre" = 'Prácticas del Lenguaje'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'VIERNES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '5to Grado' AND m."nombre" = 'Prácticas del Lenguaje'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'LUNES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '5to Grado' AND m."nombre" = 'Prácticas del Lenguaje'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'VIERNES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '5to Grado' AND m."nombre" = 'Ciencias Naturales'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'LUNES'::"DiaSemana", 720, 800
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '5to Grado' AND m."nombre" = 'Ciencias Naturales'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'LUNES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '5to Grado' AND m."nombre" = 'Ciencias Sociales'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MARTES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '5to Grado' AND m."nombre" = 'Ciencias Sociales'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MARTES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '5to Grado' AND m."nombre" = 'Educación Física'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MIERCOLES'::"DiaSemana", 630, 710
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '6to Grado' AND m."nombre" = 'Matemáticas'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'JUEVES'::"DiaSemana", 720, 800
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '6to Grado' AND m."nombre" = 'Matemáticas'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'VIERNES'::"DiaSemana", 720, 800
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '6to Grado' AND m."nombre" = 'Matemáticas'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'JUEVES'::"DiaSemana", 630, 710
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '6to Grado' AND m."nombre" = 'Prácticas del Lenguaje'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'VIERNES'::"DiaSemana", 630, 710
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '6to Grado' AND m."nombre" = 'Prácticas del Lenguaje'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'LUNES'::"DiaSemana", 630, 710
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '6to Grado' AND m."nombre" = 'Prácticas del Lenguaje'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'LUNES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '6to Grado' AND m."nombre" = 'Ciencias Naturales'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MARTES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '6to Grado' AND m."nombre" = 'Ciencias Naturales'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MIERCOLES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '6to Grado' AND m."nombre" = 'Ciencias Sociales'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'JUEVES'::"DiaSemana", 450, 530
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '6to Grado' AND m."nombre" = 'Ciencias Sociales'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;

INSERT INTO "HorarioMateria" ("materiaId", "diaSemana", "horaInicio", "horaFin")
SELECT m."id", 'MARTES'::"DiaSemana", 540, 620
FROM "Materia" m JOIN "Curso" c ON c."id" = m."cursoId" JOIN "NivelEducativo" n ON n."id" = c."nivelId"
WHERE n."nombre" = 'Primario' AND c."nombre" = '6to Grado' AND m."nombre" = 'Educación Física'
ON CONFLICT ("materiaId", "diaSemana", "horaInicio") DO NOTHING;
