import { useCallback, useEffect, useRef, useState } from 'react';
import cctvApi from '../services/cctvApi';

const MAX_PING_LINES = 400;

function sessionKeysSignature(sessions) {
  return Object.keys(sessions)
    .sort()
    .join(',');
}

export function useTerminalPing() {
  const [terminalSessions, setTerminalSessions] = useState({});
  const sessionsRef = useRef(terminalSessions);

  useEffect(() => {
    sessionsRef.current = terminalSessions;
  }, [terminalSessions]);

  const openTerminalPing = useCallback((cctv) => {
    if (!cctv?.id) return;
    const id = String(cctv.id);
    setTerminalSessions((prev) => {
      if (prev[id]) return prev;
      return {
        ...prev,
        [id]: {
          id,
          cctv,
          isGateway: false,
          targetIp: cctv.ip,
          logs: [`Mulai Ping ke ${cctv.ip} [32 bytes data]:`],
        },
      };
    });
  }, []);

  const openGatewayPing = useCallback((cctv) => {
    if (!cctv?.id) return;
    if (!cctv?.gateway) {
      alert('⚠️ Gateway belum dikonfigurasi untuk perangkat ini');
      return;
    }
    const id = `gw-${cctv.id}`;
    setTerminalSessions((prev) => {
      if (prev[id]) return prev;
      return {
        ...prev,
        [id]: {
          id,
          cctv,
          isGateway: true,
          targetIp: cctv.gateway,
          logs: [`Mulai Ping ke Gateway ${cctv.gateway} (${cctv.name}) [32 bytes data]:`],
        },
      };
    });
  }, []);

  const closeTerminalPing = useCallback((id) => {
    const key = String(id);
    setTerminalSessions((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const openIdsSig = sessionKeysSignature(terminalSessions);

  useEffect(() => {
    if (!openIdsSig) return undefined;

    let isCancelled = false;
    let timerId = null;
    let inFlight = false;

    const runPing = async () => {
      if (isCancelled || inFlight) return;
      inFlight = true;

      const snap = sessionsRef.current;
      const entries = Object.entries(snap);
      if (entries.length === 0) {
        inFlight = false;
        return;
      }

      try {
        const results = await Promise.all(
          entries.map(async ([id, session]) => {
            const ipToPing = session.targetIp || (session.isGateway ? session.cctv?.gateway : session.cctv?.ip);
            if (!ipToPing) {
              return { id, line: 'Kesalahan: IP tujuan tidak valid.' };
            }
            try {
              const data = await cctvApi.pingIpApi(ipToPing);
              const line = data.alive
                ? `Balasan dari ${ipToPing}: bytes=32 waktu=${data.time || '<1'}ms TTL=64`
                : 'Request timed out (RTO).';
              return { id, line };
            } catch (err) {
              // Jika timeout atau gagal merespons, tampilkan RTO persis seperti ping Windows asli tanpa memutus sesi
              return { id, line: 'Request timed out (RTO).' };
            }
          }),
        );

        if (!isCancelled) {
          setTerminalSessions((prev) => {
            let next = { ...prev };
            for (const { id, line } of results) {
              if (!next[id]) continue;
              const logs = [...next[id].logs, line];
              next[id] = {
                ...next[id],
                logs: logs.length > MAX_PING_LINES ? logs.slice(-MAX_PING_LINES) : logs,
              };
            }
            return next;
          });
        }
      } finally {
        inFlight = false;
        if (!isCancelled) {
          // Hanya jadwalkan ping berikutnya 1000ms SETELAH proses ping saat ini selesai
          // Ini mencegah penumpukan request (request queue pileup) dan menjaga sistem tetap ringan
          timerId = setTimeout(runPing, 1000);
        }
      }
    };

    // Jalankan segera saat pertama kali dibuka
    runPing();

    return () => {
      isCancelled = true;
      if (timerId) clearTimeout(timerId);
    };
  }, [openIdsSig]);

  return { terminalSessions, openTerminalPing, openGatewayPing, closeTerminalPing };
}
