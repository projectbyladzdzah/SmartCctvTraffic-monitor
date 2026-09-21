import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Activity, Power, PowerOff, FileSpreadsheet } from 'lucide-react';
import cctvApi from '../services/cctvApi';

export default function StatusHistoryModal({ open, onClose, cctvs }) {
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterCctvId, setFilterCctvId] = useState('');

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        const data = await cctvApi.getAllHistory(10000);
        if (!cancelled) {
          setHistory(Array.isArray(data) ? data : []);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError('Gagal memuat riwayat. Pastikan backend aktif.');
          console.error(err);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    if (!filterCctvId) return history;
    return history.filter((row) => String(row.cctv_id) === filterCctvId);
  }, [history, filterCctvId]);

  const exportToExcel = useCallback(async () => {
    if (!filtered.length) return;
    const XLSX = await import('xlsx');
    const sorted = [...filtered].sort(
      (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0),
    );
    const rows = sorted.map((item, i) => {
      const isOnline = item.status === 'online';
      return {
        No: i + 1,
        'Nama perangkat': item.cctv_name || '',
        'ID CCTV': item.cctv_id,
        Status: isOnline ? 'Nyala' : 'Mati',
        'Status (kode)': item.status || '',
        Waktu: item.timestamp
          ? new Date(item.timestamp).toLocaleString('id-ID', {
              dateStyle: 'short',
              timeStyle: 'medium',
            })
          : '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Riwayat');
    const month = new Date().toISOString().slice(0, 7);
    XLSX.writeFile(wb, `riwayat-cctv-${month}.xlsx`);
  }, [filtered]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center items-center p-4 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-history-title"
    >
      <div className="bg-[#0c0f18] border border-indigo-500/30 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[min(90vh,720px)] flex flex-col overflow-hidden cctv-reticle-box">
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-white/10 bg-[#0f1422]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
              <Activity size={22} />
            </div>
            <div className="min-w-0">
              <h2 id="status-history-title" className="text-lg font-bold text-slate-100 tracking-tight">
                Riwayat nyala &amp; mati CCTV
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Hanya gangguan offline ≥ 10 menit yang dicatat (bukan putus singkat).
                Riwayat bulan lalu dihapus otomatis di server; gunakan ekspor Excel jika perlu arsip.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-red-600/30 active:bg-red-600/50 transition-colors shrink-0 cursor-pointer min-w-[34px] min-h-[34px] flex items-center justify-center border border-white/5 hover:border-red-500/40"
            aria-label="Tutup"
            title="Tutup Riwayat"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-slate-700/40 flex flex-wrap items-center gap-3 bg-slate-900/20">
          <label className="text-[11px] uppercase tracking-wider text-slate-500 font-bold">Filter</label>
          <select
            value={filterCctvId}
            onChange={(e) => setFilterCctvId(e.target.value)}
            className="text-sm bg-slate-800/80 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/40 min-w-[200px]"
          >
            <option value="">Semua perangkat</option>
            {(cctvs || []).map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name || c.id}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 custom-scrollbar min-h-[200px]">
          {isLoading && (
            <p className="text-sm text-slate-500 text-center py-12">Memuat riwayat…</p>
          )}
          {!isLoading && error && (
            <p className="text-sm text-red-400 text-center py-12">{error}</p>
          )}
          {!isLoading && !error && filtered.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-12">
              Belum ada perubahan status tercatat.
            </p>
          )}
          {!isLoading && !error && filtered.length > 0 && (
            <ul className="space-y-2">
              {filtered.map((item) => {
                const isOnline = item.status === 'online';
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-700/50 bg-slate-800/40 px-4 py-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-black uppercase tracking-wide border shrink-0 ${
                          isOnline
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                            : 'bg-red-500/15 text-red-400 border-red-500/25'
                        }`}
                      >
                        {isOnline ? <Power size={12} /> : <PowerOff size={12} />}
                        {isOnline ? 'Nyala' : 'Mati'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200 truncate">
                          {item.cctv_name || `Perangkat ${item.cctv_id}`}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono">ID: {item.cctv_id}</p>
                      </div>
                    </div>
                    <time className="text-xs text-slate-500 font-mono tabular-nums shrink-0">
                      {item.timestamp
                        ? new Date(item.timestamp).toLocaleString('id-ID', {
                            dateStyle: 'short',
                            timeStyle: 'medium',
                          })
                        : '—'}
                    </time>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="px-6 py-3 border-t border-slate-700/60 flex flex-wrap justify-end gap-2 bg-slate-900/30">
          <button
            type="button"
            onClick={exportToExcel}
            disabled={!filtered.length || isLoading || Boolean(error)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 disabled:opacity-40 disabled:pointer-events-none transition-colors"
          >
            <FileSpreadsheet size={18} />
            Ekspor Excel
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-700 text-slate-100 hover:bg-slate-600 transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
