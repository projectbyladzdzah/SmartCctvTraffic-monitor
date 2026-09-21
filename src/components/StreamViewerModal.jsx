import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Monitor, X, Minimize2, Maximize2, AlertCircle, GripVertical, Radio } from 'lucide-react';
import cctvApi from '../services/cctvApi';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import { useResizablePanel } from '../hooks/useResizablePanel';
import ResizeHandles from './ResizeHandles';

export default function StreamViewerModal({
  cctv,
  displayRtspUrl,
  onClose,
  stopStreamBackend,
  stackIndex = 0,
}) {
  const streamViewerRef = useRef(null);
  const streamRetryRef = useRef(0);
  const [streamRequestNonce, setStreamRequestNonce] = useState(() => Date.now());
  const [streamLoaded, setStreamLoaded] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Real-time timecode for CCTV OSD overlay
  const [osdTime, setOsdTime] = useState(() => {
    return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' WIB';
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setOsdTime(new Date().toISOString().replace('T', ' ').slice(0, 19) + ' WIB');
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const MAX_STREAM_RETRIES = 3;
  const resetKey = String(cctv?.id ?? '');

  const getDefaultPosition = useCallback(() => {
    if (typeof window === 'undefined') return { x: 40, y: 60 };
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cw = Math.min(896, w - 32);
    const baseX = Math.max(8, (w - cw) / 2);
    const baseY = Math.max(16, (h - 520) / 2);
    const offset = (stackIndex || 0) * 28;
    return { x: baseX + offset, y: baseY + offset };
  }, [stackIndex]);

  const panelW = typeof window !== 'undefined' ? Math.min(896, window.innerWidth - 32) : 896;
  const { position, setPosition, dragHandlers } = useDraggablePanel(resetKey, getDefaultPosition);

  const maxW =
    typeof window !== 'undefined' ? Math.min(1100, Math.max(420, window.innerWidth - position.x - 8)) : 1100;
  const maxH =
    typeof window !== 'undefined' ? Math.min(820, Math.max(340, window.innerHeight - position.y - 8)) : 820;

  const { size, startResize } = useResizablePanel({
    initialW: Math.min(panelW, maxW),
    initialH: 520,
    minW: 420,
    minH: 280,
    maxW,
    maxH: Math.min(maxH, 700),
    onResize: ({ deltaX, deltaY }) => {
      if (deltaX || deltaY) {
        setPosition((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
      }
    },
  });

  const handleHeaderMouseDown = useCallback(
    (e) => {
      if (isFullscreen) return;
      dragHandlers.onMouseDown(e);
    },
    [isFullscreen, dragHandlers],
  );

  const handleHeaderTouchStart = useCallback(
    (e) => {
      if (isFullscreen) return;
      dragHandlers.onTouchStart(e);
    },
    [isFullscreen, dragHandlers],
  );

  useEffect(() => {
    return () => {
      if (cctv?.id) stopStreamBackend(cctv.id);
    };
  }, [cctv?.id, stopStreamBackend]);

  const retryStreamLoad = useCallback(() => {
    const nextAttempt = streamRetryRef.current + 1;
    streamRetryRef.current = nextAttempt;

    if (nextAttempt > MAX_STREAM_RETRIES) {
      setStreamLoaded(false);
      setStreamError(true);
      return;
    }

    setStreamLoaded(false);
    setStreamError(false);
    setStreamRequestNonce(Date.now());
  }, [MAX_STREAM_RETRIES]);

  useEffect(() => {
    setStreamLoaded(false);
    setStreamError(false);
    streamRetryRef.current = 0;
  }, [cctv?.rtsp_url, streamRequestNonce]);

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = async () => {
    if (!streamViewerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } else {
        await streamViewerRef.current.requestFullscreen();
        setIsFullscreen(true);
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  };

  const handleClose = () => {
    onClose();
  };

  if (!cctv) return null;

  return (
    <div className="fixed inset-0 z-[55] pointer-events-none">
      <div
        ref={streamViewerRef}
        className="pointer-events-auto absolute bg-[#0a0d14] border border-indigo-500/35 rounded-xl shadow-2xl overflow-hidden shadow-black ring-1 ring-indigo-500/20 flex flex-col relative cctv-reticle-box"
        style={{ left: position.x, top: position.y, width: size.w, height: size.h }}
      >
        {/* Tactical Window Header */}
        <div
          role="presentation"
          onMouseDown={handleHeaderMouseDown}
          onTouchStart={handleHeaderTouchStart}
          className={`flex justify-between items-center bg-[#0e121a] px-3.5 py-2.5 border-b border-white/10 select-none ${
            isFullscreen ? '' : 'cursor-grab active:cursor-grabbing'
          }`}
          title={isFullscreen ? '' : 'Seret untuk memindahkan jendela stream'}
        >
          <div className="flex items-center gap-2.5 text-slate-200 min-w-0 flex-1">
            {!isFullscreen && <GripVertical size={16} className="text-slate-500 shrink-0" />}
            <div className="flex h-6 w-6 items-center justify-center rounded bg-indigo-950/40 border border-indigo-500/30 text-indigo-400">
              <Monitor size={13} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-bold text-xs truncate text-white">{cctv.name}</p>
                <span className="cctv-online-dot" />
              </div>
              <p className="text-[10px] font-telemetry font-mono text-indigo-300 truncate">
                {cctv.ip} · CAM #{cctv.id}
              </p>
            </div>
          </div>

          <div className="relative z-50 flex items-center gap-1.5 shrink-0 pointer-events-auto">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFullscreen();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer min-w-[34px] min-h-[34px] flex items-center justify-center"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-red-600/30 active:bg-red-600/50 transition-colors cursor-pointer min-w-[34px] min-h-[34px] flex items-center justify-center border border-white/5 hover:border-red-500/40"
              title="Tutup Jendela"
              aria-label="Tutup"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Video Viewport with OSD Overlays */}
        <div className="relative bg-black flex-1 overflow-hidden">
          {/* Top Right: LIVE CAM badge */}
          {streamLoaded && (
            <div className="absolute right-3 top-3 z-30 pointer-events-none">
              <div className="cctv-rec-badge shadow-md">
                <span className="cctv-rec-dot" />
                <span>LIVE CAM</span>
              </div>
            </div>
          )}

          {/* Bottom Left: Keterangan Tanggal / Waktu */}
          {streamLoaded && (
            <div className="absolute bottom-3 left-3 z-30 pointer-events-none rounded border border-white/10 bg-black/75 px-2.5 py-1 backdrop-blur-md">
              <p className="font-telemetry font-mono text-[10px] text-emerald-400 tracking-wider">
                {osdTime}
              </p>
            </div>
          )}

          <img
            key={`${cctv.id}-${streamRequestNonce}`}
            src={cctvApi.buildStreamUrl(cctv.id, cctv.rtsp_url, streamRequestNonce)}
            alt={`Stream ${cctv.name}`}
            className="absolute inset-0 w-full h-full object-cover"
            onLoad={() => {
              setStreamLoaded(true);
            }}
            onError={() => {
              setTimeout(() => {
                retryStreamLoad();
              }, 3000);
            }}
          />

          {/* Loading State with Radar Scanner */}
          {!streamLoaded && !streamError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3.5 p-6 text-center z-20 bg-[#07090e] cctv-radar-scanner">
              <div className="relative h-14 w-14 rounded-full border border-indigo-500/30 bg-indigo-950/20 flex items-center justify-center">
                <Radio size={24} className="text-indigo-400 animate-pulse" />
              </div>
              <div>
                <p className="font-telemetry text-xs font-bold uppercase tracking-widest text-indigo-200">
                  CONNECTING RTSP STREAM...
                </p>
                <p className="mt-1 font-telemetry font-mono text-[10px] text-slate-400">
                  Target Host: {cctv.ip}
                </p>
              </div>
              <span className="font-telemetry font-mono bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded max-w-md break-all text-[9px] text-slate-500">
                {displayRtspUrl || cctv.rtsp_url}
              </span>
            </div>
          )}

          {/* Error State */}
          {streamError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center z-20 bg-[#07090e]">
              <AlertCircle size={48} className="text-red-400" />
              <p className="font-telemetry text-xs font-bold uppercase tracking-wider text-red-300">
                STREAM CONNECTION TIMEOUT
              </p>
              <p className="text-slate-400 text-xs max-w-xs">
                Kamera tidak merespon feed RTSP. Pastikan IP dan port RTSP dapat dijangkau.
              </p>
              <button
                type="button"
                onClick={async () => {
                  if (cctv?.id) await stopStreamBackend(cctv.id);
                  streamRetryRef.current = 0;
                  setStreamLoaded(false);
                  setStreamError(false);
                  setStreamRequestNonce(Date.now());
                }}
                className="mt-2 px-4 py-2 font-telemetry text-xs font-bold uppercase tracking-wider bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all"
              >
                Coba Ulang Koneksi
              </button>
            </div>
          )}
        </div>

        {!isFullscreen && (
          <ResizeHandles onResize={startResize} />
        )}
      </div>
    </div>
  );
}
