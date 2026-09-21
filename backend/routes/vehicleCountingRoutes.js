const { getPool } = require('../database');
const { state } = require('../cctvState');
const logger = require('../utils/logger');

const TARGET_BATAS_KOTA_IDS = ['CCTV-002', 'CCTV-003', 'CCTV-004', 'CCTV-005'];

function mountVehicleCountingRoutes(app) {
  // 1. Ambil info 4 CCTV Batas Kota untuk konfigurasi AI worker
  app.get('/api/vehicle-counts/targets', (req, res) => {
    try {
      const targets = TARGET_BATAS_KOTA_IDS.map((id) => {
        const found = (state.cctvsCache || []).find((c) => String(c.id) === String(id));
        return {
          id,
          name: found ? found.name : `Batas Kota (${id})`,
          ip: found ? found.ip : '',
          rtsp_url: found ? found.rtsp_url : '',
          status: found ? found.status : 'offline'
        };
      });

      return res.json({ success: true, data: targets });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 2. Endpoint untuk menerima log event counting dari AI Service (Python)
  let lastEventLogTime = 0;
  app.post('/api/vehicle-counts/record', async (req, res) => {
    try {
      const { events } = req.body;
      const pool = getPool();

      if (!events || !Array.isArray(events) || events.length === 0) {
        // Mendukung single event
        const { cctv_id, cctv_name, direction, vehicle_type, count } = req.body;
        if (!cctv_id || !direction || !vehicle_type) {
          return res.status(400).json({ error: 'Field cctv_id, direction, dan vehicle_type wajib diisi.' });
        }
        await pool.query(
          `INSERT INTO vehicle_counts (cctv_id, cctv_name, direction, vehicle_type, count) VALUES (?, ?, ?, ?, ?)`,
          [cctv_id, cctv_name || cctv_id, direction.toUpperCase(), vehicle_type.toLowerCase(), count || 1]
        );

        logger.traffic(cctv_name || cctv_id, vehicle_type, direction);
        return res.json({ success: true, message: 'Event hitungan tersimpan.' });
      }

      // Bulk insert untuk efisiensi CPU
      const values = events.map((ev) => [
        ev.cctv_id,
        ev.cctv_name || ev.cctv_id,
        ev.direction.toUpperCase(),
        ev.vehicle_type.toLowerCase(),
        ev.count || 1,
        ev.timestamp ? new Date(ev.timestamp) : new Date()
      ]);

      await pool.query(
        `INSERT INTO vehicle_counts (cctv_id, cctv_name, direction, vehicle_type, count, timestamp) VALUES ?`,
        [values]
      );

      // Log sampel event dengan throttling agar konsol tetap bersih dan nyaman dibaca
      const now = Date.now();
      if (now - lastEventLogTime > 2000 && events.length > 0) {
        const ev = events[0];
        logger.traffic(ev.cctv_name || ev.cctv_id, `${ev.vehicle_type}${events.length > 1 ? ` (+${events.length - 1} lainnya)` : ''}`, ev.direction);
        lastEventLogTime = now;
      }

      return res.json({ success: true, count: values.length, message: `${values.length} event tersimpan.` });
    } catch (err) {
      logger.error(`Error recording vehicle counts: ${err.message}`);
      return res.status(500).json({ error: err.message });
    }
  });

  // 3. Rekap ringkasan counting hari ini / per tanggal
  app.get('/api/vehicle-counts/summary', async (req, res) => {
    try {
      const pool = getPool();
      const date = req.query.date || new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      // Total Masuk (IN) dan Keluar (OUT)
      const [totals] = await pool.query(
        `SELECT direction, SUM(count) as total 
         FROM vehicle_counts 
         WHERE DATE(timestamp) = ? 
         GROUP BY direction`,
        [date]
      );

      let totalIn = 0;
      let totalOut = 0;
      totals.forEach((row) => {
        if (row.direction === 'IN') totalIn = Number(row.total);
        if (row.direction === 'OUT') totalOut = Number(row.total);
      });

      // Per CCTV Batas Kota
      const [byCctv] = await pool.query(
        `SELECT cctv_id, cctv_name, direction, SUM(count) as total 
         FROM vehicle_counts 
         WHERE DATE(timestamp) = ? 
         GROUP BY cctv_id, cctv_name, direction`,
        [date]
      );

      const cctvMap = {};
      TARGET_BATAS_KOTA_IDS.forEach((id) => {
        const found = (state.cctvsCache || []).find((c) => String(c.id) === String(id));
        cctvMap[id] = {
          id,
          name: found ? found.name : id,
          in: 0,
          out: 0,
          total: 0
        };
      });

      byCctv.forEach((row) => {
        if (!cctvMap[row.cctv_id]) {
          cctvMap[row.cctv_id] = {
            id: row.cctv_id,
            name: row.cctv_name,
            in: 0,
            out: 0,
            total: 0
          };
        }
        if (row.direction === 'IN') {
          cctvMap[row.cctv_id].in += Number(row.total);
        } else if (row.direction === 'OUT') {
          cctvMap[row.cctv_id].out += Number(row.total);
        }
        cctvMap[row.cctv_id].total += Number(row.total);
      });

      // Breakdown per tipe kendaraan
      const [byType] = await pool.query(
        `SELECT vehicle_type, direction, SUM(count) as total 
         FROM vehicle_counts 
         WHERE DATE(timestamp) = ? 
         GROUP BY vehicle_type, direction`,
        [date]
      );

      const typeStats = {
        car: { in: 0, out: 0, total: 0 },
        motorcycle: { in: 0, out: 0, total: 0 },
        truck: { in: 0, out: 0, total: 0 },
        bus: { in: 0, out: 0, total: 0 }
      };

      byType.forEach((row) => {
        const t = (row.vehicle_type || '').toLowerCase();
        if (!typeStats[t]) {
          typeStats[t] = { in: 0, out: 0, total: 0 };
        }
        if (row.direction === 'IN') typeStats[t].in += Number(row.total);
        if (row.direction === 'OUT') typeStats[t].out += Number(row.total);
        typeStats[t].total += Number(row.total);
      });

      // 10 Riwayat Terakhir
      const [recent] = await pool.query(
        `SELECT id, cctv_id, cctv_name, direction, vehicle_type, count, timestamp 
         FROM vehicle_counts 
         ORDER BY id DESC LIMIT 15`
      );

      return res.json({
        success: true,
        date,
        summary: {
          totalIn,
          totalOut,
          grandTotal: totalIn + totalOut,
          byCctv: Object.values(cctvMap),
          byType: typeStats,
          recent
        }
      });
    } catch (err) {
      console.error('Error fetching vehicle counts summary:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // 4. Statistik per jam untuk grafik tren (00:00 - 23:00)
  app.get('/api/vehicle-counts/hourly', async (req, res) => {
    try {
      const pool = getPool();
      const date = req.query.date || new Date().toISOString().slice(0, 10);
      const cctvId = req.query.cctv_id;

      let query = `
        SELECT HOUR(timestamp) as hour, direction, SUM(count) as total 
        FROM vehicle_counts 
        WHERE DATE(timestamp) = ? 
      `;
      const params = [date];

      if (cctvId) {
        query += ` AND cctv_id = ? `;
        params.push(cctvId);
      }

      query += ` GROUP BY HOUR(timestamp), direction ORDER BY hour ASC`;

      const [rows] = await pool.query(query, params);

      // Inisialisasi 24 jam (0 - 23)
      const hourlyData = Array.from({ length: 24 }, (_, i) => ({
        hour: `${String(i).padStart(2, '0')}:00`,
        in: 0,
        out: 0,
        total: 0
      }));

      rows.forEach((r) => {
        const h = Number(r.hour);
        if (h >= 0 && h < 24) {
          if (r.direction === 'IN') hourlyData[h].in += Number(r.total);
          if (r.direction === 'OUT') hourlyData[h].out += Number(r.total);
          hourlyData[h].total += Number(r.total);
        }
      });

      return res.json({ success: true, date, hourly: hourlyData });
    } catch (err) {
      console.error('Error fetching hourly vehicle counts:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  // 5. Reset / bersihkan data counting (hanya untuk testing lokal)
  app.post('/api/vehicle-counts/reset-test', async (req, res) => {
    try {
      const pool = getPool();
      await pool.query('TRUNCATE TABLE vehicle_counts');
      return res.json({ success: true, message: 'Data vehicle counts telah direset.' });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 6. Proxy live stream visual deteksi AI dari ai_service (port 5001)
  app.get('/api/vehicle-counts/ai-stream/:cctvId', (req, res) => {
    const { cctvId } = req.params;
    const http = require('http');

    logger.webAction('AI-STREAM', `Membuka Live Visual Deteksi AI: ${cctvId}`);

    const proxyReq = http.request(
      `http://127.0.0.1:5001/stream/${encodeURIComponent(cctvId)}`,
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': proxyRes.headers['content-type'] || 'multipart/x-mixed-replace; boundary=frame',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Connection: 'keep-alive',
        });
        proxyRes.pipe(res);
      }
    );

    proxyReq.on('error', () => {
      if (!res.headersSent) {
        res.status(503).json({
          error: 'AI Stream Offline',
          message: 'Layanan Python AI belum berjalan di port 5001. Jalankan ai_service/run_ai.bat terlebih dahulu.'
        });
      }
    });

    req.on('close', () => {
      try {
        proxyReq.destroy();
      } catch (_) {}
    });

    proxyReq.end();
  });

  // 7. Kontrol Nyala/Mati AI Service dari Dashboard
  app.get('/api/vehicle-counts/service-status', (req, res) => {
    try {
      const { getAiServiceStatus } = require('../startup');
      return res.json({ success: true, ...getAiServiceStatus() });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/vehicle-counts/service-start', (req, res) => {
    logger.webAction('AI', 'Perintah Web: Menyalakan Layanan AI Counting');
    try {
      const { startAiService } = require('../startup');
      const result = startAiService();
      return res.json(result);
    } catch (err) {
      logger.ai('ERROR', `Gagal menyalakan AI: ${err.message}`, 'error');
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/vehicle-counts/service-stop', (req, res) => {
    logger.webAction('AI', 'Perintah Web: Mematikan Layanan AI Counting');
    try {
      const { stopAiService } = require('../startup');
      const result = stopAiService();
      return res.json(result);
    } catch (err) {
      logger.ai('ERROR', `Gagal mematikan AI: ${err.message}`, 'error');
      return res.status(500).json({ error: err.message });
    }
  });
}

module.exports = { mountVehicleCountingRoutes, TARGET_BATAS_KOTA_IDS };
