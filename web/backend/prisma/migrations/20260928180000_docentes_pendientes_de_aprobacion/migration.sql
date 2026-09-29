-- Docentes pendientes de aprobación, separados de los desactivados.
--
-- "Pendiente" se deducía de `role = 'DOCENTE' AND "isActive" = false`. Pero el
-- administrador también desactiva docentes, y un docente desactivado caía en
-- la lista de pendientes: "Rechazar" borra al usuario, y el borrado arrastra en
-- cascada sus anuncios, mensajes y actividades. Tampoco había forma de
-- reactivarlo sin que pareciera una aprobación.
--
-- Los docentes inactivos de hoy quedan marcados como pendientes: es lo que la
-- regla vieja decía de ellos, así que ninguno cambia de lista con la
-- migración. A partir de acá, sólo el registro marca a un docente como
-- pendiente, y sólo la aprobación (o una reactivación) lo desmarca.

ALTER TABLE "User" ADD COLUMN "pendienteAprobacion" BOOLEAN NOT NULL DEFAULT false;

UPDATE "User" SET "pendienteAprobacion" = true WHERE "role" = 'DOCENTE' AND "isActive" = false;
