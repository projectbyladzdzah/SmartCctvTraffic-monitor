const multer = require('multer');
const ExcelJS = require('exceljs');
const db = require('../database');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { state } = require('../cctvState');
const logger = require('../utils/logger');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.xls', '.xlsx', '.csv'];
    const ext = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Format file harus Excel (.xls, .xlsx) atau CSV'));
    }
  },
});

function normalizeHeader(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickValue(row, candidates) {
  for (const key of candidates) {
    const value = row[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

function mountCctvRoutes(app) {
  app.get('/api/cctvs', requireAuth, async (req, res) => {
    // Jika cache di memori belum terisi RTSP URL, sinkronkan otomatis dari database
    if (!state.cctvsCache.length || !state.cctvsCache.some((c) => c.rtsp_url)) {
      try {
        const [rows] = await db.getPool().query('SELECT * FROM cctvs ORDER BY id ASC');
        if (rows.length) {
          state.cctvsCache = rows;
        }
      } catch (_) {}
    }
    res.json(state.cctvsCache);
  });

  app.get('/api/cctvs/export', requireAuth, requireAdmin, async (req, res) => {
    try {
      const [rows] = await db.getPool().query('SELECT * FROM cctvs ORDER BY created_at DESC');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('CCTV Data');

      worksheet.columns = [
        { header: 'ID', key: 'id', width: 18 },
        { header: 'Nama CCTV', key: 'name', width: 28 },
        { header: 'Jenis', key: 'jenis', width: 18 },
        { header: 'Merk', key: 'merk', width: 18 },
        { header: 'Type', key: 'type', width: 18 },
        { header: 'IP', key: 'ip', width: 18 },
        { header: 'Gateway', key: 'gateway', width: 18 },
        { header: 'RTSP URL', key: 'rtsp_url', width: 45 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Last Checked', key: 'lastChecked', width: 24 },
      ];

      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1F4E78' },
      };
      worksheet.getRow(1).alignment = { horizontal: 'center', vertical: 'center' };

      rows.forEach((row) => {
        worksheet.addRow({
          id: row.id || '',
          name: row.name || '',
          jenis: row.jenis || '',
          merk: row.merk || '',
          type: row.type || '',
          ip: row.ip || '',
          gateway: row.gateway || '',
          rtsp_url: row.rtsp_url || '',
          status: row.status || '',
          lastChecked: row.lastChecked || '',
        });
      });

      worksheet.eachRow((row) => {
        row.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const filename = `cctv_data_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.send(buffer);
    } catch (error) {
      console.error('❌ Error export CCTV Excel:', error.message);
      res.status(500).json({ error: 'Gagal export data CCTV ke Excel' });
    }
  });

  app.post('/api/cctvs', requireAuth, requireAdmin, async (req, res) => {
    const newCctv = req.body;

    const id = String(newCctv.id || Date.now());
    const status = 'offline';
    const lastChecked = new Date().toISOString();

    // Auto-detect hardware jika merk, type, atau jenis belum lengkap
    if ((!newCctv.merk || !newCctv.type || !newCctv.jenis) && newCctv.ip) {
      try {
        const { scanCamera } = require('../scan_cctv_models');
        const detected = await Promise.race([
          scanCamera(newCctv),
          new Promise((r) => setTimeout(() => r(null), 2500)),
        ]);
        if (detected && detected.detected) {
          if (!newCctv.merk) newCctv.merk = detected.merk;
          if (!newCctv.type) newCctv.type = detected.model;
          if (!newCctv.jenis) newCctv.jenis = detected.jenis;
          console.log(`🤖 Auto-detect CCTV baru (${newCctv.ip}): ${detected.merk} | ${detected.jenis} | ${detected.model}`);
        }
      } catch (_) {}
    }

    try {
      const query = `
      INSERT INTO cctvs (id, name, jenis, merk, type, ip, gateway, rtsp_url, status, lastChecked) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
      const params = [
        id,
        newCctv.name || '',
        newCctv.jenis || '',
        newCctv.merk || '',
        newCctv.type || '',
        newCctv.ip,
        newCctv.gateway || '',
        newCctv.rtsp_url || '',
        status,
        lastChecked,
      ];

      await db.getPool().query(query, params);

      const savedCctv = { ...newCctv, id, status, lastChecked };

      state.cctvsCache.unshift(savedCctv);

      logger.cctv('TAMBAH', `Menambahkan CCTV baru: ${newCctv.name} (${newCctv.ip})`);
      res.status(201).json({ message: 'CCTV berhasil disimpan ke MySQL', data: savedCctv });
    } catch (error) {
      logger.error(`Gagal tambah CCTV ke MySQL: ${error.message}`);
      res.status(500).json({ error: 'Gagal menyimpan data ke database. Cek terminal server.' });
    }
  });

  app.post('/api/cctvs/import-excel', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'File Excel belum dikirim' });
      }

      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(req.file.buffer);
      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(400).json({ error: 'File Excel kosong atau tidak valid' });
      }

      const rows = worksheet.getSheetValues();
      if (!rows || rows.length <= 1) {
        return res.status(400).json({ error: 'Tidak ada data CCTV di file Excel' });
      }

      const headerRow = rows[1] || [];
      const headerMap = {};
      headerRow.forEach((cell, index) => {
        const key = normalizeHeader(cell);
        if (key) headerMap[key] = index;
      });

      const imported = [];
      const skipped = [];

      for (let i = 2; i < rows.length; i += 1) {
        const row = rows[i] || [];
        if (!row.some((cell) => cell !== undefined && cell !== null && String(cell).trim() !== '')) {
          continue;
        }

        const record = {
          id: pickValue({
            id: row[headerMap.id] ?? row[headerMap.cctvid] ?? row[headerMap.cctv_id],
          }, ['id', 'cctvid', 'cctv_id']) || String(Date.now() + i),
          name: pickValue({
            name: row[headerMap.name] ?? row[headerMap.nama] ?? row[headerMap.cctv] ?? row[headerMap.camera],
          }, ['name', 'nama', 'cctv', 'camera', 'kamera']) || `CCTV ${i}`,
          jenis: pickValue({
            jenis: row[headerMap.jenis] ?? row[headerMap.type] ?? row[headerMap.tipe],
          }, ['jenis', 'type', 'tipe']) || '',
          merk: pickValue({
            merk: row[headerMap.merk] ?? row[headerMap.brand],
          }, ['merk', 'brand']) || '',
          type: pickValue({
            type: row[headerMap.type] ?? row[headerMap.tipe] ?? row[headerMap.jenis],
          }, ['type', 'tipe', 'jenis']) || '',
          ip: pickValue({
            ip: row[headerMap.ip] ?? row[headerMap.ipaddress] ?? row[headerMap.alamatip],
          }, ['ip', 'ipaddress', 'alamatip']) || '',
          gateway: pickValue({
            gateway: row[headerMap.gateway] ?? row[headerMap.defaultgateway],
          }, ['gateway', 'defaultgateway']) || '',
          rtsp_url: pickValue({
            rtsp: row[headerMap.rtsp] ?? row[headerMap.rtspurl] ?? row[headerMap.rtsp_url],
          }, ['rtsp', 'rtspurl', 'rtsp_url']) || '',
        };

        if (!record.name && !record.ip && !record.rtsp_url) {
          skipped.push({ row: i, reason: 'data kosong' });
          continue;
        }

        const query = `
          INSERT INTO cctvs (id, name, jenis, merk, type, ip, gateway, rtsp_url, status, lastChecked)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'offline', ?)
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            jenis = VALUES(jenis),
            merk = VALUES(merk),
            type = VALUES(type),
            ip = VALUES(ip),
            gateway = VALUES(gateway),
            rtsp_url = IF(VALUES(rtsp_url) IS NOT NULL AND VALUES(rtsp_url) != '', VALUES(rtsp_url), cctvs.rtsp_url),
            lastChecked = VALUES(lastChecked)
        `;

        await db.getPool().query(query, [
          String(record.id),
          record.name,
          record.jenis,
          record.merk,
          record.type,
          record.ip,
          record.gateway,
          record.rtsp_url,
          new Date().toISOString(),
        ]);

        const existing = state.cctvsCache.find((c) => String(c.id) === String(record.id));
        const finalRtspUrl = (record.rtsp_url && record.rtsp_url.trim()) || existing?.rtsp_url || '';

        const item = {
          id: String(record.id),
          name: record.name,
          jenis: record.jenis,
          merk: record.merk,
          type: record.type,
          ip: record.ip,
          gateway: record.gateway,
          rtsp_url: finalRtspUrl,
          status: existing?.status || 'offline',
          lastChecked: new Date().toISOString(),
        };

        state.cctvsCache = state.cctvsCache.filter((c) => String(c.id) !== String(item.id));
        state.cctvsCache.unshift(item);
        imported.push(item);
      }

      logger.cctv('IMPORT', `Import Excel berhasil (${imported.length} CCTV tersimpan/diperbarui)`);
      res.status(200).json({
        message: 'Import Excel berhasil',
        importedCount: imported.length,
        skippedCount: skipped.length,
        imported,
        skipped,
      });
    } catch (error) {
      logger.error(`Error import Excel CCTV: ${error.message}`);
      res.status(500).json({ error: 'Gagal import data Excel CCTV: ' + error.message });
    }
  });

  app.delete('/api/cctvs/:id', requireAuth, requireAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      const existing = state.cctvsCache.find((c) => String(c.id) === String(id));
      await db.getPool().query('DELETE FROM cctvs WHERE id = ?', [id]);

      state.cctvsCache = state.cctvsCache.filter((c) => String(c.id) !== String(id));
      state.offlineDowntimeTracking.delete(String(id));

      logger.cctv('HAPUS', `Menghapus CCTV: ${existing ? `${existing.name} (${id})` : `ID ${id}`}`);
      res.json({ message: 'Data CCTV berhasil dihapus' });
    } catch (error) {
      logger.error(`Error saat hapus CCTV dari database: ${error.message}`);
      res.status(500).json({ error: 'Gagal menghapus data dari database' });
    }
  });

  app.put('/api/cctvs/:id', requireAuth, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const payload = req.body || {};

    try {
      const targetIndex = state.cctvsCache.findIndex((c) => String(c.id) === String(id));
      if (targetIndex === -1) {
        return res.status(404).json({ error: 'Data CCTV tidak ditemukan' });
      }

      const existing = state.cctvsCache[targetIndex];
      const updatedCctv = {
        ...existing,
        name: payload.name || '',
        jenis: payload.jenis || '',
        merk: payload.merk || '',
        type: payload.type || '',
        ip: payload.ip || '',
        gateway: payload.gateway || '',
        rtsp_url: payload.rtsp_url || '',
      };

      await db.getPool().query(
        `UPDATE cctvs
       SET name = ?, jenis = ?, merk = ?, type = ?, ip = ?, gateway = ?, rtsp_url = ?
       WHERE id = ?`,
        [
          updatedCctv.name,
          updatedCctv.jenis,
          updatedCctv.merk,
          updatedCctv.type,
          updatedCctv.ip,
          updatedCctv.gateway,
          updatedCctv.rtsp_url,
          id,
        ],
      );

      state.cctvsCache.splice(targetIndex, 1);
      state.cctvsCache.unshift(updatedCctv);

      logger.cctv('UPDATE', `Memperbarui data CCTV: ${updatedCctv.name} (${updatedCctv.ip})`);
      res.json({ message: 'Data CCTV berhasil diupdate', data: updatedCctv });
    } catch (error) {
      logger.error(`Error saat update data CCTV: ${error.message}`);
      res.status(500).json({ error: 'Gagal mengupdate data CCTV' });
    }
  });
}

module.exports = { mountCctvRoutes };
