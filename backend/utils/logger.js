/**
 * Modern Terminal Logger for CCTV Monitor Server
 * Memberikan tampilan CMD yang bersih, rapi, menarik, dan mudah dipahami.
 */

// ANSI Color Codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  
  // Foreground Colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  
  // Bright Foreground Colors
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',
  
  // Background Colors
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
};

function getTimeStr() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${colors.gray}[${h}:${m}:${s}]${colors.reset}`;
}

/**
 * Format tag badge dengan background atau teks berwarna kontras
 */
function makeBadge(text, colorFn) {
  return `${colorFn}${text}${colors.reset}`;
}

const logger = {
  /**
   * Tampilan banner awal saat server booting
   */
  printBanner({ port = 5000, cctvCount = 0, dbName = 'cctv_db', aiStatus = 'Standby' } = {}) {
    const c = colors;
    const border = `${c.brightCyan}┌─────────────────────────────────────────────────────────────┐${c.reset}`;
    const divider = `${c.brightCyan}├─────────────────────────────────────────────────────────────┤${c.reset}`;
    const bottom = `${c.brightCyan}└─────────────────────────────────────────────────────────────┘${c.reset}`;

    console.log('');
    console.log(border);
    console.log(`${c.brightCyan}│${c.reset}            ${c.bold}${c.brightWhite}SISTEM PEMANTAUAN CCTV KOTA SURAKARTA${c.reset}            ${c.brightCyan}│${c.reset}`);
    console.log(`${c.brightCyan}│${c.reset}                 ${c.gray}Control Center & API Server${c.reset}                 ${c.brightCyan}│${c.reset}`);
    console.log(divider);
    console.log(`${c.brightCyan}│${c.reset}  ${c.green}●${c.reset} ${c.bold}Server Port${c.reset}    : ${c.brightWhite}http://localhost:${port}${c.reset}                   ${c.brightCyan}│${c.reset}`);
    console.log(`${c.brightCyan}│${c.reset}  ${c.green}●${c.reset} ${c.bold}Database MySQL${c.reset} : ${c.brightGreen}Terhubung${c.reset} (${dbName} - ${cctvCount} CCTV Aktif)     ${c.brightCyan}│${c.reset}`);
    console.log(`${c.brightCyan}│${c.reset}  ${c.yellow}●${c.reset} ${c.bold}AI Counting${c.reset}    : ${c.yellow}${aiStatus}${c.reset} ${c.gray}(Siap dari Dashboard)${c.reset}        ${c.brightCyan}│${c.reset}`);
    console.log(`${c.brightCyan}│${c.reset}  ${c.brightBlue}●${c.reset} ${c.bold}Jadwal Foto${c.reset}    : ${c.brightBlue}Aktif${c.reset} ${c.gray}(06:00, 11:00, 15:00, 18:00)${c.reset}          ${c.brightCyan}│${c.reset}`);
    console.log(bottom);
    console.log(`  ${c.brightGreen}✔${c.reset} ${c.bold}Sistem siap menerima perintah dari Web Dashboard...${c.reset}`);
    console.log('');
  },

  /**
   * Log interaksi aksi dari Web Dashboard
   */
  webAction(action, detail) {
    const time = getTimeStr();
    const badge = `${colors.bold}${colors.brightCyan}[WEB]${colors.reset}`;
    const actBadge = `${colors.cyan}${String(action).padEnd(8)}${colors.reset}`;
    console.log(`${time} ${badge} ${actBadge} │ ${colors.brightWhite}${detail}${colors.reset}`);
  },

  /**
   * Log aktivitas AI Vehicle Counting
   */
  ai(action, detail, level = 'info') {
    const time = getTimeStr();
    const badge = `${colors.bold}${colors.brightMagenta}[AI-SERVICE]${colors.reset}`;
    const actBadge = `${colors.magenta}${String(action).padEnd(8)}${colors.reset}`;
    let detailColor = colors.brightWhite;
    if (level === 'success') detailColor = colors.brightGreen;
    if (level === 'warn') detailColor = colors.brightYellow;
    if (level === 'error') detailColor = colors.brightRed;

    console.log(`${time} ${badge} ${actBadge} │ ${detailColor}${detail}${colors.reset}`);
  },

  /**
   * Log deteksi kendaraan lewat (Traffic Event)
   */
  traffic(cctvName, vehicleType, direction) {
    const time = getTimeStr();
    const badge = `${colors.bold}${colors.brightBlue}[KENDARAAN]${colors.reset}`;
    const dirStr = direction.toUpperCase() === 'IN' ? `${colors.brightGreen}MASUK (IN)${colors.reset}` : `${colors.brightYellow}KELUAR (OUT)${colors.reset}`;
    console.log(`${time} ${badge} 🚗 ${colors.bold}${cctvName}${colors.reset} │ ${vehicleType} -> ${dirStr}`);
  },

  /**
   * Log autentikasi (Login / Logout)
   */
  auth(action, detail, success = true) {
    const time = getTimeStr();
    const badge = `${colors.bold}${colors.brightYellow}[KEAMANAN]${colors.reset}`;
    const actBadge = `${colors.yellow}${String(action).padEnd(8)}${colors.reset}`;
    const detailColor = success ? colors.brightGreen : colors.brightRed;
    console.log(`${time} ${badge} ${actBadge} │ ${detailColor}${detail}${colors.reset}`);
  },

  /**
   * Log manajemen CCTV (Tambah, Ubah, Hapus)
   */
  cctv(action, detail) {
    const time = getTimeStr();
    const badge = `${colors.bold}${colors.brightBlue}[DATA CCTV]${colors.reset}`;
    const actBadge = `${colors.blue}${String(action).padEnd(8)}${colors.reset}`;
    console.log(`${time} ${badge} ${actBadge} │ ${colors.brightWhite}${detail}${colors.reset}`);
  },

  /**
   * Log kontrol perangkat (PTZ, Reboot kamera)
   */
  device(action, detail) {
    const time = getTimeStr();
    const badge = `${colors.bold}${colors.brightCyan}[KONTROL]${colors.reset}`;
    const actBadge = `${colors.cyan}${String(action).padEnd(8)}${colors.reset}`;
    console.log(`${time} ${badge} ${actBadge} │ ${colors.brightWhite}${detail}${colors.reset}`);
  },

  /**
   * Log diagnostik ping dari terminal modal web
   */
  ping(detail, isAlive = true) {
    const time = getTimeStr();
    const badge = `${colors.bold}${colors.brightGreen}[PING/NET]${colors.reset}`;
    const statusColor = isAlive ? colors.brightGreen : colors.brightRed;
    console.log(`${time} ${badge} 📡 ${statusColor}${detail}${colors.reset}`);
  },

  /**
   * Log perubahan status CCTV (Online / Offline)
   */
  statusChange(cctvName, ip, status) {
    const time = getTimeStr();
    if (status === 'online') {
      const badge = `${colors.bold}${colors.brightGreen}[ONLINE]${colors.reset}`;
      console.log(`${time} ${badge} 🟢 ${colors.bold}${cctvName}${colors.reset} (${ip}) kembali terhubung`);
    } else {
      const badge = `${colors.bold}${colors.brightRed}[OFFLINE]${colors.reset}`;
      console.log(`${time} ${badge} 🔴 ${colors.bold}${cctvName}${colors.reset} (${ip}) terputus / tidak merespon`);
    }
  },

  /**
   * Log snapshot capture
   */
  capture(action, detail) {
    const time = getTimeStr();
    const badge = `${colors.bold}${colors.brightYellow}[FOTO CCTV]${colors.reset}`;
    const actBadge = `${colors.yellow}${String(action).padEnd(8)}${colors.reset}`;
    console.log(`${time} ${badge} ${actBadge} │ ${colors.brightWhite}${detail}${colors.reset}`);
  },

  /**
   * Log umum sukses
   */
  success(detail) {
    const time = getTimeStr();
    console.log(`${time} ${colors.brightGreen}✔ [BERHASIL]${colors.reset} ${detail}`);
  },

  /**
   * Log umum info
   */
  info(detail) {
    const time = getTimeStr();
    console.log(`${time} ${colors.brightCyan}ℹ [INFO]${colors.reset} ${detail}`);
  },

  /**
   * Log umum peringatan
   */
  warn(detail) {
    const time = getTimeStr();
    console.log(`${time} ${colors.brightYellow}⚠ [PERINGATAN]${colors.reset} ${detail}`);
  },

  /**
   * Log umum error
   */
  error(detail) {
    const time = getTimeStr();
    console.log(`${time} ${colors.brightRed}✖ [ERROR]${colors.reset} ${detail}`);
  },
};

module.exports = logger;
