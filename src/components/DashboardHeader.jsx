import React from 'react';
import { Radio } from 'lucide-react';

export default function DashboardHeader({
  isBackendOnline,
  sortMode,
  setSortMode,
  stats,
  isAutoPing,
  setIsAutoPing,
}) {
  return (
    <section className="panel px-3.5 py-2.5 sm:px-4 sm:py-2.5 cctv-reticle-box">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        
        {/* Left side: System Status & Clickable Stats Badges */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
          {/* Operational Status Tag */}
          <span
            className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-md"
            style={{
              background: isBackendOnline ? 'rgba(16, 185, 129, 0.12)' : 'rgba(248, 113, 113, 0.12)',
              border: `1px solid ${isBackendOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(248, 113, 113, 0.3)'}`,
              color: isBackendOnline ? 'var(--online)' : 'var(--offline)',
            }}
          >
            <span className={isBackendOnline ? 'cctv-online-dot' : 'cctv-rec-dot'} />
            <span>{isBackendOnline ? 'SYSTEM OPERATIONAL' : 'BACKEND OFFLINE'}</span>
          </span>

          <span className="hidden sm:inline-block h-3.5 w-[1px] bg-white/10" />

          {/* Inline Clickable Metric Filter Badges */}
          <div className="flex items-center gap-1.5 font-telemetry">
            <button
              type="button"
              id="stat-filter-total"
              onClick={() => setSortMode('total')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider border transition-all duration-150 ${
                sortMode === 'total'
                  ? 'bg-indigo-500/25 border-indigo-400 text-indigo-200 shadow-[0_0_10px_rgba(129,140,248,0.3)]'
                  : 'bg-slate-900/80 border-white/5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
              }`}
              title="Filter: Semua CCTV"
            >
              TOTAL: <span className="text-white font-mono font-bold ml-0.5">{stats.total}</span>
            </button>

            <button
              type="button"
              id="stat-filter-online"
              onClick={() => setSortMode('online')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider border transition-all duration-150 ${
                sortMode === 'online'
                  ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                  : 'bg-slate-900/80 border-white/5 text-emerald-400/90 hover:text-emerald-300 hover:bg-slate-800/80'
              }`}
              title="Filter: CCTV Online"
            >
              ONLINE: <span className="font-mono font-bold ml-0.5">{stats.online}</span>
            </button>

            <button
              type="button"
              id="stat-filter-offline"
              onClick={() => setSortMode('offline')}
              className={`px-2.5 py-1 rounded-md text-[10px] font-bold tracking-wider border transition-all duration-150 ${
                sortMode === 'offline'
                  ? 'bg-red-500/25 border-red-400 text-red-200 shadow-[0_0_10px_rgba(248,113,113,0.3)]'
                  : 'bg-slate-900/80 border-white/5 text-red-400/90 hover:text-red-300 hover:bg-slate-800/80'
              }`}
              title="Filter: CCTV Offline"
            >
              OFFLINE: <span className="font-mono font-bold ml-0.5">{stats.offline}</span>
            </button>
          </div>
        </div>

        {/* Right side: Simple & Sleek Tactical Auto Ping Button */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setIsAutoPing(!isAutoPing)}
            className={`inline-flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-semibold font-telemetry transition-all duration-150 border ${
              isAutoPing
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2)] hover:bg-emerald-500/25'
                : 'bg-slate-900/70 border-slate-700/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
            }`}
            title={isAutoPing ? 'Klik untuk mematikan Auto Ping otomatis' : 'Klik untuk mengaktifkan Auto Ping otomatis'}
          >
            <Radio
              size={13}
              className={isAutoPing ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}
            />
            <span className="text-[10px] tracking-wider uppercase">
              AUTO PING: <span className={isAutoPing ? 'text-emerald-200 font-bold' : 'text-slate-500 font-bold'}>{isAutoPing ? 'ON' : 'OFF'}</span>
            </span>
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isAutoPing ? 'cctv-online-dot' : 'bg-slate-600'
              }`}
            />
          </button>
        </div>

      </div>
    </section>
  );
}
