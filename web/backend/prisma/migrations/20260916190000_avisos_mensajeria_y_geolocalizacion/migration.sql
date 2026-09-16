-- CreateEnum
CREATE TYPE "TipoAviso" AS ENUM ('CAMBIO_HORARIO', 'AUSENCIA_PROFESOR', 'GENERAL');

-- CreateEnum
CREATE TYPE "CanalMensaje" AS ENUM ('SMS', 'WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "EstadoMensaje" AS ENUM ('PENDIENTE', 'ENVIADO', 'FALLIDO', 'SIN_TELEFONO');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "telefono" TEXT;

-- CreateTable
CREATE TABLE "AvisoMasivo" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoAviso" NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "cursoId" INTEGER,
    "materiaId" INTEGER,
    "deporteId" INTEGER,
    "creadoPorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvisoMasivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MensajeEnviado" (
    "id" SERIAL NOT NULL,
    "avisoId" INTEGER NOT NULL,
    "destinatarioId" INTEGER NOT NULL,
    "alumnoId" INTEGER,
    "telefono" TEXT,
    "canal" "CanalMensaje" NOT NULL,
    "estado" "EstadoMensaje" NOT NULL DEFAULT 'PENDIENTE',
    "referenciaExterna" TEXT,
    "error" TEXT,
    "enviadoEn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MensajeEnviado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosicionTransporte" (
    "id" SERIAL NOT NULL,
    "recorridoId" INTEGER NOT NULL,
    "latitud" DOUBLE PRECISION NOT NULL,
    "longitud" DOUBLE PRECISION NOT NULL,
    "velocidad" DOUBLE PRECISION,
    "precision" DOUBLE PRECISION,
    "registradoEn" TIMESTAMP(3) NOT NULL,
    "dispositivo" TEXT,
    "recibidoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosicionTransporte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvisoMasivo_tipo_createdAt_idx" ON "AvisoMasivo"("tipo", "createdAt");

-- CreateIndex
CREATE INDEX "MensajeEnviado_avisoId_estado_idx" ON "MensajeEnviado"("avisoId", "estado");

-- CreateIndex
CREATE INDEX "MensajeEnviado_destinatarioId_idx" ON "MensajeEnviado"("destinatarioId");

-- CreateIndex
CREATE INDEX "PosicionTransporte_recorridoId_registradoEn_idx" ON "PosicionTransporte"("recorridoId", "registradoEn");

-- AddForeignKey
ALTER TABLE "AvisoMasivo" ADD CONSTRAINT "AvisoMasivo_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvisoMasivo" ADD CONSTRAINT "AvisoMasivo_materiaId_fkey" FOREIGN KEY ("materiaId") REFERENCES "Materia"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvisoMasivo" ADD CONSTRAINT "AvisoMasivo_deporteId_fkey" FOREIGN KEY ("deporteId") REFERENCES "Deporte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvisoMasivo" ADD CONSTRAINT "AvisoMasivo_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajeEnviado" ADD CONSTRAINT "MensajeEnviado_avisoId_fkey" FOREIGN KEY ("avisoId") REFERENCES "AvisoMasivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajeEnviado" ADD CONSTRAINT "MensajeEnviado_destinatarioId_fkey" FOREIGN KEY ("destinatarioId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajeEnviado" ADD CONSTRAINT "MensajeEnviado_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosicionTransporte" ADD CONSTRAINT "PosicionTransporte_recorridoId_fkey" FOREIGN KEY ("recorridoId") REFERENCES "RecorridoTransporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

