-- ============================================================
--  Centro Educativo "Educar para Transformar"
--  Esquema de base de datos PostgreSQL
-- ============================================================
--  Ejecutar:  psql -U <usuario> -d centro_educativo -f db/schema.sql
-- ============================================================

-- Limpieza previa (orden inverso por dependencias)
DROP TABLE IF EXISTS postulaciones    CASCADE;
DROP TABLE IF EXISTS contactos         CASCADE;
DROP TABLE IF EXISTS inscripciones     CASCADE;
DROP TABLE IF EXISTS opiniones         CASCADE;
DROP TABLE IF EXISTS noticias          CASCADE;
DROP TABLE IF EXISTS usuarios          CASCADE;
DROP TYPE  IF EXISTS rol_usuario        CASCADE;

-- ------------------------------------------------------------
-- Tipo enumerado de roles (5 roles, ya NO agrupados)
-- ------------------------------------------------------------
CREATE TYPE rol_usuario AS ENUM (
    'estudiante',
    'padre',        -- padre / tutor
    'docente',
    'autoridad',
    'personal'
);

-- ------------------------------------------------------------
-- Usuarios (autenticación + perfil)
-- ------------------------------------------------------------
CREATE TABLE usuarios (
    id              SERIAL PRIMARY KEY,
    rol             rol_usuario     NOT NULL,
    nombre          VARCHAR(120)    NOT NULL,
    email           VARCHAR(160)    NOT NULL UNIQUE,
    usuario         VARCHAR(60)     NOT NULL UNIQUE,
    password_hash   VARCHAR(255)    NOT NULL,   -- bcrypt, nunca texto plano
    dni             VARCHAR(20),
    curso           VARCHAR(40),
    creado_en       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Opiniones públicas (sin login)
-- ------------------------------------------------------------
CREATE TABLE opiniones (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(120)    NOT NULL,
    identificacion  VARCHAR(60),                -- rol declarado: padre, estudiante, etc.
    comentario      TEXT            NOT NULL,
    valoracion      SMALLINT        NOT NULL CHECK (valoracion BETWEEN 1 AND 5),
    creado_en       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Solicitudes de inscripción (públicas)
-- ------------------------------------------------------------
CREATE TABLE inscripciones (
    id              SERIAL PRIMARY KEY,
    numero          VARCHAR(20)     NOT NULL UNIQUE,   -- nº de solicitud generado
    nombre_tutor    VARCHAR(120)    NOT NULL,
    email           VARCHAR(160)    NOT NULL,
    telefono        VARCHAR(40)     NOT NULL,
    nombre_alumno   VARCHAR(120)    NOT NULL,
    nivel           VARCHAR(40)     NOT NULL,
    anio_curso      VARCHAR(40),
    comentario      TEXT,
    estado          VARCHAR(20)     NOT NULL DEFAULT 'pendiente',
    creado_en       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Consultas de contacto (públicas)
-- ------------------------------------------------------------
CREATE TABLE contactos (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(120)    NOT NULL,
    email           VARCHAR(160)    NOT NULL,
    telefono        VARCHAR(40),
    asunto          VARCHAR(160),
    mensaje         TEXT            NOT NULL,
    creado_en       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Postulaciones laborales (públicas, con CV en PDF)
-- ------------------------------------------------------------
CREATE TABLE postulaciones (
    id              SERIAL PRIMARY KEY,
    nombre          VARCHAR(120)    NOT NULL,
    email           VARCHAR(160)    NOT NULL,
    telefono        VARCHAR(40),
    puesto          VARCHAR(60)     NOT NULL,
    mensaje         TEXT,
    cv_archivo      VARCHAR(255),               -- nombre del archivo PDF guardado
    creado_en       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Noticias / comunicados
-- ------------------------------------------------------------
CREATE TABLE noticias (
    id              SERIAL PRIMARY KEY,
    titulo          VARCHAR(160)    NOT NULL,
    cuerpo          TEXT            NOT NULL,
    fecha           DATE            NOT NULL DEFAULT CURRENT_DATE,
    creado_en       TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

-- Índices útiles para las consultas del panel
CREATE INDEX idx_usuarios_rol        ON usuarios (rol);
CREATE INDEX idx_inscripciones_fecha ON inscripciones (creado_en DESC);
CREATE INDEX idx_opiniones_fecha     ON opiniones (creado_en DESC);
