import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding...');

  const passwordHash = await bcrypt.hash('123456', 10);

  const usersData = [
    { usuario: 'admin', email: 'admin@et.edu.ar', dni: '10000001', nombre: 'Administrador del Sistema', role: Role.ADMIN, curso: null },

    { usuario: 'mlopez',  email: 'm.lopez@et.edu.ar',  dni: '20000001', nombre: 'María López',     role: Role.DOCENTE, curso: null },
    { usuario: 'jgarcia', email: 'j.garcia@et.edu.ar', dni: '20000002', nombre: 'Javier García',   role: Role.DOCENTE, curso: null },

    { usuario: 'fbarrabino', email: 'f.barrabino@et.edu.ar', dni: '40000001', nombre: 'Franco Barrabino', role: Role.ESTUDIANTE, curso: 'Secundario — 1er Año' },
    { usuario: 'jperez',     email: 'j.perez@et.edu.ar',     dni: '40000002', nombre: 'Juan Pérez',       role: Role.ESTUDIANTE, curso: 'Secundario — 1er Año' },
    { usuario: 'mgomez',     email: 'm.gomez@et.edu.ar',     dni: '40000003', nombre: 'María Gómez',      role: Role.ESTUDIANTE, curso: 'Primario — 6to Grado' },
    { usuario: 'lferreyra',  email: 'l.ferreyra@et.edu.ar',  dni: '40000004', nombre: 'Lucía Ferreyra',   role: Role.ESTUDIANTE, curso: 'Secundario — 2do Año' },

    { usuario: 'pbarrabino', email: 'p.barrabino@et.edu.ar', dni: '30000001', nombre: 'Patricia Barrabino', role: Role.PADRE, curso: null },
    { usuario: 'rperez',     email: 'r.perez@et.edu.ar',     dni: '30000002', nombre: 'Roberto Pérez',      role: Role.PADRE, curso: null },
  ];

  for (const u of usersData) {
    await prisma.user.upsert({
      where: { usuario: u.usuario },
      update: {},
      create: { ...u, password: passwordHash },
    });
  }

  const docMaria = await prisma.user.findUniqueOrThrow({ where: { usuario: 'mlopez' } });
  const docJavier = await prisma.user.findUniqueOrThrow({ where: { usuario: 'jgarcia' } });

  const franco = await prisma.user.findUniqueOrThrow({ where: { usuario: 'fbarrabino' } });
  const juan = await prisma.user.findUniqueOrThrow({ where: { usuario: 'jperez' } });
  const maria = await prisma.user.findUniqueOrThrow({ where: { usuario: 'mgomez' } });
  const lucia = await prisma.user.findUniqueOrThrow({ where: { usuario: 'lferreyra' } });

  const patricia = await prisma.user.findUniqueOrThrow({ where: { usuario: 'pbarrabino' } });
  const roberto = await prisma.user.findUniqueOrThrow({ where: { usuario: 'rperez' } });

  await prisma.parentStudentLink.upsert({
    where: { padreId_estudianteId: { padreId: patricia.id, estudianteId: franco.id } },
    update: {},
    create: { padreId: patricia.id, estudianteId: franco.id },
  });
  await prisma.parentStudentLink.upsert({
    where: { padreId_estudianteId: { padreId: roberto.id, estudianteId: juan.id } },
    update: {},
    create: { padreId: roberto.id, estudianteId: juan.id },
  });

  const today = new Date();
  const dayIso = (offsetDays: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() - offsetDays);
    return d;
  };

  await prisma.grade.deleteMany({});
  await prisma.grade.createMany({
    data: [
      { estudianteId: franco.id, docenteId: docMaria.id,  materia: 'Álgebra y Geometría', instancia: '1er Trimestre', nota: 8,  fecha: dayIso(30) },
      { estudianteId: franco.id, docenteId: docMaria.id,  materia: 'Álgebra y Geometría', instancia: '2do Trimestre', nota: 9,  fecha: dayIso(10) },
      { estudianteId: franco.id, docenteId: docJavier.id, materia: 'Literatura',          instancia: '1er Trimestre', nota: 7,  fecha: dayIso(28) },
      { estudianteId: franco.id, docenteId: docJavier.id, materia: 'Física',              instancia: '1er Trimestre', nota: 6,  fecha: dayIso(20) },

      { estudianteId: juan.id,   docenteId: docMaria.id,  materia: 'Álgebra y Geometría', instancia: '1er Trimestre', nota: 9,  fecha: dayIso(30) },
      { estudianteId: juan.id,   docenteId: docMaria.id,  materia: 'Álgebra y Geometría', instancia: '2do Trimestre', nota: 10, fecha: dayIso(8) },
      { estudianteId: juan.id,   docenteId: docJavier.id, materia: 'Química',             instancia: '1er Trimestre', nota: 8,  fecha: dayIso(15) },

      { estudianteId: maria.id,  docenteId: docMaria.id,  materia: 'Matemáticas',         instancia: '1er Trimestre', nota: 10, fecha: dayIso(25) },
      { estudianteId: maria.id,  docenteId: docJavier.id, materia: 'Prácticas del Lenguaje', instancia: '1er Trimestre', nota: 9, fecha: dayIso(18) },

      { estudianteId: lucia.id,  docenteId: docJavier.id, materia: 'Literatura',          instancia: '1er Trimestre', nota: 7,  fecha: dayIso(22) },
    ],
  });

  console.log('✅ Seed completo. Usuarios (password: 123456):');
  for (const u of usersData) console.log(`   - ${u.usuario.padEnd(12)} ${u.role.padEnd(10)} ${u.nombre}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
