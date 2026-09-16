-- CreateEnum
CREATE TYPE "TipoTareaProgramada" AS ENUM ('FACTURACION_MENSUAL', 'RECORDATORIO_DEUDA');

-- CreateEnum
CREATE TYPE "EstadoEjecucion" AS ENUM ('EN_CURSO', 'COMPLETADA', 'FALLIDA');

-- CreateEnum
CREATE TYPE "EstadoEmail" AS ENUM ('ENVIADO', 'FALLIDO');

-- AlterTable
ALTER TABLE "NivelEducativo" ADD COLUMN     "cuotaMensual" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "EjecucionTarea" (
    "id" SERIAL NOT NULL,
    "tarea" "TipoTareaProgramada" NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "estado" "EstadoEjecucion" NOT NULL DEFAULT 'EN_CURSO',
    "iniciadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizadaEn" TIMESTAMP(3),
    "resultado" JSONB,
    "error" TEXT,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "ejecutadaPorId" INTEGER,

    CONSTRAINT "EjecucionTarea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" SERIAL NOT NULL,
    "destino" TEXT NOT NULL,
    "asunto" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "estado" "EstadoEmail" NOT NULL DEFAULT 'ENVIADO',
    "error" TEXT,
    "facturaId" INTEGER,
    "alumnoId" INTEGER,
    "ejecucionId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EjecucionTarea_estado_idx" ON "EjecucionTarea"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "EjecucionTarea_tarea_anio_mes_key" ON "EjecucionTarea"("tarea", "anio", "mes");

-- CreateIndex
CREATE INDEX "EmailLog_destino_idx" ON "EmailLog"("destino");

-- CreateIndex
CREATE INDEX "EmailLog_tipo_createdAt_idx" ON "EmailLog"("tipo", "createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_ejecucionId_idx" ON "EmailLog"("ejecucionId");

