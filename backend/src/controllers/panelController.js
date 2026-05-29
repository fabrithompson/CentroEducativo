import { query } from '../db.js';

// Datos simulados para los roles que aún no tienen módulos académicos reales.
// (En una etapa siguiente saldrían de tablas: cursos, asistencias, tareas, etc.)
const SIMULADO = {
  cursos: ['Matemática', 'Lengua', 'Ciencias Naturales', 'Historia'],
  horario: [
    { dia: 'Lunes', detalle: 'Matemática · Lengua · Ed. Física' },
    { dia: 'Martes', detalle: 'Historia · Ciencias · Arte' },
    { dia: 'Miércoles', detalle: 'Lengua · Matemática · Música' },
  ],
  tareas: [
    { materia: 'Matemática', detalle: 'Ejercicios pág. 42', vence: '10/06/2026' },
    { materia: 'Lengua', detalle: 'Ensayo sobre el cuento leído', vence: '12/06/2026' },
  ],
  asistencia: { presentes: 38, ausentes: 2, porcentaje: 95 },
};

// Trae las últimas noticias (sirven de "comunicados" para varios roles).
async function comunicados() {
  const { rows } = await query(
    'SELECT id, titulo, cuerpo, fecha FROM noticias ORDER BY fecha DESC LIMIT 5'
  );
  return rows;
}

// GET /api/panel/resumen  (protegida) -> payload según el rol.
export async function resumen(req, res) {
  const { rol, nombre } = req.user;
  const base = { rol, nombre };

  try {
    switch (rol) {
      case 'estudiante':
        return res.json({
          ...base,
          modulos: {
            cursos: SIMULADO.cursos,
            horario: SIMULADO.horario,
            tareas: SIMULADO.tareas,
            asistencia: SIMULADO.asistencia,
            comunicados: await comunicados(),
          },
        });

      case 'padre':
        return res.json({
          ...base,
          modulos: {
            estudiante: { nombre: 'María Pérez', curso: '4° A', nivel: 'Secundaria' },
            asistencia: SIMULADO.asistencia,
            estadoInscripcion: 'Inscripción confirmada · Ciclo 2026',
            comunicados: await comunicados(),
          },
        });

      case 'docente':
        return res.json({
          ...base,
          modulos: {
            cursosAsignados: ['3° A · Matemática', '4° B · Matemática', '5° A · Física'],
            tareas: SIMULADO.tareas,
            asistencia: SIMULADO.asistencia,
            comunicados: await comunicados(),
          },
        });

      case 'autoridad': {
        // Panel administrativo: datos reales agregados de la base.
        const [usuarios, inscripciones, opiniones, contactos, postulaciones, noticias] =
          await Promise.all([
            query('SELECT id, rol, nombre, email, usuario, creado_en FROM usuarios ORDER BY creado_en DESC LIMIT 50'),
            query('SELECT * FROM inscripciones ORDER BY creado_en DESC LIMIT 50'),
            query('SELECT * FROM opiniones ORDER BY creado_en DESC LIMIT 50'),
            query('SELECT * FROM contactos ORDER BY creado_en DESC LIMIT 50'),
            query('SELECT id, nombre, email, puesto, cv_archivo, creado_en FROM postulaciones ORDER BY creado_en DESC LIMIT 50'),
            query('SELECT * FROM noticias ORDER BY fecha DESC LIMIT 20'),
          ]);
        return res.json({
          ...base,
          modulos: {
            usuarios: usuarios.rows,
            inscripciones: inscripciones.rows,
            opiniones: opiniones.rows,
            consultas: contactos.rows,
            postulaciones: postulaciones.rows,
            noticias: noticias.rows,
          },
        });
      }

      case 'personal': {
        const [contactos, inscripciones, postulaciones] = await Promise.all([
          query('SELECT * FROM contactos ORDER BY creado_en DESC LIMIT 50'),
          query('SELECT * FROM inscripciones ORDER BY creado_en DESC LIMIT 50'),
          query('SELECT id, nombre, email, puesto, cv_archivo, creado_en FROM postulaciones ORDER BY creado_en DESC LIMIT 50'),
        ]);
        return res.json({
          ...base,
          modulos: {
            consultas: contactos.rows,
            inscripciones: inscripciones.rows,
            postulaciones: postulaciones.rows,
            comunicados: await comunicados(),
          },
        });
      }

      default:
        return res.status(400).json({ error: 'Rol no reconocido.' });
    }
  } catch (err) {
    console.error('Error en panel/resumen:', err);
    return res.status(500).json({ error: 'Error interno al cargar el panel.' });
  }
}
