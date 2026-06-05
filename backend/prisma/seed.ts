import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

type UserSeed = {
  usuario: string;
  email: string;
  dni: string;
  nombre: string;
  role: Role;
  curso: string | null;
};

const SEED_USERS: UserSeed[] = [
  { usuario: 'admin', email: 'admin@et.edu.ar', dni: '10000001', nombre: 'Administrador del Sistema', role: Role.ADMIN, curso: null },

  // Docentes
  { usuario: 'mlopez',    email: 'm.lopez@et.edu.ar',    dni: '20000001', nombre: 'María López',     role: Role.DOCENTE, curso: null },
  { usuario: 'jgarcia',   email: 'j.garcia@et.edu.ar',   dni: '20000002', nombre: 'Javier García',   role: Role.DOCENTE, curso: null },
  { usuario: 'csilva',    email: 'c.silva@et.edu.ar',    dni: '20000003', nombre: 'Carolina Silva',  role: Role.DOCENTE, curso: null },
  { usuario: 'amartinez', email: 'a.martinez@et.edu.ar', dni: '20000004', nombre: 'Andrés Martínez', role: Role.DOCENTE, curso: null },

  // Estudiantes
  { usuario: 'fbarrabino', email: 'f.barrabino@et.edu.ar', dni: '40000001', nombre: 'Franco Barrabino',   role: Role.ESTUDIANTE, curso: 'Secundario — 1er Año' },
  { usuario: 'jperez',     email: 'j.perez@et.edu.ar',     dni: '40000002', nombre: 'Juan Pérez',         role: Role.ESTUDIANTE, curso: 'Secundario — 1er Año' },
  { usuario: 'mgomez',     email: 'm.gomez@et.edu.ar',     dni: '40000003', nombre: 'María Gómez',        role: Role.ESTUDIANTE, curso: 'Primario — 6to Grado' },
  { usuario: 'lferreyra',  email: 'l.ferreyra@et.edu.ar',  dni: '40000004', nombre: 'Lucía Ferreyra',     role: Role.ESTUDIANTE, curso: 'Secundario — 2do Año' },
  { usuario: 'srodriguez', email: 's.rodriguez@et.edu.ar', dni: '40000005', nombre: 'Sofía Rodríguez',    role: Role.ESTUDIANTE, curso: 'Secundario — 3er Año' },
  { usuario: 'tmoreno',    email: 't.moreno@et.edu.ar',    dni: '40000006', nombre: 'Tomás Moreno',       role: Role.ESTUDIANTE, curso: 'Primario — 5to Grado' },
  { usuario: 'vsanchez',   email: 'v.sanchez@et.edu.ar',   dni: '40000007', nombre: 'Valentina Sánchez',  role: Role.ESTUDIANTE, curso: 'Secundario — 1er Año' },
  { usuario: 'iflores',    email: 'i.flores@et.edu.ar',    dni: '40000008', nombre: 'Ignacio Flores',     role: Role.ESTUDIANTE, curso: 'Primario — 6to Grado' },

  // Padres
  { usuario: 'pbarrabino', email: 'p.barrabino@et.edu.ar', dni: '30000001', nombre: 'Patricia Barrabino', role: Role.PADRE, curso: null },
  { usuario: 'rperez',     email: 'r.perez@et.edu.ar',     dni: '30000002', nombre: 'Roberto Pérez',      role: Role.PADRE, curso: null },
  { usuario: 'mgomezp',    email: 'm.gomez.padre@et.edu.ar', dni: '30000003', nombre: 'Mariana Gómez',    role: Role.PADRE, curso: null },
];

const LINKS: Array<{ padre: string; hijos: string[] }> = [
  { padre: 'pbarrabino', hijos: ['fbarrabino'] },
  { padre: 'rperez',     hijos: ['jperez'] },
  { padre: 'mgomezp',    hijos: ['mgomez', 'iflores'] },
];

type GradeSeed = {
  estudiante: string;
  docente: string;
  materia: string;
  instancia: string;
  nota: number;
  daysAgo: number;
};

