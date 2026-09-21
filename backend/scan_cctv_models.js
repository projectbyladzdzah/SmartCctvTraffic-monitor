const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { initDB, getPool } = require('./database');

function md5(s) {
  return crypto.createHash('md5').update(s).digest('hex');
}

function extractCreds(rtspUrl) {
  if (!rtspUrl) return { user: 'admin', pass: '' };
  try {
    const m = rtspUrl.match(/^rtsp:\/\/([^:@]+):([^@]+)@/i);
    if (m) return { user: decodeURIComponent(m[1]), pass: decodeURIComponent(m[2]) };
  } catch (_) {}
  return { user: 'admin', pass: '' };
}

// 1. Deteksi Sony via Raw Socket (mengatasi bug header ganda \r\r\n pada parser Node.js)
function probeSony(ip, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let timer = null;
    let resolved = false;

    const done = (val) => {
      if (!resolved) {
        resolved = true;
        if (timer) clearTimeout(timer);
        resolve(val);
      }
    };

    const client = net.connect(80, ip, () => {
      client.write(`GET /command/inquiry.cgi?inq=system HTTP/1.1\r\nHost: ${ip}\r\nConnection: close\r\n\r\n`);
    });

    let data = '';
    client.on('data', (chunk) => {
      data += chunk.toString('latin1');
      if (data.includes('ModelName=')) {
        client.destroy();
        const modelMatch = data.match(/ModelName=([^&\r\n]+)/);
        const panTiltMatch = data.match(/PanTiltFunc=([0-9]+)/);
        const contPtzMatch = data.match(/ContinuousPanTiltZoomFunc=([0-9]+)/);
        const isPtz = (panTiltMatch && panTiltMatch[1] === '1') || (contPtzMatch && contPtzMatch[1] === '1');
        return done({
          detected: true,
          merk: 'Sony',
          model: modelMatch ? modelMatch[1].trim() : 'Sony IP Camera',
          jenis: isPtz ? 'PTZ' : 'Fixed',
        });
      }
    });

    client.on('error', () => done(null));
    client.on('end', () => done(null));

    timer = setTimeout(() => {
      client.destroy();
      done(null);
    }, timeoutMs);
  });
}

// 2. Deteksi Hikvision via ISAPI
function probeHikvision(ip, user, pass, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let resolved = false;
    let timer = null;

    const done = (val) => {
      if (!resolved) {
        resolved = true;
        if (timer) clearTimeout(timer);
        resolve(val);
      }
    };

    timer = setTimeout(() => done(null), timeoutMs);

    const req1 = http.request(
      {
        hostname: ip,
        port: 80,
        path: '/ISAPI/System/deviceInfo',
        method: 'GET',
        headers: { Accept: '*/*' },
        timeout: timeoutMs,
      },
      (res1) => {
        if (res1.statusCode === 200) {
          let d = '';
          res1.on('data', (c) => (d += c));
          res1.on('end', () => done(parseHikXml(d, ip, user, pass)));
          return;
        }

        if (res1.statusCode !== 401 || !res1.headers['www-authenticate']) {
          return done(null);
        }

        const auth = res1.headers['www-authenticate'];
        const realm = auth.match(/realm="([^"]+)"/)?.[1];
        const nonce = auth.match(/nonce="([^"]+)"/)?.[1];
        const qop = auth.match(/qop="([^"]+)"/)?.[1];
        if (!realm || !nonce) return done(null);

        const ha1 = md5(`${user}:${realm}:${pass}`);
        const ha2 = md5('GET:/ISAPI/System/deviceInfo');
        const cnonce = crypto.randomBytes(8).toString('hex');
        const nc = '00000001';
        const resp = qop ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${nonce}:${ha2}`);
        let header = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="/ISAPI/System/deviceInfo", response="${resp}"`;
        if (qop) header += `, qop="${qop}", nc=${nc}, cnonce="${cnonce}"`;

        const req2 = http.request(
          {
            hostname: ip,
            port: 80,
            path: '/ISAPI/System/deviceInfo',
            method: 'GET',
            headers: { Authorization: header, Accept: '*/*' },
            timeout: timeoutMs,
          },
          (res2) => {
            let d2 = '';
            res2.on('data', (c) => (d2 += c));
            res2.on('end', async () => {
              if (res2.statusCode === 200) {
                const info = await parseHikXml(d2, ip, user, pass);
                done(info);
              } else {
                done(null);
              }
            });
          }
        );
        req2.on('error', () => done(null));
        req2.end();
      }
    );

    req1.on('error', () => done(null));
    req1.end();
  });
}

