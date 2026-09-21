const http = require('http');
const net = require('net');
const zlib = require('zlib');
const { verifyTokenString } = require('../middleware/auth');
const { state } = require('../cctvState');

/**
 * Fallback proxy menggunakan TCP socket mentah untuk menangani kamera CCTV 
 * (seperti Sony) yang memiliki bug firmware pada baris header (misal "\r\r\n" yang memicu HPE_LF_EXPECTED).
 */
function fallbackRawSocketProxy(req, res, hostname, port, targetPath, rawTarget) {
  const socket = net.connect(port, hostname, () => {
    let reqLine = `${req.method} ${targetPath} HTTP/1.1\r\n`;
    reqLine += `Host: ${hostname}:${port}\r\n`;
    reqLine += `Connection: close\r\n`;
    reqLine += `Accept: */*\r\n`;
    reqLine += `Accept-Encoding: identity\r\n`;
    reqLine += `User-Agent: Mozilla/5.0\r\n\r\n`;
    socket.write(reqLine);

    if (req.body && Object.keys(req.body).length > 0) {
      const bodyData = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      socket.write(bodyData);
    }
  });

  let buffer = Buffer.alloc(0);
  let headerProcessed = false;

  socket.on('data', (chunk) => {
    if (!headerProcessed) {
      buffer = Buffer.concat([buffer, chunk]);
      let headerEnd = buffer.indexOf('\r\n\r\n');
      let delimLen = 4;
      if (headerEnd === -1) {
        headerEnd = buffer.indexOf('\r\r\n\r\r\n');
        delimLen = 6;
      }
      if (headerEnd === -1) {
        headerEnd = buffer.indexOf('\n\n');
        delimLen = 2;
      }

      if (headerEnd !== -1) {
        headerProcessed = true;
        let headerStr = buffer.slice(0, headerEnd).toString('latin1');
        const remainingBody = buffer.slice(headerEnd + delimLen);

        // Normalisasi header rusak dari firmware kamera
        headerStr = headerStr.replace(/\r\r\n/g, '\r\n');

        const lines = headerStr.split('\r\n');
        const statusLine = lines[0] || 'HTTP/1.1 200 OK';
        const statusCodeMatch = statusLine.match(/HTTP\/\S+\s+(\d+)/);
        const statusCode = statusCodeMatch ? parseInt(statusCodeMatch[1], 10) : 200;

        for (let i = 1; i < lines.length; i++) {
          const colonIdx = lines[i].indexOf(':');
          if (colonIdx === -1) continue;
          const key = lines[i].slice(0, colonIdx).trim().toLowerCase();
          let val = lines[i].slice(colonIdx + 1).trim();

          // Hapus proteksi iframe dari kamera
          if (key === 'x-frame-options' || key === 'content-security-policy') {
            continue;
          }

          // Sesuaikan redirect location
          if (key === 'location' && val.startsWith('/')) {
            val = `/api/cctv-proxy/${encodeURIComponent(rawTarget)}${val}`;
          }

          try {
            res.setHeader(key, val);
          } catch (_) {}
        }

        res.writeHead(statusCode);
        if (remainingBody.length > 0) {
          res.write(remainingBody);
        }
      }
    } else {
      res.write(chunk);
    }
  });

  socket.on('end', () => {
    if (!res.headersSent && buffer.length > 0) {
      res.writeHead(200);
      res.write(buffer);
    }
    res.end();
  });

  socket.setTimeout(10000, () => {
    socket.destroy();
    if (!res.headersSent) {
      res.status(504).send(`
        <div style="font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;padding:32px;height:100vh;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
          <div style="background:#1e293b;padding:24px 32px;border-radius:12px;border:1px solid #334155;max-width:500px;">
            <h3 style="margin-top:0;color:#fbbf24;">⏱️ Timeout: CCTV Tidak Merespons</h3>
            <p style="color:#94a3b8;font-size:14px;line-height:1.5;">Koneksi ke IP <code>${hostname}:${port}</code> melebihi batas waktu 10 detik. Pastikan perangkat aktif dan kabel jaringan terhubung.</p>
            <button onclick="window.location.reload()" style="background:#3b82f6;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;margin-top:12px;">Coba Lagi</button>
          </div>
        </div>
      `);
    }
  });

  socket.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).send(`
        <div style="font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;padding:32px;height:100vh;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
          <div style="background:#1e293b;padding:24px 32px;border-radius:12px;border:1px solid #334155;max-width:500px;">
            <h3 style="margin-top:0;color:#f87171;">⚠️ Gagal Terhubung ke Web CCTV</h3>
            <p style="color:#94a3b8;font-size:14px;line-height:1.5;">Perangkat di IP <code>${hostname}:${port}</code> sedang offline, port web tidak dibuka, atau menolak koneksi.</p>
            <p style="color:#64748b;font-size:12px;">Detail: ${err.message}</p>
            <button onclick="window.location.reload()" style="background:#3b82f6;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;margin-top:12px;">Coba Lagi</button>
          </div>
        </div>
      `);
    }
  });
}

