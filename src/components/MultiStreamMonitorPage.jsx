import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, GripVertical, LayoutGrid, Monitor, X, Search, Maximize2, Minimize2, Radio } from 'lucide-react';
import cctvApi from '../services/cctvApi';

const GRID_OPTIONS = [
  { count: 1, label: '1 LAYAR' },
  { count: 4, label: '4 LAYAR' },
  { count: 9, label: '9 LAYAR' },
];

function emptySlots(n) {
  return Array.from({ length: n }, () => null);
}

export default function MultiStreamMonitorPage({ cctvs, onBack, stopStreamBackend, refreshCctvs, onFullScreenChange }) {
  const [gridCount, setGridCount] = useState(4);
  const [slots, setSlots] = useState(() => emptySlots(4));
  const [streamNonce, setStreamNonce] = useState({});
  const [listFilter, setListFilter] = useState('');
  const [isFullScreen, setIsFullScreen] = useState(false);
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  // Real-time live timestamp ticker for CCTV OSD overlay
  const [liveTimestamp, setLiveTimestamp] = useState(() => {
    const d = new Date();
    return d.toISOString().replace('T', ' ').slice(0, 19) + ' WIB';
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date();
      setLiveTimestamp(d.toISOString().replace('T', ' ').slice(0, 19) + ' WIB');
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const findActiveSlotIndex = useCallback(
    (cctvId) => slots.findIndex((slot) => slot && String(slot.id) === String(cctvId)),
    [slots],
  );

  const listFiltered = useMemo(() => {
    const q = listFilter.trim().toLowerCase();
    let rows = (cctvs || []).filter((c) => c.rtsp_url);
    if (q) {
      rows = rows.filter(
        (c) =>
          String(c.name || '').toLowerCase().includes(q) ||
          String(c.ip || '').toLowerCase().includes(q) ||
          String(c.id || '').toLowerCase().includes(q),
      );
    }
    return rows;
  }, [cctvs, listFilter]);

  const stopSlot = useCallback(
    (index) => {
      setSlots((prev) => {
        const c = prev[index];
        if (c) stopStreamBackend(c.id);
        const next = [...prev];
        next[index] = null;
        return next;
      });
      setStreamNonce((prev) => ({ ...prev, [index]: Date.now() }));
    },
    [stopStreamBackend],
  );

  const assignToSlot = useCallback(
    (index, cctv) => {
      if (!cctv?.rtsp_url) return;

      setSlots((prev) => {
        const next = [...prev];
        for (let j = 0; j < next.length; j++) {
          if (j !== index && next[j] && String(next[j].id) === String(cctv.id)) {
            stopStreamBackend(next[j].id);
            next[j] = null;
          }
        }
        const old = next[index];
        if (old && String(old.id) !== String(cctv.id)) {
          stopStreamBackend(old.id);
        }
        next[index] = cctv;
        return next;
      });
      setStreamNonce((prev) => ({ ...prev, [index]: Date.now() }));
    },
    [stopStreamBackend],
  );

  const changeGridCount = useCallback(
    (count) => {
      setSlots((prev) => {
        for (let i = count; i < prev.length; i++) {
          if (prev[i]) stopStreamBackend(prev[i].id);
        }
        const next = emptySlots(count);
        for (let i = 0; i < Math.min(prev.length, count); i++) {
          next[i] = prev[i];
        }
        return next;
      });
      setGridCount(count);
      setStreamNonce({});
    },
    [stopStreamBackend],
  );

  useEffect(() => {
    onFullScreenChange?.(isFullScreen);
  }, [isFullScreen, onFullScreenChange]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isFullScreen) {
        setIsFullScreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreen]);

  useEffect(() => {
    refreshCctvs?.();
  }, [refreshCctvs]);

  useEffect(() => {
    return () => {
      slotsRef.current.forEach((c) => {
        if (c) stopStreamBackend(c.id);
      });
    };
  }, [stopStreamBackend]);

  const onDragStart = (e, cctv) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ id: String(cctv.id) }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDrop = (e, slotIndex) => {
    e.preventDefault();
    let raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const { id } = JSON.parse(raw);
      const cctv = (cctvs || []).find((c) => String(c.id) === String(id));
      if (cctv && cctv.rtsp_url) assignToSlot(slotIndex, cctv);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={`flex min-h-[100dvh] flex-col bg-[#07090e] text-slate-200 ${isFullScreen ? 'fixed inset-0 z-[100]' : ''}`}>
      {/* Header Toolbar */}
      {!isFullScreen && (
        <div className="bg-[#0b0e17] flex shrink-0 flex-col gap-2.5 px-3 py-2 sm:px-4 lg:flex-row lg:items-center lg:justify-between border-b border-white/5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
            >
              <ArrowLeft size={13} />
              Kembali
            </button>

            <div className="min-w-0">
              <h1 className="flex items-center gap-2 truncate text-sm font-bold text-white tracking-wide">
                <span className="cctv-online-dot" />
                <span className="uppercase">Video Wall Surveillance</span>
              </h1>
              <p className="text-[9px] font-telemetry text-slate-500 uppercase tracking-widest">
                Multi-Stream Realtime Monitor · Surakarta Sector
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Fullscreen Toggle */}
            <button
              type="button"
              onClick={() => setIsFullScreen(!isFullScreen)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 bg-slate-900/80 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:bg-slate-800 hover:text-white"
              title={isFullScreen ? 'Keluar fullscreen (Esc)' : 'Tampilan Layar Penuh'}
            >
              {isFullScreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              <span>{isFullScreen ? 'Keluar' : 'Fullscreen'}</span>
            </button>

            {/* Grid layout switcher */}
            <div className="flex items-center gap-1 p-1 rounded-lg border border-white/5 bg-slate-950/80">
              {GRID_OPTIONS.map((opt) => (
                <button
                  key={opt.count}
                  type="button"
                  onClick={() => changeGridCount(opt.count)}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-bold tracking-wider transition font-telemetry ${
                    gridCount === opt.count
                      ? 'bg-indigo-600/30 text-indigo-200 border border-indigo-500/50 shadow-[0_0_10px_rgba(99,102,241,0.25)]'
                      : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className={`flex min-h-0 flex-1 flex-col ${isFullScreen ? 'h-full w-full' : 'lg:flex-row'}`}>

        {/* Sidebar: Kamera List (Hidden in Fullscreen) */}
        {!isFullScreen && (
          <aside className="w-full shrink-0 border-b border-slate-800/80 bg-[#0a0d14] lg:max-w-[310px] lg:border-b-0 lg:border-r border-white/5 order-2 lg:order-1 flex flex-col">
            {/* Search header */}
            <div className="border-b border-white/5 p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" size={13} />
                <input
                  type="text"
                  placeholder="Cari CCTV / IP..."
                  value={listFilter}
                  onChange={(e) => setListFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-700/60 bg-slate-950/80 py-1.5 pl-8 pr-2 text-xs text-white placeholder:text-slate-500 focus:border-indigo-500/60 focus:outline-none font-telemetry"
                />
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-slate-400 font-telemetry">
                  Kamera Tersedia
                </p>
                <span className="rounded px-1.5 py-0.5 text-[9px] font-mono font-bold bg-slate-900 border border-slate-700 text-slate-300">
                  {listFiltered.length} UNIT
                </span>
              </div>
            </div>

            {/* Camera scroll list */}
            <div className="flex-1 overflow-y-auto p-2.5 space-y-2 max-h-[50vh] lg:max-h-[calc(100vh-140px)]">
              {listFiltered.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 font-telemetry">
                  Tidak ada CCTV dengan RTSP stream aktif.
                </div>
              ) : (
                listFiltered.map((cctv) => {
                  const activeSlotIndex = findActiveSlotIndex(cctv.id);
                  const isOnGrid = activeSlotIndex >= 0;

                  return (
                    <div
                      key={cctv.id}
                      draggable="true"
                      onDragStart={(e) => onDragStart(e, cctv)}
                      className={`group cursor-grab active:cursor-grabbing rounded-xl border p-2.5 transition-all duration-150 relative overflow-hidden ${
                        isOnGrid
                          ? 'bg-indigo-950/20 border-indigo-500/40 shadow-[0_0_12px_rgba(99,102,241,0.12)]'
                          : 'bg-slate-900/60 border-slate-800 hover:border-slate-600 hover:bg-slate-900/90'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <GripVertical size={13} className="mt-0.5 text-slate-600 group-hover:text-slate-400 shrink-0" />

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-100 group-hover:text-indigo-200 transition-colors">
                            {cctv.name}
                          </p>
                          <p className="mt-0.5 truncate font-telemetry font-mono text-[10px] text-slate-400">
                            {cctv.ip}
                          </p>
                        </div>

                        <Monitor size={14} className={`shrink-0 mt-0.5 ${isOnGrid ? 'text-indigo-400' : 'text-slate-500'}`} />
                      </div>

                      <div className="mt-2.5 flex items-center justify-between gap-2 pt-2 border-t border-white/5">
                        <span
                          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider font-telemetry ${
                            isOnGrid
                              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                              : 'bg-slate-800 border border-slate-700 text-slate-400'
                          }`}
                        >
                          <span className={isOnGrid ? 'cctv-online-dot' : 'h-1.5 w-1.5 rounded-full bg-slate-500'} />
                          {isOnGrid ? `Slot ${activeSlotIndex + 1}` : 'Ready'}
                        </span>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const targetSlotIndex = slots.findIndex((slot) => !slot);
                              if (targetSlotIndex >= 0) {
                                assignToSlot(targetSlotIndex, cctv);
                                return;
                              }
                              const fallbackSlotIndex = Math.min(
                                activeSlotIndex >= 0 ? activeSlotIndex : 0,
                                Math.max(0, slots.length - 1)
                              );
                              assignToSlot(fallbackSlotIndex, cctv);
                            }}
                            className="rounded px-2 py-0.5 text-[10px] font-semibold tracking-wider font-telemetry bg-indigo-600/20 border border-indigo-500/40 text-indigo-200 hover:bg-indigo-600/30 transition-colors"
                          >
                            TAMPILKAN
                          </button>

                          {isOnGrid && (
                            <button
                              type="button"
                              onClick={() => stopSlot(activeSlotIndex)}
                              className="rounded px-1.5 py-0.5 text-[10px] font-semibold font-telemetry bg-red-500/15 border border-red-500/30 text-red-300 hover:bg-red-500/25 transition-colors"
                              title="Keluarkan dari grid"
                            >
                              TUTUP
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </aside>
        )}

        {/* Video Wall Grid Display */}
        <main className={`flex min-h-0 flex-1 flex-col overflow-hidden bg-[#06080d] ${isFullScreen ? 'h-full w-full' : 'order-1 lg:order-2'}`}>
          <div
            className={`grid min-h-0 flex-1 gap-2 p-2 sm:gap-2.5 sm:p-3 ${
              gridCount === 1
                ? 'grid-cols-1 grid-rows-1'
                : gridCount === 4
                  ? 'grid-cols-1 sm:grid-cols-2 grid-rows-2'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 grid-rows-3'
            }`}
            style={{ gridAutoRows: 'minmax(0, 1fr)' }}
          >
            {slots.map((cctv, index) => (
              <div
                key={`slot-${index}-${gridCount}`}
                onDragOver={onDragOver}
                onDrop={(e) => onDrop(e, index)}
                className={`group relative aspect-video overflow-hidden rounded-xl border transition-all duration-200 ${
                  cctv
                    ? 'border-indigo-500/30 bg-black shadow-lg shadow-black/60 cctv-reticle-box'
                    : 'border-dashed border-slate-800 bg-[#0a0d15]/60 hover:border-indigo-500/50 hover:bg-[#0d111d]/70 cctv-radar-scanner'
                }`}
              >
                {/* Empty Slot with Radar Scanner Aesthetics */}
                {!cctv && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center select-none">
                    <div className="relative mb-3">
                      <div className="h-12 w-12 rounded-full border border-indigo-500/20 bg-indigo-950/20 flex items-center justify-center">
                        <Radio size={20} className="text-indigo-400 animate-pulse" />
                      </div>
                    </div>
                    <p className="font-telemetry text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">
                      KAMERA SLOT {index + 1}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 font-telemetry">
                      Tarik CCTV dari daftar atau klik tombol Tampilkan
                    </p>
                  </div>
                )}

                {/* Active CCTV Stream with Full Surveillance HUD */}
                {cctv && (
                  <>
                    {/* Top Right: LIVE CAM badge & Close Button */}
                    <div className="absolute right-2.5 top-2.5 z-30 flex items-center gap-2">
                      <div className="cctv-rec-badge shadow-md">
                        <span className="cctv-rec-dot" />
                        <span>LIVE CAM</span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          stopSlot(index);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                        className="rounded-lg border border-white/15 bg-black/80 hover:bg-red-600/30 active:bg-red-600/50 hover:border-red-500/50 p-1.5 text-slate-300 hover:text-white transition-colors cursor-pointer min-w-[30px] min-h-[30px] flex items-center justify-center backdrop-blur-md"
                        title="Tutup stream dari slot"
                        aria-label="Tutup feed"
                      >
                        <X size={15} />
                      </button>
                    </div>

                    {/* Bottom Left: Keterangan Tanggal / Waktu */}
                    <div className="absolute bottom-2 left-2.5 z-30 pointer-events-none rounded border border-white/10 bg-black/70 px-2 py-0.5 backdrop-blur-sm">
                      <p className="font-telemetry font-mono text-[9px] text-emerald-400 tracking-wider">
                        {liveTimestamp}
                      </p>
                    </div>

                    {/* Video Stream Container (Clean, no filters) */}
                    <div className="relative h-full w-full bg-black">
                      <img
                        key={`${cctv.id}-${streamNonce[index] ?? 0}`}
                        src={cctvApi.buildStreamUrl(
                          cctv.id,
                          cctv.rtsp_url,
                          streamNonce[index] ?? 0,
                        )}
                        alt={cctv.name}
                        onError={() => {
                          setTimeout(() => {
                            setStreamNonce((prev) => ({ ...prev, [index]: Date.now() }));
                          }, 5000);
                        }}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Floating Exit Fullscreen Button */}
          {isFullScreen && (
            <button
              type="button"
              onClick={() => setIsFullScreen(false)}
              className="absolute right-4 top-4 z-50 rounded-lg border border-slate-700 bg-slate-900/90 p-2 text-slate-300 transition hover:bg-slate-800 hover:text-white backdrop-blur-md shadow-xl"
              title="Keluar Layar Penuh (Esc)"
            >
              <X size={18} />
            </button>
          )}
        </main>
      </div>
    </div>
  );
}
