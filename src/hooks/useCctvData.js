import { useCallback, useMemo, useRef, useState } from 'react';
import cctvApi from '../services/cctvApi';

export function useCctvData() {
  const [cctvs, setCctvs] = useState([]);
  const [isBackendOnline, setIsBackendOnline] = useState(true);
  const consecutiveFailuresRef = useRef(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortMode, setSortMode] = useState('online');
  const [showForm, setShowForm] = useState(false);
  const [editingCctvId, setEditingCctvId] = useState(null);
  const [newName, setNewName] = useState('');
  const [newJenis, setNewJenis] = useState('');
  const [newMerk, setNewMerk] = useState('');
  const [newType, setNewType] = useState('');
  const [newIp, setNewIp] = useState('');
  const [newGateway, setNewGateway] = useState('');
  const [newRtspUrl, setNewRtspUrl] = useState('');

  const fetchCctvs = useCallback(async () => {
    try {
      const data = await cctvApi.fetchCctvsApi();
      setCctvs(data);
      consecutiveFailuresRef.current = 0;
      setIsBackendOnline(true);
    } catch (error) {
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        return;
      }
      consecutiveFailuresRef.current += 1;
      // Hanya tampilkan peringatan terputus jika gagal 3 kali berturut-turut
      if (consecutiveFailuresRef.current >= 3) {
        setIsBackendOnline(false);
      }
      console.warn(`[CCTV Data] Percobaan fetch ke-${consecutiveFailuresRef.current} gagal:`, error.message);
    }
  }, []);

  const resetFormFields = useCallback(() => {
    setNewName('');
    setNewJenis('');
    setNewMerk('');
    setNewType('');
    setNewIp('');
    setNewGateway('');
    setNewRtspUrl('');
  }, []);

  const openAddForm = useCallback(() => {
    setEditingCctvId(null);
    resetFormFields();
    setShowForm(true);
  }, [resetFormFields]);

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingCctvId(null);
    resetFormFields();
  }, [resetFormFields]);

  const handleSaveCctv = useCallback(async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newIp.trim()) return;

    const payload = {
      name: newName,
      jenis: newJenis,
      merk: newMerk,
      type: newType,
      ip: newIp,
      gateway: newGateway,
      rtsp_url: newRtspUrl,
    };

    try {
      const response = await cctvApi.saveCctvApi(payload, editingCctvId);
      if (response.ok) {
        await fetchCctvs();
        closeForm();
      } else {
        alert('Gagal menyimpan perubahan CCTV. Pastikan server backend berjalan.');
      }
    } catch (error) {
      console.error('Gagal mengirim data ke server');
      alert('Error: Tidak dapat terhubung ke server backend (localhost:5000)');
    }
  }, [newName, newIp, newJenis, newMerk, newType, newGateway, newRtspUrl, editingCctvId, fetchCctvs, closeForm]);

  const handleDelete = useCallback(async (id) => {
    if (!window.confirm('Yakin ingin menghapus data ini?')) return;
    try {
      const response = await cctvApi.deleteCctvApi(id);
      if (response.ok) fetchCctvs();
    } catch (error) {
      console.error('Gagal menghapus data');
    }
  }, [fetchCctvs]);

  const handleEdit = useCallback((cctv) => {
    setEditingCctvId(cctv.id);
    setNewName(cctv.name);
    setNewJenis(cctv.jenis);
    setNewMerk(cctv.merk);
    setNewType(cctv.type);
    setNewIp(cctv.ip);
    setNewGateway(cctv.gateway);
    setNewRtspUrl(cctv.rtsp_url || '');
    setShowForm(true);
  }, []);

  const filteredCctvs = useMemo(
    () => cctvs.filter((c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.ip.includes(searchTerm)),
    [cctvs, searchTerm]
  );

  const sortedAndFilteredCctvs = useMemo(() => [...filteredCctvs].sort((a, b) => {
    if (sortMode === 'total') return 0;
    if (sortMode === 'online') {
      if (a.status === 'online' && b.status === 'offline') return -1;
      if (a.status === 'offline' && b.status === 'online') return 1;
    }
    if (sortMode === 'offline') {
      if (a.status === 'offline' && b.status === 'online') return -1;
      if (a.status === 'online' && b.status === 'offline') return 1;
    }
    return 0;
  }), [filteredCctvs, sortMode]);

  const stats = useMemo(() => ({
    total: cctvs.length,
    online: cctvs.filter((c) => c.status === 'online').length,
    offline: cctvs.filter((c) => c.status === 'offline').length,
  }), [cctvs]);

  return {
    cctvs,
    isBackendOnline,
    searchTerm,
    setSearchTerm,
    sortMode,
    setSortMode,
    showForm,
    setShowForm,
    editingCctvId,
    isEditMode: Boolean(editingCctvId),
    form: {
      newName, setNewName,
      newJenis, setNewJenis,
      newMerk, setNewMerk,
      newType, setNewType,
      newIp, setNewIp,
      newGateway, setNewGateway,
      newRtspUrl, setNewRtspUrl,
    },
    fetchCctvs,
    openAddForm,
    closeForm,
    handleSaveCctv,
    handleDelete,
    handleEdit,
    sortedAndFilteredCctvs,
    stats,
  };
}
