import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Download, ListChecks, Search } from 'lucide-react';
import cctvApi from '../services/cctvApi';

const statusColor = {
  jelas: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40',
  buram: 'bg-amber-500/15 text-amber-300 border border-amber-500/40',
  error: 'bg-red-500/15 text-red-300 border border-red-500/40',
};

const statusLabelMap = {
  jelas: 'Jelas',
  buram: 'Buram',
  error: 'Error',
};

const getDisplayStatus = (item) => {
  const status = String(item?.status || '').toLowerCase();
  const errorType = String(item?.error_type || '').toLowerCase();

  if (status === 'bagus') return 'jelas';
  if (status === 'error' && errorType === 'blur') return 'buram';
  if (status === 'error') return 'error';

  return 'error';
};

const errorTextMap = {
  hitam: 'Error: Layar Hitam',
  blur: 'Error: Kamera Blur',
  offline: 'Error: Kamera Offline',
};

function getTodayInputValue() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

export default function SnapshotRecapPage({ onBack }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [scheduleFilter, setScheduleFilter] = useState('all');
  const [selectedDate, setSelectedDate] = useState(getTodayInputValue);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedView, setSelectedView] = useState(null);
  const [isCaptureRunning, setIsCaptureRunning] = useState(false);
  const [captureMessage, setCaptureMessage] = useState('');
  const [toastQueue, setToastQueue] = useState([]);
  const [selectedSnapshotIds, setSelectedSnapshotIds] = useState([]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleForm, setScheduleForm] = useState({
    id: '',
    name: '',
    time: '06:00',
    enabled: true,
    description: '',
  });
  const [captureSchedules, setCaptureSchedules] = useState([]);

  const pushToast = useCallback((message, kind = 'info', ttl = 3000) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToastQueue((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToastQueue((prev) => prev.filter((item) => item.id !== id));
    }, ttl);
  }, []);

  const loadData = useCallback(async (isAutoRefresh = false) => {
    try {
      if (!isAutoRefresh) setLoading(true);
      const requestStatus = filter === 'jelas' ? 'bagus' : filter === 'buram' || filter === 'error' ? 'error' : '';
      const data = await cctvApi.getSnapshotsRecap({
        status: requestStatus,
        date: selectedDate,
        scheduleId: scheduleFilter === 'all' ? '' : scheduleFilter,
      });
      setItems(data || []);
    } catch (err) {
      if (!isAutoRefresh) setError(err.message || 'Gagal memuat rekap');
    } finally {
      if (!isAutoRefresh) setLoading(false);
    }
  }, [filter, selectedDate, scheduleFilter]);

  // Load awal
  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // ========================================================
  // FITUR SSE (SERVER-SENT EVENTS) - PENGGANTI AUTO REFRESH
  // ========================================================
  useEffect(() => {
    // Buka koneksi langsung ke backend menggunakan helper cctvApi (dengan token auth)
    const sse = cctvApi.createSnapshotStream();

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Jika menerima data yang memiliki cctvId, artinya ada 1 CCTV selesai di-capture
        if (data.cctvId) {
          console.log("Menerima pembaruan live untuk CCTV ID:", data.cctvId);
          loadData(true); // Silently refresh data
        }
      } catch (err) {
        // Abaikan error parse (misal untuk pesan koneksi pertama)
      }
    };

    sse.onerror = () => {
      console.log("Koneksi SSE terputus, browser akan otomatis menyambung kembali...");
    };

    // Tutup koneksi secara bersih saat pindah halaman
    return () => {
      sse.close();
    };
  }, [loadData]);
  // ========================================================

  useEffect(() => {
    const loadCaptureSchedules = async () => {
      try {
        const data = await cctvApi.fetchCaptureSchedules();
        setCaptureSchedules(data || []);
      } catch (err) {
        console.error('Schedule load error:', err.message);
      }
    };

    loadCaptureSchedules();
  }, []);

  const filteredItems = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();

    return items.filter((item) => {
      const displayStatus = getDisplayStatus(item);
      const matchesFilter =
        filter === 'jelas' ? displayStatus === 'jelas'
          : filter === 'buram' ? displayStatus === 'buram'
            : filter === 'error' ? displayStatus === 'error'
            : true;

      if (!matchesFilter) return false;

      if (!keyword) return true;

      const searchable = [
        item.cctv_name,
        item.cctv_id,
        item.status,
        item.error_type,
        item.created_at,
      ].filter(Boolean).join(' ').toLowerCase();

      return searchable.includes(keyword);
    });
  }, [items, filter, searchTerm]);

  const summary = useMemo(() => {
    const jelas = items.filter((item) => getDisplayStatus(item) === 'jelas').length;
    const buram = items.filter((item) => getDisplayStatus(item) === 'buram').length;
    const error = items.filter((item) => getDisplayStatus(item) === 'error').length;
    return { jelas, buram, error, total: items.length };
  }, [items]);

  const formatDate = (value) => {
    if (!value) return '-';
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString('id-ID', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const handleDownloadSnapshot = async (item) => {
    if (!item?.image_path) {
      alert('Gambar screenshot tidak tersedia untuk diunduh.');
      return;
    }

    try {
      const fileName = `${(item.cctv_name || 'cctv').replace(/\s+/g, '_')}_${new Date(item.created_at || Date.now()).toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      const imageUrl = new URL(item.image_path, cctvApi.getBaseUrl() || window.location.origin);

      const response = await fetch(imageUrl.toString(), { mode: 'cors' });
      if (!response.ok) {
        throw new Error('Gagal mengambil file gambar');
      }

      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      alert(error.message || 'Gagal mendownload screenshot');
    }
  };

  const handleCaptureAllCctvs = async () => {
    if (isCaptureRunning) {
      return;
    }

    try {
      setIsCaptureRunning(true);
      const estimatedBatches = Math.max(1, Math.ceil((items.length || 1) / 5));
      setCaptureMessage(`Capture semua CCTV sedang berjalan... (batch 1/${estimatedBatches})`);
      pushToast(`Capture dimulai • batch 1/${estimatedBatches}`, 'info', 3500);

      const data = await cctvApi.captureAllSnapshotsApi();
      setCaptureMessage(`Capture selesai. ${data.count || 0} CCTV diproses.`);
      pushToast(`Capture selesai • ${data.count || 0} CCTV diproses`, 'success', 4000);
      
    } catch (err) {
      const fallbackMessage = err.message || 'Capture semua CCTV gagal';
      setCaptureMessage(fallbackMessage);
      pushToast(fallbackMessage, 'error', 4000);
    } finally {
      setIsCaptureRunning(false);
    }
  };

  const handleExportRecap = async () => {
    try {
      await cctvApi.exportSnapshotsRecapToExcel({
        status: filter === 'all' ? '' : filter,
        date: selectedDate,
        scheduleId: scheduleFilter === 'all' ? '' : scheduleFilter,
      });
      pushToast('Export rekap berhasil dibuat', 'success', 3000);
    } catch (err) {
      pushToast(err.message || 'Gagal export rekap', 'error', 4000);
    }
  };

  const visibleSelectedIds = useMemo(
    () => filteredItems.filter((item) => selectedSnapshotIds.includes(item.id)).map((item) => item.id),
    [filteredItems, selectedSnapshotIds],
  );

  const toggleSnapshotSelection = (id) => {
    setSelectedSnapshotIds((prev) => (
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    ));
  };

  const toggleSelectionMode = () => {
    setSelectionMode((previous) => {
      if (previous) setSelectedSnapshotIds([]);
      return !previous;
    });
  };

  const toggleSelectVisible = () => {
    const nextIds = filteredItems.map((item) => item.id);
    const allVisibleSelected = nextIds.every((id) => selectedSnapshotIds.includes(id));
    setSelectedSnapshotIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !nextIds.includes(id));
      }
      return [...new Set([...prev, ...nextIds])];
    });
  };

  const handleBulkDeleteSelected = async () => {
    if (!selectedSnapshotIds.length) {
      alert('Pilih data screenshot terlebih dahulu');
      return;
    }

    if (!window.confirm(`Hapus ${selectedSnapshotIds.length} hasil capture yang dipilih?`)) {
      return;
    }

    try {
      await cctvApi.deleteSnapshotsApi(selectedSnapshotIds);
      setItems((prev) => prev.filter((item) => !selectedSnapshotIds.includes(item.id)));
      setSelectedSnapshotIds([]);
      pushToast(`Berhasil menghapus ${selectedSnapshotIds.length} hasil capture`, 'success', 3000);
    } catch (err) {
      pushToast(err.message || 'Gagal menghapus hasil capture', 'error', 4000);
    }
  };

  const handleBulkDownloadSelected = async () => {
    const selectedItems = filteredItems.filter((item) => selectedSnapshotIds.includes(item.id));
    if (!selectedItems.length) {
      alert('Pilih screenshot yang akan diunduh');
      return;
    }

    try {
      for (const item of selectedItems) {
        if (!item.image_path) continue;
        await handleDownloadSnapshot(item);
      }
      pushToast(`Mulai download ${selectedItems.length} hasil capture`, 'info', 3000);
    } catch (err) {
      pushToast(err.message || 'Gagal mendownload hasil capture', 'error', 4000);
    }
  };

  const handleScheduleSubmit = async (event) => {
    event.preventDefault();

    try {
      const payload = {
        name: scheduleForm.name.trim(),
        time: scheduleForm.time,
        enabled: scheduleForm.enabled,
        description: scheduleForm.description.trim(),
      };

      if (!payload.name || !payload.time) {
        alert('Nama jadwal dan waktu harus diisi');
        return;
      }

      if (scheduleForm.id) {
        await cctvApi.updateCaptureSchedule(scheduleForm.id, payload);
      } else {
        await cctvApi.createCaptureSchedule(payload);
      }

      const data = await cctvApi.fetchCaptureSchedules();
      setCaptureSchedules(data || []);
      setScheduleForm({ id: '', name: '', time: '06:00', enabled: true, description: '' });
      setShowScheduleModal(false);
    } catch (err) {
      alert(err.message || 'Gagal menyimpan jadwal capture');
    }
  };

  const handleScheduleDelete = async (id) => {
    if (!window.confirm('Hapus jadwal capture ini?')) return;

    try {
      await cctvApi.deleteCaptureSchedule(id);
      const data = await cctvApi.fetchCaptureSchedules();
      setCaptureSchedules(data || []);
    } catch (err) {
      alert(err.message || 'Gagal menghapus jadwal capture');
    }
  };

  return (
    <div className="min-h-screen bg-[#07090e] text-slate-200 p-3 sm:p-4 md:p-6 font-sans">
      {toastQueue.length > 0 && (
        <div className="fixed bottom-4 left-4 z-[60] flex max-w-sm flex-col gap-2">
          {toastQueue.map((toast) => (
            <div
              key={toast.id}
              className={`overflow-hidden rounded-2xl border shadow-2xl shadow-slate-950/40 backdrop-blur-md ${
                toast.kind === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                  : toast.kind === 'error'
                    ? 'border-red-500/40 bg-red-500/10 text-red-100'
                    : 'border-violet-500/40 bg-slate-900/85 text-violet-100'
              }`}
            >
              <div className="flex items-start gap-3 px-3 py-2.5">
                <div
                  className={`mt-0.5 h-2.5 w-2.5 rounded-full ${
                    toast.kind === 'success'
                      ? 'bg-emerald-300'
                      : toast.kind === 'error'
                        ? 'bg-red-300'
                        : 'bg-violet-300'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300/80">
                    {toast.kind === 'success' ? 'Selesai' : toast.kind === 'error' ? 'Perhatian' : 'Proses'}
                  </div>
                  <div className="mt-0.5 text-sm leading-5 text-current">{toast.message}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Jadwal Capture</p>
                <h3 className="text-xl font-semibold text-white">{scheduleForm.id ? 'Edit Jadwal' : 'Tambah Jadwal'}</h3>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowScheduleModal(false);
                }}
                className="rounded-full border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-sm text-slate-200 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>

            <div className="space-y-5 p-4">
              <form onSubmit={handleScheduleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-wide text-slate-400">Nama jadwal</span>
                    <input
                      type="text"
                      value={scheduleForm.name}
                      onChange={(e) => setScheduleForm((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none"
                      placeholder="Contoh: Pagi"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs uppercase tracking-wide text-slate-400">Waktu (HH:MM)</span>
                    <input
                      type="time"
                      value={scheduleForm.time}
                      onChange={(e) => setScheduleForm((prev) => ({ ...prev, time: e.target.value }))}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none"
                    />
                  </label>
                </div>

                <label className="space-y-2 block">
                  <span className="text-xs uppercase tracking-wide text-slate-400">Deskripsi</span>
                  <input
                    type="text"
                    value={scheduleForm.description}
                    onChange={(e) => setScheduleForm((prev) => ({ ...prev, description: e.target.value }))}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none"
                    placeholder="Opsional"
                  />
                </label>

                <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                  <span className="text-sm text-slate-300">Aktif</span>
                  <input
                    type="checkbox"
                    checked={scheduleForm.enabled}
                    onChange={(e) => setScheduleForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-600 bg-slate-950"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowScheduleModal(false)}
                    className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-200"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg border border-cyan-600 bg-cyan-600/10 px-4 py-2 text-sm font-semibold text-cyan-300"
                  >
                    {scheduleForm.id ? 'Simpan Perubahan' : 'Tambah Jadwal'}
                  </button>
                </div>
              </form>

              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">Daftar Jadwal</div>
                  <button
                    type="button"
                    onClick={() => {
                      setScheduleForm({ id: '', name: '', time: '06:00', enabled: true, description: '' });
                    }}
                    className="rounded-lg border border-cyan-600 bg-cyan-600/10 px-2.5 py-1.5 text-xs font-semibold text-cyan-300"
                  >
                    + Baru
                  </button>
                </div>

                <div className="space-y-2">
                  {captureSchedules.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950/50 p-3 text-sm text-slate-400">
                      Belum ada jadwal capture.
                    </div>
                  ) : (
                    captureSchedules.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-900/70 p-3">
                        <div>
                          <div className="font-medium text-white">{item.name}</div>
                          <div className="text-xs text-slate-400">{item.time} • {item.enabled ? 'Aktif' : 'Nonaktif'}</div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setScheduleForm({
                                id: item.id,
                                name: item.name,
                                time: item.time,
                                enabled: Boolean(item.enabled),
                                description: item.description || '',
                              });
                            }}
                            className="rounded-lg border border-amber-600 bg-amber-600/10 px-2.5 py-1.5 text-xs text-amber-300"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleScheduleDelete(item.id)}
                            className="rounded-lg border border-red-600 bg-red-600/10 px-2.5 py-1.5 text-xs text-red-300"
                          >
                            Hapus
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedView && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-sm">
          <div className="w-full max-w-6xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Full View</p>
                <h3 className="text-lg font-semibold text-white">{selectedView.cctv_name || 'CCTV'}</h3>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedView(null);
                }}
                className="rounded-full border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-sm text-slate-200 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>

            <div className="bg-slate-950 p-3 md:p-4">
              <img
                src={`${cctvApi.getBaseUrl()}${selectedView.image_path || ''}`}
                alt={selectedView.cctv_name || 'Full view CCTV'}
                className="h-[70vh] w-full rounded-xl object-contain"
                onError={(e) => {
                  e.target.src = 'https://placehold.co/1600x900/0f172a/94a3b8?text=No+Image';
                }}
              />
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-800 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div className="text-sm text-slate-300">
                {formatDate(selectedView.created_at)}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadSnapshot(selectedView)}
                  className="rounded-lg border border-sky-600 bg-sky-600/10 px-3 py-2 text-sm font-semibold text-sky-300 hover:bg-sky-600/20"
                >
                  Download Screenshot
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-7xl space-y-2">
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-2.5">
          <div className="flex flex-col gap-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                onClick={onBack}
                className="inline-flex items-center rounded-lg border border-slate-700/70 bg-slate-950/60 px-2 py-1 text-xs text-slate-200 transition hover:bg-slate-800"
              >
                ← Kembali
              </button>
              <h1 className="truncate text-xl font-black tracking-tight text-white sm:text-2xl">Rekap Tampilan CCTV</h1>
            </div>

            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              <div className="flex min-w-0 items-center gap-2 rounded-md bg-slate-950/40 px-2 py-1">
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Sesi</span>
                <select
                  value={scheduleFilter}
                  onChange={(e) => setScheduleFilter(e.target.value)}
                  className="min-w-0 flex-1 rounded border border-slate-700/70 bg-slate-950 px-1.5 py-1 text-xs text-white outline-none"
                >
                  <option value="all">Semua sesi</option>
                  {captureSchedules.map((schedule) => (
                    <option key={schedule.id} value={schedule.id}>
                      {schedule.name} ({schedule.time})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex min-w-0 items-center gap-2 rounded-md bg-slate-950/40 px-2 py-1">
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">Tanggal</span>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="min-w-0 flex-1 rounded border border-slate-700/70 bg-slate-950 px-1.5 py-1 text-xs text-white outline-none"
                />
              </div>

              <div className="relative min-w-0 rounded-md bg-slate-950/40 px-2 py-1 xl:col-span-2">
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari CCTV..."
                  className="w-full rounded border border-slate-700/70 bg-slate-950 px-1.5 py-1 pr-7 text-xs text-white outline-none placeholder:text-slate-500"
                />
                <Search size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>

              <button
                type="button"
                onClick={handleCaptureAllCctvs}
                disabled={isCaptureRunning}
                className="rounded-md border border-violet-600/40 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCaptureRunning ? 'Sedang Capture...' : 'Capture Semua'}
              </button>
              <button
                type="button"
                onClick={() => setShowScheduleModal(true)}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-slate-700/70 bg-slate-950/60 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:border-cyan-500/40 hover:bg-slate-800"
              >
                <CalendarClock size={13} />
                Jadwal
              </button>
              <button
                type="button"
                onClick={handleExportRecap}
                className="inline-flex items-center justify-center gap-1 rounded-md border border-emerald-600/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20"
              >
                <Download size={13} />
                Export Excel
              </button>
            </div>
          </div>
        </div>

        {captureMessage && (
          <div className={`rounded-lg border p-2 text-xs ${isCaptureRunning ? 'border-violet-500/50 bg-violet-500/10 text-violet-200' : 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200'}`}>
            {captureMessage}
          </div>
        )}

        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-800/80 bg-slate-900/60 p-2 sm:grid-cols-5">
          <button
            type="button"
            onClick={toggleSelectionMode}
            className={`flex min-h-[34px] items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1 text-left text-[9px] font-semibold uppercase tracking-[0.18em] transition ${selectionMode
              ? 'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/20'
              : 'border-slate-700/80 bg-slate-950/60 text-slate-200 hover:border-cyan-500/40 hover:bg-slate-800'
            }`}
          >
            <span>{selectionMode ? 'Batal' : 'Pilih'}</span>
            <ListChecks size={13} />
          </button>
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`flex min-h-[34px] items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1 text-left text-slate-200 transition ${filter === 'all'
              ? 'border-cyan-500/50 bg-cyan-500/10 ring-1 ring-cyan-500/20'
              : 'border-slate-700/80 bg-slate-950/60 hover:border-slate-600 hover:bg-slate-800'
            }`}
          >
            <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">Total</span>
            <span className="text-base font-bold text-white">{summary.total}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('jelas')}
            className={`flex min-h-[34px] items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1 text-left text-emerald-300 transition ${filter === 'jelas'
              ? 'border-emerald-400/60 bg-emerald-500/15 ring-1 ring-emerald-500/20'
              : 'border-emerald-700/40 bg-emerald-500/10 hover:border-emerald-500/60 hover:bg-emerald-500/15'
            }`}
          >
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em]">Jelas</span>
            <span className="text-base font-bold">{summary.jelas}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('buram')}
            className={`flex min-h-[34px] items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1 text-left text-amber-300 transition ${filter === 'buram'
              ? 'border-amber-400/60 bg-amber-500/15 ring-1 ring-amber-500/20'
              : 'border-amber-700/40 bg-amber-500/10 hover:border-amber-500/60 hover:bg-amber-500/15'
            }`}
          >
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em]">Buram</span>
            <span className="text-base font-bold">{summary.buram}</span>
          </button>
          <button
            type="button"
            onClick={() => setFilter('error')}
            className={`flex min-h-[34px] items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1 text-left text-red-300 transition ${filter === 'error'
              ? 'border-red-400/60 bg-red-500/15 ring-1 ring-red-500/20'
              : 'border-red-700/40 bg-red-500/10 hover:border-red-500/60 hover:bg-red-500/15'
            }`}
          >
            <span className="text-[9px] font-semibold uppercase tracking-[0.2em]">Error</span>
            <span className="text-base font-bold">{summary.error}</span>
          </button>
        </div>

        {selectionMode && (
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={toggleSelectVisible}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-all duration-200 ${
                filteredItems.length > 0 && filteredItems.every((item) => selectedSnapshotIds.includes(item.id))
                  ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200 shadow-[0_0_18px_rgba(16,185,129,0.15)]'
                  : 'border-slate-600 bg-slate-800 text-slate-200 hover:bg-slate-700 hover:border-slate-500'
              }`}
            >
                <span className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded border text-[9px] leading-none ${filteredItems.length > 0 && filteredItems.every((item) => selectedSnapshotIds.includes(item.id)) ? 'border-emerald-400 bg-emerald-500/20 text-emerald-200' : 'border-current'}`}>
                {filteredItems.length > 0 && filteredItems.every((item) => selectedSnapshotIds.includes(item.id)) ? '✓' : ''}
              </span>
              {filteredItems.length > 0 && filteredItems.every((item) => selectedSnapshotIds.includes(item.id)) ? 'Batal Pilih Semua' : 'Pilih Semua'}
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1 text-slate-200">{selectedSnapshotIds.length} dipilih</span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
              <button
                type="button"
                onClick={handleBulkDownloadSelected}
                disabled={!selectedSnapshotIds.length}
                className="rounded-lg border border-sky-600/40 bg-sky-500/10 px-2.5 py-1.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Download Terpilih
              </button>
              <button
                type="button"
                onClick={handleBulkDeleteSelected}
                disabled={!selectedSnapshotIds.length}
                className="rounded-lg border border-red-600/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-200 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Hapus Terpilih
              </button>
            </div>
          </div>
        </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/60 bg-red-500/10 p-3 text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-slate-400">Memuat data screenshot...</div>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/80 shadow-[0_0_0_1px_rgba(15,23,42,0.7)]">
            {filteredItems.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-700 bg-slate-900/60 p-8 text-center text-slate-400">
                Tidak ada data sesuai filter atau pencarian.
              </div>
            ) : (
              <>
                <div className="max-h-[65vh] overflow-auto [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-600 [&::-webkit-scrollbar-track]:bg-slate-900/40">
                  <div className="min-w-[760px]">
                    <div className="sticky top-0 z-10 hidden grid-cols-[48px_minmax(230px,1.7fr)_minmax(170px,1.1fr)_130px_180px] gap-3 border-b border-slate-800 bg-slate-950/90 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 backdrop-blur md:grid">
                      <div className="pl-1">No</div>
                      <div className="pl-1">Identitas CCTV</div>
                      <div className="pl-1">Waktu</div>
                      <div className="pl-1">Status</div>
                      <div className="pl-1 text-right">Aksi</div>
                    </div>

                    <div className="divide-y divide-slate-800/90 bg-slate-900/40">
                      {filteredItems.map((item, index) => (
                        <div
                          key={item.id}
                          className={`group grid grid-cols-1 gap-3 px-3 py-2.5 transition-all duration-200 ease-out md:grid-cols-[48px_minmax(230px,1.7fr)_minmax(170px,1.1fr)_130px_180px] md:items-center md:px-4 ${selectedSnapshotIds.includes(item.id) ? 'bg-sky-500/5 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.15)]' : 'hover:bg-slate-800/60'}`}
                        >
                          <div className="flex items-center justify-between text-sm text-slate-300 md:justify-start">
                            <div className="md:hidden text-[10px] uppercase tracking-[0.18em] text-slate-500">No</div>
                            <span>{index + 1}</span>
                          </div>

                          <div className="flex min-w-0 items-center gap-3">
                            {selectionMode && (
                              <input
                                type="checkbox"
                                checked={selectedSnapshotIds.includes(item.id)}
                                onChange={() => toggleSnapshotSelection(item.id)}
                                className="h-4 w-4 rounded border-slate-600 bg-slate-950 accent-sky-500"
                                aria-label={`Pilih ${item.cctv_name || 'CCTV'}`}
                              />
                            )}
                            <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
                              <img
                                src={`${cctvApi.getBaseUrl()}${item.image_path || ''}?t=${new Date(item.created_at).getTime()}`}
                                alt={item.cctv_name || 'Screenshot CCTV'}
                                className="h-full w-full object-cover"
                                onError={(e) => {
                                  e.target.src = 'https://placehold.co/1200x700/0f172a/94a3b8?text=No+Image';
                                }}
                              />
                            </div>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold text-white">{item.cctv_name || 'CCTV'}</div>
                              <div className="text-[11px] text-slate-400">ID: {item.cctv_id || item.id}</div>
                            </div>
                          </div>

                          <div className="text-sm text-slate-300 md:text-left">
                            <div className="md:hidden text-[10px] uppercase tracking-[0.18em] text-slate-500">Waktu</div>
                            <div>{formatDate(item.created_at)}</div>
                            <div className="mt-1 text-[11px] font-medium text-cyan-300">
                              {item.capture_session || 'Manual'}
                            </div>
                          </div>

                          <div className="flex items-center md:justify-start">
                            <div className="md:hidden text-[10px] uppercase tracking-[0.18em] text-slate-500">Status</div>
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusColor[getDisplayStatus(item)] || statusColor.error}`}>
                              {statusLabelMap[getDisplayStatus(item)] || 'Error'}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 md:justify-end">
                            <button
                              type="button"
                              onClick={() => setSelectedView(item)}
                              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
                            >
                              View
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadSnapshot(item)}
                              className="rounded-lg border border-sky-600 bg-sky-600/10 px-2.5 py-1.5 text-xs font-semibold text-sky-300 transition hover:bg-sky-600/20"
                            >
                              Download
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}