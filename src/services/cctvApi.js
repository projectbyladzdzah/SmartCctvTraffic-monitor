import {
  MOCK_CCTVS,
  MOCK_USER,
  MOCK_DOWNTIME_RECORDS,
  MOCK_SCHEDULES,
  MOCK_VEHICLE_STATS,
} from './mockData';

export function isDemoActive() {
  if (typeof window === 'undefined') return false;
  if (window.location.hostname.endsWith('github.io') || window.location.hostname.includes('github.io')) {
    return true;
  }
  return sessionStorage.getItem('cctv_demo_active') === 'true' || localStorage.getItem('cctv_demo_active') === 'true';
}

export function setDemoActive(val) {
  if (typeof window !== 'undefined') {
    if (val) {
      sessionStorage.setItem('cctv_demo_active', 'true');
    } else {
      sessionStorage.removeItem('cctv_demo_active');
    }
  }
}

let mockCctvsList = null;
function getMockCctvs() {
  if (!mockCctvsList) {
    try {
      const saved = sessionStorage.getItem('mock_cctv_list');
      mockCctvsList = saved ? JSON.parse(saved) : [...MOCK_CCTVS];
    } catch {
      mockCctvsList = [...MOCK_CCTVS];
    }
  }
  return mockCctvsList;
}

function saveMockCctvs(list) {
  mockCctvsList = list;
  try {
    sessionStorage.setItem('mock_cctv_list', JSON.stringify(list));
  } catch {}
}

const getApiBase = () => {
  if (import.meta.env.PROD) return '';
  if (typeof window !== 'undefined') {
    // Jika diakses via HTTPS (misal domain Cloudflare), gunakan relative path agar tidak terblokir Mixed Content oleh browser
    if (window.location.protocol === 'https:') {
      return '';
    }
    return `http://${window.location.hostname}:5000`;
  }
  return 'http://localhost:5000';
};
const API_BASE = getApiBase();
const TOKEN_KEY = 'cctv_auth_token';

// Helper function untuk fetch dengan timeout
async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  if (timeoutMs <= 0) {
    console.log(`⏱️  [fetchWithTimeout] No timeout for request to ${url} (capture mode)`);
    return fetch(url, options);
  }

  const isPing = url.includes('/api/ping/');
  if (!isPing) {
    console.log(`⏱️  [fetchWithTimeout] Starting request to ${url} (timeout: ${timeoutMs}ms)`);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    if (!isPing) {
      console.warn(`⚠️  [fetchWithTimeout] Timeout! Aborting request to ${url}`);
    }
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!isPing) {
      console.log(`✅ [fetchWithTimeout] Got response from ${url} (${response.status})`);
    }
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      console.error(`❌ [fetchWithTimeout] Request timeout to ${url} after ${timeoutMs}ms`);
      throw new Error(`Server tidak merespons (${timeoutMs}ms timeout) - pastikan backend sudah running`);
    }
    console.error(`❌ [fetchWithTimeout] Error to ${url}:`, err.message);
    throw err;
  }
}

export function getStoredToken() {
  // Cek sessionStorage dulu (saat tab aktif), kalau tidak ada cek localStorage (untuk backward compat)
  return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY);
}

export const getAuthToken = getStoredToken;

export function setStoredToken(token) {
  if (token) {
    // Simpan di sessionStorage (otomatis hilang saat browser ditutup)
    sessionStorage.setItem(TOKEN_KEY, token);
    // Hapus dari localStorage untuk tidak lanjut tersimpan
    localStorage.removeItem(TOKEN_KEY);
  } else {
    // Hapus dari kedua tempat
    sessionStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_KEY);
  }
}

function authHeaders(extra = {}) {
  const token = getStoredToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}
const getAuthHeaders = authHeaders;

async function handleAuthResponse(response) {
  if (response.status === 401) {
    setStoredToken(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cctv-unauthorized'));
    }
  }
  return response;
}

