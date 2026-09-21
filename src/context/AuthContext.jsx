import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import cctvApi, { getStoredToken, setStoredToken } from '../services/cctvApi';
import { useIdleLogout } from '../hooks/useIdleLogout';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => !!getStoredToken()); // True jika ada token yang akan diverifikasi

  const logout = useCallback(() => {
    setStoredToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    console.log('🔄 Checking session...');
    try {
      const token = getStoredToken();
      console.log('Token tersimpan:', token ? 'Ada' : 'Tidak ada');
      
      if (!token) {
        console.log('❌ Tidak ada token, logout');
        setUser(null);
        return null;
      }

      console.log('📡 Memanggil /api/auth/me...');
      const data = await cctvApi.meApi();
      
      if (data?.user) {
        console.log('✅ Session valid, user:', data.user.username);
        setUser(data.user);
        return data.user;
      }
      
      console.log('❌ Response tidak valid');
      setUser(null);
      return null;
    } catch (error) {
      console.error('❌ Error refreshing user session:', error.message);
      setStoredToken(null);
      setUser(null);
      return null;
    }
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await cctvApi.loginApi(username, password);
    setStoredToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  // SIMPLIFY: Hanya check token ada atau tidak (no loading state)
  // Jika ada token, verify di background
  useEffect(() => {
    console.log('🚀 AuthProvider mounted');
    const token = getStoredToken();
    
    // Jika tidak ada token, user state tetap null → akan ke login page
    if (!token) {
      console.log('⏭️  No token, skip session check');
      setLoading(false);
      return;
    }

    // Jika ada token, verify di background (non-blocking)
    let isMounted = true;
    const verifyToken = async () => {
      try {
        console.log('🔍 Verifying token silently...');
        const result = await cctvApi.meApi();
        if (isMounted && result?.user) {
          console.log('✅ Token valid, restoring user...');
          setUser(result.user);
        } else if (isMounted) {
          console.log('❌ Token invalid, clearing...');
          setStoredToken(null);
        }
      } catch (err) {
        console.error('❌ Token verification error:', err.message);
        if (isMounted) {
          setStoredToken(null);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    verifyToken();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const onExpired = () => {
      console.log('🔐 Session expired, logging out...');
      logout();
    };
    window.addEventListener('cctv-unauthorized', onExpired);
    
    return () => window.removeEventListener('cctv-unauthorized', onExpired);
  }, [logout]);

  // Monitor storage changes (ketika tab lain logout atau sessionStorage berubah)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'cctv_auth_token' && !e.newValue) {
        console.log('🔐 Token removed, logging out...');
        logout();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [logout]);

  // Setup idle logout - logout otomatis setelah 3 jam tidak ada aktivitas
  useIdleLogout(logout, !!user, 3 * 60 * 60 * 1000);

  // Token disimpan di sessionStorage (cctvApi.js),
  // sehingga otomatis terhapus oleh browser saat tab/jendela ditutup,
  // tetapi TETAP ADA saat di-refresh (F5).
  // Oleh karena itu, kita TIDAK BOLEH menggunakan event 'beforeunload' untuk menghapus token.

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin: user?.role === 'admin',
      login,
      logout,
      refreshUser,
    }),
    [user, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth harus di dalam AuthProvider');
  return ctx;
}
