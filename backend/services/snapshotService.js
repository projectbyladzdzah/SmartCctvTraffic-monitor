const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
const JimpModule = require('jimp');
const { getPool } = require('../database');
const { probeIp } = require('./pingService');

// 1. TAMBAHKAN EVENT EMITTER
const EventEmitter = require('events');
const cctvEvents = new EventEmitter();

const Jimp = JimpModule.Jimp || JimpModule;
const loadFont = JimpModule.loadFont;
let activeJobs = [];
let isCaptureRunning = false;
const CAPTURE_BATCH_SIZE = 4;
const BATCH_PAUSE_MS = 3000;
const CCTV_CAPTURE_TIMEOUT_MS = 12000;
let monthlyCleanupJob = null;

ffmpeg.setFfmpegPath(ffmpegPath);

const SCREENSHOT_DIR = path.resolve(__dirname, '../../public/screenshots');

function ensureScreenshotDirectory() {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function getImageDimensions(image) {
  if (!image) return { width: 0, height: 0 };

  if (typeof image.getWidth === 'function' && typeof image.getHeight === 'function') {
    return {
      width: image.getWidth(),
      height: image.getHeight(),
    };
  }

  return {
    width: image.bitmap?.width || 0,
    height: image.bitmap?.height || 0,
  };
}

function getPixelValue(image, x, y) {
  if (!image) return 0;

  if (typeof image.getPixelColor === 'function') {
    return image.getPixelColor(x, y);
  }

  const { bitmap } = image;
  if (!bitmap || !bitmap.data || !bitmap.width || !bitmap.height) {
    return 0;
  }

  const index = (y * bitmap.width + x) * 4;
  const r = bitmap.data[index];
  const g = bitmap.data[index + 1];
  const b = bitmap.data[index + 2];

  return ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
}

function rgbaFromInt(pixelValue) {
  if (typeof pixelValue !== 'number' || Number.isNaN(pixelValue)) {
    return { r: 0, g: 0, b: 0, a: 255 };
  }

  const a = (pixelValue >>> 24) & 255;
  const r = (pixelValue >>> 16) & 255;
  const g = (pixelValue >>> 8) & 255;
  const b = pixelValue & 255;

  return { r, g, b, a };
}

function getErrorTypeFromImage(image) {
  if (!image) {
    return { status: 'error', errorType: 'offline' };
  }

  const { width, height } = getImageDimensions(image);
  if (!width || !height) {
    return { status: 'error', errorType: 'offline' };
  }

  let totalBrightness = 0;
  let totalPixels = 0;
  let edgeVarianceSum = 0;
  let edgeCount = 0;

  // Optimasi performa: sampling step adaptif agar tidak membekukan event loop Node.js
  const step = Math.max(2, Math.floor(Math.min(width, height) / 240));

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const pixelValue = getPixelValue(image, x, y);
      const { r, g, b } = rgbaFromInt(pixelValue);
      const brightness = (r + g + b) / 3;
      totalBrightness += brightness;
      totalPixels += 1;

      if (x + step < width && y + step < height) {
        const nextPixel = getPixelValue(image, x + step, y);
        const downPixel = getPixelValue(image, x, y + step);
        const next = rgbaFromInt(nextPixel);
        const down = rgbaFromInt(downPixel);
        const diffX = Math.abs((next.r + next.g + next.b) / 3 - brightness);
        const diffY = Math.abs((down.r + down.g + down.b) / 3 - brightness);
        edgeVarianceSum += (diffX + diffY);
        edgeCount += 1;
      }
    }
  }

  const avgBrightness = totalPixels ? totalBrightness / totalPixels : 0;
  const avgEdge = edgeCount ? edgeVarianceSum / edgeCount : 0;

  if (avgBrightness < 12) {
    return { status: 'error', errorType: 'hitam' };
  }

  if (avgEdge < 3) {
    return { status: 'error', errorType: 'blur' };
  }

  return { status: 'bagus', errorType: null };
}

async function analyzeImage(filePath) {
  const image = await Jimp.read(filePath);
  return getErrorTypeFromImage(image);
}

