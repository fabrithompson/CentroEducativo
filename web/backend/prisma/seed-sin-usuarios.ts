/**
 * Seed del dominio SIN crear usuarios.
 *
 * `seed.ts` carga el dominio y además da de alta ~15 usuarios de
 * demostración (admin, docentes, estudiantes y padres, todos con la misma
 * contraseña). Esto sirve para probar, pero deja el registro público
 * bloqueado: cualquiera que intente crear una cuenta con uno de esos DNI o
 * correos recibe un 409.
 *
 * Este entry point carga únicamente el dominio: niveles, cursos, materias,
 * profesores, alumnos, deportes, los cuatro recorridos, comedor y las
 * facturas de ejemplo. `seedDominio` resuelve los vínculos con usuarios
 * mediante `?? null`, así que profesores y alumnos quedan sin cuenta
 * asociada y se pueden vincular después desde el panel de administración.
 *
 * Uso:
 *   pnpm --filter backend prisma:seed:limpio
 */
import { PrismaClient } from '@prisma/client';

import { seedDominio } from './seed-dominio';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const usuariosExistentes = await prisma.user.count();
  if (usuariosExistentes > 0) {
    console.log(
      `⚠️  La base ya tiene ${usuariosExistentes} usuario(s). Este seed no los toca, ` +
        'pero tampoco es una base "desde cero".',
    );
  }

  await seedDominio(prisma);

  console.log('✅ Dominio cargado, sin usuarios de demostración.');
  console.log('   El registro público queda libre: no hay DNI ni correos ocupados.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