async function loginApi(username, password) {
  if (isDemoActive() || (username && username.toLowerCase() === 'demo')) {
    setDemoActive(true);
    setStoredToken('demo-token-portfolio');
    return { token: 'demo-token-portfolio', user: MOCK_USER };
  }
  try {
    const response = await fetchWithTimeout(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Login gagal');
    }
    return data;
  } catch (err) {
    if (isDemoActive() || (typeof window !== 'undefined' && window.location.hostname.endsWith('github.io'))) {
      setDemoActive(true);
      setStoredToken('demo-token-portfolio');
      return { token: 'demo-token-portfolio', user: MOCK_USER };
    }
    console.error('❌ Login error:', err.message);
    throw err;
  }
}

async function meApi() {
  if (isDemoActive() || getStoredToken() === 'demo-token-portfolio') {
    return { user: MOCK_USER };
  }
  try {
    console.log('📡 [meApi] Verifying token...');
    
    const response = await handleAuthResponse(
      await fetchWithTimeout(`${API_BASE}/api/auth/me`, {
        headers: authHeaders(),
      }, 3000), // Reduce timeout to 3s since non-blocking
    );
    
    console.log('[meApi] Response status:', response.status);
    
    if (!response.ok) {
      console.log('❌ [meApi] Response not OK:', response.status);
      return null;
    }
    
    try {
      const data = await response.json();
      console.log('✅ [meApi] Token valid for user:', data.user?.username);
      return data;
    } catch (err) {
      console.error('❌ [meApi] Failed to parse JSON:', err.message);
      return null;
    }
  } catch (err) {
    console.error('❌ [meApi] Error:', err.message);
    return null;
  }
}

async function createUserApi({ username, password, role }) {
  if (isDemoActive()) {
    return { message: 'Pengguna berhasil ditambahkan (Demo Mode)' };
  }
  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/auth/users`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ username, password, role }),
    }),
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal membuat pengguna');
  }
  return data;
}

async function fetchUsersApi() {
  if (isDemoActive()) {
    return [MOCK_USER];
  }
  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/auth/users`, {
      headers: authHeaders(),
    }),
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal mengambil data pengguna');
  }
  return data;
}

async function resetPasswordApi({ userId, newPassword }) {
  if (isDemoActive()) {
    return { message: 'Password berhasil direset (Demo Mode)' };
  }
  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/auth/reset-password`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ userId, newPassword }),
    }),
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal mereset password');
  }
  return data;
}

async function deleteUserApi(userId) {
  if (isDemoActive()) {
    return { message: 'Pengguna berhasil dihapus (Demo Mode)' };
  }
  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/auth/users/${userId}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }),
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal menghapus pengguna');
  }
  return data;
}

async function fetchCctvsApi() {
  if (isDemoActive()) {
    return getMockCctvs();
  }
  const response = await handleAuthResponse(
    await fetchWithTimeout(
      `${API_BASE}/api/cctvs`,
      { 
        headers: authHeaders(),
      },
      12000,
    ),
  );
  if (!response.ok) {
    throw new Error('Gagal mengambil data');
  }
  return response.json();
}

async function pingIpApi(ip) {
  if (isDemoActive()) {
    return { alive: true, time: String(Math.floor(Math.random() * 20) + 12) };
  }
  const response = await handleAuthResponse(
    await fetchWithTimeout(
      `${API_BASE}/api/ping/${ip}`,
      {
        headers: authHeaders(),
      },
      4000,
    ),
  );
  if (!response.ok) {
    throw new Error('Gagal melakukan ping');
  }
  return response.json();
}

async function stopStreamApi(cctvId) {
  if (isDemoActive()) {
    return { ok: true, status: 200 };
  }
  return handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/stream-stop/${cctvId}`, {
      method: 'POST',
      headers: authHeaders(),
    }),
  );
}

