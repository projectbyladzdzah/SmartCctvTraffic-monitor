import React, { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Database,
  Home,
  LayoutGrid,
  LogOut,
  Menu,
  Plus,
  Radio,
  ShieldCheck,
  UserPlus,
  UserRound,
  Users,
  Video,
} from 'lucide-react';

export default function AppHeader({
  user,
  isAdmin,
  isBackendOnline,
  appView,
  onViewChange,
  pageTitle,
  onOpenRegisterUser,
  onOpenStatusHistory,
  onOpenUserManagement,
  onAddDevice,
  onLogout,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Live real-time digital clock ticker for surveillance telemetry
  const [timeStr, setTimeStr] = useState(() => {
    return new Date().toLocaleTimeString('id-ID', { hour12: false });
  });

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeStr(new Date().toLocaleTimeString('id-ID', { hour12: false }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // Navigation items
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home },
    { id: 'multi',     label: 'Monitor Grid', icon: LayoutGrid },
    { id: 'recap',     label: 'Rekap Tampilan', icon: Video },
    { id: 'cctv-data', label: 'Data CCTV', icon: Database, adminOnly: true },
  ].filter((item) => !item.adminOnly || isAdmin);

  const managementItems = [
    {
      label: 'Tambah CCTV',
      description: 'Tambah perangkat baru',
      icon: Plus,
      onClick: onAddDevice,
      adminOnly: true,
    },
    {
      label: 'Status CCTV',
      description: 'Riwayat status perangkat',
      icon: ShieldCheck,
      onClick: onOpenStatusHistory,
    },
  ].filter((item) => !item.adminOnly || isAdmin);

  const accountItems = [
    {
      label: 'Tambah Akun',
      description: 'Buat akun user baru',
      icon: UserPlus,
      onClick: onOpenRegisterUser,
    },
    {
      label: 'Kelola User',
      description: 'Atur akses pengguna',
      icon: Users,
      onClick: onOpenUserManagement,
    },
  ];

  return (
    <header className="navbar-glass sticky top-0 z-40">
      <div className="mx-auto max-w-7xl px-3 py-2 sm:px-4">
        <div className="flex min-h-10 items-center justify-between gap-3">

          {/* Left: Brand + Perimeter Telemetry Status */}
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center relative overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, var(--surface-2) 0%, var(--surface-3) 100%)',
                border: '1px solid var(--border-strong)',
                borderRadius: 8,
                color: 'var(--accent)',
              }}
            >
              <Radio size={14} className="relative z-10 animate-pulse" />
              <div
                className="absolute inset-0 opacity-20 pointer-events-none"
                style={{
                  background: 'radial-gradient(circle at center, var(--accent) 0%, transparent 70%)',
                }}
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-xs font-bold tracking-tight" style={{ color: 'var(--text-hi)' }}>
                  CCTV COMMAND
                </p>
                <span className="hidden sm:inline-block h-1 w-1 rounded-full bg-slate-600" />
                <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-semibold tracking-wider bg-slate-900/80 border border-slate-700/60 text-slate-300">
                  <span className="cctv-online-dot" />
                  Surakarta
                </span>
              </div>
              <p
                className="font-telemetry text-[9px] uppercase tracking-[0.15em]"
                style={{ color: 'var(--text-lo)' }}
              >
                TMC CONTROL
              </p>
            </div>
          </div>

          {/* Center: Desktop Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 p-1 rounded-lg border border-white/5 bg-slate-950/60">
            {navItems.map(({ id, label, icon: Icon }) => {
              const active = appView === id;
              return (
                <button
                  key={id}
                  id={`nav-tab-${id}`}
                  type="button"
                  onClick={() => onViewChange?.(id)}
                  className={`relative flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-150 ${
                    active
                      ? 'text-white bg-slate-800/90 shadow-sm border border-indigo-500/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
                  }`}
                >
                  <Icon size={13} className={active ? 'text-indigo-400' : 'text-slate-500'} />
                  <span>{label}</span>
                  {active && (
                    <span className="absolute bottom-0 left-2 right-2 h-[2px] bg-indigo-400 rounded-full shadow-[0_0_6px_rgba(129,140,248,0.8)]" />
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right: Operational Status, User Pill & Menu Dropdown */}
          <div className="flex items-center gap-2">
            {/* Live Telemetry Pill (Mobile/Desktop) */}
            <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-lg border border-slate-800/80 bg-slate-900/50 font-telemetry text-[10px]">
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="cctv-online-dot" />
                LIVE
              </span>
              <span className="text-slate-600">|</span>
              <span className="text-slate-300 font-mono">{timeStr}</span>
            </div>

            {/* User badge */}
            <div
              className="flex min-h-8 items-center gap-1.5 px-2"
              style={{
                background: 'var(--surface-1)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}
            >
              <span
                className="flex h-5 w-5 items-center justify-center"
                style={{
                  background: 'var(--surface-3)',
                  borderRadius: 5,
                  color: 'var(--text-mid)',
                }}
              >
                {isAdmin ? <ShieldCheck size={11} className="text-indigo-400" /> : <UserRound size={11} />}
              </span>
              <span className="min-w-0 leading-tight">
                <span
                  className="block max-w-[80px] truncate text-[10px] font-semibold"
                  style={{ color: 'var(--text-hi)' }}
                >
                  {user?.username || 'User'}
                </span>
                <span
                  className="block text-[8px] uppercase tracking-[0.12em]"
                  style={{ color: isAdmin ? 'var(--accent)' : 'var(--text-lo)' }}
                >
                  {isAdmin ? 'Admin' : 'Operator'}
                </span>
              </span>
            </div>

            {/* Menu Dropdown Trigger */}
            <div className="relative" ref={menuRef}>
              <button
                id="main-menu-trigger"
                type="button"
                onClick={() => setMenuOpen((prev) => !prev)}
                className="inline-flex min-h-8 items-center gap-1.5 px-2.5 text-[11px] font-medium transition-all duration-150"
                style={{
                  background: menuOpen ? 'var(--surface-2)' : 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text-hi)',
                }}
                onMouseEnter={(e) => { if (!menuOpen) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { if (!menuOpen) e.currentTarget.style.background = 'var(--surface-1)'; }}
              >
                <Menu size={13} />
                <span className="hidden sm:inline">Menu</span>
                <ChevronDown
                  size={12}
                  style={{
                    transition: 'transform 150ms',
                    transform: menuOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    color: 'var(--text-mid)',
                  }}
                />
              </button>

              {/* Dropdown Menu */}
              {menuOpen && (
                <div
                  className="absolute right-0 top-[calc(100%+6px)] w-[272px] p-2"
                  style={{
                    background: 'var(--surface-0)',
                    border: '1px solid var(--border-strong)',
                    borderRadius: 12,
                    boxShadow: '0 4px 24px rgba(0,0,0,0.6), 0 1px 3px rgba(0,0,0,0.35)',
                  }}
                >
                  <div className="space-y-3">

                    {/* Navigation for Mobile (and Quick Access) */}
                    <div className="md:hidden">
                      <p
                        className="mb-1 px-1 text-[8px] font-semibold uppercase tracking-[0.18em]"
                        style={{ color: 'var(--text-lo)' }}
                      >
                        Navigasi
                      </p>
                      <div className="space-y-0.5">
                        {navItems.map(({ id, label, icon: Icon }) => {
                          const active = appView === id;
                          return (
                            <button
                              key={id}
                              id={`nav-${id}`}
                              type="button"
                              onClick={() => { onViewChange?.(id); setMenuOpen(false); }}
                              className="flex min-h-9 w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] font-medium transition-all duration-100"
                              style={{
                                borderRadius: 8,
                                background: active ? 'var(--accent-dim)' : 'transparent',
                                color: active ? 'var(--accent)' : 'var(--text-mid)',
                                outline: active ? `1px solid rgba(129,140,248,0.2)` : 'none',
                              }}
                            >
                              <span
                                className="flex h-6 w-6 shrink-0 items-center justify-center"
                                style={{
                                  background: 'var(--surface-2)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 6,
                                  color: active ? 'var(--accent)' : 'var(--text-mid)',
                                }}
                              >
                                <Icon size={12} />
                              </span>
                              <span>{label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Operations */}
                    <div>
                      <p
                        className="mb-1 px-1 text-[8px] font-semibold uppercase tracking-[0.18em]"
                        style={{ color: 'var(--text-lo)' }}
                      >
                        Operasi CCTV
                      </p>
                      <div className="space-y-0.5">
                        {managementItems.map(({ label, description, icon: Icon, onClick }) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => { onClick?.(); setMenuOpen(false); }}
                            className="flex w-full items-start gap-2 px-2 py-1.5 text-left transition-all duration-100"
                            style={{ borderRadius: 8 }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                          >
                            <span
                              className="flex h-7 w-7 shrink-0 items-center justify-center"
                              style={{
                                background: 'var(--surface-2)',
                                border: '1px solid var(--border)',
                                borderRadius: 6,
                                color: 'var(--text-mid)',
                              }}
                            >
                              <Icon size={13} />
                            </span>
                            <span className="min-w-0">
                              <span className="block text-[11px] font-semibold" style={{ color: 'var(--text-hi)' }}>
                                {label}
                              </span>
                              <span className="mt-0.5 block text-[10px]" style={{ color: 'var(--text-lo)' }}>
                                {description}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Account (admin only) */}
                    {isAdmin && (
                      <div>
                        <p
                          className="mb-1 px-1 text-[8px] font-semibold uppercase tracking-[0.18em]"
                          style={{ color: 'var(--text-lo)' }}
                        >
                          Kelola Akses
                        </p>
                        <div className="space-y-0.5">
                          {accountItems.map(({ label, description, icon: Icon, onClick }) => (
                            <button
                              key={label}
                              type="button"
                              onClick={() => { onClick?.(); setMenuOpen(false); }}
                              className="flex w-full items-start gap-2 px-2 py-1.5 text-left transition-all duration-100"
                              style={{ borderRadius: 8 }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              <span
                                className="flex h-7 w-7 shrink-0 items-center justify-center"
                                style={{
                                  background: 'var(--surface-2)',
                                  border: '1px solid var(--border)',
                                  borderRadius: 6,
                                  color: 'var(--text-mid)',
                                }}
                              >
                                <Icon size={13} />
                              </span>
                              <span className="min-w-0">
                                <span className="block text-[11px] font-semibold" style={{ color: 'var(--text-hi)' }}>
                                  {label}
                                </span>
                                <span className="mt-0.5 block text-[10px]" style={{ color: 'var(--text-lo)' }}>
                                  {description}
                                </span>
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Divider + Logout */}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                      <button
                        id="logout-btn"
                        type="button"
                        onClick={() => { onLogout?.(); setMenuOpen(false); }}
                        className="flex min-h-9 w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] font-semibold transition-all duration-100"
                        style={{
                          borderRadius: 8,
                          background: 'rgba(248,113,113,0.08)',
                          border: '1px solid rgba(248,113,113,0.2)',
                          color: 'var(--offline)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(248,113,113,0.15)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(248,113,113,0.08)'; }}
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center"
                          style={{
                            background: 'rgba(248,113,113,0.12)',
                            border: '1px solid rgba(248,113,113,0.25)',
                            borderRadius: 5,
                          }}
                        >
                          <LogOut size={11} />
                        </span>
                        Keluar
                      </button>
                    </div>

                  </div>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </header>
  );
}
