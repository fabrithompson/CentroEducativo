-- Revocación real de los tokens de refresco.
--
-- El refresh token ya llevaba un campo `v` en su carga útil, pero no se
-- contrastaba contra nada: se incrementaba en cada renovación y nadie lo
-- miraba. En los hechos, un token de refresco valía sus siete días completos y
-- no había forma de anularlo.
--
-- Lo que eso dejaba abierto: cambiar la contraseña impedía ingresos nuevos
-- pero **no cerraba las sesiones ya abiertas**. Alguien con un token robado
-- seguía entrando durante una semana aunque la víctima cambiara la clave, que
-- es justamente lo primero que uno hace al sospechar que se la robaron.
--
-- `tokenVersion` arranca en 1 para todos los usuarios existentes. Los tokens
-- emitidos antes de esta migración llevan `v: 1` o un número mayor si venían
-- de varias renovaciones; los que traigan un número distinto de 1 dejarán de
-- validar y obligarán a iniciar sesión otra vez. Es el costo de una sola vez
-- de cerrar el agujero.

ALTER TABLE "User" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 1;