const GRADES: GradeSeed[] = [
  // Franco Barrabino (Secundario 1er Año)
  { estudiante: 'fbarrabino', docente: 'mlopez',    materia: 'Álgebra y Geometría',    instancia: '1er Trimestre', nota: 8,  daysAgo: 60 },
  { estudiante: 'fbarrabino', docente: 'mlopez',    materia: 'Álgebra y Geometría',    instancia: '2do Trimestre', nota: 9,  daysAgo: 12 },
  { estudiante: 'fbarrabino', docente: 'jgarcia',   materia: 'Literatura',             instancia: '1er Trimestre', nota: 7,  daysAgo: 55 },
  { estudiante: 'fbarrabino', docente: 'jgarcia',   materia: 'Literatura',             instancia: '2do Trimestre', nota: 8,  daysAgo: 10 },
  { estudiante: 'fbarrabino', docente: 'csilva',    materia: 'Física',                 instancia: '1er Trimestre', nota: 6,  daysAgo: 40 },
  { estudiante: 'fbarrabino', docente: 'csilva',    materia: 'Química',                instancia: '1er Trimestre', nota: 7,  daysAgo: 30 },
  { estudiante: 'fbarrabino', docente: 'amartinez', materia: 'Historia',               instancia: '1er Trimestre', nota: 9,  daysAgo: 25 },
  { estudiante: 'fbarrabino', docente: 'amartinez', materia: 'Inglés',                 instancia: '1er Trimestre', nota: 10, daysAgo: 20 },

  // Juan Pérez (Secundario 1er Año)
  { estudiante: 'jperez', docente: 'mlopez',    materia: 'Álgebra y Geometría',  instancia: '1er Trimestre', nota: 9,  daysAgo: 60 },
  { estudiante: 'jperez', docente: 'mlopez',    materia: 'Álgebra y Geometría',  instancia: '2do Trimestre', nota: 10, daysAgo: 8 },
  { estudiante: 'jperez', docente: 'jgarcia',   materia: 'Literatura',           instancia: '1er Trimestre', nota: 7,  daysAgo: 50 },
  { estudiante: 'jperez', docente: 'csilva',    materia: 'Química',              instancia: '1er Trimestre', nota: 8,  daysAgo: 15 },
  { estudiante: 'jperez', docente: 'csilva',    materia: 'Física',               instancia: '1er Trimestre', nota: 7,  daysAgo: 35 },
  { estudiante: 'jperez', docente: 'amartinez', materia: 'Inglés',               instancia: '1er Trimestre', nota: 9,  daysAgo: 22 },

  // María Gómez (Primario 6to Grado)
  { estudiante: 'mgomez', docente: 'mlopez',    materia: 'Matemáticas',            instancia: '1er Trimestre', nota: 10, daysAgo: 55 },
  { estudiante: 'mgomez', docente: 'mlopez',    materia: 'Matemáticas',            instancia: '2do Trimestre', nota: 9,  daysAgo: 8 },
  { estudiante: 'mgomez', docente: 'jgarcia',   materia: 'Prácticas del Lenguaje', instancia: '1er Trimestre', nota: 9,  daysAgo: 45 },
  { estudiante: 'mgomez', docente: 'amartinez', materia: 'Ciencias Sociales',      instancia: '1er Trimestre', nota: 8,  daysAgo: 30 },
  { estudiante: 'mgomez', docente: 'csilva',    materia: 'Ciencias Naturales',     instancia: '1er Trimestre', nota: 10, daysAgo: 25 },

  // Lucía Ferreyra (Secundario 2do Año)
  { estudiante: 'lferreyra', docente: 'jgarcia',   materia: 'Literatura',          instancia: '1er Trimestre', nota: 7,  daysAgo: 50 },
  { estudiante: 'lferreyra', docente: 'mlopez',    materia: 'Álgebra y Geometría', instancia: '1er Trimestre', nota: 6,  daysAgo: 45 },
  { estudiante: 'lferreyra', docente: 'csilva',    materia: 'Biología',            instancia: '1er Trimestre', nota: 8,  daysAgo: 28 },
  { estudiante: 'lferreyra', docente: 'amartinez', materia: 'Historia',            instancia: '1er Trimestre', nota: 7,  daysAgo: 20 },

  // Sofía Rodríguez (Secundario 3er Año)
  { estudiante: 'srodriguez', docente: 'mlopez',    materia: 'Matemática Discreta', instancia: '1er Trimestre', nota: 9, daysAgo: 50 },
  { estudiante: 'srodriguez', docente: 'csilva',    materia: 'Química Orgánica',    instancia: '1er Trimestre', nota: 8, daysAgo: 35 },
  { estudiante: 'srodriguez', docente: 'amartinez', materia: 'Geografía',           instancia: '1er Trimestre', nota: 10, daysAgo: 20 },

  // Tomás Moreno (Primario 5to Grado)
  { estudiante: 'tmoreno', docente: 'mlopez',  materia: 'Matemáticas',            instancia: '1er Trimestre', nota: 7, daysAgo: 50 },
  { estudiante: 'tmoreno', docente: 'jgarcia', materia: 'Prácticas del Lenguaje', instancia: '1er Trimestre', nota: 8, daysAgo: 40 },
  { estudiante: 'tmoreno', docente: 'csilva',  materia: 'Ciencias Naturales',     instancia: '1er Trimestre', nota: 9, daysAgo: 25 },

  // Valentina Sánchez (Secundario 1er Año)
  { estudiante: 'vsanchez', docente: 'mlopez',    materia: 'Álgebra y Geometría', instancia: '1er Trimestre', nota: 9, daysAgo: 55 },
  { estudiante: 'vsanchez', docente: 'jgarcia',   materia: 'Literatura',          instancia: '1er Trimestre', nota: 10, daysAgo: 30 },
  { estudiante: 'vsanchez', docente: 'amartinez', materia: 'Inglés',              instancia: '1er Trimestre', nota: 9, daysAgo: 18 },

  // Ignacio Flores (Primario 6to Grado)
  { estudiante: 'iflores', docente: 'mlopez',  materia: 'Matemáticas',            instancia: '1er Trimestre', nota: 8, daysAgo: 48 },
  { estudiante: 'iflores', docente: 'jgarcia', materia: 'Prácticas del Lenguaje', instancia: '1er Trimestre', nota: 7, daysAgo: 38 },
  { estudiante: 'iflores', docente: 'csilva',  materia: 'Ciencias Naturales',     instancia: '1er Trimestre', nota: 9, daysAgo: 22 },
];

