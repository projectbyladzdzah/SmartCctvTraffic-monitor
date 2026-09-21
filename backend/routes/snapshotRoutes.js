const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { getPool } = require('../database');
const { requireAuth, requireAdmin, requireStreamAuth } = require('../middleware/auth');
const logger = require('../utils/logger');

// 1. 👇 TAMBAHKAN cctvEvents DI SINI 👇
const { refreshCaptureSchedules, captureAllSnapshots, cctvEvents } = require('../services/snapshotService');

function getDisplaySnapshotStatus(status, errorType) {
  if (status === 'bagus') return 'Jelas';
  if (status === 'error' && errorType === 'blur') return 'Buram';
  return 'Error';
}

function getJakartaDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).reduce((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function attachCaptureSchedule(item, schedules) {
  const capturedAt = getJakartaDateTime(item.created_at);
  if (!capturedAt || !schedules.length) {
    return { ...item, capture_session: 'Manual', schedule_name: '', schedule_time: '' };
  }

  const matchingSchedules = schedules
    .map((schedule) => {
      const [hour, minute] = String(schedule.time || '').split(':').map(Number);
      if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
      return { schedule, minutes: hour * 60 + minute };
    })
    .filter(Boolean)
    .sort((left, right) => Math.abs(left.minutes - capturedAt.minutes) - Math.abs(right.minutes - capturedAt.minutes));

  const match = matchingSchedules[0];
  if (!match) return { ...item, capture_session: 'Manual', schedule_name: '', schedule_time: '' };

  return {
    ...item,
    schedule_id: match.schedule.id,
    schedule_name: match.schedule.name || 'Sesi Capture',
    schedule_time: match.schedule.time,
    capture_session: `${match.schedule.name || 'Sesi Capture'} (${match.schedule.time})`,
  };
}

function mountSnapshotRoutes(app) {

  // 2. 👇 TAMBAHKAN ENDPOINT STREAM (SSE) DI SINI 👇
  app.get('/api/snapshots/stream', requireStreamAuth, (req, res) => {
    // Set Header khusus untuk Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // Kirim pesan pertama agar koneksi langsung sukses tersambung
    res.write(`data: {"message": "Koneksi Live CCTV terhubung"}\n\n`);

    // Fungsi untuk mengirim data baru ke Frontend
    const sendUpdate = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Dengarkan sinyal dari proses capture
    if (cctvEvents) {
      cctvEvents.on('snapshot_updated', sendUpdate);
    }

    // Hapus pendengar jika user menutup tab browser
    req.on('close', () => {
      if (cctvEvents) {
        cctvEvents.removeListener('snapshot_updated', sendUpdate);
      }
    });
  });
  // 👆 BATAS KODE ENDPOINT STREAM 👆


  app.get('/api/snapshots/latest', requireAuth, async (req, res) => {
    try {
      const pool = getPool();
      const [rows] = await pool.query(`
        SELECT s1.*
        FROM cctv_snapshots s1
        INNER JOIN (
          SELECT cctv_id, MAX(created_at) AS max_created_at
          FROM cctv_snapshots
          GROUP BY cctv_id
        ) s2 ON s1.cctv_id = s2.cctv_id AND s1.created_at = s2.max_created_at
        ORDER BY s1.created_at DESC
      `);

      const result = [];
      for (const row of rows) {
        const [cctvRows] = await pool.query('SELECT id, name FROM cctvs WHERE id = ?', [row.cctv_id]);
        result.push({
          id: row.id,
          cctv_id: row.cctv_id,
          cctv_name: cctvRows[0]?.name || 'CCTV',
          image_path: row.image_path,
          status: row.status,
          error_type: row.error_type,
          created_at: row.created_at,
        });
      }

      res.json(result);
    } catch (error) {
      console.error('❌ Error get latest snapshots:', error.message);
      res.status(500).json({ error: 'Gagal mengambil snapshot terbaru' });
    }
  });

  app.get('/api/snapshots/recap', requireAuth, async (req, res) => {
    try {
      const { status, cctv_id, date, schedule_id } = req.query;
      const conditions = [];
      const values = [];

      if (status && ['bagus', 'error', 'jelas', 'buram'].includes(status)) {
        if (status === 'bagus') {
          conditions.push('s.status = ?');
          values.push('bagus');
        } else if (status === 'error') {
          conditions.push('s.status = ?');
          values.push('error');
        } else if (status === 'jelas') {
          conditions.push('s.status = ?');
          values.push('bagus');
        } else if (status === 'buram') {
          conditions.push('s.status = ? AND s.error_type = ?');
          values.push('error', 'blur');
        } else {
          conditions.push("s.status = 'error' AND (s.error_type IS NULL OR s.error_type <> 'blur')");
        }
      }

      if (cctv_id) {
        conditions.push('s.cctv_id = ?');
        values.push(String(cctv_id));
      }

      if (date) {
        conditions.push('DATE(s.created_at) = ?');
        values.push(String(date));
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

      const [rows] = await getPool().query(`
        SELECT s.*, c.name AS cctv_name
        FROM cctv_snapshots s
        LEFT JOIN cctvs c ON c.id = s.cctv_id
        ${whereClause}
        ORDER BY s.created_at DESC
      `, values);

      const [schedules] = await getPool().query('SELECT id, name, time FROM cctv_capture_schedules ORDER BY time ASC');
      const enrichedRows = rows.map((item) => attachCaptureSchedule(item, schedules));
      const filteredRows = schedule_id
        ? enrichedRows.filter((item) => String(item.schedule_id) === String(schedule_id))
        : enrichedRows;

      res.json(filteredRows.map((item) => ({
        id: item.id,
        cctv_id: item.cctv_id,
        cctv_name: item.cctv_name || 'CCTV',
        image_path: item.image_path,
        status: item.status,
        error_type: item.error_type,
        created_at: item.created_at,
        schedule_id: item.schedule_id || null,
        schedule_name: item.schedule_name,
        schedule_time: item.schedule_time,
        capture_session: item.capture_session,
      })));
    } catch (error) {
      console.error('❌ Error get recap snapshots:', error.message);
      res.status(500).json({ error: 'Gagal mengambil rekap snapshot' });
    }
  });

  app.post('/api/snapshots/capture-all', requireAuth, requireAdmin, async (req, res) => {
    logger.capture('CAPTURE', 'Perintah Web: Mengambil foto snapshot seluruh kamera CCTV');
    try {
      const results = await captureAllSnapshots();
      res.json({
        message: 'Capture semua CCTV berhasil dijalankan',
        count: results.length,
        results,
      });
    } catch (error) {
      logger.error(`Error capture all snapshots: ${error.message}`);
      res.status(500).json({ error: 'Gagal menjalankan capture semua CCTV' });
    }
  });

  app.delete('/api/snapshots', requireAuth, requireAdmin, async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
      if (!ids.length) {
        return res.status(400).json({ error: 'Tidak ada snapshot yang dipilih' });
      }

      const placeholders = ids.map(() => '?').join(', ');
      const [rows] = await getPool().query(`SELECT id, image_path FROM cctv_snapshots WHERE id IN (${placeholders})`, ids);

      for (const row of rows) {
        if (row.image_path) {
          const relativePath = String(row.image_path).replace(/^\//, '');
          const absolutePath = path.resolve(__dirname, '../../public', relativePath);
          if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
          }
        }
      }

      await getPool().query(`DELETE FROM cctv_snapshots WHERE id IN (${placeholders})`, ids);
      logger.capture('HAPUS', `Menghapus ${ids.length} foto rekap snapshot dari server`);
      res.json({ message: 'Snapshot berhasil dihapus', deletedCount: ids.length });
    } catch (error) {
      logger.error(`Error delete snapshots: ${error.message}`);
      res.status(500).json({ error: 'Gagal menghapus snapshot yang dipilih' });
    }
  });

  app.get('/api/snapshots/schedules', requireAuth, async (req, res) => {
    try {
      const [rows] = await getPool().query(
        'SELECT * FROM cctv_capture_schedules ORDER BY time ASC',
      );
      res.json(rows);
    } catch (error) {
      logger.error(`Error get capture schedules: ${error.message}`);
      res.status(500).json({ error: 'Gagal mengambil jadwal capture' });
    }
  });

  app.post('/api/snapshots/schedules', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { name, time, enabled = true, description = '' } = req.body || {};
      if (!name || !time || !/^\d{2}:\d{2}$/.test(time)) {
        return res.status(400).json({ error: 'Nama dan waktu jadwal harus valid, format HH:MM' });
      }

      const [result] = await getPool().query(
        'INSERT INTO cctv_capture_schedules (name, time, enabled, description) VALUES (?, ?, ?, ?)',
        [String(name).trim(), time, enabled ? 1 : 0, String(description || '').trim()],
      );

      refreshCaptureSchedules();
      logger.capture('JADWAL+', `Menambah jadwal foto otomatis: ${name} (${time})`);
      res.status(201).json({ message: 'Jadwal capture berhasil ditambahkan', id: result.insertId });
    } catch (error) {
      logger.error(`Error add capture schedule: ${error.message}`);
      res.status(500).json({ error: 'Gagal menambahkan jadwal capture' });
    }
  });

  app.put('/api/snapshots/schedules/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, time, enabled = true, description = '' } = req.body || {};
      if (!name || !time || !/^\d{2}:\d{2}$/.test(time)) {
        return res.status(400).json({ error: 'Nama dan waktu jadwal harus valid, format HH:MM' });
      }

      await getPool().query(
        'UPDATE cctv_capture_schedules SET name = ?, time = ?, enabled = ?, description = ? WHERE id = ?',
        [String(name).trim(), time, enabled ? 1 : 0, String(description || '').trim(), id],
      );

      refreshCaptureSchedules();
      res.json({ message: 'Jadwal capture berhasil diperbarui' });
    } catch (error) {
      console.error('❌ Error update capture schedule:', error.message);
      res.status(500).json({ error: 'Gagal memperbarui jadwal capture' });
    }
  });

  app.delete('/api/snapshots/schedules/:id', requireAuth, requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await getPool().query('DELETE FROM cctv_capture_schedules WHERE id = ?', [id]);
      refreshCaptureSchedules();
      res.json({ message: 'Jadwal capture berhasil dihapus' });
    } catch (error) {
      console.error('❌ Error delete capture schedule:', error.message);
      res.status(500).json({ error: 'Gagal menghapus jadwal capture' });
    }
  });

  app.get('/api/snapshots/recap/export', requireAuth, async (req, res) => {
    try {
      const { status, cctv_id, date, schedule_id } = req.query;
      const conditions = [];
      const values = [];

      if (status && ['bagus', 'error', 'jelas', 'buram'].includes(status)) {
        if (status === 'bagus' || status === 'jelas') {
          conditions.push('s.status = ?');
          values.push('bagus');
        } else if (status === 'buram') {
          conditions.push('s.status = ? AND s.error_type = ?');
          values.push('error', 'blur');
        } else {
          conditions.push("s.status = 'error' AND (s.error_type IS NULL OR s.error_type <> 'blur')");
        }
      }

      if (cctv_id) {
        conditions.push('s.cctv_id = ?');
        values.push(String(cctv_id));
      }

      if (date) {
        conditions.push('DATE(s.created_at) = ?');
        values.push(String(date));
      }

      const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const [rows] = await getPool().query(`
        SELECT s.*, c.name AS cctv_name
        FROM cctv_snapshots s
        LEFT JOIN cctvs c ON c.id = s.cctv_id
        ${whereClause}
        ORDER BY s.created_at DESC
      `, values);

      const [schedules] = await getPool().query('SELECT id, name, time FROM cctv_capture_schedules ORDER BY time ASC');
      const enrichedRows = rows.map((item) => attachCaptureSchedule(item, schedules));
      const exportRows = schedule_id
        ? enrichedRows.filter((item) => String(item.schedule_id) === String(schedule_id))
        : enrichedRows;

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Snapshot Recap');

      worksheet.columns = [
        { header: 'ID', key: 'id', width: 10 },
        { header: 'CCTV ID', key: 'cctv_id', width: 18 },
        { header: 'Nama CCTV', key: 'cctv_name', width: 26 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Error Type', key: 'error_type', width: 20 },
        { header: 'Sesi Pengambilan', key: 'capture_session', width: 24 },
        { header: 'Waktu', key: 'created_at', width: 22 },
        { header: 'Tampilan CCTV', key: 'image_path', width: 24 },
      ];

      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E78' },
      };

      exportRows.forEach((item) => {
        const row = worksheet.addRow({
          id: item.id,
          cctv_id: item.cctv_id || '',
          cctv_name: item.cctv_name || '',
          status: getDisplaySnapshotStatus(item.status, item.error_type),
          error_type: item.error_type || '',
          capture_session: item.capture_session || 'Manual',
          created_at: item.created_at || '',
          image_path: item.image_path ? 'Terlampir' : 'Tidak tersedia',
        });

        row.height = 82;

        if (!item.image_path) return;

        const relativePath = String(item.image_path).replace(/^\/+/, '');
        const imagePath = path.resolve(__dirname, '../../public', relativePath);
        const publicDirectory = path.resolve(__dirname, '../../public');
        const isInsidePublicDirectory = imagePath === publicDirectory
          || imagePath.startsWith(`${publicDirectory}${path.sep}`);

        if (!isInsidePublicDirectory || !fs.existsSync(imagePath)) return;

        const extension = path.extname(imagePath).toLowerCase();
        const imageExtension = extension === '.png' ? 'png' : 'jpeg';
        const imageId = workbook.addImage({
          filename: imagePath,
          extension: imageExtension,
        });

        worksheet.addImage(imageId, {
          tl: { col: 6, row: row.number - 1 },
          br: { col: 7, row: row.number },
          editAs: 'twoCell',
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const filename = `snapshot_recap_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (error) {
      console.error('❌ Error export recap snapshots:', error.message);
      res.status(500).json({ error: 'Gagal export rekap screenshot ke Excel' });
    }
  });
}

module.exports = { mountSnapshotRoutes };