import React, { useState } from 'react';
import { LogIn, Eye, EyeOff, Radio, ShieldCheck, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { setDemoActive } from '../services/cctvApi';

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername]         = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState('');
  const [submitting, setSubmitting]     = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Username dan password wajib diisi.');
      return;
    }
    setSubmitting(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err.message || 'Autentikasi gagal. Periksa kembali akun Anda.');
    } finally {
      setSubmitting(false);
    }
  };

  const onDemoLogin = async () => {
    setError('');
    setSubmitting(true);
    try {
      setDemoActive(true);
      await login('demo', 'demo');
    } catch (err) {
      setError(err.message || 'Gagal masuk ke mode demo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 bg-[#07090e] text-slate-200 overflow-hidden select-none">
      {/* Subtle tactical surveillance radar backdrop */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: `
            radial-gradient(circle at center, rgba(99, 102, 241, 0.12) 0%, transparent 60%),
            linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 36px 36px, 36px 36px',
        }}
      />

      {/* Subtle CRT monitor scanlines */}
      <div className="pointer-events-none absolute inset-0 cctv-scanlines opacity-25" />

      {/* Login Card */}
      <div className="relative w-full max-w-sm z-10">
        <div className="panel p-7 sm:p-8 cctv-reticle-box bg-[#0c0f18]/90 border border-indigo-500/30 shadow-2xl backdrop-blur-xl">

          {/* Tactical Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <span className="cctv-online-dot" />
              <span className="font-telemetry text-[9px] font-bold uppercase tracking-[0.2em] text-indigo-400">
                TMC SURAKARTA COMMAND
              </span>
            </div>

            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              <span>CCTV Command</span>
            </h1>

            <p className="mt-1 text-xs text-slate-400 font-telemetry">
              Sistem Pemantauan
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            {/* Username */}
            <div>
              <label className="mb-1.5 block font-telemetry text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Operator Username
              </label>
              <input
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="cth: operator1"
                className="field font-telemetry text-xs"
              />
            </div>

            {/* Password */}
            <div>
              <label className="mb-1.5 block font-telemetry text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Kunci Akses
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="field pr-10 font-telemetry text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                  aria-label={showPassword ? 'Sembunyikan' : 'Tampilkan'}
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="rounded-lg p-2.5 text-xs font-medium border border-red-500/30 bg-red-500/10 text-red-300">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <button
              id="login-submit"
              type="submit"
              disabled={submitting}
              className="btn-primary w-full mt-2 font-telemetry tracking-wider uppercase text-xs"
            >
              <LogIn size={15} />
              <span>{submitting ? 'Mengautentikasi…' : 'Masuk ke Sistem'}</span>
            </button>

            {/* Demo Mode Button for Portfolio Visitors */}
            <div className="pt-2 border-t border-indigo-500/20">
              <button
                type="button"
                onClick={onDemoLogin}
                disabled={submitting}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-telemetry bg-gradient-to-r from-indigo-900/50 to-blue-900/50 border border-indigo-500/40 text-indigo-200 hover:from-indigo-800/60 hover:to-blue-800/60 transition-all shadow-sm"
              >
                <Sparkles size={14} className="text-amber-400" />
                <span>Mode Demo Portofolio (Akses Langsung)</span>
              </button>
            </div>
          </form>

          {/* Footer note */}
          <div className="mt-6 pt-4 border-t border-white/5 text-center">
            <p className="text-[10px] text-slate-500 font-telemetry">
              Hak akses diawasi TMC Surakarta.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
