const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { buildFfmpegArgs } = require('../services/streamService');
const { requireAuth, requireStreamAuth } = require('../middleware/auth');
const { state } = require('../cctvState');
const logger = require('../utils/logger');

function mountStreamRoutes(app) {
  app.get('/api/stream/:cctvId', requireStreamAuth, async (req, res) => {
    const { cctvId } = req.params;
    const { rtsp_url } = req.query;

    try {
      const cctv = state.cctvsCache.find((c) => String(c.id) === String(cctvId));
      if (!cctv) {
        return res.status(404).json({ error: 'CCTV tidak ditemukan' });
      }

      let rtspUrlToUse = cctv.rtsp_url;
      if (rtsp_url) {
        const decoded = decodeURIComponent(rtsp_url);
        if (decoded.toLowerCase().startsWith('rtsp://')) {
          rtspUrlToUse = decoded;
        } else {
          return res.status(400).json({ error: 'Format URL streaming harus rtsp://' });
        }
      }

      if (!rtspUrlToUse) {
        return res.status(400).json({ error: 'RTSP URL tidak tersedia' });
      }

      res.setHeader('Content-Type', 'multipart/x-mixed-replace; boundary=frame');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Cache-Control', 'no-cache');
      if (typeof res.flushHeaders === 'function') res.flushHeaders();

      const foundCctv = (state.cctvsCache || []).find((c) => String(c.id) === String(cctvId));
      const cctvLabel = foundCctv ? `${foundCctv.name} (${cctvId})` : `CCTV ID: ${cctvId}`;

      // [STREAM MULTIPLEXING] Check if stream is already running
      if (state.activeStreams.has(cctvId)) {
        const streamData = state.activeStreams.get(cctvId);
        streamData.clients.add(res);
        streamData.process.stdout.pipe(res);
        
        logger.webAction('STREAM', `Membuka Live: ${cctvLabel} (Penonton: ${streamData.clients.size})`);
        
        res.on('close', () => {
          streamData.clients.delete(res);
          try { streamData.process.stdout.unpipe(res); } catch (_) {}
          
          if (streamData.clients.size === 0) {
            logger.webAction('STREAM', `Menutup Live: ${cctvLabel} (Semua penonton keluar)`);
            streamData.process.kill('SIGKILL');
            state.activeStreams.delete(cctvId);
          } else {
            logger.webAction('STREAM', `Keluar dari Live: ${cctvLabel} (Sisa penonton: ${streamData.clients.size})`);
          }
        });
        return; // done for this multiplexed client
      }

      logger.webAction('STREAM', `Membuka Live: ${cctvLabel}`);
      const ffmpegProcess = spawn(ffmpegPath, buildFfmpegArgs(rtspUrlToUse));
      
      // Allow unlimited listeners for stdout piping
      ffmpegProcess.stdout.setMaxListeners(0);
      
      const streamData = { process: ffmpegProcess, clients: new Set([res]) };
      state.activeStreams.set(cctvId, streamData);

      ffmpegProcess.stdout.pipe(res);

      // Tangkap stderr hanya jika dibutuhkan untuk diagnosa error (tidak spam konsol)
      let lastStderr = '';
      ffmpegProcess.stderr.on('data', (data) => {
        lastStderr = data.toString().trim();
      });

      const STREAM_INACTIVITY_MS = 60000;
      let hasWrittenFrame = false;
      let inactivityTimer = null;

      const cleanupStream = (signal = 'SIGTERM') => {
        if (ffmpegProcess.killed) {
          state.activeStreams.delete(cctvId);
          if (inactivityTimer) clearTimeout(inactivityTimer);
          return;
        }

        // Unpipe all clients
        if (state.activeStreams.has(cctvId)) {
          const sd = state.activeStreams.get(cctvId);
          sd.clients.forEach(client => {
            try { ffmpegProcess.stdout.unpipe(client); client.end(); } catch (_) {}
          });
          sd.clients.clear();
        }

        state.activeStreams.delete(cctvId);
        if (inactivityTimer) clearTimeout(inactivityTimer);
        ffmpegProcess.kill(signal);
      };

      const resetInactivityTimer = () => {
        if (inactivityTimer) clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
          console.log(`⏱️ [Stream ${cctvId}] Tidak ada frame ${STREAM_INACTIVITY_MS / 1000}s, membunuh FFmpeg`);
          cleanupStream('SIGKILL');
        }, STREAM_INACTIVITY_MS);
      };

      resetInactivityTimer();

      ffmpegProcess.stdout.on('data', (chunk) => {
        if (chunk && chunk.length > 0) {
          hasWrittenFrame = true;
          resetInactivityTimer();
        }
      });

      // Prevent unhandled EPIPE crash when clients disconnect abruptly
      ffmpegProcess.stdout.on('error', (err) => {
        if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_PREMATURE_CLOSE') {
          // Ignore normal pipe errors
          return;
        }
        console.error(`❌ [Stream ${cctvId}] stdout error:`, err.message);
      });

      ffmpegProcess.on('error', (err) => {
        console.error(`❌ [Stream ${cctvId}] FFmpeg error:`, err.message);
        cleanupStream('SIGKILL');
      });

      ffmpegProcess.on('exit', (code) => {
        cleanupStream('SIGKILL');
      });

      res.on('close', () => {
        if (state.activeStreams.has(cctvId)) {
          const sd = state.activeStreams.get(cctvId);
          sd.clients.delete(res);
          try { ffmpegProcess.stdout.unpipe(res); } catch (_) {}
          
          if (sd.clients.size === 0) {
            logger.webAction('STREAM', `Menutup Live: ${cctvLabel} (Semua penonton keluar)`);
            cleanupStream('SIGKILL');
          } else {
            logger.webAction('STREAM', `Keluar dari Live: ${cctvLabel} (Sisa penonton: ${sd.clients.size})`);
          }
        }
      });

      res.on('error', () => {
        if (state.activeStreams.has(cctvId)) {
           const sd = state.activeStreams.get(cctvId);
           sd.clients.delete(res);
           try { ffmpegProcess.stdout.unpipe(res); } catch (_) {}
        }
      });
    } catch (error) {
      console.error(`❌ [Stream ${cctvId}] Error:`, error.message);
      res.status(500).json({ error: 'Streaming error: ' + error.message });
    }
  });

  app.post('/api/stream-stop/:cctvId', requireAuth, (req, res) => {
    const { cctvId } = req.params;
    const foundCctv = (state.cctvsCache || []).find((c) => String(c.id) === String(cctvId));
    const cctvLabel = foundCctv ? `${foundCctv.name} (${cctvId})` : `CCTV ID: ${cctvId}`;

    logger.webAction('STREAM', `Menutup Monitor: ${cctvLabel}`);

    if (state.activeStreams.has(cctvId)) {
      const sd = state.activeStreams.get(cctvId);
      sd.clients.forEach((client) => {
        try {
          sd.process.stdout.unpipe(client);
          client.end();
        } catch (_) {}
      });
      sd.clients.clear();
      try {
        sd.process.kill('SIGKILL');
      } catch (_) {}
      state.activeStreams.delete(cctvId);
    }

    res.json({ success: true, message: `Stream ${cctvLabel} dihentikan` });
  });
}

module.exports = { mountStreamRoutes };
