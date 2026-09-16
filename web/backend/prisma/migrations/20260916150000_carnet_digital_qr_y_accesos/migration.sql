-- CreateEnum
CREATE TYPE "PuntoControl" AS ENUM ('TRANSPORTE', 'COMEDOR');

-- CreateEnum
CREATE TYPE "ResultadoAcceso" AS ENUM ('PERMITIDO', 'DENEGADO_CODIGO_INVALIDO', 'DENEGADO_CODIGO_REUTILIZADO', 'DENEGADO_CREDENCIAL_REVOCADA', 'DENEGADO_ALUMNO_INACTIVO', 'DENEGADO_SIN_SERVICIO', 'DENEGADO_OTRO_RECORRIDO');

-- CreateTable
CREATE TABLE "CredencialDigital" (
    "id" SERIAL NOT NULL,
    "alumnoId" INTEGER NOT NULL,
    "secreto" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "emitidaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocadaEn" TIMESTAMP(3),
    "motivoRevocacion" TEXT,
    "emitidaPorId" INTEGER,

    CONSTRAINT "CredencialDigital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistroAcceso" (
    "id" SERIAL NOT NULL,
    "credencialId" INTEGER,
    "alumnoId" INTEGER,
    "punto" "PuntoControl" NOT NULL,
    "resultado" "ResultadoAcceso" NOT NULL,
    "motivo" TEXT,
    "contador" INTEGER,
    "recorridoId" INTEGER,
    "comedorId" INTEGER,
    "operadorId" INTEGER,
    "dispositivo" TEXT,
    "notificado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroAcceso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CredencialDigital_alumnoId_key" ON "CredencialDigital"("alumnoId");

-- CreateIndex
CREATE INDEX "CredencialDigital_activa_idx" ON "CredencialDigital"("activa");

-- CreateIndex
CREATE INDEX "RegistroAcceso_alumnoId_createdAt_idx" ON "RegistroAcceso"("alumnoId", "createdAt");

-- CreateIndex
CREATE INDEX "RegistroAcceso_punto_createdAt_idx" ON "RegistroAcceso"("punto", "createdAt");

-- CreateIndex
CREATE INDEX "RegistroAcceso_resultado_idx" ON "RegistroAcceso"("resultado");

-- CreateIndex
CREATE UNIQUE INDEX "RegistroAcceso_credencialId_punto_contador_key" ON "RegistroAcceso"("credencialId", "punto", "contador");

-- AddForeignKey
ALTER TABLE "CredencialDigital" ADD CONSTRAINT "CredencialDigital_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredencialDigital" ADD CONSTRAINT "CredencialDigital_emitidaPorId_fkey" FOREIGN KEY ("emitidaPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAcceso" ADD CONSTRAINT "RegistroAcceso_credencialId_fkey" FOREIGN KEY ("credencialId") REFERENCES "CredencialDigital"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAcceso" ADD CONSTRAINT "RegistroAcceso_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAcceso" ADD CONSTRAINT "RegistroAcceso_recorridoId_fkey" FOREIGN KEY ("recorridoId") REFERENCES "RecorridoTransporte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAcceso" ADD CONSTRAINT "RegistroAcceso_comedorId_fkey" FOREIGN KEY ("comedorId") REFERENCES "Comedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAcceso" ADD CONSTRAINT "RegistroAcceso_operadorId_fkey" FOREIGN KEY ("operadorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

