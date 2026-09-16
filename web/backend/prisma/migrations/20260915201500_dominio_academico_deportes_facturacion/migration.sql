-- CreateEnum
CREATE TYPE "Turno" AS ENUM ('MANANA', 'TARDE', 'JORNADA_COMPLETA');

-- CreateEnum
CREATE TYPE "DiaSemana" AS ENUM ('LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO');

-- CreateEnum
CREATE TYPE "EstadoAlumno" AS ENUM ('ACTIVO', 'INACTIVO', 'EGRESADO', 'SUSPENDIDO');

-- CreateEnum
CREATE TYPE "EstadoProfesor" AS ENUM ('ACTIVO', 'INACTIVO', 'LICENCIA');

-- CreateEnum
CREATE TYPE "EstadoInscripcion" AS ENUM ('ACTIVA', 'BAJA');

-- CreateEnum
CREATE TYPE "CodigoRecorrido" AS ENUM ('R1', 'R2', 'R3', 'R4');

-- CreateEnum
CREATE TYPE "TurnoTransporte" AS ENUM ('IDA', 'VUELTA', 'IDA_Y_VUELTA');

-- CreateEnum
CREATE TYPE "TipoItemFactura" AS ENUM ('MATRICULA', 'CUOTA', 'TRANSPORTE', 'COMEDOR', 'DEPORTE', 'RECARGO', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoFactura" AS ENUM ('PENDIENTE', 'EN_REVISION', 'PARCIAL', 'PAGADA', 'VENCIDA', 'ANULADA');

-- CreateEnum
CREATE TYPE "EstadoComprobante" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO');

-- CreateTable
CREATE TABLE "NivelEducativo" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "orden" INTEGER NOT NULL,
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NivelEducativo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Curso" (
    "id" SERIAL NOT NULL,
    "nivelId" INTEGER NOT NULL,
    "nombre" TEXT NOT NULL,
    "division" TEXT NOT NULL DEFAULT 'A',
    "turno" "Turno" NOT NULL DEFAULT 'MANANA',
    "anioLectivo" INTEGER NOT NULL,
    "cupoMaximo" INTEGER NOT NULL DEFAULT 30,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Curso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Materia" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "cursoId" INTEGER NOT NULL,
    "profesorId" INTEGER,
    "cargaHoraria" INTEGER NOT NULL DEFAULT 4,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Materia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alumno" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "legajo" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "fechaNacimiento" DATE NOT NULL,
    "domicilio" TEXT NOT NULL,
    "localidad" TEXT NOT NULL DEFAULT 'Resistencia',
    "provincia" TEXT NOT NULL DEFAULT 'Chaco',
    "telefono" TEXT,
    "email" TEXT,
    "cursoId" INTEGER NOT NULL,
    "estado" "EstadoAlumno" NOT NULL DEFAULT 'ACTIVO',
    "fechaIngreso" DATE NOT NULL,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Alumno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Profesor" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER,
    "legajo" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "apellido" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "especialidad" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telefono" TEXT,
    "domicilio" TEXT,
    "estado" "EstadoProfesor" NOT NULL DEFAULT 'ACTIVO',
    "fechaIngreso" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Profesor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deporte" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "profesorResponsableId" INTEGER NOT NULL,
    "arancelMensual" DECIMAL(10,2) NOT NULL,
    "cupoMaximo" INTEGER NOT NULL DEFAULT 25,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorarioDeporte" (
    "id" SERIAL NOT NULL,
    "deporteId" INTEGER NOT NULL,
    "nivelId" INTEGER NOT NULL,
    "diaSemana" "DiaSemana" NOT NULL,
    "horaInicio" INTEGER NOT NULL,
    "horaFin" INTEGER NOT NULL,
    "lugar" TEXT NOT NULL DEFAULT 'Polideportivo del colegio',
    "profesorId" INTEGER,
    "cupoMaximo" INTEGER NOT NULL DEFAULT 25,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HorarioDeporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InscripcionDeporte" (
    "id" SERIAL NOT NULL,
    "alumnoId" INTEGER NOT NULL,
    "deporteId" INTEGER NOT NULL,
    "slot" INTEGER NOT NULL,
    "estado" "EstadoInscripcion" NOT NULL DEFAULT 'ACTIVA',
    "fechaAlta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaBaja" TIMESTAMP(3),
    "observacion" TEXT,

    CONSTRAINT "InscripcionDeporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecorridoTransporte" (
    "id" SERIAL NOT NULL,
    "codigo" "CodigoRecorrido" NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "zonas" TEXT NOT NULL,
    "arancelMensual" DECIMAL(10,2) NOT NULL,
    "capacidad" INTEGER NOT NULL DEFAULT 45,
    "choferNombre" TEXT,
    "patente" TEXT,
    "horaSalida" INTEGER NOT NULL,
    "horaRegreso" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecorridoTransporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InscripcionTransporte" (
    "id" SERIAL NOT NULL,
    "alumnoId" INTEGER NOT NULL,
    "recorridoId" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "turno" "TurnoTransporte" NOT NULL DEFAULT 'IDA_Y_VUELTA',
    "estado" "EstadoInscripcion" NOT NULL DEFAULT 'ACTIVA',
    "fechaAlta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaBaja" TIMESTAMP(3),

    CONSTRAINT "InscripcionTransporte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comedor" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "diasPorSemana" INTEGER NOT NULL,
    "arancelMensual" DECIMAL(10,2) NOT NULL,
    "cupoMaximo" INTEGER NOT NULL DEFAULT 120,
    "horaServicio" INTEGER NOT NULL DEFAULT 720,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InscripcionComedor" (
    "id" SERIAL NOT NULL,
    "alumnoId" INTEGER NOT NULL,
    "comedorId" INTEGER NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "estado" "EstadoInscripcion" NOT NULL DEFAULT 'ACTIVA',
    "fechaAlta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaBaja" TIMESTAMP(3),

    CONSTRAINT "InscripcionComedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factura" (
    "id" SERIAL NOT NULL,
    "numero" TEXT NOT NULL,
    "alumnoId" INTEGER NOT NULL,
    "tutorId" INTEGER,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "fechaEmision" DATE NOT NULL,
    "fechaVencimiento" DATE NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "recargo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(10,2) NOT NULL,
    "montoPagado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "estado" "EstadoFactura" NOT NULL DEFAULT 'PENDIENTE',
    "pdfUrl" TEXT,
    "observaciones" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Factura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ItemFactura" (
    "id" SERIAL NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "tipo" "TipoItemFactura" NOT NULL,
    "descripcion" TEXT NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "precioUnitario" DECIMAL(10,2) NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "referenciaId" INTEGER,

    CONSTRAINT "ItemFactura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComprobantePago" (
    "id" SERIAL NOT NULL,
    "facturaId" INTEGER NOT NULL,
    "subidoPorId" INTEGER NOT NULL,
    "monto" DECIMAL(10,2) NOT NULL,
    "fechaTransferencia" DATE NOT NULL,
    "bancoOrigen" TEXT NOT NULL,
    "numeroOperacion" TEXT NOT NULL,
    "archivoUrl" TEXT NOT NULL,
    "estado" "EstadoComprobante" NOT NULL DEFAULT 'PENDIENTE',
    "validadoPorId" INTEGER,
    "validadoEn" TIMESTAMP(3),
    "motivoRechazo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComprobantePago_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NivelEducativo_nombre_key" ON "NivelEducativo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "NivelEducativo_orden_key" ON "NivelEducativo"("orden");

-- CreateIndex
CREATE INDEX "NivelEducativo_activo_idx" ON "NivelEducativo"("activo");

-- CreateIndex
CREATE INDEX "Curso_anioLectivo_activo_idx" ON "Curso"("anioLectivo", "activo");

-- CreateIndex
CREATE UNIQUE INDEX "Curso_nivelId_nombre_division_anioLectivo_key" ON "Curso"("nivelId", "nombre", "division", "anioLectivo");

-- CreateIndex
CREATE INDEX "Materia_profesorId_idx" ON "Materia"("profesorId");

-- CreateIndex
CREATE UNIQUE INDEX "Materia_cursoId_nombre_key" ON "Materia"("cursoId", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Alumno_userId_key" ON "Alumno"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Alumno_legajo_key" ON "Alumno"("legajo");

-- CreateIndex
CREATE UNIQUE INDEX "Alumno_dni_key" ON "Alumno"("dni");

-- CreateIndex
CREATE INDEX "Alumno_cursoId_idx" ON "Alumno"("cursoId");

-- CreateIndex
CREATE INDEX "Alumno_estado_idx" ON "Alumno"("estado");

-- CreateIndex
CREATE INDEX "Alumno_apellido_nombres_idx" ON "Alumno"("apellido", "nombres");

-- CreateIndex
CREATE UNIQUE INDEX "Profesor_userId_key" ON "Profesor"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Profesor_legajo_key" ON "Profesor"("legajo");

-- CreateIndex
CREATE UNIQUE INDEX "Profesor_dni_key" ON "Profesor"("dni");

-- CreateIndex
CREATE INDEX "Profesor_estado_idx" ON "Profesor"("estado");

-- CreateIndex
CREATE INDEX "Profesor_apellido_nombres_idx" ON "Profesor"("apellido", "nombres");

-- CreateIndex
CREATE UNIQUE INDEX "Deporte_nombre_key" ON "Deporte"("nombre");

-- CreateIndex
CREATE INDEX "Deporte_activo_idx" ON "Deporte"("activo");

-- CreateIndex
CREATE INDEX "Deporte_profesorResponsableId_idx" ON "Deporte"("profesorResponsableId");

-- CreateIndex
CREATE INDEX "HorarioDeporte_nivelId_diaSemana_idx" ON "HorarioDeporte"("nivelId", "diaSemana");

-- CreateIndex
CREATE INDEX "HorarioDeporte_deporteId_idx" ON "HorarioDeporte"("deporteId");

-- CreateIndex
CREATE UNIQUE INDEX "HorarioDeporte_deporteId_nivelId_diaSemana_horaInicio_key" ON "HorarioDeporte"("deporteId", "nivelId", "diaSemana", "horaInicio");

-- CreateIndex
CREATE INDEX "InscripcionDeporte_alumnoId_estado_idx" ON "InscripcionDeporte"("alumnoId", "estado");

-- CreateIndex
CREATE INDEX "InscripcionDeporte_deporteId_estado_idx" ON "InscripcionDeporte"("deporteId", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "InscripcionDeporte_alumnoId_deporteId_key" ON "InscripcionDeporte"("alumnoId", "deporteId");

-- CreateIndex
CREATE UNIQUE INDEX "RecorridoTransporte_codigo_key" ON "RecorridoTransporte"("codigo");

-- CreateIndex
CREATE INDEX "RecorridoTransporte_activo_idx" ON "RecorridoTransporte"("activo");

-- CreateIndex
CREATE INDEX "InscripcionTransporte_recorridoId_anio_mes_idx" ON "InscripcionTransporte"("recorridoId", "anio", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "InscripcionTransporte_alumnoId_anio_mes_key" ON "InscripcionTransporte"("alumnoId", "anio", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "Comedor_nombre_key" ON "Comedor"("nombre");

-- CreateIndex
CREATE INDEX "Comedor_activo_idx" ON "Comedor"("activo");

-- CreateIndex
CREATE INDEX "InscripcionComedor_comedorId_anio_mes_idx" ON "InscripcionComedor"("comedorId", "anio", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "InscripcionComedor_alumnoId_anio_mes_key" ON "InscripcionComedor"("alumnoId", "anio", "mes");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_numero_key" ON "Factura"("numero");

-- CreateIndex
CREATE INDEX "Factura_estado_idx" ON "Factura"("estado");

-- CreateIndex
CREATE INDEX "Factura_anio_mes_idx" ON "Factura"("anio", "mes");

-- CreateIndex
CREATE INDEX "Factura_fechaVencimiento_idx" ON "Factura"("fechaVencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "Factura_alumnoId_anio_mes_key" ON "Factura"("alumnoId", "anio", "mes");

-- CreateIndex
CREATE INDEX "ItemFactura_facturaId_idx" ON "ItemFactura"("facturaId");

-- CreateIndex
CREATE INDEX "ItemFactura_tipo_idx" ON "ItemFactura"("tipo");

-- CreateIndex
CREATE INDEX "ComprobantePago_facturaId_estado_idx" ON "ComprobantePago"("facturaId", "estado");

-- CreateIndex
CREATE INDEX "ComprobantePago_estado_idx" ON "ComprobantePago"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "ComprobantePago_facturaId_numeroOperacion_key" ON "ComprobantePago"("facturaId", "numeroOperacion");

-- AddForeignKey
ALTER TABLE "Curso" ADD CONSTRAINT "Curso_nivelId_fkey" FOREIGN KEY ("nivelId") REFERENCES "NivelEducativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Materia" ADD CONSTRAINT "Materia_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Materia" ADD CONSTRAINT "Materia_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alumno" ADD CONSTRAINT "Alumno_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alumno" ADD CONSTRAINT "Alumno_cursoId_fkey" FOREIGN KEY ("cursoId") REFERENCES "Curso"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Profesor" ADD CONSTRAINT "Profesor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deporte" ADD CONSTRAINT "Deporte_profesorResponsableId_fkey" FOREIGN KEY ("profesorResponsableId") REFERENCES "Profesor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioDeporte" ADD CONSTRAINT "HorarioDeporte_deporteId_fkey" FOREIGN KEY ("deporteId") REFERENCES "Deporte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioDeporte" ADD CONSTRAINT "HorarioDeporte_nivelId_fkey" FOREIGN KEY ("nivelId") REFERENCES "NivelEducativo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorarioDeporte" ADD CONSTRAINT "HorarioDeporte_profesorId_fkey" FOREIGN KEY ("profesorId") REFERENCES "Profesor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionDeporte" ADD CONSTRAINT "InscripcionDeporte_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionDeporte" ADD CONSTRAINT "InscripcionDeporte_deporteId_fkey" FOREIGN KEY ("deporteId") REFERENCES "Deporte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionTransporte" ADD CONSTRAINT "InscripcionTransporte_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionTransporte" ADD CONSTRAINT "InscripcionTransporte_recorridoId_fkey" FOREIGN KEY ("recorridoId") REFERENCES "RecorridoTransporte"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionComedor" ADD CONSTRAINT "InscripcionComedor_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InscripcionComedor" ADD CONSTRAINT "InscripcionComedor_comedorId_fkey" FOREIGN KEY ("comedorId") REFERENCES "Comedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_alumnoId_fkey" FOREIGN KEY ("alumnoId") REFERENCES "Alumno"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factura" ADD CONSTRAINT "Factura_tutorId_fkey" FOREIGN KEY ("tutorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ItemFactura" ADD CONSTRAINT "ItemFactura_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobantePago" ADD CONSTRAINT "ComprobantePago_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobantePago" ADD CONSTRAINT "ComprobantePago_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComprobantePago" ADD CONSTRAINT "ComprobantePago_validadoPorId_fkey" FOREIGN KEY ("validadoPorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ============================================================================
-- REGLAS DE NEGOCIO A NIVEL DE MOTOR
-- ----------------------------------------------------------------------------
-- Todo lo anterior lo generó Prisma a partir del schema. De acá en adelante es
-- SQL escrito a mano: CHECKs, un índice único parcial y funciones/triggers que
-- Prisma no puede expresar en su DSL.
--
-- Criterio: las reglas que la consigna declara "estrictas" no pueden depender
-- de que la capa de aplicación se acuerde de validarlas. Un INSERT por consola,
-- un script de migración o un endpoint nuevo escrito con prisa deben fallar.
-- ============================================================================


-- ============================================================
-- 1. CHECKs de rango y dominio
-- ============================================================

-- Horarios en minutos desde medianoche: [0, 1440] y fin posterior al inicio.
ALTER TABLE "HorarioDeporte"
  ADD CONSTRAINT "chk_horario_deporte_rango"
  CHECK ("horaInicio" >= 0 AND "horaInicio" < 1440
     AND "horaFin"    > 0 AND "horaFin"   <= 1440
     AND "horaFin"    > "horaInicio");

ALTER TABLE "RecorridoTransporte"
  ADD CONSTRAINT "chk_recorrido_horas"
  CHECK ("horaSalida"  >= 0 AND "horaSalida"  < 1440
     AND "horaRegreso" >= 0 AND "horaRegreso" < 1440);

ALTER TABLE "Comedor"
  ADD CONSTRAINT "chk_comedor_dias"
  CHECK ("diasPorSemana" BETWEEN 1 AND 5
     AND "horaServicio" >= 0 AND "horaServicio" < 1440);

-- Regla de negocio: máximo 2 deportes simultáneos. El slot sólo puede ser 1 o 2.
ALTER TABLE "InscripcionDeporte"
  ADD CONSTRAINT "chk_inscripcion_deporte_slot"
  CHECK ("slot" IN (1, 2));

-- Períodos de servicios mensuales.
ALTER TABLE "InscripcionTransporte"
  ADD CONSTRAINT "chk_insc_transporte_periodo"
  CHECK ("mes" BETWEEN 1 AND 12 AND "anio" BETWEEN 2025 AND 2100);

ALTER TABLE "InscripcionComedor"
  ADD CONSTRAINT "chk_insc_comedor_periodo"
  CHECK ("mes" BETWEEN 1 AND 12 AND "anio" BETWEEN 2025 AND 2100);

-- Importes no negativos.
ALTER TABLE "Deporte"
  ADD CONSTRAINT "chk_deporte_arancel" CHECK ("arancelMensual" >= 0);

ALTER TABLE "RecorridoTransporte"
  ADD CONSTRAINT "chk_recorrido_arancel" CHECK ("arancelMensual" >= 0);

ALTER TABLE "Comedor"
  ADD CONSTRAINT "chk_comedor_arancel" CHECK ("arancelMensual" >= 0);

ALTER TABLE "Factura"
  ADD CONSTRAINT "chk_factura_montos"
  CHECK ("mes" BETWEEN 1 AND 12
     AND "anio" BETWEEN 2025 AND 2100
     AND "subtotal" >= 0 AND "recargo" >= 0 AND "total" >= 0
     AND "montoPagado" >= 0
     AND "fechaVencimiento" >= "fechaEmision");

ALTER TABLE "ItemFactura"
  ADD CONSTRAINT "chk_item_factura_montos"
  CHECK ("cantidad" > 0 AND "precioUnitario" >= 0 AND "subtotal" >= 0);

-- Regla de negocio: no se acepta efectivo. Todo comprobante tiene importe
-- positivo y archivo adjunto (la columna es NOT NULL; acá se impide la cadena vacía).
ALTER TABLE "ComprobantePago"
  ADD CONSTRAINT "chk_comprobante_valido"
  CHECK ("monto" > 0 AND length(btrim("archivoUrl")) > 0);


-- ============================================================
-- 2. Máximo 2 deportes por alumno - garantía física
-- ============================================================
-- El índice único parcial es la defensa real: con slot en {1,2} y unicidad de
-- (alumnoId, slot) entre las inscripciones ACTIVAS, una tercera inscripción
-- activa no tiene dónde ubicarse. No hay condición de carrera posible: lo
-- resuelve el motor, no la aplicación.
CREATE UNIQUE INDEX "ux_inscripcion_deporte_slot_activo"
  ON "InscripcionDeporte" ("alumnoId", "slot")
  WHERE "estado" = 'ACTIVA';


-- Helper para mensajes legibles: 450 -> '07:30'
CREATE OR REPLACE FUNCTION fn_minutos_a_hora(p_minutos INTEGER)
RETURNS TEXT AS $$
BEGIN
  RETURN lpad((p_minutos / 60)::TEXT, 2, '0') || ':' || lpad((p_minutos % 60)::TEXT, 2, '0');
END;
$$ LANGUAGE plpgsql IMMUTABLE;


-- El índice parcial ya impide el caso, pero su error ("duplicate key") no le
-- dice nada a un usuario. Este trigger corta antes y explica el motivo.
CREATE OR REPLACE FUNCTION fn_validar_max_deportes()
RETURNS TRIGGER AS $$
DECLARE
  v_activas INTEGER;
  v_nombre  TEXT;
BEGIN
  IF NEW."estado" <> 'ACTIVA' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_activas
  FROM "InscripcionDeporte"
  WHERE "alumnoId" = NEW."alumnoId"
    AND "estado" = 'ACTIVA'
    AND "id" <> NEW."id";

  IF v_activas >= 2 THEN
    SELECT a."apellido" || ', ' || a."nombres" INTO v_nombre
    FROM "Alumno" a WHERE a."id" = NEW."alumnoId";

    RAISE EXCEPTION
      'El alumno % ya tiene % deportes activos. El máximo permitido es 2.',
      COALESCE(v_nombre, NEW."alumnoId"::TEXT), v_activas
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_inscripcion_deporte_max2"
  BEFORE INSERT OR UPDATE ON "InscripcionDeporte"
  FOR EACH ROW EXECUTE FUNCTION fn_validar_max_deportes();


-- ============================================================
-- 3. Sin solapamiento de horarios entre deportes
-- ============================================================
-- Compara los horarios del deporte que se pretende cursar contra los de los
-- deportes que el alumno ya cursa, acotando al nivel educativo del alumno
-- (cada deporte abre grupos por nivel). Dos intervalos se solapan si y sólo si
-- aIni < bFin AND bIni < aFin - comparación exacta entre enteros.
CREATE OR REPLACE FUNCTION fn_validar_solapamiento_deporte()
RETURNS TRIGGER AS $$
DECLARE
  v_nivel_id   INTEGER;
  v_dia        "DiaSemana";
  v_nuevo_ini  INTEGER;
  v_nuevo_fin  INTEGER;
  v_otro_ini   INTEGER;
  v_otro_fin   INTEGER;
  v_nuevo_dep  TEXT;
  v_otro_dep   TEXT;
BEGIN
  IF NEW."estado" <> 'ACTIVA' THEN
    RETURN NEW;
  END IF;

  -- El nivel del alumno se deriva de su curso; nunca se duplica.
  SELECT c."nivelId" INTO v_nivel_id
  FROM "Alumno" a
  JOIN "Curso" c ON c."id" = a."cursoId"
  WHERE a."id" = NEW."alumnoId";

  IF v_nivel_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT hn."diaSemana", hn."horaInicio", hn."horaFin",
         he."horaInicio", he."horaFin",
         dn."nombre", de."nombre"
    INTO v_dia, v_nuevo_ini, v_nuevo_fin,
         v_otro_ini, v_otro_fin,
         v_nuevo_dep, v_otro_dep
  FROM "HorarioDeporte" hn
  JOIN "Deporte" dn ON dn."id" = hn."deporteId"
  JOIN "InscripcionDeporte" i
       ON i."alumnoId"  = NEW."alumnoId"
      AND i."estado"    = 'ACTIVA'
      AND i."id"        <> NEW."id"
      AND i."deporteId" <> NEW."deporteId"
  JOIN "HorarioDeporte" he
       ON he."deporteId" = i."deporteId"
      AND he."nivelId"   = v_nivel_id
      AND he."activo"    = TRUE
  JOIN "Deporte" de ON de."id" = he."deporteId"
  WHERE hn."deporteId" = NEW."deporteId"
    AND hn."nivelId"   = v_nivel_id
    AND hn."activo"    = TRUE
    AND hn."diaSemana" = he."diaSemana"
    AND hn."horaInicio" < he."horaFin"      -- condición de solapamiento
    AND he."horaInicio" < hn."horaFin"
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION
      'Conflicto de horarios: % (% de % a %) se superpone con % (de % a %), que el alumno ya cursa.',
      v_nuevo_dep, v_dia, fn_minutos_a_hora(v_nuevo_ini), fn_minutos_a_hora(v_nuevo_fin),
      v_otro_dep,  fn_minutos_a_hora(v_otro_ini),  fn_minutos_a_hora(v_otro_fin)
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_inscripcion_deporte_sin_solapamiento"
  BEFORE INSERT OR UPDATE ON "InscripcionDeporte"
  FOR EACH ROW EXECUTE FUNCTION fn_validar_solapamiento_deporte();


-- ============================================================
-- 4. Factura 1:N ComprobantePago - estado derivado, nunca declarado
-- ============================================================
-- `montoPagado` y `estado` de la factura son consecuencia de los comprobantes
-- APROBADOS. La aplicación no los escribe: los recalcula el motor ante cualquier
-- alta, validación, rechazo o baja de un comprobante. Así una factura no puede
-- quedar en PAGADA sin transferencias que la respalden.
CREATE OR REPLACE FUNCTION fn_recalcular_estado_factura()
RETURNS TRIGGER AS $$
DECLARE
  v_factura_id  INTEGER;
  v_total       NUMERIC(10,2);
  v_vencimiento DATE;
  v_estado      "EstadoFactura";
  v_pagado      NUMERIC(10,2);
  v_pendientes  INTEGER;
  v_nuevo       "EstadoFactura";
BEGIN
  v_factura_id := COALESCE(NEW."facturaId", OLD."facturaId");

  SELECT f."total", f."fechaVencimiento", f."estado"
    INTO v_total, v_vencimiento, v_estado
  FROM "Factura" f WHERE f."id" = v_factura_id;

  -- La factura pudo haberse borrado en cascada: no hay nada que recalcular.
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Una factura anulada no vuelve sola a circulación.
  IF v_estado = 'ANULADA' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(c."monto"), 0) INTO v_pagado
  FROM "ComprobantePago" c
  WHERE c."facturaId" = v_factura_id AND c."estado" = 'APROBADO';

  SELECT COUNT(*) INTO v_pendientes
  FROM "ComprobantePago" c
  WHERE c."facturaId" = v_factura_id AND c."estado" = 'PENDIENTE';

  IF v_pagado >= v_total THEN
    v_nuevo := 'PAGADA';
  ELSIF v_pendientes > 0 THEN
    v_nuevo := 'EN_REVISION';
  ELSIF v_pagado > 0 THEN
    v_nuevo := 'PARCIAL';
  ELSIF v_vencimiento < CURRENT_DATE THEN
    v_nuevo := 'VENCIDA';
  ELSE
    v_nuevo := 'PENDIENTE';
  END IF;

  UPDATE "Factura"
     SET "montoPagado" = v_pagado,
         "estado"      = v_nuevo,
         "updatedAt"   = NOW()
   WHERE "id" = v_factura_id;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_comprobante_recalcula_factura"
  AFTER INSERT OR UPDATE OR DELETE ON "ComprobantePago"
  FOR EACH ROW EXECUTE FUNCTION fn_recalcular_estado_factura();


-- Coherencia del comprobante: si está APROBADO o RECHAZADO necesita quién y
-- cuándo lo resolvió; si fue rechazado, el motivo. Auditoría mínima del circuito.
CREATE OR REPLACE FUNCTION fn_validar_comprobante()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."estado" IN ('APROBADO', 'RECHAZADO') THEN
    IF NEW."validadoPorId" IS NULL OR NEW."validadoEn" IS NULL THEN
      RAISE EXCEPTION
        'Un comprobante % debe registrar quién lo validó y cuándo.', NEW."estado"
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW."estado" = 'RECHAZADO'
     AND (NEW."motivoRechazo" IS NULL OR length(btrim(NEW."motivoRechazo")) = 0) THEN
    RAISE EXCEPTION 'Un comprobante rechazado debe indicar el motivo.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_comprobante_validar"
  BEFORE INSERT OR UPDATE ON "ComprobantePago"
  FOR EACH ROW EXECUTE FUNCTION fn_validar_comprobante();


-- ============================================================
-- 5. Exactamente 4 recorridos de transporte
-- ============================================================
-- El enum CodigoRecorrido (R1..R4) más el UNIQUE sobre `codigo` ya impiden un
-- quinto recorrido. Falta blindar el otro extremo: que no queden menos de 4.
-- Para dar de baja un recorrido se usa `activo = false`, no DELETE.
CREATE OR REPLACE FUNCTION fn_proteger_recorridos()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'Los 4 recorridos de transporte son fijos por regla de negocio. Para discontinuar el recorrido % usá activo = false.',
    OLD."codigo"
    USING ERRCODE = '23514';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "trg_recorrido_no_eliminar"
  BEFORE DELETE ON "RecorridoTransporte"
  FOR EACH ROW EXECUTE FUNCTION fn_proteger_recorridos();
