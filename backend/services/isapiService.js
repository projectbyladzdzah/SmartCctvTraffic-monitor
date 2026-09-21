const http = require('http');
const crypto = require('crypto');

function md5(s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

/**
 * Ekstrak kredensial (username, password) dari URL RTSP
 */
function extractCredentialsFromRtsp(rtspUrl) {
  if (!rtspUrl) return { username: 'admin', password: '' };
  try {
    const match = rtspUrl.match(/^rtsp:\/\/([^:@]+):([^@]+)@/i);
    if (match) {
      return {
        username: decodeURIComponent(match[1]),
        password: decodeURIComponent(match[2]),
      };
    }
  } catch (_) {}
  return { username: 'admin', password: '' };
}

/**
 * Kirim request HTTP dengan Digest Authentication (standar Hikvision & ONVIF)
 */
function isapiRequest(options, user, pass, body = null) {
  return new Promise((resolve, reject) => {
    const { hostname, port = 80, path, method = 'GET' } = options;

    const initialHeaders = {
      'Accept': '*/*',
      'User-Agent': 'CCTV-Monitor-Controller',
    };
    if (body) {
      initialHeaders['Content-Type'] = 'application/xml';
      initialHeaders['Content-Length'] = Buffer.byteLength(body);
    }

    const req1 = http.request({ hostname, port, path, method, headers: initialHeaders, timeout: 5000 }, (res1) => {
      // Jika kamera tidak meminta autentikasi (200 OK langsung)
      if (res1.statusCode < 400 && res1.statusCode !== 401) {
        let d = '';
        res1.on('data', (c) => (d += c));
        res1.on('end', () => resolve({ statusCode: res1.statusCode, body: d }));
        return;
      }

      if (res1.statusCode !== 401 || !res1.headers['www-authenticate']) {
        let d = '';
        res1.on('data', (c) => (d += c));
        res1.on('end', () => resolve({ statusCode: res1.statusCode, body: d }));
        return;
      }

      const auth = res1.headers['www-authenticate'];
      res1.resume(); // Drain and release the initial response stream
      const realmMatch = auth.match(/realm="([^"]+)"/);
      const nonceMatch = auth.match(/nonce="([^"]+)"/);
      const qopMatch = auth.match(/qop="([^"]+)"/);

      if (!realmMatch || !nonceMatch) {
        return resolve({ statusCode: 401, body: 'Digest challenge missing realm or nonce' });
      }

      const realm = realmMatch[1];
      const nonce = nonceMatch[1];
      const qop = qopMatch ? qopMatch[1] : null;

      const ha1 = md5(`${user}:${realm}:${pass}`);
      const ha2 = md5(`${method}:${path}`);
      const cnonce = crypto.randomBytes(8).toString('hex');
      const nc = '00000001';

      let resp;
      if (qop) {
        resp = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
      } else {
        resp = md5(`${ha1}:${nonce}:${ha2}`);
      }

      let header = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${path}", response="${resp}"`;
      if (qop) {
        header += `, qop="${qop}", nc=${nc}, cnonce="${cnonce}"`;
      }

      const req2Headers = {
        'Authorization': header,
        'Accept': '*/*',
        'User-Agent': 'CCTV-Monitor-Controller',
      };
      if (body) {
        req2Headers['Content-Type'] = 'application/xml';
        req2Headers['Content-Length'] = Buffer.byteLength(body);
      }

      const req2 = http.request({ hostname, port, path, method, headers: req2Headers, timeout: 5000 }, (res2) => {
        let d2 = '';
        res2.on('data', (c) => (d2 += c));
        res2.on('end', () => resolve({ statusCode: res2.statusCode, body: d2 }));
      });

      req2.on('timeout', () => {
        req2.destroy();
        reject(new Error('Timeout menghubungi kamera (Digest stage)'));
      });
      req2.on('error', reject);
      if (body) req2.write(body);
      req2.end();
    });

    req1.on('timeout', () => {
      req1.destroy();
      reject(new Error('Timeout menghubungi kamera'));
    });
    req1.on('error', reject);
    if (body) req1.write(body);
    req1.end();
  });
}

