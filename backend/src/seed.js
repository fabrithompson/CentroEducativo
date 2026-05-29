import bcrypt from 'bcryptjs';
import { pool } from './db.js';

// Usuarios de prueba, uno por cada rol. Contraseña común: "password123".
const USUARIOS = [
  { rol: 'estudiante', nombre: 'Lucía Fernández', email: 'lucia@demo.edu',  usuario: 'estudiante', curso: '4° A' },
  { rol: 'padre',      nombre: 'Roberto Pérez',    email: 'roberto@demo.edu', usuario: 'padre' },
  { rol: 'docente',    nombre: 'Ana Gómez',        email: 'ana@demo.edu',     usuario: 'docente' },
  { rol: 'autoridad',  nombre: 'Director Martín',  email: 'director@demo.edu',usuario: 'autoridad' },
  { rol: 'personal',   nombre: 'Sofía Admin',      email: 'sofia@demo.edu',   usuario: 'personal' },
];

const NOTICIAS = [
  { titulo: 'Comenzó el ciclo lectivo 2026', cuerpo: 'Les damos la bienvenida a todos los estudiantes y familias.', fecha: '2026-05-05' },
  { titulo: 'Jornada de orientación vocacional', cuerpo: 'Jornada especial para estudiantes de 5° año.', fecha: '2026-04-28' },
  { titulo: 'Festival de ciencias y tecnología', cuerpo: 'Invitamos a toda la comunidad a participar de nuestro festival anual.', fecha: '2026-04-20' },
];

async function seed() {
  try {
    const hash = await bcrypt.hash('password123', 10);

    for (const u of USUARIOS) {
      await pool.query(
        `INSERT INTO usuarios (rol, nombre, email, usuario, password_hash, curso)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (usuario) DO NOTHING`,
        [u.rol, u.nombre, u.email, u.usuario, hash, u.curso || null]
      );
    }

    for (const n of NOTICIAS) {
      await pool.query(
        'INSERT INTO noticias (titulo, cuerpo, fecha) VALUES ($1, $2, $3)',
        [n.titulo, n.cuerpo, n.fecha]
      );
    }

    console.log('✓ Datos de prueba cargados.');
    console.log('  Usuarios: estudiante / padre / docente / autoridad / personal');
    console.log('  Contraseña para todos: password123');
  } catch (err) {
    console.error('✗ Error al cargar datos:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();
