const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'sigba_jwt_secret_change_in_production';
const JWT_EXPIRES_IN = '8h';

const signToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

const extractToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice(7);
};

module.exports = { signToken, verifyToken, extractToken, JWT_SECRET };
