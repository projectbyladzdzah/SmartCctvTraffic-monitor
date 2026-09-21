import React, { useState } from 'react';
import { X, UserPlus } from 'lucide-react';
import cctvApi from '../services/cctvApi';

export default function RegisterUserModal({ open, onClose }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('user');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await cctvApi.createUserApi({
        username: username.trim(),
        password,
        role,
      });
      setUsername('');
      setPassword('');
      setRole('user');
      onClose();
      alert('Pengguna berhasil dibuat.');
    } catch (err) {
      setError(err.message || 'Gagal');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="w-full max-w-md rounded-2xl border border-indigo-500/30 bg-[#0c0f18] shadow-2xl overflow-hidden cctv-reticle-box">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-[#0e121a]">
          <div className="flex items-center gap-2 text-slate-100 font-semibold text-sm">
            <span className="cctv-online-dot" />
            <span>Buat Akun Operator Baru</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-red-600/30 active:bg-red-600/50 transition-colors cursor-pointer min-w-[34px] min-h-[34px] flex items-center justify-center border border-white/5 hover:border-red-500/40"
            aria-label="Tutup"
            title="Tutup Modal"
          >
            <X size={18} />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <p className="text-xs text-slate-500">Hanya admin. Tanpa email.</p>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Username</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Password (min. 6)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white"
            >
              <option value="user">User (hanya ping & monitor)</option>
              <option value="admin">Admin (penuh)</option>
            </select>
          </div>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-200 text-sm font-semibold">
              Batal
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              {busy ? 'Menyimpan…' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
