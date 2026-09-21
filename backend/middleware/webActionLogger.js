const logger = require('../utils/logger');
const { state } = require('../cctvState');

// Endpoints yang diabaikan dari logging umum agar tidak spam
const IGNORED_PATHS = [
  '/api/vehicle-counts/record', // Handled tersendiri dengan throttling
  '/api/cctvs', // GET polling
  '/api/history',
  '/api/vehicle-counts/summary',
  '/api/vehicle-counts/hourly',
  '/api/vehicle-counts/service-status',
  '/api/vehicle-counts/targets',
  '/api/auth/me',
  '/favicon.ico',
];

/**
 * Middleware untuk mencatat aksi penting yang berasal dari Web Dashboard
 */
function webActionLogger(req, res, next) {
  const url = req.path || req.url;

  // Lewati static files & polling rutin
  if (
    url.startsWith('/screenshots') ||
    url.startsWith('/dist') ||
    url.startsWith('/assets') ||
    IGNORED_PATHS.some((p) => url === p || url.startsWith(p + '?'))
  ) {
    return next();
  }

  // Khusus route ekspor excel
  if (url === '/api/downtime/export') {
    logger.webAction('EXPORT', 'Mengunduh laporan riwayat downtime (Excel)');
    return next();
  }

  // Khusus sinkronisasi CCTV
  if (url === '/api/cctvs/sync' && req.method === 'POST') {
    logger.webAction('SYNC', 'Sinkronisasi manual daftar kamera CCTV');
    return next();
  }

  // Khusus reset test vehicle counts
  if (url === '/api/vehicle-counts/reset-test' && req.method === 'POST') {
    logger.ai('RESET', 'Reset data hitungan kendaraan dari web dashboard');
    return next();
  }

  next();
}

module.exports = webActionLogger;
