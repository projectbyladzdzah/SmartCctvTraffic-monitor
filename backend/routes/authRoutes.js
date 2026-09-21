const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../database');
const { signToken, requireAuth, requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 menit jendela waktu
  max: 30, // Maksimal 30 request login per IP per 15 menit agar tidak mudah terblokir saat testing / multi-device
  message: { error: 'Terlalu banyak percobaan login. Silakan coba beberapa saat lagi.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req) => {
    return req.headers['cf-connecting-ip'] || req.ip || '127.0.0.1';
  },
});

function mountAuthRoutes(app) {
  app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan password wajib' });
    }
    try {
      const pool = db.getPool();
      if (!pool) {
        return res.status(503).json({ error: 'Database belum siap atau terputus' });
      }
      const [rows] = await pool.query(
        'SELECT id, username, password_hash, role FROM users WHERE username = ?',
        [String(username).trim()],
      );
      const user = rows[0];
      if (!user) {
        logger.auth('GAGAL', `Percobaan login gagal untuk user '${username}'`, false);
        return res.status(401).json({ error: 'Username atau password salah' });
      }
      const ok = await bcrypt.compare(String(password), user.password_hash);
      if (!ok) {
        logger.auth('GAGAL', `Password salah untuk user '${username}'`, false);
        return res.status(401).json({ error: 'Username atau password salah' });
      }
      const token = signToken({ id: user.id, username: user.username, role: user.role });
      logger.auth('LOGIN', `User '${user.username}' (${user.role}) berhasil masuk dari Web Dashboard`, true);
      return res.json({
        token,
        user: { id: user.id, username: user.username, role: user.role },
      });
    } catch (err) {
      logger.error(`Login error: ${err.message}`);
      if (err.code === 'ECONNREFUSED' || err.code === 'PROTOCOL_CONNECTION_LOST') {
        return res.status(503).json({ error: 'Gagal terhubung ke database server MySQL. Pastikan MySQL di XAMPP aktif.' });
      }
      return res.status(500).json({ error: 'Gagal login: ' + (err.message || 'Terjadi kesalahan sistem') });
    }
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ user: { id: req.user.sub, username: req.user.username, role: req.user.role } });
  });

  app.post('/api/auth/users', requireAuth, requireAdmin, async (req, res) => {
    const { username, password, role } = req.body || {};
    const u = String(username || '').trim();
    const p = String(password || '');
    const r = String(role || 'user').toLowerCase();
    if (!u || !p) {
      return res.status(400).json({ error: 'Username dan password wajib' });
    }
    if (p.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter' });
    }
    if (r !== 'admin' && r !== 'user') {
      return res.status(400).json({ error: 'Role harus admin atau user' });
    }
    try {
      const hash = await bcrypt.hash(p, 10);
      const [result] = await db.getPool().query(
        'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
        [u, hash, r],
      );
      res.status(201).json({
        message: 'Pengguna dibuat',
        user: { id: result.insertId, username: u, role: r },
      });
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: 'Username sudah dipakai' });
      }
      console.error('❌ Buat user error:', err.message);
      return res.status(500).json({ error: 'Gagal membuat pengguna' });
    }
  });

  app.get('/api/auth/users', requireAuth, requireAdmin, async (req, res) => {
    try {
      const [rows] = await db.getPool().query(
        'SELECT id, username, role, created_at FROM users ORDER BY created_at DESC',
      );
      res.json({ users: rows });
    } catch (err) {
      console.error('❌ Get users error:', err.message);
      return res.status(500).json({ error: 'Gagal mengambil data pengguna' });
    }
  });

  app.delete('/api/auth/users/:userId', requireAuth, requireAdmin, async (req, res) => {
    const userId = parseInt(req.params.userId, 10);
    const currentUserId = req.user.sub;

    if (isNaN(userId)) {
      return res.status(400).json({ error: 'User ID tidak valid' });
    }

    if (userId === currentUserId) {
      return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri' });
    }

    try {
      const [result] = await db.getPool().query('DELETE FROM users WHERE id = ?', [userId]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
      }
      res.json({ message: 'Pengguna dihapus' });
    } catch (err) {
      console.error('❌ Delete user error:', err.message);
      return res.status(500).json({ error: 'Gagal menghapus pengguna' });
    }
  });

  app.post('/api/auth/reset-password', requireAuth, requireAdmin, async (req, res) => {
    const { userId, newPassword } = req.body || {};
    const uid = parseInt(userId, 10);
    const np = String(newPassword || '').trim();

    if (isNaN(uid)) {
      return res.status(400).json({ error: 'User ID tidak valid' });
    }

    if (!np || np.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter' });
    }

    try {
      const hash = await bcrypt.hash(np, 10);
      const [result] = await db.getPool().query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, uid]);
      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
      }
      res.json({ message: 'Password berhasil direset' });
    } catch (err) {
      console.error('❌ Reset password error:', err.message);
      return res.status(500).json({ error: 'Gagal mereset password' });
    }
  });
}

module.exports = { mountAuthRoutes };
