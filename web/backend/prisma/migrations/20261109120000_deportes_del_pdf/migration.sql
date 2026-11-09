-- Deportes del PDF de la cátedra.
--
-- La consigna enumera los deportes del colegio: Atletismo, Natación, Fútbol,
-- Artes Marciales, Vóleibol, Danza, Básquet y Ajedrez. El seed original había
-- cargado Handball y Hockey sobre césped en lugar de Artes Marciales y Danza.
--
-- Se renombran en el lugar, no se borran ni se crean: así las inscripciones
-- activas, los horarios y el profesor responsable se conservan, y el tope de 2
-- deportes y la validación de choques siguen funcionando sobre las mismas filas.
-- Las facturas ya emitidas no se tocan: son documentos del período en que se
-- emitieron y su detalle conserva el nombre que tenía el deporte entonces.
--
-- Cada UPDATE se protege con NOT EXISTS: si el destino ya existiera (por
-- ejemplo, alguien lo cargó a mano), el índice único sobre "nombre" haría
-- fallar la migración entera en el despliegue.

UPDATE "Deporte"
SET "nombre" = 'Artes Marciales',
    "descripcion" = 'Judo y taekwondo escolar. Técnica, disciplina y respeto, con exámenes de graduación.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "nombre" = 'Handball'
  AND NOT EXISTS (SELECT 1 FROM "Deporte" WHERE "nombre" = 'Artes Marciales');

UPDATE "Deporte"
SET "nombre" = 'Danza',
    "descripcion" = 'Danza contemporánea y folklore argentino. Muestra anual y encuentros intercolegiales.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "nombre" = 'Hockey sobre césped'
  AND NOT EXISTS (SELECT 1 FROM "Deporte" WHERE "nombre" = 'Danza');

-- La danza no se practica en la cancha: pasa al salón de usos múltiples.
UPDATE "HorarioDeporte"
SET "lugar" = 'SUM — Salón de usos múltiples'
WHERE "deporteId" IN (SELECT "id" FROM "Deporte" WHERE "nombre" = 'Danza')
  AND "lugar" = 'Polideportivo del colegio';