async function saveCctvApi(payload, editingCctvId) {
  if (isDemoActive()) {
    const current = getMockCctvs();
    if (editingCctvId) {
      const updated = current.map((c) => (c.id === editingCctvId ? { ...c, ...payload } : c));
      saveMockCctvs(updated);
    } else {
      const newEntry = {
        ...payload,
        id: payload.id || `CCTV-${String(current.length + 1).padStart(3, '0')}`,
        status: 'online',
        lastChecked: new Date().toISOString(),
        ping_time: '18',
      };
      saveMockCctvs([newEntry, ...current]);
    }
    return { ok: true, status: 200, json: async () => ({ message: 'Data CCTV berhasil disimpan' }) };
  }
  const isEditMode = Boolean(editingCctvId);
  const endpoint = isEditMode
    ? `${API_BASE}/api/cctvs/${editingCctvId}`
    : `${API_BASE}/api/cctvs`;

  const body = isEditMode ? payload : { ...payload, id: String(Date.now()) };
  return handleAuthResponse(
    await fetchWithTimeout(endpoint, {
      method: isEditMode ? 'PUT' : 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }),
  );
}

async function deleteCctvApi(id) {
  if (isDemoActive()) {
    const current = getMockCctvs();
    saveMockCctvs(current.filter((c) => c.id !== id));
    return { ok: true, status: 200, json: async () => ({ message: 'Data CCTV berhasil dihapus' }) };
  }
  return handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/cctvs/${id}`, { 
      method: 'DELETE',
      headers: authHeaders(),
    }),
  );
}

/**
 * Helper Domain Sharding:
 * Membagi URL streaming antara localhost dan 127.0.0.1 saat di lingkungan lokal.
 * Browser menganggap localhost dan 127.0.0.1 sebagai host terpisah sehingga
 * kuota koneksi simultan berlipat dari 6 menjadi 12 koneksi!
 */
function getStreamOrigin(key = '') {
  if (typeof window === 'undefined') return API_BASE;
  if (window.location.protocol === 'https:') return '';

  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    const num = parseInt(String(key).replace(/\D/g, ''), 10) || 0;
    return num % 2 === 0 ? 'http://localhost:5000' : 'http://127.0.0.1:5000';
  }

  return API_BASE;
}

function buildStreamUrl(cctvId, rtspUrl, nonce, jwtToken) {
  const origin = getStreamOrigin(cctvId);
  const t = nonce || cctvId;
  let url = `${origin}/api/stream/${cctvId}?rtsp_url=${encodeURIComponent(rtspUrl)}&t=${t}`;
  const token = jwtToken || getStoredToken();
  if (token) {
    url += `&token=${encodeURIComponent(token)}`;
  }
  return url;
}

async function getHistory(cctvId) {
  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/history/${cctvId}`, { 
      headers: authHeaders(),
    }),
  );
  if (!response.ok) {
    throw new Error('Gagal mengambil riwayat');
  }
  return response.json();
}

async function getAllHistory(limit = 10000) {
  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/history?limit=${limit}`, { 
      headers: authHeaders(),
    }),
  );
  if (!response.ok) {
    throw new Error('Gagal mengambil riwayat');
  }
  return response.json();
}

async function importCctvsFromExcel(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/cctvs/import-excel`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData,
    }),
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal mengimport file Excel');
  }
  return data;
}

async function exportCctvsToExcel() {
  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/cctvs/export`, {
      headers: authHeaders(),
    }),
  );

  if (!response.ok) {
    throw new Error('Gagal export data CCTV');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cctv_data_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

async function exportSnapshotsRecapToExcel({ status = '', cctvId = '', date = '', scheduleId = '' } = {}) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (cctvId) params.set('cctv_id', cctvId);
  if (date) params.set('date', date);
  if (scheduleId) params.set('schedule_id', scheduleId);

  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/snapshots/recap/export?${params.toString()}`, {
      headers: authHeaders(),
    }),
  );

  if (!response.ok) {
    throw new Error('Gagal export rekap screenshot');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `snapshot_recap_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

async function captureAllSnapshotsApi() {
  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/snapshots/capture-all`, {
      method: 'POST',
      headers: authHeaders(),
    }, 0),
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal menjalankan capture semua CCTV');
  }

  return data;
}

