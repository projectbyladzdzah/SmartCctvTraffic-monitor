import React from 'react';
import { X, Server, Plus, Save } from 'lucide-react';
import DeviceIdentitySection from './components/config-form/DeviceIdentitySection';
import NetworkConfigSection from './components/config-form/NetworkConfigSection';

const ConfigForm = ({
  handleSaveCctv,
  newName,
  setNewName,
  newJenis,
  setNewJenis,
  newMerk,
  setNewMerk,
  newType,
  setNewType,
  newIp,
  setNewIp,
  newGateway,
  setNewGateway,
  newRtspUrl,
  setNewRtspUrl,
  isBackendOnline,
  isEditMode,
  onCancel,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="bg-[#0c0f18] border border-indigo-500/30 w-full max-w-3xl rounded-2xl shadow-2xl shadow-black/60 overflow-hidden cctv-reticle-box">
        <div className="flex justify-between items-center px-6 py-4 border-b border-white/10 bg-[#0e121a]">
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
            <span className="cctv-online-dot" />
            <span>{isEditMode ? 'Edit Perangkat CCTV' : 'Konfigurasi Perangkat Baru'}</span>
          </h2>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-red-600/30 active:bg-red-600/50 transition-colors cursor-pointer min-w-[34px] min-h-[34px] flex items-center justify-center border border-white/5 hover:border-red-500/40"
            aria-label="Tutup Form"
            title="Tutup Form"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={handleSaveCctv}
          className="p-8 space-y-8 max-h-[80vh] overflow-y-auto custom-scrollbar"
        >
          <DeviceIdentitySection
            newName={newName}
            setNewName={setNewName}
            newMerk={newMerk}
            setNewMerk={setNewMerk}
            newJenis={newJenis}
            setNewJenis={setNewJenis}
            newType={newType}
            setNewType={setNewType}
          />

          <NetworkConfigSection
            newIp={newIp}
            setNewIp={setNewIp}
            newGateway={newGateway}
            setNewGateway={setNewGateway}
            newRtspUrl={newRtspUrl}
            setNewRtspUrl={setNewRtspUrl}
          />
          <div className="flex justify-end items-center pt-6">
            <button
              type="button"
              onClick={onCancel}
              className="px-8 py-2.5 rounded-lg font-semibold text-sm text-slate-300 hover:bg-white/10 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!isBackendOnline || !newName.trim() || !newIp.trim()}
              className="flex items-center gap-2 px-8 py-2.5 rounded-lg font-bold text-sm transition-all duration-300 shadow-lg ml-4 transform bg-cyan-400/80 text-slate-900 hover:bg-cyan-400 hover:shadow-cyan-400/30 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed"
            >
              {isEditMode ? <Save size={18} strokeWidth={2.5} /> : <Plus size={18} strokeWidth={2.5} />}
              {isEditMode ? 'Update Perangkat' : 'Simpan Perangkat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ConfigForm;
