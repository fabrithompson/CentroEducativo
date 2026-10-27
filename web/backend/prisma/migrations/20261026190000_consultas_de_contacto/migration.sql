-- Consultas del formulario de contacto del sitio público.
--
-- El formulario "Envianos un mensaje" mostraba "Mensaje enviado. Te
-- responderemos dentro de las próximas 24 hs." sin guardar ni mandar nada: la
-- consulta se perdía al recargar la página. Desde esta migración queda
-- registrada y administración la ve en su panel hasta marcarla como atendida.

-- CreateTable
CREATE TABLE "ConsultaContacto" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "atendida" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atendidaAt" TIMESTAMP(3),

    CONSTRAINT "ConsultaContacto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConsultaContacto_atendida_idx" ON "ConsultaContacto"("atendida");

-- CreateIndex
CREATE INDEX "ConsultaContacto_createdAt_idx" ON "ConsultaContacto"("createdAt");
