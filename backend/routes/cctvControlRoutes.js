const { state } = require('../cctvState');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');
const {
  extractCredentialsFromRtsp,
  getDeviceInfo: getHikDeviceInfo,
  controlPtzContinuous: controlHikPtz,
  stopPtz: stopHikPtz,
  gotoPtzPreset: gotoHikPreset,
  syncHikTime,
  setHikOsdName,
  getHikOsdName,
  rebootCamera: rebootHikCamera,
} = require('../services/isapiService');
const {
  getSonyDeviceInfo,
  controlSonyPtzContinuous,
  stopSonyPtz,
  gotoSonyPreset,
  syncSonyTime,
  setSonyOsdName,
  getSonyOsdName,
  rebootSonyCamera,
} = require('../services/sonyService');

function isSonyCamera(cctv) {
  if (!cctv) return false;
  const merk = (cctv.merk || '').toLowerCase();
  const rtsp = (cctv.rtsp_url || '').toLowerCase();
  const type = (cctv.type || '').toLowerCase();
  if (merk.includes('sony') || type.startsWith('snc-')) return true;
  if (rtsp.includes('/media/video')) return true;
  return false;
}

function mountCctvControlRoutes(app) {
  // Helper untuk mengambil CCTV & kredensialnya langsung dari RTSP URL
  function getCctvWithCreds(cctvId, req) {
    if (!cctvId) return null;
    const target = String(cctvId).trim().toLowerCase();
    const cctv = state.cctvsCache.find(
      (c) =>
        String(c.id).toLowerCase() === target ||
        String(c.id).toLowerCase().replace(/^cctv-?0*/i, '') === target.replace(/^cctv-?0*/i, '')
    );
    if (!cctv) return null;

    const fromRtsp = extractCredentialsFromRtsp(cctv.rtsp_url);
    const isSony = isSonyCamera(cctv);
    const user = req?.body?.username || req?.query?.username || fromRtsp.username || 'admin';
    const pass = req?.body?.password || req?.query?.password || fromRtsp.password || (isSony ? 'admin' : '');

    return { cctv, user, pass, isSony };
  }

  // 1. Ambil Info Hardware & Firmware CCTV (Dual-Driver)
  app.get('/api/cctv-control/:cctvId/info', requireAuth, async (req, res) => {
    const { cctvId } = req.params;
    const data = getCctvWithCreds(cctvId, req);
    if (!data) {
      return res.status(404).json({ error: 'CCTV tidak ditemukan' });
    }

    try {
      if (data.isSony) {
        const info = await getSonyDeviceInfo(data.cctv.ip, data.user, data.pass);
        return res.json({ success: true, driver: 'Sony CGI', info });
      }

      // Default: Hikvision ISAPI
      const info = await getHikDeviceInfo(data.cctv.ip, data.user, data.pass);
      res.json({ success: true, driver: 'Hikvision ISAPI', info });
    } catch (err) {
      console.error(`❌ [Control ${cctvId} - ${data.cctv.name}] Gagal ambil info:`, err.message);
      res.status(502).json({ error: err.message });
    }
  });

  // 2. Kontrol PTZ (Geser & Zoom - Dual-Driver)
  app.post('/api/cctv-control/:cctvId/ptz', requireAuth, async (req, res) => {
    const { cctvId } = req.params;
    const { action = 'move', pan = 0, tilt = 0, zoom = 0, channel = 1 } = req.body || {};

    const data = getCctvWithCreds(cctvId, req);
    if (!data) {
      return res.status(404).json({ error: 'CCTV tidak ditemukan' });
    }

    if (action !== 'stop') {
      logger.device('PTZ', `Kontrol PTZ (${action}) pada kamera: ${data.cctv.name}`);
    }

    try {
      // Driver Sony
      if (data.isSony) {
        if (action === 'stop') {
          const result = await stopSonyPtz(data.cctv.ip);
          return res.json(result);
        }
        const result = await controlSonyPtzContinuous(data.cctv.ip, { pan, tilt, zoom });
        return res.json(result);
      }

      // Driver Hikvision
      if (action === 'stop') {
        const result = await stopHikPtz(data.cctv.ip, data.user, data.pass, channel);
        return res.json(result);
      }

      const result = await controlHikPtz(data.cctv.ip, data.user, data.pass, { pan, tilt, zoom, channel });
      res.json(result);
    } catch (err) {
      logger.error(`[PTZ ${cctvId} - ${data.cctv.name}] Gagal kontrol PTZ: ${err.message}`);
      res.status(502).json({ error: err.message });
    }
  });

  // 3. Panggil Preset Posisi PTZ (Dual-Driver)
  app.post('/api/cctv-control/:cctvId/preset', requireAuth, async (req, res) => {
    const { cctvId } = req.params;
    const { presetId = 1, channel = 1 } = req.body || {};

    const data = getCctvWithCreds(cctvId, req);
    if (!data) {
      return res.status(404).json({ error: 'CCTV tidak ditemukan' });
    }

    try {
      if (data.isSony) {
        const result = await gotoSonyPreset(data.cctv.ip, presetId);
        return res.json(result);
      }

      const result = await gotoHikPreset(data.cctv.ip, data.user, data.pass, presetId, channel);
      res.json(result);
    } catch (err) {
      console.error(`❌ [PTZ Preset ${cctvId} - ${data.cctv.name}] Gagal panggil preset:`, err.message);
      res.status(502).json({ error: err.message });
    }
  });

  // 4. Sinkronisasi Waktu Kamera (Dual-Driver)
  app.post('/api/cctv-control/:cctvId/sync-time', requireAuth, async (req, res) => {
    const { cctvId } = req.params;
    const data = getCctvWithCreds(cctvId, req);
    if (!data) {
      return res.status(404).json({ error: 'CCTV tidak ditemukan' });
    }

    try {
      if (data.isSony) {
        const result = await syncSonyTime(data.cctv.ip, data.user, data.pass);
        return res.json(result);
      }

      const result = await syncHikTime(data.cctv.ip, data.user, data.pass);
      res.json(result);
    } catch (err) {
      console.error(`❌ [Sync Time ${cctvId} - ${data.cctv.name}] Gagal sinkronisasi waktu:`, err.message);
      res.status(502).json({ error: err.message });
    }
  });

  // 5. Ubah Keterangan Tulisan di Kamera / OSD Title (Dual-Driver)
  app.post('/api/cctv-control/:cctvId/osd-name', requireAuth, async (req, res) => {
    const { cctvId } = req.params;
    const { title = '' } = req.body || {};
    const data = getCctvWithCreds(cctvId, req);
    if (!data) {
      return res.status(404).json({ error: 'CCTV tidak ditemukan' });
    }

    const titleToSet = title || data.cctv.name || 'CCTV';

    try {
      if (data.isSony) {
        const result = await setSonyOsdName(data.cctv.ip, titleToSet, data.user, data.pass);
        return res.json(result);
      }

      const result = await setHikOsdName(data.cctv.ip, data.user, data.pass, titleToSet);
      res.json(result);
    } catch (err) {
      console.error(`❌ [Set OSD ${cctvId} - ${data.cctv.name}] Gagal ubah OSD:`, err.message);
      res.status(502).json({ error: err.message });
    }
  });

  // 6. Baca Keterangan OSD Saat Ini (Dual-Driver)
  app.get('/api/cctv-control/:cctvId/osd-name', requireAuth, async (req, res) => {
    const { cctvId } = req.params;
    const data = getCctvWithCreds(cctvId, req);
    if (!data) {
      return res.status(404).json({ error: 'CCTV tidak ditemukan' });
    }

    try {
      let currentOsd = '';
      if (data.isSony) {
        currentOsd = await getSonyOsdName(data.cctv.ip, data.user, data.pass);
      } else {
        currentOsd = await getHikOsdName(data.cctv.ip, data.user, data.pass);
      }
      res.json({ success: true, osdName: currentOsd || data.cctv.name });
    } catch (err) {
      res.json({ success: false, osdName: data.cctv.name });
    }
  });

  // 7. Perintah Reboot / Restart CCTV (Hanya Admin)
  app.post('/api/cctv-control/:cctvId/reboot', requireAuth, requireAdmin, async (req, res) => {
    const { cctvId } = req.params;
    const data = getCctvWithCreds(cctvId, req);
    if (!data) {
      return res.status(404).json({ error: 'CCTV tidak ditemukan' });
    }

    logger.device('REBOOT', `Mengirim perintah reboot ke kamera: ${data.cctv.name} (${data.cctv.ip})`);

    try {
      if (data.isSony) {
        const result = await rebootSonyCamera(data.cctv.ip, data.user, data.pass);
        return res.json(result);
      }

      const result = await rebootHikCamera(data.cctv.ip, data.user, data.pass);
      res.json(result);
    } catch (err) {
      logger.error(`[Reboot ${cctvId} - ${data.cctv.name}] Gagal reboot: ${err.message}`);
      res.status(502).json({ error: err.message });
    }
  });
}

module.exports = { mountCctvControlRoutes };
