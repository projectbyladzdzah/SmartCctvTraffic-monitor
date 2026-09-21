import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Minimize2,
  Maximize2,
  ExternalLink,
  GripVertical,
  RotateCw,
  ZoomIn,
  ZoomOut,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpLeft,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowDownRight,
  Square,
  Info,
  Power,
  Sliders,
  RefreshCw,
  Video,
  ShieldCheck,
  Cpu,
  Clock,
  Type,
  CheckCircle,
  Sparkles,
  MousePointer,
  Hand,
} from 'lucide-react';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import { useResizablePanel } from '../hooks/useResizablePanel';
import ResizeHandles from './ResizeHandles';
import cctvApi from '../services/cctvApi';

export default function IPConfigModal({
  cctv,
  onClose,
  stackIndex = 0,
}) {
  const [activeTab, setActiveTab] = useState('ptz'); // 'ptz' | 'settings' | 'system'
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [infoError, setInfoError] = useState(null);
  const [ptzSpeed, setPtzSpeed] = useState(60); // 1-100

  // Movement mode: 'step' (klik sekali otomatis geser) | 'hold' (tahan untuk geser)
  const [moveMode, setMoveMode] = useState('step');
  const [stepDuration, setStepDuration] = useState(1200); // 600ms | 1200ms | 2000ms
  const [isMoving, setIsMoving] = useState(false);
  const [activeDirection, setActiveDirection] = useState(null);
  const stepTimerRef = useRef(null);

  // Time & OSD Settings state
  const [osdTitle, setOsdTitle] = useState(cctv?.name || '');
  const [savingOsd, setSavingOsd] = useState(false);
  const [osdMsg, setOsdMsg] = useState('');
  const [syncingTime, setSyncingTime] = useState(false);
  const [timeMsg, setTimeMsg] = useState('');
  const [currentTimeStr, setCurrentTimeStr] = useState('');

  // Reboot state
  const [rebooting, setRebooting] = useState(false);
  const [rebootMsg, setRebootMsg] = useState('');

  const resetKey = String(cctv?.id ?? '');
  const targetIp = cctv?.ip;
  const proxyUrl = targetIp ? `${cctvApi.getBaseUrl()}/api/cctv-proxy/${encodeURIComponent(targetIp)}/` : '';

  // Update live clock for time sync tab
  useEffect(() => {
    const updateTime = () => setCurrentTimeStr(new Date().toLocaleTimeString('id-ID'));
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const getDefaultPosition = () => {
    if (typeof window === 'undefined') return { x: 40, y: 60 };
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cw = Math.min(880, w - 32);
    const baseX = Math.max(8, (w - cw) / 2);
    const baseY = Math.max(16, (h - 640) / 2);
    const offset = (stackIndex || 0) * 24;
    return { x: baseX + offset, y: baseY + offset };
  };

  const panelW = typeof window !== 'undefined' ? Math.min(880, window.innerWidth - 32) : 880;
  const { position, setPosition, dragHandlers } = useDraggablePanel(resetKey, getDefaultPosition);

  const maxW = typeof window !== 'undefined' ? Math.min(1200, Math.max(500, window.innerWidth - position.x - 8)) : 1200;
  const maxH = typeof window !== 'undefined' ? Math.min(900, Math.max(450, window.innerHeight - position.y - 8)) : 900;

  const { size, startResize } = useResizablePanel({
    initialW: Math.min(panelW, maxW),
    initialH: 600,
    minW: 520,
    minH: 440,
    maxW,
    maxH: Math.min(maxH, 850),
    onResize: ({ deltaX, deltaY }) => {
      if (deltaX || deltaY) {
        setPosition((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
      }
    },
  });

  // Muat info perangkat dan nama OSD dari kamera
  const loadDeviceInfo = async () => {
    if (!cctv?.id) return;
    setLoadingInfo(true);
    setInfoError(null);
    try {
      const res = await cctvApi.getDeviceInfoApi(cctv.id);
      if (res.success && res.info) {
        setDeviceInfo({ ...res.info, driver: res.driver });
      } else {
        setInfoError(res.error || 'Gagal memuat info perangkat dari kamera');
      }

      // Ambil juga nama OSD saat ini
      const osdRes = await cctvApi.getCameraOsdNameApi(cctv.id).catch(() => null);
      if (osdRes?.osdName) {
        setOsdTitle(osdRes.osdName);
      }
    } catch (err) {
      setInfoError(err.message || 'Tidak dapat terhubung ke API kamera');
    } finally {
      setLoadingInfo(false);
    }
  };

  useEffect(() => {
    loadDeviceInfo();
    return () => {
      if (stepTimerRef.current) {
        clearTimeout(stepTimerRef.current);
        stepTimerRef.current = null;
      }
    };
  }, [cctv?.id]);

  // Handle pergerakan PTZ inti
  const sendPtzMove = async (pan, tilt, zoom = 0, dirName = '') => {
    if (!cctv?.id) return;
    setIsMoving(true);
    setActiveDirection(dirName);

    const scaledPan = Math.round((pan * ptzSpeed) / 100);
    const scaledTilt = Math.round((tilt * ptzSpeed) / 100);
    const scaledZoom = Math.round((zoom * ptzSpeed) / 100);

    try {
      await cctvApi.controlPtzApi(cctv.id, {
        action: 'move',
        pan: scaledPan,
        tilt: scaledTilt,
        zoom: scaledZoom,
      });
    } catch (e) {
      console.error('PTZ Move error:', e);
    }
  };

  const sendPtzStop = async () => {
    if (!cctv?.id) return;
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    setIsMoving(false);
    setActiveDirection(null);
    try {
      await cctvApi.controlPtzApi(cctv.id, { action: 'stop' });
    } catch (e) {
      console.error('PTZ Stop error:', e);
    }
  };

  // Trigger pergerakan tombol PTZ (Mencegah bentrok event onClick & onMouseDown)
  const handleStepClick = (pan, tilt, zoom, dirName) => {
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    sendPtzMove(pan, tilt, zoom, dirName);
    stepTimerRef.current = setTimeout(() => {
      sendPtzStop();
    }, stepDuration);
  };

  const handleHoldStart = (pan, tilt, zoom, dirName) => {
    if (stepTimerRef.current) {
      clearTimeout(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    sendPtzMove(pan, tilt, zoom, dirName);
  };

  const handleHoldEnd = () => {
    sendPtzStop();
  };

  const getPtzButtonProps = (pan, tilt, zoom, dirName) => {
    if (moveMode === 'step') {
      return {
        onClick: () => handleStepClick(pan, tilt, zoom, dirName),
      };
    }
    return {
      onMouseDown: () => handleHoldStart(pan, tilt, zoom, dirName),
      onMouseUp: handleHoldEnd,
      onMouseLeave: handleHoldEnd,
      onTouchStart: (e) => {
        e.preventDefault();
        handleHoldStart(pan, tilt, zoom, dirName);
      },
      onTouchEnd: (e) => {
        e.preventDefault();
        handleHoldEnd();
      },
    };
  };

  const handlePtzPreset = async (presetId) => {
    if (!cctv?.id) return;
    try {
      await cctvApi.gotoPresetApi(cctv.id, presetId);
    } catch (e) {
      alert(`Gagal memanggil preset ${presetId}: ${e.message}`);
    }
  };

  // Sinkronisasi waktu kamera
  const handleSyncTime = async () => {
    if (!cctv?.id) return;
    setSyncingTime(true);
    setTimeMsg('');
    try {
      const res = await cctvApi.syncCameraTimeApi(cctv.id);
      if (res.success) {
        setTimeMsg(`✅ Berhasil! Jam kamera telah disinkronkan ke ${res.syncedTime || 'waktu saat ini'} & sinkronisasi otomatis (NTP) aktif.`);
      } else {
        setTimeMsg(`⚠️ Gagal: ${res.error || res.message || 'Kamera menolak perintah sinkronisasi waktu'}`);
      }
    } catch (err) {
      setTimeMsg(`❌ Error: ${err.message}`);
    } finally {
      setSyncingTime(false);
    }
  };

  // Ubah keterangan nama OSD kamera
  const handleSaveOsd = async (e) => {
    e?.preventDefault();
    if (!cctv?.id || !osdTitle.trim()) return;
    setSavingOsd(true);
    setOsdMsg('');
    try {
      const res = await cctvApi.setCameraOsdNameApi(cctv.id, osdTitle.trim());
      if (res.success) {
        setOsdMsg(`✅ Keterangan di layar CCTV berhasil diubah menjadi "${osdTitle.trim()}"!`);
      } else {
        setOsdMsg(`⚠️ Gagal: ${res.error || res.message || 'Kamera tidak merespons perubahan OSD'}`);
      }
    } catch (err) {
      setOsdMsg(`❌ Error: ${err.message}`);
    } finally {
      setSavingOsd(false);
    }
  };

  const handleReboot = async () => {
    if (!window.confirm(`Yakin ingin me-restart kamera "${cctv.name}" (${cctv.ip})? Kamera akan offline selama 1-2 menit.`)) {
      return;
    }
    setRebooting(true);
    setRebootMsg('');
    try {
      const res = await cctvApi.rebootCctvApi(cctv.id);
      if (res.success) {
        setRebootMsg('✅ Perintah restart berhasil dikirim ke CCTV!');
      } else {
        setRebootMsg(`⚠️ Gagal: ${res.error || res.message}`);
      }
    } catch (e) {
      setRebootMsg(`❌ Error: ${e.message}`);
    } finally {
      setRebooting(false);
    }
  };

  const openExternalBrowser = () => {
    if (!proxyUrl) return;
    window.open(proxyUrl, '_blank');
  };

  if (!cctv) return null;

  const streamUrl = cctv.rtsp_url ? cctvApi.buildStreamUrl(cctv.id, cctv.rtsp_url) : null;

  return (
    <div className="fixed inset-0 z-[55] pointer-events-none">
      <div
        id={`cctv-control-modal-${cctv?.id}`}
        className="pointer-events-auto absolute bg-[#0a0d14] border border-indigo-500/30 rounded-xl shadow-2xl overflow-hidden shadow-black ring-1 ring-indigo-500/20 flex flex-col cctv-reticle-box"
        style={{ left: position.x, top: position.y, width: size.w, height: size.h }}
      >
        {/* Header Modal */}
        <div
          role="presentation"
          {...dragHandlers}
          className="flex justify-between items-center bg-[#0e121a] px-4 py-3 border-b border-white/10 cursor-grab active:cursor-grabbing select-none"
          title="Seret untuk memindahkan"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <GripVertical size={18} className="text-slate-500 shrink-0" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-slate-100 truncate">
                  {cctv.name}
                </span>
                <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full uppercase ${
                  cctv.status === 'online' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {cctv.status || 'offline'}
                </span>
                <span className="text-[11px] text-slate-400 bg-slate-700/50 px-2 py-0.5 rounded">
                  {cctv.merk || 'CCTV'} {cctv.jenis ? `(${cctv.jenis})` : ''}
                </span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-0.5">
                IP: <span className="text-sky-300 font-mono">{cctv.ip}</span>
                {cctv.type ? ` • Tipe: ${cctv.type}` : ''}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="relative z-50 flex items-center gap-1.5 shrink-0 pointer-events-auto">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openExternalBrowser();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="p-2 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-700 transition-colors cursor-pointer min-w-[34px] min-h-[34px] flex items-center justify-center"
              title="Buka Web UI Asli Kamera di Tab Baru"
            >
              <ExternalLink size={16} />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsFullscreen(!isFullscreen);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors cursor-pointer min-w-[34px] min-h-[34px] flex items-center justify-center"
              title={isFullscreen ? 'Kecilkan' : 'Perbesar'}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-red-600/30 active:bg-red-600/50 transition-colors cursor-pointer min-w-[34px] min-h-[34px] flex items-center justify-center border border-white/5 hover:border-red-500/40"
              title="Tutup Modal"
              aria-label="Tutup"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex bg-slate-950/80 px-4 border-b border-slate-800 gap-2 select-none">
          <button
            type="button"
            onClick={() => setActiveTab('ptz')}
            className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'ptz'
                ? 'border-sky-500 text-sky-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders size={14} />
            Kontrol PTZ & Kamera
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'settings'
                ? 'border-sky-500 text-sky-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock size={14} />
            Waktu & Keterangan OSD
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'system'
                ? 'border-sky-500 text-sky-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Power size={14} />
            Aksi & Reboot
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 bg-slate-900/90 overflow-y-auto p-4 select-none">
          {/* TAB 1: PTZ CONTROLLER */}
          {activeTab === 'ptz' && (
            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 h-full items-start">
              {/* Kolom Kiri: Live Stream Video Preview */}
              <div className="md:col-span-7 flex flex-col gap-2">
                {cctv.jenis === 'Fixed' && (
                  <div className="bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-lg text-[11px] text-amber-300 flex items-center gap-1.5">
                    <Info size={13} className="shrink-0" />
                    <span>Kamera Fixed: Mendukung Motorized Zoom In/Out. Tidak memiliki motor putar horizontal/vertikal.</span>
                  </div>
                )}

                <div className="relative aspect-video bg-black rounded-lg overflow-hidden border border-slate-800 shadow-inner flex items-center justify-center">
                  {streamUrl ? (
                    <img
                      src={streamUrl}
                      alt={cctv.name}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="text-center p-4 text-slate-500">
                      <Video size={36} className="mx-auto mb-2 opacity-50" />
                      <p className="text-xs">Streaming RTSP tidak tersedia</p>
                    </div>
                  )}

                  {/* Indicator Pergerakan di atas video */}
                  {isMoving && (
                    <div className="absolute top-3 left-3 bg-sky-500/90 text-white text-[11px] font-semibold px-2.5 py-1 rounded shadow-lg animate-pulse flex items-center gap-1.5">
                      <RotateCw size={12} className="animate-spin" />
                      Menggeser: {activeDirection} {moveMode === 'step' ? '(Auto-Stop)' : ''}
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 text-center">
                  💡 <strong>Mode {moveMode === 'step' ? 'Otomatis' : 'Tahan'}:</strong> {moveMode === 'step' ? 'Klik sekali tombol panah untuk menggeser kamera satu langkah terukur.' : 'Tekan & tahan tombol untuk menggeser, lepas untuk berhenti.'}
                </p>
              </div>

              {/* Kolom Kanan: D-Pad & Zoom Controls */}
              <div className="md:col-span-5 flex flex-col items-center bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
                {/* Pilihan Mode Geser (Klik Sekali vs Tahan) */}
                <div className="w-full mb-3 flex items-center justify-between bg-slate-900 p-1.5 rounded-lg border border-slate-800 text-[11px]">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setMoveMode('step')}
                      className={`px-2 py-1 rounded flex items-center gap-1 font-medium transition ${
                        moveMode === 'step'
                          ? 'bg-sky-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Klik sekali langsung geser satu langkah terukur lalu otomatis berhenti"
                    >
                      <MousePointer size={12} />
                      Klik Sekali Geser
                    </button>
                    <button
                      type="button"
                      onClick={() => setMoveMode('hold')}
                      className={`px-2 py-1 rounded flex items-center gap-1 font-medium transition ${
                        moveMode === 'hold'
                          ? 'bg-sky-600 text-white shadow'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Tekan dan tahan untuk menggeser secara manual"
                    >
                      <Hand size={12} />
                      Tahan
                    </button>
                  </div>

                  {moveMode === 'step' && (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setStepDuration(600)}
                        className={`px-1.5 py-0.5 rounded text-[10px] ${stepDuration === 600 ? 'bg-slate-700 text-sky-300 font-bold' : 'text-slate-500'}`}
                      >
                        Halus
                      </button>
                      <button
                        type="button"
                        onClick={() => setStepDuration(1200)}
                        className={`px-1.5 py-0.5 rounded text-[10px] ${stepDuration === 1200 ? 'bg-slate-700 text-sky-300 font-bold' : 'text-slate-500'}`}
                      >
                        Sedang
                      </button>
                      <button
                        type="button"
                        onClick={() => setStepDuration(2000)}
                        className={`px-1.5 py-0.5 rounded text-[10px] ${stepDuration === 2000 ? 'bg-slate-700 text-sky-300 font-bold' : 'text-slate-500'}`}
                      >
                        Jauh
                      </button>
                    </div>
                  )}
                </div>

                {/* D-PAD JOYSTICK GRID */}
                <div className="grid grid-cols-3 gap-2 w-48 h-48 mb-4">
                  {/* Diagonal Up-Left */}
                  <button
                    type="button"
                    {...getPtzButtonProps(-60, 60, 0, 'Kiri-Atas')}
                    className="flex items-center justify-center rounded-lg bg-slate-800 hover:bg-sky-600 active:bg-sky-700 text-slate-300 hover:text-white transition border border-slate-700/60 shadow"
                    title="Kiri Atas"
                  >
                    <ArrowUpLeft size={20} />
                  </button>

                  {/* Up */}
                  <button
                    type="button"
                    {...getPtzButtonProps(0, 70, 0, 'Atas')}
                    className="flex items-center justify-center rounded-lg bg-slate-800 hover:bg-sky-600 active:bg-sky-700 text-slate-200 hover:text-white transition border border-slate-700/60 shadow"
                    title="Atas"
                  >
                    <ArrowUp size={24} />
                  </button>

                  {/* Diagonal Up-Right */}
                  <button
                    type="button"
                    {...getPtzButtonProps(60, 60, 0, 'Kanan-Atas')}
                    className="flex items-center justify-center rounded-lg bg-slate-800 hover:bg-sky-600 active:bg-sky-700 text-slate-300 hover:text-white transition border border-slate-700/60 shadow"
                    title="Kanan Atas"
                  >
                    <ArrowUpRight size={20} />
                  </button>

                  {/* Left */}
                  <button
                    type="button"
                    {...getPtzButtonProps(-70, 0, 0, 'Kiri')}
                    className="flex items-center justify-center rounded-lg bg-slate-800 hover:bg-sky-600 active:bg-sky-700 text-slate-200 hover:text-white transition border border-slate-700/60 shadow"
                    title="Kiri"
                  >
                    <ArrowLeft size={24} />
                  </button>

                  {/* Center / Stop */}
                  <button
                    type="button"
                    onClick={sendPtzStop}
                    className="flex items-center justify-center rounded-lg bg-rose-600/80 hover:bg-rose-500 active:bg-rose-700 text-white transition border border-rose-500/50 shadow"
                    title="Stop (Berhenti)"
                  >
                    <Square size={18} fill="currentColor" />
                  </button>

                  {/* Right */}
                  <button
                    type="button"
                    {...getPtzButtonProps(70, 0, 0, 'Kanan')}
                    className="flex items-center justify-center rounded-lg bg-slate-800 hover:bg-sky-600 active:bg-sky-700 text-slate-200 hover:text-white transition border border-slate-700/60 shadow"
                    title="Kanan"
                  >
                    <ArrowRight size={24} />
                  </button>

                  {/* Diagonal Down-Left */}
                  <button
                    type="button"
                    {...getPtzButtonProps(-60, -60, 0, 'Kiri-Bawah')}
                    className="flex items-center justify-center rounded-lg bg-slate-800 hover:bg-sky-600 active:bg-sky-700 text-slate-300 hover:text-white transition border border-slate-700/60 shadow"
                    title="Kiri Bawah"
                  >
                    <ArrowDownLeft size={20} />
                  </button>

                  {/* Down */}
                  <button
                    type="button"
                    {...getPtzButtonProps(0, -70, 0, 'Bawah')}
                    className="flex items-center justify-center rounded-lg bg-slate-800 hover:bg-sky-600 active:bg-sky-700 text-slate-200 hover:text-white transition border border-slate-700/60 shadow"
                    title="Bawah"
                  >
                    <ArrowDown size={24} />
                  </button>

                  {/* Diagonal Down-Right */}
                  <button
                    type="button"
                    {...getPtzButtonProps(60, -60, 0, 'Kanan-Bawah')}
                    className="flex items-center justify-center rounded-lg bg-slate-800 hover:bg-sky-600 active:bg-sky-700 text-slate-300 hover:text-white transition border border-slate-700/60 shadow"
                    title="Kanan Bawah"
                  >
                    <ArrowDownRight size={20} />
                  </button>
                </div>

                {/* ZOOM CONTROLS */}
                <div className="w-full flex items-center justify-center gap-3 pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    {...getPtzButtonProps(0, 0, 60, 'Zoom In')}
                    className="flex-1 py-2 px-3 bg-slate-800 hover:bg-emerald-600 active:bg-emerald-700 text-emerald-300 hover:text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 border border-emerald-600/30 transition shadow"
                  >
                    <ZoomIn size={16} />
                    Zoom In
                  </button>

                  <button
                    type="button"
                    {...getPtzButtonProps(0, 0, -60, 'Zoom Out')}
                    className="flex-1 py-2 px-3 bg-slate-800 hover:bg-amber-600 active:bg-amber-700 text-amber-300 hover:text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 border border-amber-600/30 transition shadow"
                  >
                    <ZoomOut size={16} />
                    Zoom Out
                  </button>
                </div>

                {/* PRESET POSISI PINTAS */}
                <div className="w-full pt-3 mt-3 border-t border-slate-800">
                  <span className="text-[11px] text-slate-400 block text-center mb-1.5 font-medium">
                    Pintasan Posisi Preset
                  </span>
                  {deviceInfo?.presets && deviceInfo.presets.length > 0 ? (
                    <div className="grid grid-cols-2 gap-1.5">
                      {deviceInfo.presets.slice(0, 6).map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handlePtzPreset(p.id)}
                          className="py-1.5 px-2 bg-slate-800/80 hover:bg-sky-600 text-slate-300 hover:text-white text-xs font-medium rounded border border-slate-700/50 transition truncate text-center"
                          title={p.name}
                        >
                          {p.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-1.5">
                      {[1, 2, 3, 4].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => handlePtzPreset(num)}
                          className="py-1.5 bg-slate-800/80 hover:bg-sky-600 text-slate-300 hover:text-white text-xs font-medium rounded border border-slate-700/50 transition"
                        >
                          Arah {num}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SETTINGS (WAKTU & OSD TITLE) */}
          {activeTab === 'settings' && (
            <div className="max-w-xl mx-auto space-y-5">
              {/* Card 1: Sinkronisasi Jam & Waktu Kamera */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                    <Clock size={16} className="text-sky-400" />
                    Sinkronisasi Jam & Waktu Kamera
                  </h4>
                  <span className="text-[11px] font-mono bg-slate-800 text-sky-300 px-2.5 py-0.5 rounded">
                    Waktu Server: {currentTimeStr}
                  </span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Menyelaraskan jam internal CCTV dengan waktu server/PC saat ini serta mengaktifkan sinkronisasi otomatis NTP (Network Time Protocol) agar jam kamera tidak kembali ke tahun lama saat mati listrik.
                </p>

                <button
                  type="button"
                  onClick={handleSyncTime}
                  disabled={syncingTime}
                  className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 active:bg-sky-700 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition shadow flex items-center justify-center gap-2"
                >
                  <RefreshCw size={15} className={syncingTime ? 'animate-spin' : ''} />
                  {syncingTime ? 'Menyinkronkan Waktu...' : 'Sinkronkan Jam Kamera Sekarang (Otomatis)'}
                </button>

                {timeMsg && (
                  <div className={`mt-3 p-3 rounded-lg text-xs border ${
                    timeMsg.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  }`}>
                    {timeMsg}
                  </div>
                )}
              </div>

              {/* Card 2: Ubah Keterangan Tulisan OSD di Layar Kamera */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                <h4 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
                  <Type size={16} className="text-emerald-400" />
                  Keterangan Teks di Layar CCTV (OSD Overlay)
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed mb-3">
                  Ubah tulisan default pabrikan (seperti tulisan <em>"Camera 01"</em>) yang tertempel di rekaman video menjadi nama lokasi CCTV yang resmi.
                </p>

                <form onSubmit={handleSaveOsd} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Teks Keterangan di Layar Video:
                    </label>
                    <input
                      type="text"
                      value={osdTitle}
                      onChange={(e) => setOsdTitle(e.target.value)}
                      placeholder="Contoh: BUNDARAN PURWOSARI"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingOsd || !osdTitle.trim()}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition shadow flex items-center justify-center gap-2"
                  >
                    <CheckCircle size={15} />
                    {savingOsd ? 'Menyimpan ke Kamera...' : 'Terapkan Nama ke Layar CCTV'}
                  </button>
                </form>

                {osdMsg && (
                  <div className={`mt-3 p-3 rounded-lg text-xs border ${
                    osdMsg.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                  }`}>
                    {osdMsg}
                  </div>
                )}
              </div>

              {/* Card 3: Identitas & Driver Integrasi */}
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800 text-xs">
                <h4 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                  <ShieldCheck size={16} className="text-purple-400" />
                  Identitas Hardware & Driver
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-500 block">Merk & Model:</span>
                    <span className="font-semibold text-slate-200">{cctv.merk || '-'} {cctv.type || ''}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Jenis Hardware:</span>
                    <span className="font-semibold text-slate-200">{cctv.jenis || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Alamat IP:</span>
                    <span className="font-mono text-sky-300">{cctv.ip}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Driver Aktif:</span>
                    <span className="font-semibold text-emerald-400">
                      {deviceInfo?.driver || (cctv.merk === 'Sony' ? 'Sony CGI Driver' : 'Hikvision ISAPI Driver')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SYSTEM & REBOOT */}
          {activeTab === 'system' && (
            <div className="max-w-xl mx-auto space-y-5">
              <div className="bg-slate-950/70 p-4 rounded-xl border border-slate-800">
                <h4 className="text-sm font-semibold text-slate-200 mb-1 flex items-center gap-2">
                  <Power size={16} className="text-rose-400" />
                  Restart / Reboot CCTV dari Jarak Jauh
                </h4>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Kirim perintah reboot langsung ke sistem CCTV tanpa perlu mendatangi lokasi tiang CCTV. Kamera akan me-restart layanannya dan aktif kembali dalam 1–2 menit.
                </p>

                <button
                  type="button"
                  onClick={handleReboot}
                  disabled={rebooting}
                  className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 disabled:opacity-50 text-white font-semibold text-xs rounded-lg transition shadow flex items-center justify-center gap-2"
                >
                  <Power size={16} className={rebooting ? 'animate-spin' : ''} />
                  {rebooting ? 'Mengirim Perintah Reboot...' : `Restart Kamera ${cctv.name}`}
                </button>

                {rebootMsg && (
                  <div className="mt-4 p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300">
                    {rebootMsg}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Resize Handles */}
        <ResizeHandles onResize={startResize} onStartResize={startResize} />
      </div>
    </div>
  );
}
