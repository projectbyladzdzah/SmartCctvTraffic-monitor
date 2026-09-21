/**
 * Mock Data untuk GitHub Pages / Demo Mode
 * Memungkinkan pengunjung portofolio menguji interaksi dashboard tanpa harus terhubung ke backend MySQL lokal.
 */

export const MOCK_CCTVS = [
  {
    id: 'CCTV-001',
    name: 'Simpang Empat Sudirman (Demo)',
    jenis: 'Fixed',
    merk: 'Hikvision',
    type: 'IP Camera 4K',
    ip: '192.168.1.101',
    gateway: '192.168.1.1',
    rtsp_url: 'rtsp://admin:pass@192.168.1.101:554/stream1',
    status: 'online',
    lastChecked: new Date().toISOString(),
    ping_time: '18',
  },
  {
    id: 'CCTV-002',
    name: 'Batas Kota Barat - Pos Polisi',
    jenis: 'Dome',
    merk: 'Dahua',
    type: 'IP Camera PTZ',
    ip: '192.168.1.102',
    gateway: '192.168.1.1',
    rtsp_url: 'rtsp://admin:pass@192.168.1.102:554/stream1',
    status: 'online',
    lastChecked: new Date().toISOString(),
    ping_time: '24',
  },
  {
    id: 'CCTV-003',
    name: 'Bundaran Monumen Selamat Datang',
    jenis: 'PTZ',
    merk: 'Hikvision',
    type: 'Speed Dome 32x',
    ip: '192.168.1.103',
    gateway: '192.168.1.1',
    rtsp_url: 'rtsp://admin:pass@192.168.1.103:554/stream1',
    status: 'online',
    lastChecked: new Date().toISOString(),
    ping_time: '12',
  },
  {
    id: 'CCTV-004',
    name: 'Simpang Gatsu - Nonongan',
    jenis: 'Fixed',
    merk: 'Hikvision',
    type: 'Bullet DarkFighter',
    ip: '192.168.1.104',
    gateway: '192.168.1.1',
    rtsp_url: 'rtsp://admin:pass@192.168.1.104:554/stream1',
    status: 'offline',
    lastChecked: new Date(Date.now() - 3600000).toISOString(),
    ping_time: null,
  },
  {
    id: 'CCTV-005',
    name: 'Gerbang Tol Kota Sektor 1',
    jenis: 'Fixed',
    merk: 'Sony',
    type: 'SNC-EB630',
    ip: '192.168.1.105',
    gateway: '192.168.1.1',
    rtsp_url: 'rtsp://admin:pass@192.168.1.105:554/media/video1',
    status: 'online',
    lastChecked: new Date().toISOString(),
    ping_time: '31',
  },
  {
    id: 'CCTV-006',
    name: 'Depan Pasar Induk Klewer',
    jenis: 'Dome',
    merk: 'Hikvision',
    type: 'ColorVu IP',
    ip: '192.168.1.106',
    gateway: '192.168.1.1',
    rtsp_url: 'rtsp://admin:pass@192.168.1.106:554/stream1',
    status: 'online',
    lastChecked: new Date().toISOString(),
    ping_time: '19',
  },
  {
    id: 'CCTV-007',
    name: 'Simpang Stasiun Balapan',
    jenis: 'Fixed',
    merk: 'Dahua',
    type: 'IP Camera 5MP',
    ip: '192.168.1.107',
    gateway: '192.168.1.1',
    rtsp_url: 'rtsp://admin:pass@192.168.1.107:554/stream1',
    status: 'online',
    lastChecked: new Date().toISOString(),
    ping_time: '15',
  },
  {
    id: 'CCTV-008',
    name: 'Batas Kota Timur - Jembatan Bengawan',
    jenis: 'PTZ',
    merk: 'Hikvision',
    type: 'AcuSense PTZ',
    ip: '192.168.1.108',
    gateway: '192.168.1.1',
    rtsp_url: 'rtsp://admin:pass@192.168.1.108:554/stream1',
    status: 'offline',
    lastChecked: new Date(Date.now() - 7200000).toISOString(),
    ping_time: null,
  }
];

export const MOCK_USER = {
  id: 999,
  username: 'portfolio_visitor',
  role: 'admin',
};

export const MOCK_DOWNTIME_RECORDS = [
  {
    id: 1,
    cctv_id: 'CCTV-004',
    cctv_name: 'Simpang Gatsu - Nonongan',
    cctv_ip: '192.168.1.104',
    downtime_start: new Date(Date.now() - 4200000).toISOString(),
    downtime_end: null,
    duration_minutes: 70,
    status: 'down',
    recorded_at: new Date().toISOString(),
  },
  {
    id: 2,
    cctv_id: 'CCTV-008',
    cctv_name: 'Batas Kota Timur - Jembatan Bengawan',
    cctv_ip: '192.168.1.108',
    downtime_start: new Date(Date.now() - 86400000).toISOString(),
    downtime_end: new Date(Date.now() - 82800000).toISOString(),
    duration_minutes: 60,
    status: 'resolved',
    recorded_at: new Date(Date.now() - 82800000).toISOString(),
  }
];

export const MOCK_SCHEDULES = [
  { id: 1, name: 'Pagi', time: '06:00', enabled: true, description: 'Capture snapshot berkala jam 06:00' },
  { id: 2, name: 'Siang', time: '12:00', enabled: true, description: 'Capture snapshot berkala jam 12:00' },
  { id: 3, name: 'Sore', time: '19:00', enabled: true, description: 'Capture snapshot berkala jam 19:00' },
];

export const MOCK_VEHICLE_STATS = {
  active_ai: true,
  today: {
    total_in: 4892,
    total_out: 4120,
    total_all: 9012,
    by_type: {
      car: 5120,
      motorcycle: 3100,
      bus: 412,
      truck: 380,
    },
  },
  cameras: [
    { id: 'CCTV-001', name: 'Simpang Empat Sudirman', total_in: 1450, total_out: 1200 },
    { id: 'CCTV-002', name: 'Batas Kota Barat - Pos Polisi', total_in: 1820, total_out: 1540 },
    { id: 'CCTV-003', name: 'Bundaran Monumen Selamat Datang', total_in: 1622, total_out: 1380 },
  ],
};