async function main() {
  console.log('🌱 Seeding...');

  const passwordHash = await bcrypt.hash('123456', 10);

  for (const u of SEED_USERS) {
    await prisma.user.upsert({
      where: { usuario: u.usuario },
      update: {},
      create: { ...u, password: passwordHash },
    });
  }

  const byUsername = new Map<string, number>();
  for (const u of await prisma.user.findMany({ select: { id: true, usuario: true } })) {
    byUsername.set(u.usuario, u.id);
  }

  for (const link of LINKS) {
    const padreId = byUsername.get(link.padre)!;
    for (const hijo of link.hijos) {
      const estudianteId = byUsername.get(hijo)!;
      await prisma.parentStudentLink.upsert({
        where: { padreId_estudianteId: { padreId, estudianteId } },
        update: {},
        create: { padreId, estudianteId },
      });
    }
  }

  const today = new Date();
  const dayIso = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offset);
    return d;
  };

  await prisma.grade.deleteMany({});
  await prisma.grade.createMany({
    data: GRADES.map((g) => ({
      estudianteId: byUsername.get(g.estudiante)!,
      docenteId: byUsername.get(g.docente)!,
      materia: g.materia,
      instancia: g.instancia,
      nota: g.nota,
      fecha: dayIso(g.daysAgo),
    })),
  });

  console.log('✅ Seed completo. Password de todos los usuarios: 123456');
  console.log(`   ${SEED_USERS.length} usuarios, ${GRADES.length} calificaciones, ${LINKS.reduce((a, l) => a + l.hijos.length, 0)} vínculos padre-hijo.`);
  console.log('');
  console.log('   Usuarios de prueba:');
  for (const u of SEED_USERS) {
    console.log(`     ${u.usuario.padEnd(12)} ${u.role.padEnd(10)} ${u.nombre}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
