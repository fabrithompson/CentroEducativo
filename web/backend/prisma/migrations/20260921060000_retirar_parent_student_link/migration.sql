-- Retira `ParentStudentLink`, la tabla de vínculos del primer sprint.
--
-- Convivía con `TutorAlumno` como segunda fuente de verdad, y esa duplicación
-- no era inocua: las notas, la asistencia y las cuotas resolvían el vínculo
-- contra esta tabla mientras el portal del tutor, la app móvil y la
-- facturación lo resolvían contra `TutorAlumno`. Un vínculo cargado desde el
-- backoffice servía para una mitad del sistema y no para la otra.
--
-- Diferencias entre las dos, que son el motivo de fondo del reemplazo:
--
--   * `ParentStudentLink` unía dos cuentas de usuario. `TutorAlumno` une el
--     tutor con el `Alumno` del dominio, de modo que un alumno sin cuenta
--     —los de nivel inicial, por ejemplo— también puede tener tutor.
--   * `TutorAlumno` registra parentesco, quién es responsable de facturación
--     y quién creó el vínculo. Nada de eso existía acá.
--   * Un disparador verifica que el tutor tenga rol PADRE, y un índice único
--     parcial admite un solo responsable de facturación por alumno.

-- ------------------------------------------------------------------
-- 1. Rescatar lo que sólo exista en la tabla vieja
-- ------------------------------------------------------------------
-- El salto de cuenta de usuario a alumno se hace por `Alumno.userId`. Un
-- vínculo cuyo estudiante no tenga ficha de alumno no se puede trasladar: se
-- informa más abajo en vez de perderse en silencio.

INSERT INTO "TutorAlumno" ("tutorId", "alumnoId", "parentesco", "esResponsableFacturacion", "createdAt")
SELECT
  psl."padreId",
  a."id",
  NULL,
  FALSE,
  NOW()
FROM "ParentStudentLink" psl
JOIN "Alumno" a ON a."userId" = psl."estudianteId"
JOIN "User" u ON u."id" = psl."padreId" AND u."role" = 'PADRE'
ON CONFLICT ("tutorId", "alumnoId") DO NOTHING;

-- ------------------------------------------------------------------
-- 2. Avisar de lo que no se pudo trasladar
-- ------------------------------------------------------------------
-- No aborta la migración: son vínculos de una tabla que ya no se consulta
-- desde ningún endpoint. Pero queda en el log del despliegue, que es donde
-- hay que mirarlo si alguien reclama que perdió un hijo de su listado.

DO $$
DECLARE
  huerfanos INT;
BEGIN
  SELECT COUNT(*) INTO huerfanos
  FROM "ParentStudentLink" psl
  LEFT JOIN "Alumno" a ON a."userId" = psl."estudianteId"
  WHERE a."id" IS NULL;

  IF huerfanos > 0 THEN
    RAISE WARNING 'ParentStudentLink: % vínculo(s) no se trasladaron porque el estudiante no tiene ficha de alumno.', huerfanos;
  END IF;
END $$;

-- ------------------------------------------------------------------
-- 3. Eliminar la tabla
-- ------------------------------------------------------------------

DROP TABLE "ParentStudentLink";
