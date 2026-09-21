import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Plus, AlertCircle, History, LogOut, UserPlus, LayoutGrid, Users, Upload } from 'lucide-react';
import ConfigForm from './ConfigForm';
import cctvApi from './services/cctvApi';
import { useCctvData } from './hooks/useCctvData';
import { useTerminalPing } from './hooks/useTerminalPing';
import ListView from './components/ListView';
import TerminalModal from './components/TerminalModal';
import StreamViewerModal from './components/StreamViewerModal';
import IPConfigModal from './components/IPConfigModal';
import StatusHistoryModal from './components/StatusHistoryModal';
import LoginPage from './components/LoginPage';
import RegisterUserModal from './components/RegisterUserModal';
import UserManagementModal from './components/UserManagementModal';
import MultiStreamMonitorPage from './components/MultiStreamMonitorPage';
import SnapshotRecapPage from './components/SnapshotRecapPage';
import AppHeader from './components/AppHeader';
import AppFooter from './components/AppFooter';
import DashboardHeader from './components/DashboardHeader';
import { useAuth } from './context/AuthContext';

export default function App() {
  const { user, loading: authLoading, isAdmin, logout } = useAuth();
  const [appView, setAppView] = useState(() => {
    return localStorage.getItem('lastAppView') || 'dashboard';
  });

  useEffect(() => {
    localStorage.setItem('lastAppView', appView);
  }, [appView]);
  const [isMonitorFullscreen, setIsMonitorFullscreen] = useState(false);
  const {
    cctvs,
    isBackendOnline,
    searchTerm,
    setSearchTerm,
    sortMode,
    setSortMode,
    showForm,
    isEditMode,
    form,
    fetchCctvs,
    openAddForm,
    closeForm,
    handleSaveCctv,
    handleDelete,
    handleEdit,
    sortedAndFilteredCctvs,
    stats,
  } = useCctvData();

  const [isAutoPing, setIsAutoPing] = useState(true);

  const viewMeta = {
    dashboard: { title: 'Dashboard' },
    multi: { title: 'Monitor Grid' },
    recap: { title: 'Rekap Tampilan' },
    'cctv-data': { title: 'Data CCTV' },
  };

  const currentViewMeta = viewMeta[appView] || viewMeta.dashboard;

  const [showStatusHistory, setShowStatusHistory] = useState(false);
  const [showRegisterUser, setShowRegisterUser] = useState(false);
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [captureSchedules, setCaptureSchedules] = useState([]);
  const [scheduleForm, setScheduleForm] = useState({
    id: '',
    name: '',
    time: '06:00',
    enabled: true,
    description: '',
  });
  const fileInputRef = useRef(null);

  const [streamSessions, setStreamSessions] = useState({});
  const [ipConfigSessions, setIpConfigSessions] = useState({});

  const { terminalSessions, openTerminalPing, openGatewayPing, closeTerminalPing } = useTerminalPing();

  const stopStreamBackend = useCallback(async (cctvId) => {
    if (!cctvId) return;
    try {
      await cctvApi.stopStreamApi(cctvId);
    } catch (err) {
      console.log('Stream stop error:', err.message);
    }
  }, []);

  const handleExcelImport = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const result = await cctvApi.importCctvsFromExcel(file);
      alert(`Import Excel berhasil: ${result.importedCount} item masuk, ${result.skippedCount} dilewati.`);
      await fetchCctvs();
    } catch (err) {
      alert(err.message || 'Import Excel gagal');
    } finally {
      event.target.value = '';
    }
  }, [fetchCctvs]);

  const handleExportCctvExcel = useCallback(async () => {
    try {
      await cctvApi.exportCctvsToExcel();
    } catch (err) {
      alert(err.message || 'Export data CCTV gagal');
    }
  }, []);

  const handleCaptureAllCctvs = useCallback(async () => {
    try {
      const data = await cctvApi.captureAllSnapshotsApi();
      alert(`Capture selesai. ${data.count || 0} CCTV diproses.`);
    } catch (err) {
      alert(err.message || 'Capture semua CCTV gagal');
    }
  }, []);

  const loadCaptureSchedules = useCallback(async () => {
    try {
      const data = await cctvApi.fetchCaptureSchedules();
      setCaptureSchedules(data || []);
    } catch (err) {
      console.error('Schedule load error:', err.message);
    }
  }, []);

  const handleCaptureScheduleSubmit = useCallback(async (event) => {
    event.preventDefault();

    try {
      const payload = {
        name: scheduleForm.name.trim(),
        time: scheduleForm.time,
        enabled: scheduleForm.enabled,
        description: scheduleForm.description.trim(),
      };

      if (!payload.name || !payload.time) {
        alert('Nama jadwal dan waktu harus diisi');
        return;
      }

      if (scheduleForm.id) {
        await cctvApi.updateCaptureSchedule(scheduleForm.id, payload);
      } else {
        await cctvApi.createCaptureSchedule(payload);
      }

      setScheduleForm({ id: '', name: '', time: '06:00', enabled: true, description: '' });
      await loadCaptureSchedules();
      alert(scheduleForm.id ? 'Jadwal capture berhasil diperbarui' : 'Jadwal capture berhasil ditambahkan');
    } catch (err) {
      alert(err.message || 'Gagal menyimpan jadwal capture');
    }
  }, [loadCaptureSchedules, scheduleForm]);

  const handleScheduleEdit = useCallback((item) => {
    setScheduleForm({
      id: item.id,
      name: item.name,
      time: item.time,
      enabled: Boolean(item.enabled),
      description: item.description || '',
    });
  }, []);

  const handleScheduleDelete = useCallback(async (id) => {
    if (!window.confirm('Hapus jadwal capture ini?')) return;

    try {
      await cctvApi.deleteCaptureSchedule(id);
      await loadCaptureSchedules();
      if (scheduleForm.id === id) {
        setScheduleForm({ id: '', name: '', time: '06:00', enabled: true, description: '' });
      }
      alert('Jadwal capture berhasil dihapus');
    } catch (err) {
      alert(err.message || 'Gagal menghapus jadwal capture');
    }
  }, [loadCaptureSchedules, scheduleForm.id]);

  const startStreamSession = useCallback((cctvWithRtspUrl, displayRtspUrl) => {
    const id = String(cctvWithRtspUrl.id);
    setStreamSessions((prev) => ({
      ...prev,
      [id]: {
        cctv: cctvWithRtspUrl,
        displayRtspUrl: displayRtspUrl ?? cctvWithRtspUrl.rtsp_url,
      },
    }));
  }, []);

  const closeStreamSession = useCallback(
    async (cctvId) => {
      if (!cctvId) return;
      await stopStreamBackend(cctvId);
      const key = String(cctvId);
      setStreamSessions((prev) => {
        if (!prev[key]) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
    },
    [stopStreamBackend],
  );

  const openMonitorForCctv = useCallback(
    (cctv) => {
      if (!cctv?.rtsp_url) {
        alert('⚠️ RTSP URL belum dikonfigurasi untuk perangkat ini');
        return;
      }
      startStreamSession(cctv, cctv.rtsp_url);
    },
    [startStreamSession],
  );

  const openIPConfigForCctv = useCallback((cctv) => {
    if (!cctv?.ip) {
      alert('⚠️ IP belum dikonfigurasi untuk perangkat ini');
      return;
    }
    const id = String(cctv.id);
    setIpConfigSessions((prev) => ({
      ...prev,
      [id]: cctv,
    }));
  }, []);

  const closeIPConfigSession = useCallback((cctvId) => {
    if (!cctvId) return;
    const key = String(cctvId);
    setIpConfigSessions((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const streamSessionCount = Object.keys(streamSessions).length;
  const ipConfigSessionCount = Object.keys(ipConfigSessions).length;
  useEffect(() => {
    if (!user) return;
    fetchCctvs();
    let interval;
    // Hanya auto-poll saat di dashboard utama dan tidak sedang membuka modal streaming
    if (isAutoPing && streamSessionCount === 0 && appView === 'dashboard') {
      interval = setInterval(() => {
        fetchCctvs();
      }, 10000);
    }
    return () => clearInterval(interval);
  }, [user, isAutoPing, streamSessionCount, appView, fetchCctvs]);

  useEffect(() => {
    if (user && isAdmin && appView === 'cctv-data') {
      loadCaptureSchedules();
    }
  }, [user, isAdmin, appView, loadCaptureSchedules]);

  useEffect(() => {
    if (user && !isAdmin && appView === 'cctv-data') {
      setAppView('dashboard');
    }
  }, [user, isAdmin, appView]);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'var(--base)' }}>
        <div className="flex flex-col items-center gap-4">
          <div
            className="h-9 w-9 animate-spin rounded-full border-[3px]"
            style={{ borderColor: 'var(--surface-3)', borderTopColor: 'var(--accent)' }}
          />
          <p className="text-sm" style={{ color: 'var(--text-mid)' }}>Memuat sesi…</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (appView === 'multi') {
    return (
      <div className="flex min-h-screen flex-col" style={{ background: 'var(--base)', color: 'var(--text-hi)' }}>
        {!isMonitorFullscreen && (
          <AppHeader
            user={user}
            isAdmin={isAdmin}
            isBackendOnline={isBackendOnline}
            appView={appView}
            onViewChange={setAppView}
            pageTitle={currentViewMeta.title}
            onOpenRegisterUser={() => setShowRegisterUser(true)}
            onOpenStatusHistory={() => setShowStatusHistory(true)}
            onOpenUserManagement={() => setShowUserManagement(true)}
            onAddDevice={openAddForm}
            onLogout={logout}
          />
        )}
        <div className="flex-1">
          <MultiStreamMonitorPage
            cctvs={cctvs}
            onBack={() => setAppView('dashboard')}
            stopStreamBackend={stopStreamBackend}
            refreshCctvs={fetchCctvs}
            onFullScreenChange={setIsMonitorFullscreen}
          />
        </div>
        {!isMonitorFullscreen && <AppFooter />}
      </div>
    );
  }

  if (appView === 'recap') {
    return (
      <div className="flex min-h-screen flex-col" style={{ background: 'var(--base)', color: 'var(--text-hi)' }}>
        <AppHeader
          user={user}
          isAdmin={isAdmin}
          isBackendOnline={isBackendOnline}
          appView={appView}
          onViewChange={setAppView}
          pageTitle={currentViewMeta.title}
          onOpenRegisterUser={() => setShowRegisterUser(true)}
          onOpenStatusHistory={() => setShowStatusHistory(true)}
          onOpenUserManagement={() => setShowUserManagement(true)}
          onAddDevice={openAddForm}
          onLogout={logout}
        />
        <div className="flex-1">
          <SnapshotRecapPage onBack={() => setAppView('dashboard')} />
        </div>
        <AppFooter />
      </div>
    );
  }

  if (appView === 'cctv-data') {
    return (
      <div className="flex min-h-screen flex-col" style={{ background: 'var(--base)', color: 'var(--text-hi)' }}>
        <AppHeader
          user={user}
          isAdmin={isAdmin}
          isBackendOnline={isBackendOnline}
          appView={appView}
          onViewChange={setAppView}
          pageTitle={currentViewMeta.title}
          onOpenRegisterUser={() => setShowRegisterUser(true)}
          onOpenStatusHistory={() => setShowStatusHistory(true)}
          onOpenUserManagement={() => setShowUserManagement(true)}
          onAddDevice={openAddForm}
          onLogout={logout}
        />
        <div className="flex-1 p-4 md:p-6">
          <div className="mx-auto max-w-3xl space-y-5">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={() => setAppView('dashboard')}
                className="text-sm transition-colors duration-150"
                style={{
                  background: 'var(--surface-1)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text-mid)',
                  padding: '6px 14px',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-hi)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-mid)'; e.currentTarget.style.background = 'var(--surface-1)'; }}
              >
                ← Kembali
              </button>
              <h1 className="text-xl font-semibold" style={{ color: 'var(--text-hi)' }}>Kelola Data CCTV</h1>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-4 text-left transition-all duration-150"
                style={{
                  background: 'var(--surface-0)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-1)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-0)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>Import Excel CCTV</div>
                <div className="mt-1.5 text-sm" style={{ color: 'var(--text-mid)' }}>Unggah file Excel atau CSV untuk menambah atau memperbarui data CCTV.</div>
              </button>

              <button
                type="button"
                onClick={handleExportCctvExcel}
                className="p-4 text-left transition-all duration-150"
                style={{
                  background: 'var(--surface-0)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-1)'; e.currentTarget.style.borderColor = 'var(--border-strong)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--surface-0)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                <div className="text-sm font-semibold" style={{ color: 'var(--text-hi)' }}>Export Excel CCTV</div>
                <div className="mt-1.5 text-sm" style={{ color: 'var(--text-mid)' }}>Download seluruh data CCTV ke file Excel untuk backup atau laporan.</div>
              </button>
            </div>

            <div
              className="p-4 text-sm"
              style={{
                background: 'var(--surface-0)',
                border: '1px solid var(--border)',
                borderRadius: 12,
              }}
            >
              <div className="mb-2 font-semibold" style={{ color: 'var(--text-hi)' }}>Catatan</div>
              <ul className="list-disc space-y-1 pl-5" style={{ color: 'var(--text-mid)' }}>
                <li>Import data hanya digunakan untuk data CCTV.</li>
                <li>Format file yang didukung: Excel (.xls, .xlsx) dan CSV.</li>
                <li>Ekspor rekap screenshot tersedia di halaman Rekap.</li>
              </ul>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleExcelImport}
          />
        </div>
        <AppFooter />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: 'var(--base)', color: 'var(--text-hi)' }}>
      <AppHeader
        user={user}
        isAdmin={isAdmin}
        isBackendOnline={isBackendOnline}
        appView={appView}
        onViewChange={setAppView}
        pageTitle={currentViewMeta.title}
        onOpenRegisterUser={() => setShowRegisterUser(true)}
        onOpenStatusHistory={() => setShowStatusHistory(true)}
        onOpenUserManagement={() => setShowUserManagement(true)}
        onAddDevice={openAddForm}
        onLogout={logout}
        sortMode={sortMode}
        setSortMode={setSortMode}
        stats={stats}
        isAutoPing={isAutoPing}
        setIsAutoPing={setIsAutoPing}
      />

      <div className="flex-1 overflow-x-hidden p-3 font-sans sm:p-4 md:p-5">
        <div className="mx-auto max-w-7xl space-y-3 pb-4">
          {!isBackendOnline && (
            <div className="flex items-center gap-2.5 p-3 text-xs font-medium rounded-xl border border-red-500/30 bg-red-500/10 text-red-300 font-telemetry">
              <span className="cctv-rec-dot shrink-0" />
              <div>
                <span className="font-bold uppercase tracking-wider">KONEKSI BACKEND TERPUTUS —</span> Pastikan server backend CCTV berjalan dengan normal.
              </div>
            </div>
          )}

          {isAdmin && showForm && (
            <ConfigForm
              handleSaveCctv={handleSaveCctv}
              newName={form.newName}
              setNewName={form.setNewName}
              newJenis={form.newJenis}
              setNewJenis={form.setNewJenis}
              newMerk={form.newMerk}
              setNewMerk={form.setNewMerk}
              newType={form.newType}
              setNewType={form.setNewType}
              newIp={form.newIp}
              setNewIp={form.setNewIp}
              newGateway={form.newGateway}
              setNewGateway={form.setNewGateway}
              newRtspUrl={form.newRtspUrl}
              setNewRtspUrl={form.setNewRtspUrl}
              isBackendOnline={isBackendOnline}
              isEditMode={isEditMode}
              onCancel={closeForm}
            />
          )}

          <DashboardHeader
            isBackendOnline={isBackendOnline}
            sortMode={sortMode}
            setSortMode={setSortMode}
            stats={stats}
            isAutoPing={isAutoPing}
            setIsAutoPing={setIsAutoPing}
          />

          <ListView
            searchTerm={searchTerm}
            setSearchTerm={setSearchTerm}
            sortedAndFilteredCctvs={sortedAndFilteredCctvs}
            isBackendOnline={isBackendOnline}
            isAdmin={isAdmin}
            onOpenTerminalPing={openTerminalPing}
            onOpenGatewayPing={openGatewayPing}
            onOpenMonitor={openMonitorForCctv}
            onOpenIPConfig={openIPConfigForCctv}
            handleDelete={handleDelete}
            handleEdit={handleEdit}
          />

          <StatusHistoryModal
            open={showStatusHistory}
            onClose={() => setShowStatusHistory(false)}
            cctvs={cctvs}
          />

          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleExcelImport}
          />

          {isAdmin && <RegisterUserModal open={showRegisterUser} onClose={() => setShowRegisterUser(false)} />}

          {isAdmin && (
            <UserManagementModal
              open={showUserManagement}
              onClose={() => setShowUserManagement(false)}
              userId={user?.id}
            />
          )}

          {Object.entries(streamSessions).map(([id, session], stackIndex) => (
            <StreamViewerModal
              key={id}
              cctv={session.cctv}
              displayRtspUrl={session.displayRtspUrl}
              onClose={() => closeStreamSession(id)}
              stopStreamBackend={stopStreamBackend}
              stackIndex={stackIndex}
            />
          ))}

          {Object.entries(ipConfigSessions).map(([id, cctv], stackIndex) => (
            <IPConfigModal
              key={id}
              cctv={cctv}
              onClose={() => closeIPConfigSession(id)}
              stackIndex={stackIndex}
            />
          ))}

          <TerminalModal terminalSessions={terminalSessions} closeTerminalPing={closeTerminalPing} />
        </div>
      </div>

      <AppFooter />
    </div>
  );
}