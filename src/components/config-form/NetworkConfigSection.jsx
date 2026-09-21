import React from 'react';

export default function NetworkConfigSection({
  newIp,
  setNewIp,
  newGateway,
  setNewGateway,
  newRtspUrl,
  setNewRtspUrl,
}) {
  return (
    <div>
      <h2 className="text-lg font-bold mb-4 inline-block">
        <span className="bg-slate-800 text-slate-200 text-sm font-semibold mr-2 px-2.5 py-1 rounded-full">
          Konfigurasi Jaringan
        </span>
      </h2>
      <div className="bg-slate-800/50 p-6 rounded-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label htmlFor="ipAddress" className="block text-sm font-semibold text-slate-300 mb-2">IP Address</label>
            <input
              type="text"
              id="ipAddress"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
              value={newIp}
              onChange={(e) => setNewIp(e.target.value)}
              required
            />
          </div>
          <div>
            <label htmlFor="gateway" className="block text-sm font-semibold text-slate-300 mb-2">Gateway</label>
            <input
              type="text"
              id="gateway"
              className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
              value={newGateway}
              onChange={(e) => setNewGateway(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label htmlFor="rtspUrl" className="block text-sm font-semibold text-slate-300 mb-2">RTSP Stream URL</label>
          <input
            type="text"
            id="rtspUrl"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
            value={newRtspUrl}
            onChange={(e) => setNewRtspUrl(e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-2">URL ini digunakan untuk streaming video dari perangkat CCTV.</p>
        </div>
      </div>
    </div>
  );
}
