// Hook `commit-msg`: exige Conventional Commits, la convención que fija el plan
// de trabajo (§7.1). Un mensaje como «arreglos» o «cambios varios» no dice qué
// se tocó ni permite agrupar el historial por tipo.
//
// Formato: tipo(ámbito opcional): descripción
//   feat(alumnos): validar DNI repetido en el alta
//   fix: el escáner acepta el legajo a mano
//
// Se dejan pasar los mensajes que genera Git solo (merge, revert, fixup).

import { readFileSync } from 'node:fs';

const TIPOS = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert', 'merge'];

const archivo = process.argv[2];
const primeraLinea = readFileSync(archivo, 'utf8').split('\n')[0].trim();

const automatico = /^(Merge |Revert "|fixup! |squash! )/.test(primeraLinea);
const convencional = new RegExp(`^(${TIPOS.join('|')})(\\([\\w\\-./áéíóúñ ]+\\))?!?: .{3,}`, 'i');

if (!automatico && !convencional.test(primeraLinea)) {
  console.error(`
✖ El mensaje del commit no sigue Conventional Commits:

    ${primeraLinea || '(vacío)'}

  Formato:  tipo(ámbito): descripción
  Tipos:    ${TIPOS.join(', ')}
  Ejemplo:  feat(alumnos): validar DNI repetido en el alta
`);
  process.exit(1);
}
