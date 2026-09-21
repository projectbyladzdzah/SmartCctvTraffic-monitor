const net = require('net');

/**
 * Kirim HTTP Request via Raw TCP Socket ke Kamera Sony
 * Ini mencegah error Node.js HPE_LF_EXPECTED akibat bug firmware Sony (\r\r\n pada header)
 */
function sendSonySocketRequest(ip, requestPath, timeoutMs = 4000, user = 'admin', pass = 'admin') {
  return new Promise((resolve, reject) => {
    let timer = null;
    let resolved = false;

    const done = (err, res) => {
      if (!resolved) {
        resolved = true;
        if (timer) clearTimeout(timer);
        if (err) reject(err);
        else resolve(res);
      }
    };

    const client = net.connect(80, ip, () => {
      const finalUser = user || 'admin';
      const finalPass = pass || 'admin';
      const b64 = Buffer.from(`${finalUser}:${finalPass}`).toString('base64');
      const authHeader = `Authorization: Basic ${b64}\r\n`;

      const httpMsg =
        `GET ${requestPath} HTTP/1.1\r\n` +
        `Host: ${ip}\r\n` +
        `User-Agent: CCTV-Monitor-SonyDriver\r\n` +
        `Accept: */*\r\n` +
        authHeader +
        `Connection: close\r\n\r\n`;
      client.write(httpMsg);
    });

    let rawBuffer = '';
    client.on('data', (chunk) => {
      rawBuffer += chunk.toString('latin1');
    });

    client.on('error', (err) => {
      client.destroy();
      done(new Error(`Gagal menghubungi CCTV Sony (${ip}): ${err.message}`));
    });

    client.on('end', () => {
      client.destroy();
      // Parsing status code dan body
      const firstLine = rawBuffer.split('\r\n')[0] || rawBuffer.split('\n')[0] || '';
      const statusMatch = firstLine.match(/HTTP\/\d\.\d\s+(\d+)/);
      const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;

      // Pisahkan header dan body
      const splitIdx = rawBuffer.indexOf('\r\n\r\n');
      const body = splitIdx !== -1 ? rawBuffer.slice(splitIdx + 4) : rawBuffer;

      done(null, { statusCode, body, raw: rawBuffer });
    });

    timer = setTimeout(() => {
      client.destroy();
      done(new Error(`Timeout menghubungi CCTV Sony (${ip}) setelah ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

/**
 * Mengambil informasi hardware, spesifikasi PTZ, dan Preset dari kamera Sony
 */
async function getSonyDeviceInfo(ip, user = 'admin', pass = 'admin') {
  const [sysRes, ptzRes, presetRes] = await Promise.allSettled([
    sendSonySocketRequest(ip, '/command/inquiry.cgi?inq=system', 3000, user, pass),
    sendSonySocketRequest(ip, '/command/inquiry.cgi?inq=ptzf', 3000, user, pass),
    sendSonySocketRequest(ip, '/command/inquiry.cgi?inq=presetposition', 3000, user, pass),
  ]);

  const sysBody = sysRes.status === 'fulfilled' ? sysRes.value.body : '';
  const ptzBody = ptzRes.status === 'fulfilled' ? ptzRes.value.body : '';
  const presetBody = presetRes.status === 'fulfilled' ? presetRes.value.body : '';

  const modelMatch = sysBody.match(/ModelName=([^&\r\n]+)/);
  const serialMatch = sysBody.match(/Serial=([^&\r\n]+)/);
  const verMatch = sysBody.match(/SoftVersion=([^&\r\n]+)/);
  const panTiltMatch = sysBody.match(/PanTiltFunc=([0-9]+)/);
  const contPtzMatch = sysBody.match(/ContinuousPanTiltZoomFunc=([0-9]+)/);

  const isPtz = (panTiltMatch && panTiltMatch[1] === '1') || (contPtzMatch && contPtzMatch[1] === '1');

  // Ambil daftar nama Preset yang tersimpan di kamera Sony jika ada
  const presets = [];
  const presetNameMatch = presetBody.match(/PresetName=([^&\r\n]+)/);
  if (presetNameMatch) {
    const tokens = presetNameMatch[1].split(',');
    for (let i = 0; i < tokens.length; i += 2) {
      if (tokens[i]) {
        presets.push({ id: parseInt(tokens[i], 10), name: tokens[i + 1] || `Preset ${tokens[i]}` });
      }
    }
  }

  return {
    deviceName: modelMatch ? `Sony ${modelMatch[1].trim()}` : 'Sony IP Camera',
    model: modelMatch ? modelMatch[1].trim() : 'Sony Network Camera',
    serialNumber: serialMatch ? serialMatch[1].trim() : '',
    firmwareVersion: verMatch ? verMatch[1].trim() : '',
    manufacturer: 'Sony',
    isPtz,
    presets,
  };
}

/**
 * Kontrol Continuous PTZ Kamera Sony
 */
async function controlSonyPtzContinuous(ip, { pan = 0, tilt = 0, zoom = 0 }) {
  const scaledPan = Math.round((pan / 100) * 24);
  const scaledTilt = Math.round((tilt / 100) * 24);
  const scaledZoom = Math.round((zoom / 100) * 8);

  const path = `/command/ptzf.cgi?ContinuousPanTiltZoom=${scaledPan},${scaledTilt},${scaledZoom}`;
  const res = await sendSonySocketRequest(ip, path);

  const success = res.statusCode === 200 || res.statusCode === 204;
  return {
    success,
    statusCode: res.statusCode,
    response: res.body,
  };
}

/**
 * Hentikan pergerakan PTZ Kamera Sony
 */
async function stopSonyPtz(ip) {
  return controlSonyPtzContinuous(ip, { pan: 0, tilt: 0, zoom: 0 });
}

/**
 * Arahkan Kamera Sony ke Preset tertentu
 */
async function gotoSonyPreset(ip, presetId = 1) {
  const path = `/command/presetposition.cgi?PresetOperation=recall&PresetNum=${presetId}`;
  const res = await sendSonySocketRequest(ip, path);

  const success = res.statusCode === 200 || res.statusCode === 204;
  return {
    success,
    statusCode: res.statusCode,
    message: success ? `Kamera mengarah ke Preset ${presetId}` : 'Gagal memanggil preset',
  };
}

/**
 * Sinkronkan Waktu Kamera Sony dengan Waktu Server/PC Saat Ini & Aktifkan NTP Otomatis
 */
async function syncSonyTime(ip, user = 'admin', pass = 'admin') {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yr = String(now.getFullYear()).slice(-2);
  const mon = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hr = pad(now.getHours());
  const min = pad(now.getMinutes());
  const sec = pad(now.getSeconds());
  // Format Sony: YYMMDDhhmmssW (W: 1=Sun, 2=Mon... 7=Sat)
  const dayOfWeek = now.getDay() === 0 ? 1 : now.getDay() + 1;
  const timeStr = `${yr}${mon}${day}${hr}${min}${sec}${dayOfWeek}`;

  // 1. Set jam manual instan
  const resManual = await sendSonySocketRequest(
    ip,
    `/command/system.cgi?Time=${timeStr}`,
    3500,
    user,
    pass
  );

  // 2. Set auto sync NTP (pool.ntp.org / id.pool.ntp.org)
  await sendSonySocketRequest(
    ip,
    `/command/system.cgi?NtpService=on&NtpServer=id.pool.ntp.org&NtpAuto=on`,
    3500,
    user,
    pass
  ).catch(() => {});

  const success = resManual.statusCode === 200 || resManual.statusCode === 204;
  return {
    success,
    statusCode: resManual.statusCode,
    syncedTime: now.toLocaleString('id-ID'),
    message: success ? 'Waktu kamera berhasil disinkronkan & NTP aktif' : 'Gagal sinkronisasi waktu kamera',
  };
}

/**
 * Ubah Keterangan Teks / OSD Title di Layar Video Kamera Sony
 */
async function setSonyOsdName(ip, titleText, user = 'admin', pass = 'admin') {
  const cleanTitle = encodeURIComponent(titleText.trim());
  const path = `/command/superimpose.cgi?SiEnableImage1=on&SiPositionArea1Image1=0,0,left&SiFormatArea1Image1=${cleanTitle}`;
  const res = await sendSonySocketRequest(ip, path, 3500, user, pass);

  const success = res.statusCode === 200 || res.statusCode === 204;
  return {
    success,
    statusCode: res.statusCode,
    title: titleText,
    message: success ? `Keterangan OSD berhasil diubah menjadi "${titleText}"` : 'Gagal mengubah OSD kamera',
  };
}

/**
 * Baca Keterangan OSD Saat Ini dari Kamera Sony
 */
async function getSonyOsdName(ip, user = 'admin', pass = 'admin') {
  const res = await sendSonySocketRequest(ip, '/command/inquiry.cgi?inq=superimpose', 3000, user, pass);
  const match = res.body.match(/SiFormatArea1Image1=([^&\r\n]*)/);
  return match ? decodeURIComponent(match[1]) : '';
}

/**
 * Reboot Kamera Sony
 */
async function rebootSonyCamera(ip, user = 'admin', pass = 'admin') {
  const path = '/command/system.cgi?reboot=camera';
  const res = await sendSonySocketRequest(ip, path, 3500, user, pass);
  const success = res.statusCode === 200 || res.statusCode === 204;
  return {
    success,
    statusCode: res.statusCode,
    message: success ? 'Perintah restart berhasil dikirim ke kamera Sony' : 'Gagal restart kamera Sony',
  };
}

module.exports = {
  sendSonySocketRequest,
  getSonyDeviceInfo,
  controlSonyPtzContinuous,
  stopSonyPtz,
  gotoSonyPreset,
  syncSonyTime,
  setSonyOsdName,
  getSonyOsdName,
  rebootSonyCamera,
};
