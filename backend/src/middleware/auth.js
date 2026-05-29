import jwt from 'jsonwebtoken';

// Verifica el token JWT enviado en el header Authorization: Bearer <token>.
// Si es válido, deja los datos del usuario en req.user.
export function autenticar(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Falta el token de autenticación.' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido o expirado.' });
  }
}

// Restringe una ruta a determinados roles.
// Uso: router.get('/admin', autenticar, permitirRoles('autoridad'), handler)
export function permitirRoles(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'No tenés permisos para acceder a este recurso.' });
    }
    next();
  };
}
