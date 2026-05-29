import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../db.js';
import { validarRegistro } from '../utils/validators.js';

const SALT_ROUNDS = 10;
const TOKEN_DURACION = '8h';

// Genera el token JWT a partir de un registro de usuario.
function firmarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre, usuario: usuario.usuario },
    process.env.JWT_SECRET,
    { expiresIn: TOKEN_DURACION }
  );
}

// Quita el hash de contraseña antes de devolver el usuario al cliente.
function sanear(u) {
  const { password_hash, ...resto } = u;
  return resto;
}

// POST /api/auth/register
export async function registrar(req, res) {
  const errores = validarRegistro(req.body);
  if (errores.length) return res.status(400).json({ errores });

  const { rol, nombre, email, usuario, password, dni, curso } = req.body;

  try {
    // Validar usuario y email únicos.
    const existe = await query(
      'SELECT 1 FROM usuarios WHERE usuario = $1 OR email = $2',
      [usuario.trim(), email.trim().toLowerCase()]
    );
    if (existe.rowCount > 0) {
      return res.status(409).json({ errores: ['El usuario o el email ya están registrados.'] });
    }

    // Hasheamos la contraseña; nunca se guarda en texto plano.
    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const { rows } = await query(
      `INSERT INTO usuarios (rol, nombre, email, usuario, password_hash, dni, curso)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, rol, nombre, email, usuario, dni, curso, creado_en`,
      [rol, nombre.trim(), email.trim().toLowerCase(), usuario.trim(), password_hash, dni || null, curso || null]
    );

    const nuevo = rows[0];
    return res.status(201).json({ usuario: nuevo, token: firmarToken(nuevo) });
  } catch (err) {
    console.error('Error en registro:', err);
    return res.status(500).json({ errores: ['Error interno al registrar el usuario.'] });
  }
}

// POST /api/auth/login
export async function login(req, res) {
  const { usuario, password } = req.body;
  if (!usuario || !password) {
    return res.status(400).json({ errores: ['Usuario y contraseña son obligatorios.'] });
  }

  try {
    const { rows } = await query('SELECT * FROM usuarios WHERE usuario = $1', [usuario.trim()]);
    const user = rows[0];

    // Comparamos siempre, exista o no el usuario, con un mensaje genérico.
    const ok = user ? await bcrypt.compare(password, user.password_hash) : false;
    if (!ok) {
      return res.status(401).json({ errores: ['Usuario o contraseña incorrectos.'] });
    }

    return res.json({ usuario: sanear(user), token: firmarToken(user) });
  } catch (err) {
    console.error('Error en login:', err);
    return res.status(500).json({ errores: ['Error interno al iniciar sesión.'] });
  }
}

// GET /api/auth/me  (ruta protegida)
export async function perfil(req, res) {
  try {
    const { rows } = await query(
      'SELECT id, rol, nombre, email, usuario, dni, curso, creado_en FROM usuarios WHERE id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado.' });
    return res.json({ usuario: rows[0] });
  } catch (err) {
    console.error('Error en perfil:', err);
    return res.status(500).json({ error: 'Error interno.' });
  }
}