function buildSnapshotFilename(cctvId, ext = 'jpg') {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${String(cctvId)}-${timestamp}.${ext}`;
}

async function saveSnapshotRecord(cctvId, imageUrl, status, errorType) {
  const pool = getPool();
  await pool.query(
    `INSERT INTO cctv_snapshots (cctv_id, image_path, status, error_type) VALUES (?, ?, ?, ?)`,
    [String(cctvId), imageUrl, status, errorType],
  );

  return {
    cctvId,
    imagePath: imageUrl,
    status,
    errorType,
  };
}

async function createErrorPlaceholderImage(filePath, label = 'OFFLINE') {
  try {
    ensureScreenshotDirectory();
    const image = new Jimp({ width: 1280, height: 720, color: 0x1e293bff });
    try {
      const fontPath = path.resolve(__dirname, '../node_modules/@jimp/plugin-print/fonts/open-sans/open-sans-32-white/open-sans-32-white.fnt');
      if (typeof loadFont === 'function' && fs.existsSync(fontPath)) {
        const font = await loadFont(fontPath);
        image.print({ font, x: 520, y: 330, text: label });
      }
    } catch (_) {}
    await image.write(filePath);
    return true;
  } catch (error) {
    console.error('[Capture] Gagal membuat placeholder error:', error.message);
    return false;
  }
}

async function createErrorPlaceholderForCctv(cctv, label = 'OFFLINE') {
  const filename = buildSnapshotFilename(cctv.id, 'jpg');
  const imagePath = path.join(SCREENSHOT_DIR, filename);
  const publicUrl = `/screenshots/${filename}`;

  await createErrorPlaceholderImage(imagePath, label);
  return {
    cctvId: cctv.id,
    imagePath: publicUrl,
    status: 'error',
    errorType: 'offline',
  };
}

async function captureSnapshotWithFfmpeg(cctv) {
  if (!cctv || !cctv.rtsp_url) return null;

  ensureScreenshotDirectory();
  const filename = buildSnapshotFilename(cctv.id, 'jpg');
  const imagePath = path.join(SCREENSHOT_DIR, filename);
  const publicUrl = `/screenshots/${filename}`;

  return new Promise((resolve, reject) => {
    let isSettled = false;
    
    const cmd = ffmpeg(cctv.rtsp_url)
      .inputOptions([
        '-rtsp_transport', 'tcp',
        '-fflags', 'nobuffer',
        '-flags', 'low_delay',
        '-max_delay', '500000',
        '-analyzeduration', '1000000',
        '-probesize', '1000000',
      ])
      .outputOptions(['-frames:v', '1', '-q:v', '2'])
      .output(imagePath);

    const timeoutId = setTimeout(() => {
      if (isSettled) return;
      isSettled = true;
      console.error(`[Capture] ⚠️ Timeout! Membunuh paksa FFmpeg untuk CCTV ${cctv.id}`);
      try { cmd.kill('SIGKILL'); } catch (_) {}
      reject(new Error(`TIMEOUT_${CCTV_CAPTURE_TIMEOUT_MS}`));
    }, CCTV_CAPTURE_TIMEOUT_MS);

    cmd.on('end', async () => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timeoutId);
      
      try {
        const analysis = await analyzeImage(imagePath);
        await saveSnapshotRecord(cctv.id, publicUrl, analysis.status, analysis.errorType);
        resolve({
          cctvId: cctv.id,
          imagePath: publicUrl,
          status: analysis.status,
          errorType: analysis.errorType,
        });
      } catch (error) {
        reject(error);
      }
    })
    .on('error', async (error) => {
      if (isSettled) return;
      isSettled = true;
      clearTimeout(timeoutId);
      
      try {
        console.error(`[Capture] CCTV ${cctv.id} gagal membuka stream: ${error.message}`);
        await createErrorPlaceholderImage(imagePath, 'OFFLINE');
        await saveSnapshotRecord(cctv.id, publicUrl, 'error', 'offline');
        resolve({ cctvId: cctv.id, imagePath: publicUrl, status: 'error', errorType: 'offline' });
      } catch (insertError) {
        reject(insertError || error);
      }
    })
    .run();
  });
}

async function captureSnapshotForCctv(cctv) {
  if (!cctv) return null;

  const cctvId = cctv.id;
  const cctvName = cctv.name || `CCTV ${cctvId}`;

  // Jika CCTV tidak memiliki RTSP URL, segera buat placeholder offline
  if (!cctv.rtsp_url) {
    console.warn(`[Capture] CCTV ${cctvName} (ID: ${cctvId}) belum memiliki RTSP URL. Mencatat status offline.`);
    const placeholder = await createErrorPlaceholderForCctv(cctv, 'NO RTSP');
    await saveSnapshotRecord(cctv.id, placeholder.imagePath, 'error', 'offline');
    cctvEvents.emit('snapshot_updated', { cctvId: cctv.id });
    return placeholder;
  }

  // Optimasi cepat: Jika CCTV berstatus offline di cache, lakukan quick ping 1s.
  // Jika tetap offline, lewati pemanggilan FFmpeg agar tidak buang waktu 12-25 detik!
  if (cctv.status === 'offline' && cctv.ip) {
    const pingCheck = await probeIp(cctv.ip, 1);
    if (!pingCheck.alive) {
      console.log(`[Capture] CCTV ${cctvName} (ID: ${cctvId}) offline. Menyimpan placeholder OFFLINE.`);
      const placeholder = await createErrorPlaceholderForCctv(cctv, 'OFFLINE');
      await saveSnapshotRecord(cctv.id, placeholder.imagePath, 'error', 'offline');
      cctvEvents.emit('snapshot_updated', { cctvId: cctv.id });
      return placeholder;
    }
  }

  console.log(`[Capture] Mulai ${cctvName} (ID: ${cctvId})`);

  try {
    const result = await captureSnapshotWithFfmpeg(cctv);
    console.log(`[Capture] Selesai ${cctvName} (ID: ${cctvId}) -> ${result?.status || 'unknown'}`);
    
    // PANCAKKAN SINYAL BAHWA 1 CCTV SELESAI
    cctvEvents.emit('snapshot_updated', { cctvId: cctv.id });
    return result;
  } catch (error) {
    const timeoutMessage = error && error.message && error.message.includes('TIMEOUT_');
    const errorType = timeoutMessage ? 'timeout' : 'offline';

    console.error(`[Capture] CCTV ${cctvName} (ID: ${cctvId}) error (${errorType}):`, error.message);

    const placeholder = await createErrorPlaceholderForCctv(cctv, errorType === 'timeout' ? 'TIMEOUT' : 'OFFLINE');
    await saveSnapshotRecord(cctv.id, placeholder.imagePath, 'error', errorType);

    cctvEvents.emit('snapshot_updated', { cctvId: cctv.id });

    return {
      cctvId: cctv.id,
      imagePath: placeholder.imagePath,
      status: 'error',
      errorType,
    };
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function captureAllSnapshots() {
  if (isCaptureRunning) {
    console.log('📸 [Scheduler] Capture sedang berjalan, skip batch baru untuk mencegah overload server.');
    return [];
  }

  isCaptureRunning = true;

  try {
    const pool = getPool();
    const [rows] = await pool.query('SELECT * FROM cctvs ORDER BY id ASC');

    if (!rows.length) {
      console.warn('⚠️ [Scheduler] Tidak ada data CCTV di database.');
      return [];
    }

    const batches = [];
    for (let index = 0; index < rows.length; index += CAPTURE_BATCH_SIZE) {
      batches.push(rows.slice(index, index + CAPTURE_BATCH_SIZE));
    }

    const results = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      console.log(`📸 [Scheduler] Mulai batch ${batchIndex + 1}/${batches.length} (${batch.length} CCTV)...`);

      // Eksekusi paralel per batch dengan sedikit stagger (200ms) untuk meringankan socket OS
      const batchResults = await Promise.all(
        batch.map(async (cctv, idx) => {
          try {
            if (idx > 0) await wait(idx * 200);
            return await captureSnapshotForCctv(cctv);
          } catch (error) {
            console.error(`❌ [Scheduler] CCTV ${cctv.id} gagal:`, error.message);
            return null;
          }
        })
      );

      for (const r of batchResults) {
        if (r) results.push(r);
      }

      console.log(`📌 [Scheduler] Batch ${batchIndex + 1}/${batches.length} selesai.`);

      if (batchIndex < batches.length - 1) {
        await wait(BATCH_PAUSE_MS);
      }
    }

    console.log(`🏁 [Scheduler] Semua batch capture selesai. Total: ${results.length} hasil.`);
    return results;
  } finally {
    isCaptureRunning = false;
  }
}

async function purgeSnapshotRecapBeforeCurrentMonth() {
  try {
    const pool = getPool();
    const [rows] = await pool.query(
      `SELECT id, image_path FROM cctv_snapshots WHERE created_at < DATE_FORMAT(NOW(), '%Y-%m-01')`,
    );

    for (const row of rows) {
      if (!row.image_path) continue;

      const relativePath = String(row.image_path).replace(/^\/+/, '');
      const imagePath = path.resolve(__dirname, '../../public', relativePath);
      const publicDirectory = path.resolve(__dirname, '../../public');
      const isInsidePublicDirectory = imagePath === publicDirectory
        || imagePath.startsWith(`${publicDirectory}${path.sep}`);

      if (isInsidePublicDirectory && fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
        } catch (_) {}
      }
    }

    const [result] = await pool.query(
      `DELETE FROM cctv_snapshots WHERE created_at < DATE_FORMAT(NOW(), '%Y-%m-01')`,
    );

    if (result.affectedRows > 0) {
      console.log(`🧹 Rekap Tampilan CCTV: ${result.affectedRows} data bulan lalu dihapus.`);
    }
  } catch (error) {
    console.error('❌ Gagal membersihkan rekap Tampilan CCTV:', error.message);
  }
}

function buildCronFromTime(timeValue) {
  if (!timeValue) return null;
  const match = String(timeValue).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;

  const hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return `0 ${minute} ${hour} * * *`;
}

async function getEnabledCaptureSchedules() {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT * FROM cctv_capture_schedules WHERE enabled = 1 ORDER BY time ASC',
  );
  return rows;
}

function refreshCaptureSchedules() {
  const jobsToStop = activeJobs;
  jobsToStop.forEach((job) => job.stop());
  activeJobs = [];

  getEnabledCaptureSchedules()
    .then((schedules) => {
      schedules.forEach((schedule) => {
        const cronExpression = buildCronFromTime(schedule.time);
        if (!cronExpression) {
          return;
        }

        const job = cron.schedule(cronExpression, async () => {
          console.log(`📸 [Scheduler] Jalankan capture ${schedule.name || schedule.time}...`);
          try {
            await captureAllSnapshots();
          } catch (error) {
            console.error(`❌ [Scheduler] Capture failed (${schedule.name}):`, error.message);
          }
        }, {
          timezone: 'Asia/Jakarta',
        });

        activeJobs.push(job);
      });

      console.log(`📸 [Scheduler] ${activeJobs.length} jadwal capture aktif.`);
    })
    .catch((error) => {
      console.error('❌ [Scheduler] Gagal refresh jadwal capture:', error.message);
    });
}

function startSnapshotScheduler() {
  if (!monthlyCleanupJob) {
    monthlyCleanupJob = cron.schedule('0 5 0 1 * *', async () => {
      console.log('🧹 [Scheduler] Membersihkan rekap CCTV bulan lalu...');
      await purgeSnapshotRecapBeforeCurrentMonth();
    }, {
      timezone: 'Asia/Jakarta',
    });
  }

  purgeSnapshotRecapBeforeCurrentMonth();
  refreshCaptureSchedules();
}

module.exports = {
  captureSnapshotForCctv,
  captureAllSnapshots,
  startSnapshotScheduler,
  refreshCaptureSchedules,
  getEnabledCaptureSchedules,
  analyzeImage,
  cctvEvents, // 3. EKSPOR EVENT EMITTER AGAR BISA DIGUNAKAN OLEH API
};