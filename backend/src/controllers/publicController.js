import { query } from '../db.js';
import {
  validarOpinion,
  validarInscripcion,
  validarContacto,
  validarPostulacion,
} from '../utils/validators.js';

// ---------------- OPINIONES ----------------

// GET /api/opiniones  -> listado público (más recientes primero)
export async function listarOpiniones(_req, res) {
  const { rows } = await query(
    'SELECT id, nombre, identificacion, comentario, valoracion, creado_en FROM opiniones ORDER BY creado_en DESC LIMIT 50'
  );
  res.json({ opiniones: rows });
}

// POST /api/opiniones  -> crear (sin login)
export async function crearOpinion(req, res) {
  const errores = validarOpinion(req.body);
  if (errores.length) return res.status(400).json({ errores });

  const { nombre, identificacion, comentario, valoracion } = req.body;
  const { rows } = await query(
    `INSERT INTO opiniones (nombre, identificacion, comentario, valoracion)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [nombre.trim(), identificacion || null, comentario.trim(), Number(valoracion)]
  );
  res.status(201).json({ opinion: rows[0] });
}

// ---------------- INSCRIPCIONES ----------------

// POST /api/inscripciones  -> genera un número de solicitud
export async function crearInscripcion(req, res) {
  const errores = validarInscripcion(req.body);
  if (errores.length) return res.status(400).json({ errores });

  const { nombre_tutor, email, telefono, nombre_alumno, nivel, anio_curso, comentario } = req.body;

  // Número de solicitud legible: INS-<año>-<5 dígitos>
  const numero = `INS-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

  const { rows } = await query(
    `INSERT INTO inscripciones
       (numero, nombre_tutor, email, telefono, nombre_alumno, nivel, anio_curso, comentario)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [numero, nombre_tutor.trim(), email.trim().toLowerCase(), telefono.trim(),
     nombre_alumno.trim(), nivel, anio_curso || null, comentario || null]
  );
  res.status(201).json({ inscripcion: rows[0], numero });
}

// ---------------- CONTACTO ----------------

// POST /api/contacto
export async function crearContacto(req, res) {
  const errores = validarContacto(req.body);
  if (errores.length) return res.status(400).json({ errores });

  const { nombre, email, telefono, asunto, mensaje } = req.body;
  const { rows } = await query(
    `INSERT INTO contactos (nombre, email, telefono, asunto, mensaje)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [nombre.trim(), email.trim().toLowerCase(), telefono || null, asunto || null, mensaje.trim()]
  );
  res.status(201).json({ contacto: rows[0] });
}

// ---------------- POSTULACIONES (EMPLEO) ----------------

// POST /api/empleo  -> recibe multipart/form-data con el CV en PDF
export async function crearPostulacion(req, res) {
  const errores = validarPostulacion(req.body);
  if (errores.length) return res.status(400).json({ errores });

  const { nombre, email, telefono, puesto, mensaje } = req.body;
  const cvArchivo = req.file ? req.file.filename : null; // nombre del PDF guardado

  const { rows } = await query(
    `INSERT INTO postulaciones (nombre, email, telefono, puesto, mensaje, cv_archivo)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [nombre.trim(), email.trim().toLowerCase(), telefono || null, puesto, mensaje || null, cvArchivo]
  );
  res.status(201).json({ postulacion: rows[0] });
}

// ---------------- NOTICIAS ----------------

// GET /api/noticias  -> listado público
export async function listarNoticias(_req, res) {
  const { rows } = await query(
    'SELECT id, titulo, cuerpo, fecha FROM noticias ORDER BY fecha DESC LIMIT 20'
  );
  res.json({ noticias: rows });
}
