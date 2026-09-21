import React, { useEffect, useState } from 'react';
import { X, Trash2, Lock, RefreshCw, AlertCircle } from 'lucide-react';
import cctvApi from '../services/cctvApi';

export default function UserManagementModal({ open, onClose, userId }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showResetForm, setShowResetForm] = useState(null);

  const fetchUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await cctvApi.fetchUsersApi();
      setUsers(data.users || []);
    } catch (err) {
      console.error('❌ Fetch users error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchUsers();
      setError('');
      setSuccess('');
    }
  }, [open]);

  const handleResetPassword = async (targetUserId) => {
    if (!newPassword || !confirmPassword) {
      setError('Password dan konfirmasi wajib diisi');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Password dan konfirmasi tidak cocok');
      return;
    }

    if (newPassword.length < 6) {
      setError('Password minimal 6 karakter');
      return;
    }

    setLoading(true);
    setError('');

    try {
      await cctvApi.resetPasswordApi({ userId: targetUserId, newPassword });

      setSuccess('Password berhasil direset');
      setShowResetForm(null);
      setNewPassword('');
      setConfirmPassword('');
      await fetchUsers();
    } catch (err) {
      console.error('❌ Reset password error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (targetUserId, username) => {
    if (!window.confirm(`Yakin hapus akun "${username}"? Tindakan ini tidak bisa dibatalkan.`)) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      await cctvApi.deleteUserApi(targetUserId);

      setSuccess('Pengguna berhasil dihapus');
      await fetchUsers();
    } catch (err) {
      console.error('❌ Delete user error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-[#0c0f18] border border-indigo-500/30 rounded-xl shadow-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col cctv-reticle-box">
        <div className="flex justify-between items-center bg-[#0e121a] px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span className="cctv-online-dot" />
            <span>Manajemen Akun Pengguna</span>
          </h2>
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
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/50 p-4 rounded-lg flex items-center gap-3 text-red-400">
              <AlertCircle size={20} />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-emerald-500/10 border border-emerald-500/50 p-4 rounded-lg flex items-center gap-3 text-emerald-400">
              <RefreshCw size={20} />
              <p>{success}</p>
            </div>
          )}

          {loading && !users.length ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-center text-slate-500 py-8">Tidak ada pengguna</p>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div key={user.id} className="border border-slate-700 rounded-lg p-4 bg-slate-800/50 hover:bg-slate-800/70 transition-colors">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <p className="font-bold text-slate-200 truncate">{user.username}</p>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide border ${
                            user.role === 'admin'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                              : 'bg-slate-600/30 text-slate-300 border-slate-600/50'
                          }`}
                        >
                          {user.role === 'admin' ? '👑 Admin' : '👤 User'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">
                        ID: {user.id} • Dibuat: {new Date(user.created_at).toLocaleDateString('id-ID', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => setShowResetForm(showResetForm === user.id ? null : user.id)}
                        className="p-2 rounded-lg text-amber-400 hover:bg-amber-500/10 transition-colors"
                        title="Reset Password"
                        disabled={loading}
                      >
                        <Lock size={18} />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.id, user.username)}
                        className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Hapus Akun"
                        disabled={loading || userId === user.id}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  {showResetForm === user.id && (
                    <div className="mt-4 pt-4 border-t border-slate-700 space-y-3">
                      <p className="text-sm text-slate-400">Reset password untuk <span className="font-bold text-slate-300">{user.username}</span></p>
                      <input
                        type="password"
                        placeholder="Password baru"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 text-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                        disabled={loading}
                      />
                      <input
                        type="password"
                        placeholder="Konfirmasi password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-600 text-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                        disabled={loading}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleResetPassword(user.id)}
                          className="flex-1 px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={loading}
                        >
                          Reset Password
                        </button>
                        <button
                          onClick={() => {
                            setShowResetForm(null);
                            setNewPassword('');
                            setConfirmPassword('');
                          }}
                          className="flex-1 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg font-semibold text-sm transition-colors"
                          disabled={loading}
                        >
                          Batal
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
