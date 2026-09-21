const net = require('net');

function probeIp(ip, timeoutSeconds = 2) {
  return new Promise((resolve) => {
    if (!ip) return resolve({ alive: false, time: null });

    const timeoutMs = timeoutSeconds * 1000;
    const socket = new net.Socket();
    const startTime = Date.now();
    let settled = false;

    const safeResolve = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);

    // Try connecting to port 554 (Default RTSP)
    socket.connect(554, ip, () => {
      const time = Date.now() - startTime;
      safeResolve({ alive: true, time: String(time) });
    });

    socket.on('timeout', () => {
      safeResolve({ alive: false, time: null });
    });

    socket.on('error', () => {
      socket.destroy();
      const elapsed = Date.now() - startTime;
      const remainingMs = timeoutMs - elapsed;

      // Jika sisa waktu sudah habis atau terlalu mepet, langsung selesaikan tanpa membuat socket baru
      if (remainingMs <= 100) {
        return safeResolve({ alive: false, time: null });
      }

      const socket80 = new net.Socket();
      socket80.setTimeout(remainingMs);

      socket80.connect(80, ip, () => {
        const time = Date.now() - startTime;
        safeResolve({ alive: true, time: String(time) });
        socket80.destroy();
      });

      socket80.on('error', () => {
        safeResolve({ alive: false, time: null });
        socket80.destroy();
      });

      socket80.on('timeout', () => {
        safeResolve({ alive: false, time: null });
        socket80.destroy();
      });
    });
  });
}

module.exports = { probeIp };