async function deleteSnapshotsApi(ids = []) {
  if (!Array.isArray(ids) || !ids.length) {
    return { deletedCount: 0 };
  }

  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/snapshots`, {
      method: 'DELETE',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ids }),
    }),
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal menghapus snapshot yang dipilih');
  }

  return data;
}

async function fetchCaptureSchedules() {
  if (isDemoActive()) {
    return MOCK_SCHEDULES;
  }
  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/snapshots/schedules`, {
      headers: authHeaders(),
    }),
  );

  if (!response.ok) {
    throw new Error('Gagal mengambil jadwal capture');
  }

  return response.json();
}

async function createCaptureSchedule(payload) {
  if (isDemoActive()) {
    return { message: 'Jadwal berhasil ditambahkan (Demo Mode)' };
  }
  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/snapshots/schedules`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    }),
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal menambahkan jadwal capture');
  }
  return data;
}

async function updateCaptureSchedule(id, payload) {
  if (isDemoActive()) {
    return { message: 'Jadwal berhasil diupdate (Demo Mode)' };
  }
  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/snapshots/schedules/${id}`, {
      method: 'PUT',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    }),
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal memperbarui jadwal capture');
  }
  return data;
}

async function deleteCaptureSchedule(id) {
  if (isDemoActive()) {
    return { message: 'Jadwal berhasil dihapus (Demo Mode)' };
  }
  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/snapshots/schedules/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    }),
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Gagal menghapus jadwal capture');
  }
  return data;
}

async function getSnapshotsLatest() {
  if (isDemoActive()) {
    return [];
  }
  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/snapshots/latest`, {
      headers: authHeaders(),
    }),
  );
  if (!response.ok) {
    throw new Error('Gagal mengambil snapshot terbaru');
  }
  return response.json();
}

async function getSnapshotsRecap({ status = '', cctvId = '', date = '', scheduleId = '' } = {}) {
  if (isDemoActive()) {
    return [];
  }
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (cctvId) params.set('cctv_id', cctvId);
  if (date) params.set('date', date);
  if (scheduleId) params.set('schedule_id', scheduleId);

  const response = await handleAuthResponse(
    await fetchWithTimeout(`${API_BASE}/api/snapshots/recap?${params.toString()}`, {
      headers: authHeaders(),
    }),
  );
  if (!response.ok) {
    throw new Error('Gagal mengambil rekap snapshot');
  }
  return response.json();
}

// FUNGSI UNTUK KONEKSI STREAM SSE
function createSnapshotStream() {
  if (isDemoActive()) {
    return {
      onmessage: null,
      onerror: null,
      close: () => {},
    };
  }
  const token = getStoredToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  return new EventSource(`${API_BASE}/api/snapshots/stream${query}`);
}

async function getDeviceInfoApi(cctvId) {
  const response = await fetchWithTimeout(`${API_BASE}/api/cctv-control/${cctvId}/info`, {
    headers: getAuthHeaders(),
  });
  return response.json();
}

async function controlPtzApi(cctvId, { action = 'move', pan = 0, tilt = 0, zoom = 0, channel = 1 }) {
  const response = await fetchWithTimeout(`${API_BASE}/api/cctv-control/${cctvId}/ptz`, {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, pan, tilt, zoom, channel }),
  }, 3000);
  return response.json();
}

async function gotoPresetApi(cctvId, presetId = 1, channel = 1) {
  const response = await fetchWithTimeout(`${API_BASE}/api/cctv-control/${cctvId}/preset`, {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ presetId, channel }),
  });
  return response.json();
}

async function rebootCctvApi(cctvId) {
  const response = await fetchWithTimeout(`${API_BASE}/api/cctv-control/${cctvId}/reboot`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return response.json();
}

async function syncCameraTimeApi(cctvId) {
  const response = await fetchWithTimeout(`${API_BASE}/api/cctv-control/${cctvId}/sync-time`, {
    method: 'POST',
    headers: getAuthHeaders(),
  });
  return response.json();
}

async function setCameraOsdNameApi(cctvId, title) {
  const response = await fetchWithTimeout(`${API_BASE}/api/cctv-control/${cctvId}/osd-name`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ title }),
  });
  return response.json();
}

async function getCameraOsdNameApi(cctvId) {
  const response = await fetchWithTimeout(`${API_BASE}/api/cctv-control/${cctvId}/osd-name`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return response.json();
}

async function fetchVehicleCountingSummaryApi(date) {
  if (isDemoActive()) {
    return MOCK_VEHICLE_STATS;
  }
  const query = date ? `?date=${encodeURIComponent(date)}` : '';
  const response = await fetchWithTimeout(`${API_BASE}/api/vehicle-counts/summary${query}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return response.json();
}