function parseXmlTag(xml, tag) {
  if (!xml) return '';
  const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]+)<\/${tag}>`, 'i'));
  return match ? match[1].trim() : '';
}

/**
 * Ambil informasi hardware & firmware perangkat
 */
async function getDeviceInfo(ip, user, pass) {
  const res = await isapiRequest({ hostname: ip, path: '/ISAPI/System/deviceInfo', method: 'GET' }, user, pass);
  if (res.statusCode !== 200) {
    throw new Error(`Kamera merespons kode status ${res.statusCode}: ${res.body.slice(0, 100)}`);
  }

  return {
    deviceName: parseXmlTag(res.body, 'deviceName') || parseXmlTag(res.body, 'deviceDescription'),
    model: parseXmlTag(res.body, 'model'),
    serialNumber: parseXmlTag(res.body, 'serialNumber'),
    macAddress: parseXmlTag(res.body, 'macAddress'),
    firmwareVersion: parseXmlTag(res.body, 'firmwareVersion'),
    encoderVersion: parseXmlTag(res.body, 'encoderVersion'),
    manufacturer: parseXmlTag(res.body, 'manufacturer') || 'Hikvision',
  };
}

/**
 * Gerakkan PTZ secara continuous (Pan, Tilt, Zoom)
 * pan: -100 s/d 100 (negatif = kiri, positif = kanan)
 * tilt: -100 s/d 100 (negatif = bawah, positif = atas)
 * zoom: -100 s/d 100 (negatif = zoom out, positif = zoom in)
 */
async function controlPtzContinuous(ip, user, pass, { pan = 0, tilt = 0, zoom = 0, channel = 1 }) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<PTZData>
  <pan>${Math.round(pan)}</pan>
  <tilt>${Math.round(tilt)}</tilt>
  <zoom>${Math.round(zoom)}</zoom>
</PTZData>`;

  const path = `/ISAPI/PTZCtrl/channels/${channel}/continuous`;
  const res = await isapiRequest({ hostname: ip, path, method: 'PUT' }, user, pass, xml);
  return {
    success: res.statusCode === 200,
    statusCode: res.statusCode,
    response: res.body,
  };
}

/**
 * Hentikan pergerakan PTZ
 */
async function stopPtz(ip, user, pass, channel = 1) {
  return controlPtzContinuous(ip, user, pass, { pan: 0, tilt: 0, zoom: 0, channel });
}

/**
 * Arahkan kamera ke Preset posisi tertentu
 */
async function gotoPtzPreset(ip, user, pass, presetId = 1, channel = 1) {
  const path = `/ISAPI/PTZCtrl/channels/${channel}/presets/${presetId}/goto`;
  const res = await isapiRequest({ hostname: ip, path, method: 'PUT' }, user, pass);
  return {
    success: res.statusCode === 200,
    statusCode: res.statusCode,
  };
}

/**
 * Reboot kamera
 */
async function rebootCamera(ip, user, pass) {
  const path = '/ISAPI/System/reboot';
  const res = await isapiRequest({ hostname: ip, path, method: 'PUT' }, user, pass);
  return {
    success: res.statusCode === 200,
    statusCode: res.statusCode,
    message: res.statusCode === 200 ? 'Perintah restart berhasil dikirim' : 'Gagal restart kamera',
  };
}
/**
 * Sinkronkan Waktu Kamera Hikvision
 */
async function syncHikTime(ip, user, pass) {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yr = now.getFullYear();
  const mon = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hr = pad(now.getHours());
  const min = pad(now.getMinutes());
  const sec = pad(now.getSeconds());
  const localTime = `${yr}-${mon}-${day}T${hr}:${min}:${sec}+07:00`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Time version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <timeMode>manual</timeMode>
  <localTime>${localTime}</localTime>
  <timeZone>CST-7:00:00</timeZone>
</Time>`;

  const res = await isapiRequest({ hostname: ip, path: '/ISAPI/System/time', method: 'PUT' }, user, pass, xml);
  const success = res.statusCode === 200;
  return {
    success,
    statusCode: res.statusCode,
    syncedTime: now.toLocaleString('id-ID'),
    message: success ? 'Waktu kamera Hikvision berhasil disinkronkan' : 'Gagal sinkronisasi waktu',
  };
}

/**
 * Ubah Keterangan Teks / OSD Title di Layar Video Kamera Hikvision
 */
async function setHikOsdName(ip, user, pass, titleText, channel = 1) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<VideoInputChannel version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
  <id>${channel}</id>
  <inputPort>${channel}</inputPort>
  <name>${titleText}</name>
  <videoFormat>PAL</videoFormat>
</VideoInputChannel>`;

  const res = await isapiRequest(
    { hostname: ip, path: `/ISAPI/System/Video/inputs/channels/${channel}`, method: 'PUT' },
    user,
    pass,
    xml
  );
  const success = res.statusCode === 200;
  return {
    success,
    statusCode: res.statusCode,
    title: titleText,
    message: success ? `Keterangan OSD berhasil diubah menjadi "${titleText}"` : 'Gagal mengubah OSD kamera',
  };
}

/**
 * Baca Keterangan OSD Saat Ini dari Kamera Hikvision
 */
async function getHikOsdName(ip, user, pass, channel = 1) {
  const res = await isapiRequest(
    { hostname: ip, path: `/ISAPI/System/Video/inputs/channels/${channel}`, method: 'GET' },
    user,
    pass
  );
  if (res.statusCode === 200) {
    return parseXmlTag(res.body, 'name');
  }
  return '';
}

module.exports = {
  extractCredentialsFromRtsp,
  isapiRequest,
  getDeviceInfo,
  controlPtzContinuous,
  stopPtz,
  gotoPtzPreset,
  syncHikTime,
  setHikOsdName,
  getHikOsdName,
  rebootCamera,
};

