/**
 * Infrastructure as Code de Railway.
 *
 * Reemplaza a `railway.json`, que Railway declaró obsoleto: la CLI avisa que
 * los archivos de Config as Code siguen funcionando hasta el 01/12/2026. Este
 * archivo se generó con `railway config migrate` a partir de aquél, así que
 * declara exactamente lo mismo.
 *
 * ── POR QUÉ TODAVÍA CONVIVEN LOS DOS ───────────────────────────────────────
 * `railway.json` lo lee Railway solo, en cada despliegue. Este archivo no: hay
 * que aplicarlo con `railway config apply`, que necesita una sesión iniciada
 * contra el proyecto. Borrar el `railway.json` antes de esa primera aplicación
 * dejaría los despliegues sin `preDeployCommand`, que es justamente la pieza
 * que hace que las migraciones se apliquen solas. Se retira recién después de
 * comprobar que este archivo quedó aplicado.
 *
 * Pasos, para quien tenga acceso al proyecto:
 *
 *   npx @railway/cli login
 *   npx @railway/cli link
 *   npx @railway/cli config plan     # muestra qué cambiaría, sin aplicar
 *   npx @railway/cli config apply
 *
 * Y después, para comprobar que el pre-deploy efectivamente corre, lo de la
 * sección 1 de `docs/despliegue.md`: `prisma migrate status` tiene que informar
 * las nueve migraciones aplicadas.
 */

import { defineRailway, project, service } from 'railway/iac';

// Este repositorio administra únicamente sus propios recursos del entorno.
// https://docs.railway.com/infrastructure-as-code#multi-repo-projects
export const partial = 'CentroEducativo';

export default defineRailway(() => {
  const CentroEducativo = service('CentroEducativo', {
    build: 'pnpm build',
    start: 'pnpm start',

    // El release command. Corre sobre la imagen ya construida y antes de que la
    // versión nueva reciba tráfico: si una migración falla, el despliegue se
    // detiene y la versión anterior sigue sirviendo. Sin esto, el código nuevo
    // sale a atender consultas contra el esquema viejo y el error aparece más
    // tarde, en la primera consulta que toca una columna que no existe.
    preDeploy: 'pnpm --filter backend prisma:deploy',

    // builder heredado de railway.json: "NIXPACKS"
  });

  return project('surprising-joy', {
    resources: [CentroEducativo],
  });
});
