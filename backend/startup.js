const db = require('./database');
const { probeIp } = require('./services/pingService');
const { startSnapshotScheduler } = require('./services/snapshotService');
const { state, applyOfflineHistoryRules, purgeCctvHistoryBeforeCurrentMonth } = require('./cctvState');
const logger = require('./utils/logger');

/**
 * Inisialisasi DB, cache CCTV, loop ping, dan listen.
 * Dipanggil setelah semua route terdaftar pada app.
 */
async function startServer(app) {
  try {
    const pool = await db.initDB();

    await purgeCctvHistoryBeforeCurrentMonth();
    setInterval(() => {
      purgeCctvHistoryBeforeCurrentMonth().catch((err) => {
        console.error('⚠️ Pembersihan riwayat:', err.message);
      });
    }, 24 * 60 * 60 * 1000);

    const [rows] = await pool.query('SELECT * FROM cctvs ORDER BY created_at DESC');
    state.cctvsCache = rows;

    const runPingLoop = async () => {
      if (state.isPingLoopRunning) return;
      state.isPingLoopRunning = true;

      try {
        if (!state.cctvsCache.length) return;

        await Promise.all(state.cctvsCache.map(async (targetCCTV) => {
          if (!targetCCTV || !targetCCTV.ip) return;

          const oldStatus = targetCCTV.status;
          const res = await probeIp(targetCCTV.ip, 2);
          const newStatus = res.alive ? 'online' : 'offline';

          applyOfflineHistoryRules(targetCCTV, oldStatus, newStatus);

          targetCCTV.status = newStatus;
          targetCCTV.lastChecked = new Date().toISOString();

          // Hanya update ke database jika status berubah untuk mengurangi beban disk I/O
          if (oldStatus !== newStatus) {
            if (oldStatus) {
              logger.statusChange(targetCCTV.name || `CCTV ${targetCCTV.id}`, targetCCTV.ip, newStatus);
            }
            db.getPool()
              .query('UPDATE cctvs SET status = ?, lastChecked = ? WHERE id = ?', [
                targetCCTV.status,
                targetCCTV.lastChecked,
                targetCCTV.id,
              ])
              .catch(() => {});
          }
        }));
      } finally {
        state.isPingLoopRunning = false;
      }
    };

    setInterval(() => {
      runPingLoop().catch((err) => {
        logger.warn(`Ping loop error: ${err.message}`);
      });
    }, 30000); // Update status setiap 30 detik

    runPingLoop().catch((err) => {
      logger.warn(`Ping startup error: ${err.message}`);
    });

    startSnapshotScheduler();

    const PORT = 5000;
    app.listen(PORT, () => {
      logger.printBanner({
        port: PORT,
        cctvCount: state.cctvsCache.length,
        dbName: process.env.DB_NAME || 'cctv_db',
        aiStatus: 'Standby (Mati)',
      });
    });
  } catch (error) {
    logger.error(`Gagal menjalankan server backend: ${error.message}`);
  }
}

let aiServiceProcess = null;

function getAiServiceStatus() {
  return {
    running: Boolean(aiServiceProcess && !aiServiceProcess.killed),
    pid: aiServiceProcess ? aiServiceProcess.pid : null,
  };
}

function startAiService() {
  if (aiServiceProcess && !aiServiceProcess.killed) {
    return { success: true, message: 'AI Service sudah aktif.', running: true };
  }

  const path = require('path');
  const { spawn } = require('child_process');
  const aiDir = path.resolve(__dirname, '../ai_service');

  try {
    logger.ai('START', 'Menyalakan proses Python YOLOv8n (Vehicle Counting)...', 'success');
    aiServiceProcess = spawn('python', ['main.py'], {
      cwd: aiDir,
      stdio: 'inherit',
    });

    aiServiceProcess.on('error', (err) => {
      logger.ai('ERROR', `Gagal memulai Python AI service: ${err.message}`, 'error');
    });

    aiServiceProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        logger.ai('OFF', `Proses AI berhenti (exit code: ${code})`, 'warn');
      }
      aiServiceProcess = null;
    });

    return { success: true, message: 'AI Service berhasil dinyalakan.', running: true };
  } catch (err) {
    logger.ai('ERROR', `Gagal menyalakan AI: ${err.message}`, 'error');
    return { success: false, error: err.message, running: false };
  }
}

function stopAiService() {
  if (aiServiceProcess) {
    logger.ai('STOP', 'Mematikan proses Python YOLOv8n...', 'warn');
    const pid = aiServiceProcess.pid;
    try {
      if (process.platform === 'win32') {
        const { execSync } = require('child_process');
        try {
          execSync(`taskkill /pid ${pid} /t /f`, { stdio: 'ignore' });
        } catch (_) {
          aiServiceProcess.kill('SIGKILL');
        }
      } else {
        aiServiceProcess.kill('SIGKILL');
      }
    } catch (_) {}
    aiServiceProcess = null;
    logger.ai('STOP', 'Layanan AI dimatikan. Beban CPU kembali 0%.', 'success');
    return { success: true, message: 'AI Service berhasil dimatikan.', running: false };
  }
  return { success: true, message: 'AI Service memang sedang tidak aktif.', running: false };
}

// Cleanup saat Node.js keluar
const cleanUp = () => {
  stopAiService();
};
process.on('SIGINT', cleanUp);
process.on('SIGTERM', cleanUp);
process.on('exit', cleanUp);

module.exports = {
  startServer,
  startAiService,
  stopAiService,
  getAiServiceStatus,
};
