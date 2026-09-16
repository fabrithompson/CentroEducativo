-- CreateTable
CREATE TABLE "TutorAlumno" (
    "id" SERIAL NOT NULL,
    "tutorId" INTEGER NOT NULL,
    "alumnoId" INTEGER NOT NULL,
    "parentesco" TEXT,
    "esResponsableFacturacion" BOOLEAN NOT NULL DEFAULT false,
    "creadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorAlumno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "solicitadoDesde" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TutorAlumno_alumnoId_idx" ON "TutorAlumno"("alumnoId");

-- CreateIndex
CREATE INDEX "TutorAlumno_tutorId_idx" ON "TutorAlumno"("tutorId");

-- CreateIndex
CREATE UNIQUE INDEX "TutorAlumno_tutorId_alumnoId_key" ON "TutorAlumno"("tutorId", "alumnoId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- AddForeignKey
ALTER TABLE "TutorAlumno" ADD CONSTRAINT "TutorAlumno_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorAlumno" ADD CONSTRAINT "TutorAlumno_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorAlumno" ADD CONSTRAINT "TutorAlumno_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ============================================================================
-- REGLAS DE NEGOCIO A NIVEL DE MOTOR
-- ============================================================================

-- Un alumno tiene a lo sumo UN tutor responsable de facturación: si no, no se
-- sabría a quién emitirle la factura del mes.
CREATE UNIQUE INDEX "ux_tutor_alumno_responsable_facturacion"
  ON "TutorAlumno" ("alumnoId")
  WHERE "esResponsableFacturacion" = TRUE;

-- Sólo un usuario con rol PADRE puede ser tutor. La FK garantiza que el User
-- exista, pero no dice nada de su rol.
CREATE OR REPLACE FUNCTION fn_validar_tutor_es_padre()
RETURNS TRIGGER AS $$
DECLARE
  v_role "Role";
BEGIN
  SELECT u."role" INTO v_role FROM "User" u WHERE u."id" = NEW."tutorId";

  IF v_role IS DISTINCT FROM 'PADRE' THEN
    RAISE EXCEPTION
      'Sólo un usuario con rol PADRE puede ser tutor de un alumno (el usuario % tiene rol %).',
      NEW."tutorId", COALESCE(v_role::TEXT, 'inexistente')
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_tutor_alumno_valida_rol"
  BEFORE INSERT OR UPDATE ON "TutorAlumno"
  FOR EACH ROW EXECUTE FUNCTION fn_validar_tutor_es_padre();
