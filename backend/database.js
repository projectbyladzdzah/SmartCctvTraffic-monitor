require('dotenv').config();
const mysql = require('mysql2/promise');

// Konfigurasi Database MySQL (dari .env atau fallback default dev)
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : '',
  database: process.env.DB_NAME || 'cctv_db'
};

let pool;

// Fungsi untuk menginisialisasi Database dan Tabel dengan auto-retry saat Windows startup
async function initDB(maxRetries = 20, delayMs = 2000) {
  let attempt = 0;
  while (attempt < maxRetries) {
    attempt++;
    try {
      // 1. Koneksi awal untuk membuat database otomatis jika belum ada
      const connection = await mysql.createConnection({ host: dbConfig.host, user: dbConfig.user, password: dbConfig.password });
      await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
      await connection.end();

      // 2. Hubungkan ke database cctv_db
      pool = mysql.createPool(dbConfig);
      break; // Berhasil connect
    } catch (err) {
      if (attempt >= maxRetries) {
        throw new Error(`Gagal terhubung ke MySQL setelah ${maxRetries} kali percobaan: ${err.message}`);
      }
      console.log(`⏳ [Startup] Menunggu MySQL siap (percobaan ${attempt}/${maxRetries})...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  try {

    // 3. Buat tabel otomatis jika belum ada
    const createCctvsTableQuery = `
      CREATE TABLE IF NOT EXISTS cctvs (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(255),
        jenis VARCHAR(100),
        merk VARCHAR(100),
        type VARCHAR(100),
        ip VARCHAR(50),
        gateway VARCHAR(50),
        rtsp_url VARCHAR(500),
        status VARCHAR(20),
        lastChecked VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await pool.query(createCctvsTableQuery);

    const createHistoryTableQuery = `
      CREATE TABLE IF NOT EXISTS cctv_status_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cctv_id VARCHAR(50),
        status VARCHAR(20),
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cctv_id) REFERENCES cctvs(id) ON DELETE CASCADE
      );
    `;
    await pool.query(createHistoryTableQuery);

    // Tabel baru untuk downtime recordings (CCTV mati >= 10 menit)
    const createDowntimeTableQuery = `
      CREATE TABLE IF NOT EXISTS cctv_downtime_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cctv_id VARCHAR(50),
        cctv_name VARCHAR(255),
        cctv_ip VARCHAR(50),
        downtime_start DATETIME,
        downtime_end DATETIME,
        duration_minutes INT,
        status VARCHAR(20),
        recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cctv_id) REFERENCES cctvs(id) ON DELETE CASCADE,
        INDEX idx_cctv_id (cctv_id),
        INDEX idx_downtime_start (downtime_start)
      );
    `;
    await pool.query(createDowntimeTableQuery);

    const createSnapshotsTableQuery = `
      CREATE TABLE IF NOT EXISTS cctv_snapshots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cctv_id VARCHAR(50) NOT NULL,
        image_path VARCHAR(500) NOT NULL,
        status ENUM('bagus', 'error') NOT NULL DEFAULT 'bagus',
        error_type VARCHAR(50) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (cctv_id) REFERENCES cctvs(id) ON DELETE CASCADE,
        INDEX idx_cctv_created_at (cctv_id, created_at),
        INDEX idx_snapshot_status (status)
      );
    `;
    await pool.query(createSnapshotsTableQuery);

    const createCaptureScheduleTableQuery = `
      CREATE TABLE IF NOT EXISTS cctv_capture_schedules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL DEFAULT 'Schedule',
        time VARCHAR(5) NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        description VARCHAR(255) DEFAULT '',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_schedule_time (time)
      );
    `;
    await pool.query(createCaptureScheduleTableQuery);

    const [[{ count: scheduleCount }]] = await pool.query('SELECT COUNT(*) AS count FROM cctv_capture_schedules');
    if (Number(scheduleCount) === 0) {
      await pool.query(
        'INSERT INTO cctv_capture_schedules (name, time, enabled, description) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)',
        ['Pagi', '06:00', true, 'Capture otomatis pagi', 'Siang', '12:00', true, 'Capture otomatis siang', 'Sore', '19:00', true, 'Capture otomatis sore'],
      );
    }

    const createUsersTableQuery = `
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(64) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin','user') NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    await pool.query(createUsersTableQuery);

    const bcrypt = require('bcryptjs');
    const [[{ cnt }]] = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    if (Number(cnt) === 0) {
      const defaultUser = process.env.DEFAULT_ADMIN_USERNAME || 'admin';
      const defaultPass = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
      const hash = await bcrypt.hash(defaultPass, 10);
      await pool.query(
        'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
        [defaultUser, hash, 'admin'],
      );
      console.log(
        `🔐 Akun admin awal dibuat: username="${defaultUser}" password="${defaultPass}" (ubah via env DEFAULT_ADMIN_USERNAME / DEFAULT_ADMIN_PASSWORD)`,
      );
    }
    
    // Tambahkan kolom rtsp_url jika belum ada (untuk kompatibilitas)
    await pool.query(`
      ALTER TABLE cctvs 
      ADD COLUMN rtsp_url VARCHAR(500) DEFAULT '' 
      AFTER gateway
    `).catch(() => {
      // Kolom sudah ada, abaikan error
    });

    // Tabel untuk pencatatan traffic vehicle counting batas kota
    const createVehicleCountsTableQuery = `
      CREATE TABLE IF NOT EXISTS vehicle_counts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cctv_id VARCHAR(50) NOT NULL,
        cctv_name VARCHAR(255) NOT NULL,
        direction ENUM('IN', 'OUT') NOT NULL,
        vehicle_type VARCHAR(50) NOT NULL,
        count INT NOT NULL DEFAULT 1,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_vehicle_cctv (cctv_id),
        INDEX idx_vehicle_timestamp (timestamp),
        INDEX idx_vehicle_dir (direction)
      );
    `;
    await pool.query(createVehicleCountsTableQuery);
    
    console.log('✅ Database MySQL Terhubung & Tabel Siap!');
    
    return pool; // Kembalikan objek pool agar bisa dipakai di server.js
  } catch (error) {
    console.error('❌ Gagal terhubung ke MySQL. Pastikan MySQL/XAMPP menyala!', error.message);
    throw error;
  }
}

// Fungsi untuk mengambil koneksi database yang sudah berjalan
function getPool() {
  if (!pool) {
    throw new Error('Database pool belum diinisialisasi!');
  }
  return pool;
}

module.exports = { initDB, getPool };