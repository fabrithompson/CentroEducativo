import { PrismaClient } from '@prisma/client';
import { fakerES as faker } from '@faker-js/faker'; // Usamos faker en español

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando carga masiva de alumnos...');

  // 1. Buscamos un curso existente para asignar a los alumnos
  const cursoExistente = await prisma.curso.findFirst();
  
  if (!cursoExistente) {
    console.error('❌ Error: No hay ningún curso en la base de datos.');
    console.log('Por favor, creá al menos un curso desde la web antes de correr el script.');
    process.exit(1);
  }

  const CANTIDAD_ALUMNOS = 5000; // Podés subirlo a 10000 si querés probar más estrés
  const alumnosData = [];

  console.log(`Generando ${CANTIDAD_ALUMNOS} alumnos en memoria...`);

  for (let i = 0; i < CANTIDAD_ALUMNOS; i++) {
    alumnosData.push({
      legajo: `LEG-${faker.string.alphanumeric({ length: 6, casing: 'upper' })}-${i}`,
      dni: faker.string.numeric(8), // DNI aleatorio de 8 números
      apellido: faker.person.lastName(),
      nombres: faker.person.firstName(),
      fechaNacimiento: faker.date.birthdate({ min: 12, max: 18, mode: 'age' }),
      domicilio: faker.location.streetAddress(),
      localidad: 'Resistencia',
      provincia: 'Chaco',
      telefono: faker.phone.number(),
      email: faker.internet.email(),
      cursoId: cursoExistente.id,
      fechaIngreso: new Date(),
    });
  }

  console.log('Insertando en la base de datos... (esto puede tardar unos segundos)');

  // 2. Insertamos todos de golpe con createMany
  const resultado = await prisma.alumno.createMany({
    data: alumnosData,
    skipDuplicates: true, // Ignora si por casualidad se genera un DNI o Legajo repetido
  });

  console.log(`✅ ¡Éxito! Se insertaron ${resultado.count} alumnos ficticios al curso "${cursoExistente.id}".`);
}

main()
  .catch((e) => {
    console.error('Ocurrió un error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });