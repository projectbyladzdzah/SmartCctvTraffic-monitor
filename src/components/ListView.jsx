import React from 'react';
import { Edit, Globe, Router, Search, Terminal, Trash2, Video, Wifi, WifiOff, X } from 'lucide-react';

export default function ListView({
  searchTerm,
  setSearchTerm,
  sortedAndFilteredCctvs,
  isBackendOnline,
  isAdmin = false,
  onOpenTerminalPing,
  onOpenGatewayPing,
  onOpenMonitor,
  onOpenIPConfig,
  handleDelete,
  handleEdit,
}) {
  return (
    <section className="panel cctv-reticle-box overflow-hidden">
      {/* Header bar: Title + Search & Telemetry Count */}
      <div className="flex flex-col gap-3 p-3 sm:p-4 md:flex-row md:items-center md:justify-between border-b border-white/5">
        <div>
          <div className="flex items-center gap-2">
            <span className="cctv-online-dot" />
            <p className="font-telemetry text-[9px] font-bold uppercase tracking-[0.2em] text-indigo-400">
              Perimeter Surveillance Table
            </p>
          </div>
          <h2 className="mt-0.5 text-base font-bold text-white tracking-wide">
            Daftar Perangkat CCTV
          </h2>
        </div>

        {/* Tactical Search input */}
        <div className="relative w-full md:max-w-[280px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
            size={14}
          />
          <input
            id="cctv-search"
            type="text"
            placeholder="Filter nama, IP, ID..."
            className="field pl-9 pr-8 font-telemetry text-xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Telemetry sub-header: Unit count & Link status */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 sm:px-4 bg-slate-950/50 border-b border-white/5 font-telemetry">
        <span className="text-xs text-slate-400 flex items-center gap-1.5">
          <span className="text-slate-200 font-bold font-mono">{sortedAndFilteredCctvs.length}</span>
          <span>UNIT TERDAFTAR</span>
        </span>

        <span
          className={`px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded border flex items-center gap-1.5 ${
            isBackendOnline
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          <span className={isBackendOnline ? 'cctv-online-dot' : 'cctv-rec-dot'} />
          {isBackendOnline ? 'GATEWAY LINK ACTIVE' : 'GATEWAY UNREACHABLE'}
        </span>
      </div>

      {/* Table container */}
      <div className="overflow-hidden bg-[#07090e]">
        <div className="max-h-[65vh] overflow-y-auto">

          {/* Desktop Surveillance Table */}
          <div className="hidden md:block">
            <table className="min-w-full border-collapse text-left">
              <thead className="sticky top-0 z-10 bg-[#0c1018] border-b border-white/10">
                <tr className="font-telemetry text-[9px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  <th className="px-4 py-3 w-12 text-center">No</th>
                  <th className="px-4 py-3">Perangkat Kamera</th>
                  <th className="px-4 py-3">Spesifikasi Hardware</th>
                  <th className="px-4 py-3">Telemetri Jaringan (IP / GW)</th>
                  <th className="px-4 py-3 text-center">Status Link</th>
                  <th className="px-4 py-3 text-center">Aksi Kendali</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-sans">
                {sortedAndFilteredCctvs.length === 0 ? (
                  <tr>
                    <td
                      colSpan="6"
                      className="px-4 py-14 text-center text-sm font-telemetry text-slate-500"
                    >
                      {isBackendOnline ? 'Tidak ada data kamera yang cocok.' : 'Gagal terhubung ke backend server.'}
                    </td>
                  </tr>
                ) : (
                  sortedAndFilteredCctvs.map((cctv, index) => (
                    <tr
                      key={cctv.id}
                      className="transition-colors duration-150 hover:bg-[#121622] group"
                    >
                      {/* Number */}
                      <td className="px-4 py-3 text-center font-telemetry font-mono text-xs text-slate-500 group-hover:text-slate-300">
                        {String(index + 1).padStart(2, '0')}
                      </td>

                      {/* Name & ID */}
                      <td className="px-4 py-3">
                        <div className="text-xs font-bold text-white group-hover:text-indigo-200 transition-colors">
                          {cctv.name}
                        </div>
                        <div className="mt-0.5 font-telemetry font-mono text-[10px] text-slate-500">
                          CAM ID #{cctv.id}
                        </div>
                      </td>

                      {/* Specs */}
                      <td className="px-4 py-3 text-xs text-slate-300">
                        <div className="font-medium text-slate-200">{cctv.merk || '—'}</div>
                        <div className="mt-0.5 font-telemetry text-[10px] text-slate-500">{cctv.jenis} · {cctv.type}</div>
                      </td>

                      {/* IP & Gateway */}
                      <td className="px-4 py-3 text-xs font-telemetry font-mono">
                        <div className="text-slate-200 font-semibold flex items-center gap-1.5">
                          <span className="h-1.5 w-1.5 rounded-full bg-indigo-400/80" />
                          <span>{cctv.ip}</span>
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500 pl-3">
                          GW: {cctv.gateway || '—'}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3 text-center">
                        {cctv.status === 'online' ? (
                          <span className="badge-online shadow-sm">
                            <span className="cctv-online-dot" />
                            ONLINE
                          </span>
                        ) : (
                          <span className="badge-offline shadow-sm">
                            <span className="cctv-rec-dot" />
                            OFFLINE
                          </span>
                        )}
                      </td>

                      {/* Action buttons */}
                      <td className="px-4 py-3">
                        <div className="flex justify-center items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onOpenTerminalPing(cctv)}
                            className="action-btn"
                            title="Ping CCTV (Terminal)"
                            style={{ color: '#60a5fa' }}
                          >
                            <Terminal size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenGatewayPing(cctv)}
                            className="action-btn"
                            title={cctv.gateway ? 'Ping Gateway' : 'Gateway belum disetel'}
                            disabled={!cctv.gateway}
                            style={{ color: cctv.gateway ? '#fbbf24' : undefined }}
                          >
                            <Router size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() => onOpenMonitor(cctv)}
                            className="action-btn"
                            title={cctv.rtsp_url ? 'Monitor Stream Tunggal' : 'RTSP URL belum diisi'}
                            disabled={!cctv.rtsp_url}
                            style={{ color: cctv.rtsp_url ? '#a78bfa' : undefined }}
                          >
                            <Video size={13} />
                          </button>

                          {isAdmin && (
                            <>
                              <button
                                type="button"
                                onClick={() => onOpenIPConfig(cctv)}
                                className="action-btn"
                                title="Kontrol & Konfigurasi IP"
                                style={{ color: '#34d399' }}
                              >
                                <Globe size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEdit(cctv)}
                                className="action-btn"
                                title="Edit Perangkat"
                                style={{ color: '#fbbf24' }}
                              >
                                <Edit size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDelete(cctv.id)}
                                className="action-btn"
                                title="Hapus Perangkat"
                                style={{ color: '#f87171' }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Tactical Cards */}
          <div className="space-y-2.5 p-3 md:hidden">
            {sortedAndFilteredCctvs.length === 0 ? (
              <div className="py-10 text-center text-xs font-telemetry text-slate-500">
                {isBackendOnline ? 'Tidak ada data kamera yang cocok.' : 'Gagal terhubung ke backend.'}
              </div>
            ) : (
              sortedAndFilteredCctvs.map((cctv) => (
                <div
                  key={cctv.id}
                  className="p-3 rounded-xl border border-white/5 bg-[#0e121a] cctv-reticle-box space-y-2.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs font-bold text-white">
                        {cctv.name}
                      </div>
                      <div className="mt-0.5 font-telemetry font-mono text-[10px] text-indigo-300">
                        {cctv.ip} · #{cctv.id}
                      </div>
                    </div>

                    {cctv.status === 'online' ? (
                      <span className="badge-online">
                        <span className="cctv-online-dot" />
                        ONLINE
                      </span>
                    ) : (
                      <span className="badge-offline">
                        <span className="cctv-rec-dot" />
                        OFFLINE
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-slate-400 font-telemetry">
                    {cctv.merk || '—'} · {cctv.jenis} · {cctv.type}
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-2 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => onOpenTerminalPing(cctv)}
                      className="action-btn"
                      title="Ping CCTV"
                      style={{ color: '#60a5fa' }}
                    >
                      <Terminal size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenGatewayPing(cctv)}
                      className="action-btn"
                      disabled={!cctv.gateway}
                      title={cctv.gateway ? 'Ping Gateway' : 'Gateway kosong'}
                      style={{ color: cctv.gateway ? '#fbbf24' : undefined }}
                    >
                      <Router size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenMonitor(cctv)}
                      className="action-btn"
                      disabled={!cctv.rtsp_url}
                      title={cctv.rtsp_url ? 'Monitor' : 'RTSP URL kosong'}
                      style={{ color: cctv.rtsp_url ? '#a78bfa' : undefined }}
                    >
                      <Video size={13} />
                    </button>

                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => onOpenIPConfig(cctv)}
                          className="action-btn"
                          title="Kontrol IP"
                          style={{ color: '#34d399' }}
                        >
                          <Globe size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(cctv)}
                          className="action-btn"
                          title="Edit"
                          style={{ color: '#fbbf24' }}
                        >
                          <Edit size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(cctv.id)}
                          className="action-btn"
                          title="Hapus"
                          style={{ color: '#f87171' }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </section>
  );
}
