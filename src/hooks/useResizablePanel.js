import { useCallback, useMemo, useRef, useState } from 'react';

/**
 * Resizable panel (bottom-right) berbasis mouse/pointer.
 * Bug yang pernah terjadi ("stuck") dihindari dengan:
 * - Cleanup selalu jalan di `pointerup` / `pointercancel` / `blur`
 * - Tidak ada filter `pointerId` yang bisa bikin cleanup tidak terpanggil
 * - Safety timeout agar state tidak menggantung selamanya
 */
export function useResizablePanel({
  initialW,
  initialH,
  minW = 280,
  minH = 200,
  maxW,
  maxH,
  onResize,
} = {}) {
  const [size, setSize] = useState(() => ({
    w: initialW ?? 480,
    h: initialH ?? 380,
  }));

  const resizingRef = useRef(false);
  const safetyTimerRef = useRef(null);

  const maxSizes = useMemo(
    () => ({
      maxW: typeof maxW === 'number' ? maxW : Number.MAX_SAFE_INTEGER,
      maxH: typeof maxH === 'number' ? maxH : Number.MAX_SAFE_INTEGER,
    }),
    [maxW, maxH],
  );

  const startResize = useCallback(
    (direction = 'se') => (e) => {
      if (resizingRef.current) return;
      if (e.pointerType === 'mouse' && typeof e.button === 'number' && e.button !== 0) return;

      e.preventDefault();
      e.stopPropagation();

      resizingRef.current = true;

      const startX = e.clientX;
      const startY = e.clientY;
      const startW = size.w;
      const startH = size.h;
      let previousLeftDelta = 0;
      let previousTopDelta = 0;

      const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

      const prevUserSelect = document.body.style.userSelect;
      const prevCursor = document.body.style.cursor;
      const cursorByDirection = {
        n: 'ns-resize',
        s: 'ns-resize',
        e: 'ew-resize',
        w: 'ew-resize',
        ne: 'nesw-resize',
        sw: 'nesw-resize',
        nw: 'nwse-resize',
        se: 'nwse-resize',
      };
      document.body.style.userSelect = 'none';
      document.body.style.cursor = cursorByDirection[direction] || 'nwse-resize';

      const cleanup = () => {
        if (!resizingRef.current) return;
        resizingRef.current = false;

        if (safetyTimerRef.current) {
          clearTimeout(safetyTimerRef.current);
          safetyTimerRef.current = null;
        }

        document.removeEventListener('pointermove', onMove, { capture: true });
        document.removeEventListener('pointerup', onUp, { capture: true });
        document.removeEventListener('pointercancel', onCancel, { capture: true });

        document.body.style.userSelect = prevUserSelect;
        document.body.style.cursor = prevCursor || '';
      };

      const onMove = (ev) => {
        if (!resizingRef.current) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        const horizontalFactor = direction.includes('w') ? -1 : direction.includes('e') ? 1 : 0;
        const verticalFactor = direction.includes('n') ? -1 : direction.includes('s') ? 1 : 0;
        const nextW = clamp(startW + (horizontalFactor * dx), minW, maxSizes.maxW);
        const nextH = clamp(startH + (verticalFactor * dy), minH, maxSizes.maxH);
        setSize({ w: nextW, h: nextH });
        const leftDelta = direction.includes('w') ? startW - nextW : 0;
        const topDelta = direction.includes('n') ? startH - nextH : 0;
        onResize?.({
          direction,
          deltaX: leftDelta - previousLeftDelta,
          deltaY: topDelta - previousTopDelta,
          width: nextW,
          height: nextH,
        });
        previousLeftDelta = leftDelta;
        previousTopDelta = topDelta;
      };

      const onUp = () => cleanup();
      const onCancel = () => cleanup();

      safetyTimerRef.current = setTimeout(() => cleanup(), 30000);

      try {
        e.currentTarget?.setPointerCapture?.(e.pointerId);
      } catch {
      }

      document.addEventListener('pointermove', onMove, { capture: true });
      document.addEventListener('pointerup', onUp, { capture: true });
      document.addEventListener('pointercancel', onCancel, { capture: true });

      const onBlur = () => cleanup();
      window.addEventListener('blur', onBlur, { once: true });
    },
    [maxSizes.maxH, maxSizes.maxW, minH, minW, onResize, size.h, size.w],
  );

  return { size, setSize, startResize };
}

