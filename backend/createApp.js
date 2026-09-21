const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const { mountAuthRoutes } = require('./routes/authRoutes');
const { mountRootRoutes } = require('./routes/rootRoutes');
const { mountCctvRoutes } = require('./routes/cctvRoutes');
const { mountPingHistoryRoutes } = require('./routes/pingHistoryRoutes');
const { mountStreamRoutes } = require('./routes/streamRoutes');
const { mountDowntimeRoutes } = require('./routes/downtimeRoutes');
const { mountSnapshotRoutes } = require('./routes/snapshotRoutes');
const { mountProxyRoutes } = require('./routes/proxyRoutes');
const { mountCctvControlRoutes } = require('./routes/cctvControlRoutes');
const { mountVehicleCountingRoutes } = require('./routes/vehicleCountingRoutes');

function createApp() {
  const app = express();

  // Trust reverse proxy (Cloudflare Tunnel) untuk membaca IP asli pengunjung
  app.set('trust proxy', 1);

  // 1. Security Headers (Helmet)
  app.use(
    helmet({
      contentSecurityPolicy: false, // Nonaktifkan CSP bawaan agar iframe CCTV dan MJPEG stream dapat dimuat
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: false,
      crossOriginOpenerPolicy: false,
    })
  );

  // 2. CORS
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  const screenshotsDir = path.resolve(__dirname, '../public/screenshots');
  app.use('/screenshots', express.static(screenshotsDir));

  // Logger interaksi web
  const webActionLogger = require('./middleware/webActionLogger');
  app.use(webActionLogger);

  mountAuthRoutes(app);
  mountRootRoutes(app);
  mountCctvRoutes(app);
  mountPingHistoryRoutes(app);
  mountStreamRoutes(app);
  mountDowntimeRoutes(app);
  mountSnapshotRoutes(app);
  mountProxyRoutes(app);
  mountCctvControlRoutes(app);
  mountVehicleCountingRoutes(app);

  // Menyajikan file statis dari hasil build React (Vite)
  const distDir = path.resolve(__dirname, '../dist');
  app.use(express.static(distDir));

  // Menangkap semua rute yang tidak dikenali API untuk dilempar ke React Router (SPA)
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      res.sendFile(path.join(distDir, 'index.html'));
    } else {
      next();
    }
  });

  return app;
}

module.exports = { createApp };