async function parseHikXml(xml, ip, user, pass) {
  const modelMatch = xml.match(/<model[^>]*>([^<]+)<\/model>/i);
  const manuMatch = xml.match(/<manufacturer[^>]*>([^<]+)<\/manufacturer>/i);
  const model = modelMatch ? modelMatch[1].trim() : 'Hikvision IP Camera';

  let jenis = 'Fixed';
  // Check typical Hikvision PTZ model numbers (DE/DF series)
  if (/DS-2D[EF]|DS-2SE|PTZ/i.test(model)) {
    jenis = 'PTZ';
  } else {
    // Probe PTZ channels to be 100% sure
    try {
      const ptzCap = await checkHikPtzChannels(ip, user, pass);
      if (ptzCap && ptzCap.panSupport) {
        jenis = 'PTZ';
      }
    } catch (_) {}
  }

  return {
    detected: true,
    merk: manuMatch ? manuMatch[1].trim() : 'Hikvision',
    model,
    jenis,
  };
}

function checkHikPtzChannels(ip, user, pass, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req1 = http.request(
      {
        hostname: ip,
        port: 80,
        path: '/ISAPI/PTZCtrl/channels',
        method: 'GET',
        headers: { Accept: '*/*' },
        timeout: timeoutMs,
      },
      (res1) => {
        if (res1.statusCode === 200) {
          let d = '';
          res1.on('data', (c) => (d += c));
          res1.on('end', () => {
            const pan = /<panSupport>true<\/panSupport>/i.test(d);
            const zoom = /<zoomSupport>true<\/zoomSupport>/i.test(d);
            resolve({ panSupport: pan, zoomSupport: zoom });
          });
          return;
        }

        if (res1.statusCode !== 401 || !res1.headers['www-authenticate']) {
          return resolve(null);
        }

        const auth = res1.headers['www-authenticate'];
        const realm = auth.match(/realm="([^"]+)"/)?.[1];
        const nonce = auth.match(/nonce="([^"]+)"/)?.[1];
        const qop = auth.match(/qop="([^"]+)"/)?.[1];
        if (!realm || !nonce) return resolve(null);

        const ha1 = md5(`${user}:${realm}:${pass}`);
        const ha2 = md5('GET:/ISAPI/PTZCtrl/channels');
        const cnonce = crypto.randomBytes(8).toString('hex');
        const nc = '00000001';
        const resp = qop ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${nonce}:${ha2}`);
        let header = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="/ISAPI/PTZCtrl/channels", response="${resp}"`;
        if (qop) header += `, qop="${qop}", nc=${nc}, cnonce="${cnonce}"`;

        const req2 = http.request(
          {
            hostname: ip,
            port: 80,
            path: '/ISAPI/PTZCtrl/channels',
            method: 'GET',
            headers: { Authorization: header, Accept: '*/*' },
            timeout: timeoutMs,
          },
          (res2) => {
            let d2 = '';
            res2.on('data', (c) => (d2 += c));
            res2.on('end', () => {
              const pan = /<panSupport>true<\/panSupport>/i.test(d2);
              const zoom = /<zoomSupport>true<\/zoomSupport>/i.test(d2);
              resolve({ panSupport: pan, zoomSupport: zoom });
            });
          }
        );
        req2.on('error', () => resolve(null));
        req2.end();
      }
    );
    req1.on('error', () => resolve(null));
    req1.end();
  });
}