/**
 * Route reverse proxy untuk membuka web interface CCTV / Gateway di dalam iframe
 * tanpa terhalang X-Frame-Options, Mixed Content, atau keterbatasan jaringan lokal.
 */
function mountProxyRoutes(app) {
  function isTargetAllowed(hostname) {
    if (!hostname) return false;
    const cleanHost = String(hostname).trim().toLowerCase();

    // 1. Larang loopback, link-local, broadcast, cloud metadata
    if (
      cleanHost === 'localhost' ||
      cleanHost === '127.0.0.1' ||
      cleanHost === '0.0.0.0' ||
      cleanHost === '::1' ||
      cleanHost.startsWith('127.') ||
      cleanHost === '169.254.169.254'
    ) {
      return false;
    }

    // 2. Cocokkan dengan IP atau Gateway CCTV yang terdaftar
    const cache = state.cctvsCache || [];
    if (cache.length > 0) {
      const isRegistered = cache.some(
        (c) => c.ip === cleanHost || c.gateway === cleanHost
      );
      if (isRegistered) return true;
    }

    // 3. Fallback jika cache belum termuat penuh: hanya izinkan format IP private lokal
    const isPrivateIp = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})$/.test(cleanHost);
    if (isPrivateIp && cache.length === 0) {
      return true;
    }

    return false;
  }

  function checkProxyAuth(req) {
    // 1. Header Authorization
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      const payload = verifyTokenString(token);
      if (payload) return { valid: true, token };
    }

    // 2. Query parameter (?token=...)
    if (req.query && req.query.token) {
      const token = String(req.query.token).trim();
      const payload = verifyTokenString(token);
      if (payload) return { valid: true, token };
    }

    // 3. Cookie session
    const cookieHeader = req.headers.cookie || '';
    const match = cookieHeader.match(/cctv_proxy_auth=([^;]+)/);
    if (match) {
      const token = decodeURIComponent(match[1]);
      const payload = verifyTokenString(token);
      if (payload) return { valid: true, token };
    }

    return null;
  }

  function resolveTarget(req) {
    // 1. Cek parameter URL langsung: /api/cctv-proxy/:targetIp/*
    const proxyMatch = req.originalUrl.match(/\/api\/cctv-proxy\/([^\/]+)(.*)/);
    if (proxyMatch) {
      return {
        target: decodeURIComponent(proxyMatch[1]),
        targetPath: proxyMatch[2] || '/',
      };
    }

    // 2. Cek referer header jika request berupa asset (/doc/*, /ui/*, /index.html*, dll)
    const referer = req.headers.referer || '';
    const refererMatch = referer.match(/\/api\/cctv-proxy\/([^\/]+)/);
    if (refererMatch) {
      return {
        target: decodeURIComponent(refererMatch[1]),
        targetPath: req.originalUrl,
      };
    }

    // 3. Cek path CCTV yang umum jika ada cookie
    const isCameraPath = /^\/(doc|ui|ISAPI|SDK|Streaming|Security|System|cgi-bin|index\.html)/i.test(req.originalUrl);
    const cookieHeader = req.headers.cookie || '';
    const cookieMatch = cookieHeader.match(/cctv_proxy_ip=([^;]+)/);
    if (isCameraPath && cookieMatch) {
      return {
        target: decodeURIComponent(cookieMatch[1]),
        targetPath: req.originalUrl,
      };
    }

    return null;
  }

  function handleProxyRequest(req, res, targetInfo) {
    const rawTarget = targetInfo.target;
    let targetPath = targetInfo.targetPath || '/';

    let hostname = rawTarget;
    let port = 80;
    if (hostname.includes(':')) {
      const parts = hostname.split(':');
      hostname = parts[0];
      port = parseInt(parts[1], 10) || 80;
    }

    // [SECURITY] SSRF Protection: validasi IP target
    if (!isTargetAllowed(hostname)) {
      return res.status(403).json({ error: 'Akses ke target IP ini ditolak demi keamanan (SSRF Protection).' });
    }

    // [SECURITY] Autentikasi Pengguna
    const auth = checkProxyAuth(req);
    if (!auth) {
      return res.status(401).json({ error: 'Autentikasi diperlukan untuk mengakses antarmuka CCTV.' });
    }

    if (!targetPath.startsWith('/')) {
      targetPath = '/' + targetPath;
    }

    const cookies = [
      `cctv_proxy_ip=${encodeURIComponent(rawTarget)}; Path=/; SameSite=Lax`,
    ];
    if (auth.token) {
      cookies.push(`cctv_proxy_auth=${encodeURIComponent(auth.token)}; Path=/; SameSite=Lax; HttpOnly`);
    }
    res.setHeader('Set-Cookie', cookies);

    const clientHeaders = { ...req.headers };
    clientHeaders['host'] = `${hostname}:${port}`;
    delete clientHeaders['referer'];
    clientHeaders['accept-encoding'] = 'identity'; // Minta teks polos tanpa kompresi

    const options = {
      hostname,
      port,
      path: targetPath,
      method: req.method,
      headers: clientHeaders,
      timeout: 10000,
      insecureHTTPParser: true, // Toleransi format header non-standar
    };

    const proxyReq = http.request(options, (cameraRes) => {
      const responseHeaders = { ...cameraRes.headers };

      delete responseHeaders['x-frame-options'];
      delete responseHeaders['X-Frame-Options'];
      delete responseHeaders['content-security-policy'];
      if (cameraRes.statusCode >= 300 && cameraRes.statusCode < 400 && responseHeaders.location) {
        const redirectLocation = responseHeaders.location;
        if (redirectLocation.startsWith('/')) {
          responseHeaders.location = `/api/cctv-proxy/${encodeURIComponent(rawTarget)}${redirectLocation}`;
        }
      }

      const contentType = (responseHeaders['content-type'] || '').toLowerCase();
      const encoding = (responseHeaders['content-encoding'] || '').toLowerCase();

      if (contentType.includes('text/html')) {
        let htmlChunks = [];
        cameraRes.on('data', (c) => htmlChunks.push(c));
        cameraRes.on('end', () => {
          let buffer = Buffer.concat(htmlChunks);

          // Dekompresi jika kamera tetap memaksakan format gzip/deflate
          try {
            if (encoding === 'gzip') {
              buffer = zlib.gunzipSync(buffer);
            } else if (encoding === 'deflate') {
              buffer = zlib.inflateSync(buffer);
            }
          } catch (decompErr) {
            console.warn('⚠️ Gagal dekompresi response kamera:', decompErr.message);
          }

          let html = buffer.toString('utf-8');
          const targetPrefix = `/api/cctv-proxy/${encodeURIComponent(rawTarget)}`;

          // 1. Rewrite script redirect bawaan kamera (misal window.location.href = "/doc/page/login.asp")
          html = html.replace(
            /((?:window\.|document\.)?location(?:\.href)?\s*=\s*["'])\/([^"']+)(["'])/gi,
            `$1${targetPrefix}/$2$3`
          );

          // 2. Inject <base> tag agar semua aset relatif/absolut tetap di dalam proxy
          if (html.includes('<head>')) {
            html = html.replace('<head>', `<head><base href="${targetPrefix}/">`);
          } else if (html.includes('<HEAD>')) {
            html = html.replace('<HEAD>', `<HEAD><base href="${targetPrefix}/">`);
          }

          delete responseHeaders['content-encoding'];
          delete responseHeaders['content-length'];
          res.writeHead(cameraRes.statusCode, responseHeaders);
          res.end(html);
        });
      } else {
        res.writeHead(cameraRes.statusCode, responseHeaders);
        cameraRes.pipe(res);
      }
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).send(`
          <div style="font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;padding:32px;height:100vh;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
            <div style="background:#1e293b;padding:24px 32px;border-radius:12px;border:1px solid #334155;max-width:500px;">
              <h3 style="margin-top:0;color:#fbbf24;">⏱️ Timeout: CCTV Tidak Merespons</h3>
              <p style="color:#94a3b8;font-size:14px;line-height:1.5;">Koneksi ke IP <code>${hostname}:${port}</code> melebihi batas waktu 10 detik. Pastikan perangkat aktif dan kabel jaringan terhubung.</p>
              <button onclick="window.location.reload()" style="background:#3b82f6;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;margin-top:12px;">Coba Lagi</button>
            </div>
          </div>
        `);
      }
    });

    proxyReq.on('error', (err) => {
      // Jika terjadi parse error karena header non-standar (misal bug firmware Sony \r\r\n), gunakan fallback raw socket
      if (err.code === 'HPE_LF_EXPECTED' || (err.message && err.message.includes('Parse Error'))) {
        return fallbackRawSocketProxy(req, res, hostname, port, targetPath, rawTarget);
      }

      if (!res.headersSent) {
        res.status(502).send(`
          <div style="font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;padding:32px;height:100vh;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;">
            <div style="background:#1e293b;padding:24px 32px;border-radius:12px;border:1px solid #334155;max-width:500px;">
              <h3 style="margin-top:0;color:#f87171;">⚠️ Gagal Terhubung ke Web CCTV</h3>
              <p style="color:#94a3b8;font-size:14px;line-height:1.5;">Perangkat di IP <code>${hostname}:${port}</code> sedang offline, port web tidak dibuka, atau menolak koneksi.</p>
              <p style="color:#64748b;font-size:12px;">Detail: ${err.message}</p>
              <button onclick="window.location.reload()" style="background:#3b82f6;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;margin-top:12px;">Coba Lagi</button>
            </div>
          </div>
        `);
      }
    });

    if (req.body && Object.keys(req.body).length > 0) {
      const bodyData = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
      proxyReq.end();
    } else {
      req.pipe(proxyReq);
    }
  }

  // 1. Endpoint utama: /api/cctv-proxy/:targetIp/*
  app.use('/api/cctv-proxy/:targetIp', (req, res) => {
    const targetIp = req.params.targetIp;
    const subpath = req.url || '/';
    handleProxyRequest(req, res, { target: targetIp, targetPath: subpath });
  });

  // 2. Interceptor untuk semua aset/API yang dipanggil dari dalam iframe CCTV
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/assets/')) {
      return next();
    }

    const targetInfo = resolveTarget(req);
    if (targetInfo && targetInfo.target) {
      return handleProxyRequest(req, res, targetInfo);
    }
    next();
  });
}

module.exports = { mountProxyRoutes };
