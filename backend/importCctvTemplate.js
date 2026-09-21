require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  let filePath = path.resolve(__dirname, '../templates/cctv_import_real.csv');
  if (!fs.existsSync(filePath)) {
    filePath = path.resolve(__dirname, '../templates/cctv_import_template.csv');
  }
  const csvText = fs.readFileSync(filePath, 'utf8');
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== '');

  if (lines.length < 2) {
    console.log('NO_DATA');
    return;
  }

  const headers = lines[0].split(',').map((h) => h.trim());
  const pool = await mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
    database: process.env.DB_NAME || 'cctv_db',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  let count = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const values = lines[i].split(',');
    const row = {};

    headers.forEach((header, idx) => {
      row[header] = (values[idx] ?? '').trim();
    });

    if (!row.id && !row.name && !row.ip) continue;

    const id = row.id || `CCTV-${String(i).padStart(3, '0')}`;
    const name = row.name || `CCTV ${i}`;
    const jenis = row.jenis || '';
    const merk = row.merk || '';
    const type = row.type || '';
    const ip = row.ip || '';
    const gateway = row.gateway || '';
    const rtsp_url = row.rtsp_url || '';

    await pool.query(
      `INSERT INTO cctvs (id, name, jenis, merk, type, ip, gateway, rtsp_url, status, lastChecked)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'offline', ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         jenis = VALUES(jenis),
         merk = VALUES(merk),
         type = VALUES(type),
         ip = VALUES(ip),
         gateway = VALUES(gateway),
         rtsp_url = IF(VALUES(rtsp_url) IS NOT NULL AND VALUES(rtsp_url) != '', VALUES(rtsp_url), cctvs.rtsp_url),
         status = VALUES(status),
         lastChecked = VALUES(lastChecked)`,
      [id, name, jenis, merk, type, ip, gateway, rtsp_url, new Date().toISOString()],
    );

    count += 1;
  }

  const [rows] = await pool.query('SELECT COUNT(*) AS total FROM cctvs');
  console.log('IMPORT_OK');
  console.log(`IMPORTED_ROWS=${count}`);
  console.log(`TOTAL_ROWS=${rows[0].total}`);

  await pool.end();
}

main().catch((error) => {
  console.error('IMPORT_ERROR:', error.message);
  process.exit(1);
});
