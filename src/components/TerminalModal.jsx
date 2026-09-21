import React, { useCallback, useEffect, useRef } from 'react';
import { Terminal, Router, X, GripVertical } from 'lucide-react';
import { useDraggablePanel } from '../hooks/useDraggablePanel';
import { useResizablePanel } from '../hooks/useResizablePanel';
import ResizeHandles from './ResizeHandles';

function TerminalPingPanel({ sessionId, cctv, targetIp, isGateway = false, logs, stackIndex, onClose }) {
  const endRef = useRef(null);
  const ip = targetIp || (isGateway ? cctv?.gateway : cctv?.ip);

  const getDefaultPosition = useCallback(() => {
    if (typeof window === 'undefined') return { x: 100, y: 100 };
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pw = Math.min(672, w - 32);
    const ph = 380;
    const baseX = Math.max(8, w - pw - 16);
    const baseY = Math.max(8, h - ph - 16);
    const offset = (stackIndex || 0) * 24;
    return { x: baseX + offset, y: baseY + offset };
  }, [stackIndex]);

  const panelW = typeof window !== 'undefined' ? Math.min(672, window.innerWidth - 32) : 672;
  const { position, setPosition, dragHandlers } = useDraggablePanel(sessionId || String(cctv?.id), getDefaultPosition);

  const maxW =
    typeof window !== 'undefined' ? Math.min(760, Math.max(300, window.innerWidth - position.x - 8)) : 760;
  const maxH =
    typeof window !== 'undefined' ? Math.min(620, Math.max(220, window.innerHeight - position.y - 8)) : 620;

  const { size, startResize } = useResizablePanel({
    initialW: Math.min(panelW, maxW),
    initialH: Math.min(380, maxH),
    minW: 320,
    minH: 240,
    maxW,
    maxH,
    onResize: ({ deltaX, deltaY }) => {
      if (deltaX || deltaY) {
        setPosition((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
      }
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handleClose = (e) => {
    e?.stopPropagation?.();
    onClose(sessionId || cctv?.id);
  };

  return (
    <div className="fixed inset-0 z-[60] pointer-events-none">
      <div
        className="pointer-events-auto absolute bg-[#0a0d14] border border-indigo-500/30 rounded-xl shadow-2xl overflow-hidden shadow-black ring-1 ring-indigo-500/20 flex flex-col relative cctv-reticle-box"
        style={{ left: position.x, top: position.y, width: size.w, height: size.h }}
      >
        <div
          role="presentation"
          {...dragHandlers}
          className="flex justify-between items-center bg-[#0e121a] px-3.5 py-2.5 border-b border-white/10 cursor-grab active:cursor-grabbing select-none"
          title="Seret untuk memindahkan panel"
        >
          <div className="flex items-center gap-2 text-slate-200 min-w-0 flex-1">
            <GripVertical size={18} className="text-slate-500 shrink-0" />
            {isGateway ? (
              <Router size={18} className="text-amber-400 shrink-0" />
            ) : (
              <Terminal size={18} className="text-blue-400 shrink-0" />
            )}
            <span className="font-mono text-xs font-bold tracking-widest truncate">
              CMD: PING {isGateway ? `GATEWAY ${ip}` : ip}
              {cctv?.name ? ` · ${cctv.name}` : ''}
            </span>
            <span
              className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0 ${
                isGateway
                  ? 'bg-amber-500/20 border border-amber-500/30 text-amber-300'
                  : 'bg-blue-500/20 border border-blue-500/30 text-blue-300'
              }`}
            >
              {isGateway ? 'Gateway' : 'CCTV'}
            </span>
          </div>
          <div className="relative z-50 flex items-center gap-2 shrink-0 pointer-events-auto">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClose(e);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-red-600/30 active:bg-red-600/50 transition-colors cursor-pointer min-w-[34px] min-h-[34px] flex items-center justify-center border border-white/5 hover:border-red-500/40"
              title="Tutup Terminal"
              aria-label="Tutup"
            >
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="p-6 flex-1 overflow-y-auto bg-black text-emerald-500 font-mono text-xs flex flex-col gap-1 leading-relaxed scrollbar-hide">
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
          <div ref={endRef} />
        </div>
        <div className="bg-slate-800 p-2 text-[10px] text-slate-500 text-center font-mono">
          Boleh buka beberapa ping sekaligus · Seret header · Tutup dengan silang
        </div>

        <ResizeHandles onResize={startResize} />
      </div>
    </div>
  );
}

export default function TerminalModal({ terminalSessions, closeTerminalPing }) {
  const entries = Object.entries(terminalSessions);
  if (entries.length === 0) return null;

  return (
    <>
      {entries.map(([id, session], stackIndex) => (
        <TerminalPingPanel
          key={id}
          sessionId={id}
          cctv={session.cctv}
          targetIp={session.targetIp}
          isGateway={session.isGateway}
          logs={session.logs}
          stackIndex={stackIndex}
          onClose={closeTerminalPing}
        />
      ))}
    </>
  );
}