async function fetchVehicleCountingHourlyApi(date, cctvId) {
  if (isDemoActive()) {
    return [];
  }
  const params = new URLSearchParams();
  if (date) params.append('date', date);
  if (cctvId) params.append('cctv_id', cctvId);
  const response = await fetchWithTimeout(`${API_BASE}/api/vehicle-counts/hourly?${params.toString()}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return response.json();
}

async function resetVehicleCountingTestApi() {
  if (isDemoActive()) {
    return { success: true, message: 'Data demo telah direset' };
  }
  const response = await fetchWithTimeout(`${API_BASE}/api/vehicle-counts/reset-test`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
  });
  return response.json();
}

function buildAiStreamUrl(cctvId) {
  const origin = getStreamOrigin(cctvId);
  return `${origin}/api/vehicle-counts/ai-stream/${encodeURIComponent(cctvId)}`;
}

async function getVehicleCountingServiceStatusApi() {
  if (isDemoActive()) {
    return { running: true, active_cameras: 4, mode: 'demo' };
  }
  const response = await fetchWithTimeout(`${API_BASE}/api/vehicle-counts/service-status`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });
  return response.json();
}

async function startVehicleCountingServiceApi() {
  if (isDemoActive()) {
    return { success: true, message: 'AI Service aktif (Demo Simulasi)' };
  }
  const response = await fetchWithTimeout(`${API_BASE}/api/vehicle-counts/service-start`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
  });
  return response.json();
}

async function stopVehicleCountingServiceApi() {
  if (isDemoActive()) {
    return { success: true, message: 'AI Service dihentikan (Demo Simulasi)' };
  }
  const response = await fetchWithTimeout(`${API_BASE}/api/vehicle-counts/service-stop`, {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
  });
  return response.json();
}

const cctvApi = {
  loginApi,
  meApi,
  createUserApi,
  fetchUsersApi,
  resetPasswordApi,
  deleteUserApi,
  fetchCctvsApi,
  pingIpApi,
  stopStreamApi,
  saveCctvApi,
  deleteCctvApi,
  buildStreamUrl,
  buildAiStreamUrl,
  getHistory,
  getAllHistory,
  importCctvsFromExcel,
  exportCctvsToExcel,
  exportSnapshotsRecapToExcel,
  captureAllSnapshotsApi,
  deleteSnapshotsApi,
  fetchCaptureSchedules,
  createCaptureSchedule,
  updateCaptureSchedule,
  deleteCaptureSchedule,
  getSnapshotsLatest,
  getSnapshotsRecap,
  createSnapshotStream, // Daftarkan fungsi ke export
  getBaseUrl: () => API_BASE,
  getDeviceInfoApi,
  controlPtzApi,
  gotoPresetApi,
  syncCameraTimeApi,
  setCameraOsdNameApi,
  getCameraOsdNameApi,
  rebootCctvApi,
  fetchVehicleCountingSummaryApi,
  fetchVehicleCountingHourlyApi,
  resetVehicleCountingTestApi,
  getVehicleCountingServiceStatusApi,
  startVehicleCountingServiceApi,
  stopVehicleCountingServiceApi,
  isDemoActive,
  setDemoActive,
};

export default cctvApi;