// 3. Deteksi Dahua via banner
function probeDahua(ip, user, pass, timeoutMs = 2500) {
  return new Promise((resolve) => {
    let resolved = false;
    let timer = setTimeout(() => {
      if (!resolved) { resolved = true; resolve(null); }
    }, timeoutMs);

    const path = '/cgi-bin/magicBox.cgi?action=getSystemInfo';
    const req1 = http.request({ hostname: ip, port: 80, path, method: 'GET', timeout: timeoutMs }, (res1) => {
      if (res1.statusCode !== 401 || !res1.headers['www-authenticate']) {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(null); }
        return;
      }
      const auth = res1.headers['www-authenticate'];
      const realm = auth.match(/realm="([^"]+)"/)?.[1];
      const nonce = auth.match(/nonce="([^"]+)"/)?.[1];
      const qop = auth.match(/qop="([^"]+)"/)?.[1];
      const opaque = auth.match(/opaque="([^"]+)"/)?.[1];
      if (!realm || !nonce) {
        if (!resolved) { resolved = true; clearTimeout(timer); resolve(null); }
        return;
      }

      const ha1 = md5(`${user}:${realm}:${pass}`);
      const ha2 = md5(`GET:${path}`);
      const cnonce = crypto.randomBytes(8).toString('hex');
      const nc = '00000001';
      const resp = qop ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`) : md5(`${ha1}:${nonce}:${ha2}`);

      let header = `Digest username="${user}", realm="${realm}", nonce="${nonce}", uri="${path}", response="${resp}"`;
      if (qop) header += `, qop="${qop}", nc=${nc}, cnonce="${cnonce}"`;
      if (opaque) header += `, opaque="${opaque}"`;

      const req2 = http.request({ hostname: ip, port: 80, path, method: 'GET', headers: { Authorization: header }, timeout: timeoutMs }, (res2) => {
        let d2 = '';
        res2.on('data', (c) => (d2 += c));
        res2.on('end', () => {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          if (res2.statusCode === 200) {
            const devType = d2.match(/deviceType=([^\r\n]+)/)?.[1] || 'Dahua IP Camera';
            const isPtz = /SD|PTZ/i.test(devType);
            resolve({
              detected: true,
              merk: 'Dahua',
              model: devType.trim(),
              jenis: isPtz ? 'PTZ' : 'Fixed',
            });
          } else {
            resolve(null);
          }
        });
      });
      req2.on('error', () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(null); } });
      req2.end();
    });
    req1.on('error', () => { if (!resolved) { resolved = true; clearTimeout(timer); resolve(null); } });
    req1.end();
  });
}

// 4. Deteksi generic web port 80 jika kamera tidak merespons API di atas
function probeGenericWeb(ip, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let resolved = false;
    let timer = setTimeout(() => {
      if (!resolved) { resolved = true; resolve(null); }
    }, timeoutMs);

    const client = net.connect(80, ip, () => {
      client.write(`GET / HTTP/1.1\r\nHost: ${ip}\r\nConnection: close\r\n\r\n`);
    });
    let d = '';
    client.on('data', (chunk) => {
      d += chunk.toString('latin1');
      if (d.length > 500) {
        client.destroy();
      }
    });
    client.on('error', () => {
      if (!resolved) { resolved = true; clearTimeout(timer); resolve(null); }
    });
    client.on('close', () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      if (/Sony/i.test(d)) return resolve({ detected: true, merk: 'Sony', model: 'Sony IP Camera', jenis: 'Fixed' });
      if (/Hikvision/i.test(d)) return resolve({ detected: true, merk: 'Hikvision', model: 'Hikvision IP Camera', jenis: 'Fixed' });
      if (/Dahua|QuickViewer/i.test(d)) return resolve({ detected: true, merk: 'Dahua', model: 'Dahua IP Camera', jenis: 'Fixed' });
      resolve(null);
    });
  });
}

// Master scanner per camera
async function scanCamera(cctv) {
  const { user, pass } = extractCreds(cctv.rtsp_url);

  // 1. Coba Sony dulu (sangat cepat ~100ms via TCP socket)
  const sony = await probeSony(cctv.ip);
  if (sony) return sony;

  // 2. Coba Hikvision
  const hik = await probeHikvision(cctv.ip, user, pass);
  if (hik) return hik;

  // 3. Coba Dahua
  const dahua = await probeDahua(cctv.ip, user, pass);
  if (dahua) return dahua;

  // 4. Coba generic check
  const generic = await probeGenericWeb(cctv.ip);
  if (generic) return generic;

  return null;
}

// Batch runner with concurrency limit
async function scanAllCctvs(cctvs, concurrency = 8) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < cctvs.length) {
      const i = index++;
      const c = cctvs[i];
      process.stdout.write(`[${i + 1}/${cctvs.length}] Memindai ${c.name} (${c.ip})...\r`);
      try {
        const detected = await scanCamera(c);
        results[i] = {
          cctv: c,
          detected,
        };
      } catch (err) {
        results[i] = {
          cctv: c,
          detected: null,
          error: err.message,
        };
      }
    }
  }

  const workers = [];
  for (let w = 0; w < concurrency; w++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  process.stdout.write('\n');
  return results;
}

async function main() {
  const isApply = process.argv.includes('--apply');
  console.log('🚀 Memulai Pemindai Spesifikasi Hardware CCTV...');
  console.log(`Mode: ${isApply ? 'APPLY (Menyimpan langsung ke database)' : 'DRY-RUN (Simulasi / Tinjauan)'}\n`);

  await initDB();
  const pool = getPool();

  const [cctvs] = await pool.query('SELECT id, name, jenis, merk, type, ip, rtsp_url FROM cctvs ORDER BY id ASC');
  console.log(`📡 Ditemukan ${cctvs.length} kamera di database. Menjalankan pemindaian paralel...`);

  const startTime = Date.now();
  const scanResults = await scanAllCctvs(cctvs, 6);
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`\n⏱️ Pemindaian selesai dalam ${duration} detik!\n`);

  let updatedCount = 0;
  let offlineCount = 0;
  let unchangedCount = 0;

  console.log('='.repeat(105));
  console.log(
    'ID'.padEnd(10) +
    'Nama'.padEnd(30) +
    'IP'.padEnd(16) +
    'Data Lama (Merk/Jenis/Type)'.padEnd(26) +
    'Hasil Baru Terdeteksi'
  );
  console.log('='.repeat(105));

  for (const item of scanResults) {
    const { cctv, detected } = item;
    const oldStr = `${cctv.merk || '-'} / ${cctv.jenis || '-'} / ${cctv.type || '-'}`;

    if (detected && detected.detected) {
      const newStr = `${detected.merk} | ${detected.jenis} | ${detected.model}`;
      const isChanged =
        cctv.merk !== detected.merk ||
        cctv.jenis !== detected.jenis ||
        cctv.type !== detected.model;

      if (isChanged) {
        updatedCount++;
        console.log(
          cctv.id.padEnd(10) +
          cctv.name.slice(0, 28).padEnd(30) +
          cctv.ip.padEnd(16) +
          oldStr.slice(0, 24).padEnd(26) +
          `👉 ${newStr}`
        );

        if (isApply) {
          await pool.query(
            'UPDATE cctvs SET merk = ?, jenis = ?, type = ? WHERE id = ?',
            [detected.merk, detected.jenis, detected.model, cctv.id]
          );
        }
      } else {
        unchangedCount++;
        console.log(
          cctv.id.padEnd(10) +
          cctv.name.slice(0, 28).padEnd(30) +
          cctv.ip.padEnd(16) +
          oldStr.slice(0, 24).padEnd(26) +
          `✅ Cocok (${newStr})`
        );
      }
    } else {
      offlineCount++;
      console.log(
        cctv.id.padEnd(10) +
        cctv.name.slice(0, 28).padEnd(30) +
        cctv.ip.padEnd(16) +
        oldStr.slice(0, 24).padEnd(26) +
        '⚠️ Tidak ada respon / Offline'
      );
    }
  }

  console.log('='.repeat(105));
  console.log(`\n📊 Ringkasan Pemindaian:`);
  console.log(`- Perubahan terdeteksi : ${updatedCount} kamera`);
  console.log(`- Data sudah cocok     : ${unchangedCount} kamera`);
  console.log(`- Offline / No Response: ${offlineCount} kamera`);
  console.log(`- Total kamera         : ${cctvs.length}`);

  if (isApply) {
    console.log(`\n✅ BERHASIL: ${updatedCount} data kamera di database telah diperbarui!`);
  } else {
    console.log(`\n💡 Ini adalah hasil DRY-RUN. Jalankan dengan argumen --apply untuk menyimpan perubahan ke database.`);
  }

  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Fatal error saat memindai:', err);
    process.exit(1);
  });
}

module.exports = {
  scanCamera,
  scanAllCctvs,
  probeSony,
  probeHikvision,
};

