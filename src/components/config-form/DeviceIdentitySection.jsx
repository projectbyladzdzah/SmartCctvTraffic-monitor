import React from 'react';

export default function DeviceIdentitySection({
  newName,
  setNewName,
  newMerk,
  setNewMerk,
  newJenis,
  setNewJenis,
  newType,
  setNewType,
}) {
  return (
    <div className="mb-10">
      <div className="mb-6">
        <label htmlFor="deviceName" className="block text-sm font-semibold text-slate-300 mb-2">
          Nama/Lokasi Perangkat
        </label>
        <input
          type="text"
          id="deviceName"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
          placeholder="Contoh: CCTV Teras Depan"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          required
        />
        <p className="text-xs text-slate-500 mt-2">Berikan nama yang deskriptif untuk memudahkan identifikasi.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div>
          <label htmlFor="brand" className="block text-sm font-semibold text-slate-300 mb-2">Merk</label>
          <input
            type="text"
            id="brand"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
            value={newMerk}
            onChange={(e) => setNewMerk(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="type" className="block text-sm font-semibold text-slate-300 mb-2">Jenis</label>
          <input
            type="text"
            id="type"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
            value={newJenis}
            onChange={(e) => setNewJenis(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="model" className="block text-sm font-semibold text-slate-300 mb-2">Type/Model</label>
          <input
            type="text"
            id="model"
            className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 focus:ring-blue-500 focus:border-blue-500 transition-all duration-300"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
