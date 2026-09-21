const db = require('../database');
const ping = require('ping');
const { probeIp } = require('../services/pingService');
const { requireAuth } = require('../middleware/auth');
const { state } = require('../cctvState');
const logger = require('../utils/logger');

function mountPingHistoryRoutes(app) {
  app.get('/api/ping/:ip', requireAuth, async (req, res) => {
    const ip = String(req.params.ip || '').trim();
    if (!ip) {
      return res.status(400).json({ error: 'IP address wajib diisi' });
    }
    try {
      let isAlive = false;
      let pingTime = null;

      // 1. Coba ICMP echo ping terlebih dahulu (sangat cepat ~1-5ms untuk gateway, router, switch, dan CCTV)
      try {
        const icmpRes = await ping.promise.probe(ip, { timeout: 1, min_reply: 1 });
        if (icmpRes && icmpRes.alive) {
          isAlive = true;
          pingTime = icmpRes.time !== 'unknown' ? String(icmpRes.time) : '<1';
        }
      } catch (_) {}

      // 2. Fallback jika ICMP diblokir oleh firewall perangkat, uji port TCP (554 RTSP / 80 HTTP)
      if (!isAlive) {
        try {
          const tcpRes = await probeIp(ip, 1);
          if (tcpRes && tcpRes.alive) {
            isAlive = true;
            pingTime = tcpRes.time || '<1';
          }
        } catch (_) {}
      }

      const foundCctv = (state.cctvsCache || []).find((c) => c.ip === ip || c.gateway === ip);
      const label = foundCctv ? (foundCctv.ip === ip ? foundCctv.name : `Gateway (${foundCctv.name})`) : ip;
      logger.ping(`Uji koneksi ke ${label} [${ip}]: ${isAlive ? `ONLINE (${pingTime}ms)` : 'OFFLINE (RTO)'}`, isAlive);

      res.json({
        alive: isAlive,
        time: pingTime,
      });
    } catch (error) {
      logger.error(`Gagal ping ${ip}: ${error.message}`);
      res.status(500).json({ error: 'Gagal melakukan proses ping' });
    }
  });

  app.get('/api/history', requireAuth, async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 10000);
    try {
      const [rows] = await db.getPool().query(
        `SELECT h.id, h.cctv_id, h.status, h.timestamp, c.name AS cctv_name
       FROM cctv_status_history h
       LEFT JOIN cctvs c ON c.id = h.cctv_id
       ORDER BY h.timestamp DESC
       LIMIT ?`,
        [limit],
      );
      res.json(rows);
    } catch (error) {
      console.error('❌ Error saat mengambil riwayat global:', error.message);
      res.status(500).json({ error: 'Gagal mengambil riwayat dari database' });
    }
  });

  app.get('/api/history/:cctvId', requireAuth, async (req, res) => {
    const { cctvId } = req.params;
    try {
      const [rows] = await db.getPool().query(
        'SELECT * FROM cctv_status_history WHERE cctv_id = ? ORDER BY timestamp DESC',
        [cctvId],
      );
      res.json(rows);
    } catch (error) {
      console.error(`❌ Error saat mengambil riwayat untuk CCTV ${cctvId}:`, error.message);
      res.status(500).json({ error: 'Gagal mengambil riwayat dari database' });
    }
  });
}

module.exports = { mountPingHistoryRoutes };
