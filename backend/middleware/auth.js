require('dotenv').config();
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'cctv-monitor-dev-secret-ganti-di-production';

function signToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      username: user.username,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

function verifyTokenString(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Tidak terautentikasi' });
  }
  const payload = verifyTokenString(header.slice(7));
  if (!payload) {
    return res.status(401).json({ error: 'Token tidak valid atau kadaluarsa' });
  }
  req.user = payload;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Hanya admin yang dapat mengakses' });
  }
  next();
}

/** Untuk stream MJPEG: token bisa lewat query `token=` karena <img> tidak mengirim header. */
function requireStreamAuth(req, res, next) {
  const q = req.query.token;
  const header = req.headers.authorization;
  const raw =
    (typeof q === 'string' && q.trim() ? q.trim() : null) ||
    (header && header.startsWith('Bearer ') ? header.slice(7) : null);
  const payload = verifyTokenString(raw);
  if (!payload) {
    return res.status(401).end('Unauthorized');
  }
  if (payload.role !== 'admin' && payload.role !== 'user') {
    return res.status(403).end('Forbidden');
  }
  req.user = payload;
  next();
}

module.exports = {
  JWT_SECRET,
  signToken,
  verifyTokenString,
  requireAuth,
  requireAdmin,
  requireStreamAuth,
};
