import { useEffect, useRef, useCallback } from 'react';

/**
 * Hook untuk logout otomatis jika 3 jam tidak ada activity
 * @param {function} onLogout - Callback saat dibutuhkan logout
 * @param {boolean} isActive - Jika user sudah login
 * @param {number} idleTimeMs - Waktu idle dalam milliseconds (default: 3 jam)
 */
export function useIdleLogout(onLogout, isActive, idleTimeMs = 3 * 60 * 60 * 1000) {
  const idleTimerRef = useRef(null);
  const lastActivityRef = useRef(Date.now());

  const resetIdleTimer = useCallback(() => {
    if (!isActive) return;

    // Clear previous timer
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
    }

    lastActivityRef.current = Date.now();
    
    // Setup new timer
    idleTimerRef.current = setTimeout(() => {
      console.warn(`⏰ Idle timeout: Tidak ada aktivitas selama ${idleTimeMs / 1000 / 60 / 60} jam. Logout otomatis...`);
      onLogout();
    }, idleTimeMs);
  }, [isActive, idleTimeMs, onLogout]);

  // Track user activity
  useEffect(() => {
    if (!isActive) return;

    // Activity events yang di-monitor
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivityRef.current;
      
      // Hanya reset jika lebih dari 1 menit sejak activity terakhir
      // (untuk menghindari reset berulang-ulang)
      if (timeSinceLastActivity > 60000) {
        console.log('📍 User activity detected, reset idle timer');
        resetIdleTimer();
      }
    };

    // Add event listeners
    events.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Initial timer
    resetIdleTimer();

    return () => {
      // Cleanup
      events.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
    };
  }, [isActive, resetIdleTimer]);

  return {
    resetIdleTimer,
    getLastActivityTime: () => new Date(lastActivityRef.current),
    getIdleTime: () => Date.now() - lastActivityRef.current,
  };
}
