const { verifyToken, extractToken } = require('../config/jwt');

const authenticate = (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ message: 'Token de acceso requerido' });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Sesion expirada, inicia sesion nuevamente' });
    }
    return res.status(401).json({ message: 'Token invalido' });
  }
};

const authenticateStudent = (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ message: 'Token de acceso requerido' });
  }

  try {
    const decoded = verifyToken(token);

    if (decoded.role !== 'student') {
      return res.status(403).json({ message: 'Acceso denegado: rol no autorizado' });
    }

    req.student = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Sesion expirada, inicia sesion nuevamente' });
    }
    return res.status(401).json({ message: 'Token invalido' });
  }
};

const authenticateAdmin = (req, res, next) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({ message: 'Token de acceso requerido' });
  }

  try {
    const decoded = verifyToken(token);

    if (decoded.role !== 'admin') {
      return res.status(403).json({ message: 'Acceso denegado: rol no autorizado' });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Sesion expirada, inicia sesion nuevamente' });
    }
    return res.status(401).json({ message: 'Token invalido' });
  }
};

module.exports = { authenticate, authenticateStudent, authenticateAdmin };
