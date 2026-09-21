const db = require('./database');
const logger = require('./utils/logger');

/** Minimal lama offline berkelanjutan agar kejadian tercatat di riwayat (filter gangguan singkat). */
const OFFLINE_HISTORY_MIN_MS = 10 * 60 * 1000; // 10 menit

const state = {
  /** Cache data CCTV di memori */
  cctvsCache: [],
  /** Proses FFmpeg aktif per CCTV */
  activeStreams: new Map(),
  isPingLoopRunning: false,
  offlineDowntimeTracking: new Map(), // { since: timestamp, loggedOffline: bool, downtimeRecorded: bool }
  OFFLINE_HISTORY_MIN_MS,
};

function insertStatusHistory(cctvId, status) {
  return db
    .getPool()
    .query('INSERT INTO cctv_status_history (cctv_id, status) VALUES (?, ?)', [cctvId, status])
    .catch((err) => {
      console.error('❌ Gagal menyimpan riwayat status:', err.message);
    });
}

/**
 * Record downtime awal ke tabel cctv_downtime_records jika sudah >= 10 menit
 */
async function recordDowntimeToExcel(cctvId, cctv) {
  try {
    const track = state.offlineDowntimeTracking.get(String(cctvId));
    if (!track || track.downtimeRecorded) return; // Sudah di-record

    const downtime_start = new Date(track.since);
    const downtime_end = new Date();
    const duration_minutes = Math.round((downtime_end - downtime_start) / 1000 / 60);

    if (duration_minutes >= 10) {
      const [result] = await db.getPool().query(
        `INSERT INTO cctv_downtime_records (cctv_id, cctv_name, cctv_ip, downtime_start, downtime_end, duration_minutes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          String(cctvId),
          cctv?.name || 'Unknown',
          cctv?.ip || 'Unknown',
          downtime_start,
          downtime_end,
          duration_minutes,
          'ongoing',
        ],
      );

      // Simpan recordId agar bisa diupdate saat CCTV online kembali
      track.downtimeRecorded = true;
      track.downtimeRecordId = result?.insertId || null;
      track.cctvName = cctv?.name;
      track.cctvIp = cctv?.ip;
      logger.warn(`Downtime terdeteksi: ${cctv?.name} (${cctv?.ip}) sudah ${duration_minutes} menit offline`);
    }
  } catch (err) {
    logger.error(`Gagal merekam downtime ke database: ${err.message}`);
  }
}

/**
 * Perbarui durasi dan waktu selesai ketika CCTV kembali online
 */
async function resolveDowntimeRecord(cctvId, track) {
  try {
    const downtime_start = new Date(track.since);
    const downtime_end = new Date();
    const duration_minutes = Math.max(1, Math.round((downtime_end - downtime_start) / 1000 / 60));

    if (track.downtimeRecordId) {
      await db.getPool().query(
        `UPDATE cctv_downtime_records 
         SET downtime_end = ?, duration_minutes = ?, status = 'resolved'
         WHERE id = ?`,
        [downtime_end, duration_minutes, track.downtimeRecordId],
      );
      logger.success(
        `Downtime ${track.cctvName || `CCTV ${cctvId}`} selesai: ${duration_minutes} menit offline (${downtime_start.toLocaleTimeString()} - ${downtime_end.toLocaleTimeString()})`
      );
    } else if (duration_minutes >= 10) {
      // Jika belum sempat terinsert di loop offline tapi durasi >= 10 menit
      await db.getPool().query(
        `INSERT INTO cctv_downtime_records (cctv_id, cctv_name, cctv_ip, downtime_start, downtime_end, duration_minutes, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          String(cctvId),
          track.cctvName || 'Unknown',
          track.cctvIp || 'Unknown',
          downtime_start,
          downtime_end,
          duration_minutes,
          'resolved',
        ],
      );
      logger.success(`Downtime ${track.cctvName || `CCTV ${cctvId}`} selesai: total ${duration_minutes} menit`);
    }
  } catch (err) {
    logger.error(`Gagal memperbarui riwayat downtime: ${err.message}`);
  }
}

function applyOfflineHistoryRules(targetCCTV, oldStatus, newStatus) {
  const id = String(targetCCTV.id);

  if (newStatus === 'offline') {
    if (oldStatus === 'online' || !state.offlineDowntimeTracking.has(id)) {
      state.offlineDowntimeTracking.set(id, {
        since: Date.now(),
        loggedOffline: false,
        downtimeRecorded: false,
        downtimeRecordId: null,
        cctvName: targetCCTV?.name,
        cctvIp: targetCCTV?.ip,
      });
    }

    const track = state.offlineDowntimeTracking.get(id);
    
    // Record downtime jika sudah >= 10 menit
    const downtime_ms = Date.now() - track.since;
    if (!track.downtimeRecorded && downtime_ms >= OFFLINE_HISTORY_MIN_MS) {
      recordDowntimeToExcel(id, targetCCTV).catch(() => {});
    }

    if (track && !track.loggedOffline && Date.now() - track.since >= OFFLINE_HISTORY_MIN_MS) {
      track.loggedOffline = true;
      insertStatusHistory(id, 'offline');
    }
    return;
  }

  const track = state.offlineDowntimeTracking.get(id);
  if (track) {
    if (track.loggedOffline) {
      insertStatusHistory(id, 'online');
    }
    // Perbarui rekap downtime dengan durasi total yang nyata
    resolveDowntimeRecord(id, track).catch(() => {});
    state.offlineDowntimeTracking.delete(id);
  }
}

async function purgeCctvHistoryBeforeCurrentMonth() {
  try {
    const pool = db.getPool();
    const [result] = await pool.query(
      `DELETE FROM cctv_status_history WHERE timestamp < DATE_FORMAT(NOW(), '%Y-%m-01')`,
    );
    if (result.affectedRows > 0) {
      console.log(`🧹 Riwayat status: ${result.affectedRows} entri bulan lalu dihapus.`);
    }
  } catch (err) {
    console.error('❌ Gagal membersihkan riwayat bulan lalu:', err.message);
  }
}

module.exports = {
  state,
  insertStatusHistory,
  applyOfflineHistoryRules,
  purgeCctvHistoryBeforeCurrentMonth,
};
