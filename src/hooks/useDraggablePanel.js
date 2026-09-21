import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Panel dengan posisi fixed (left/top px) yang bisa digeser lewat header.
 * @param resetKey - ganti nilai untuk reset posisi ke default (mis. id CCTV)
 * @param getDefaultPosition - () => ({ x, y })
 * @param panelWidth - perkiraan lebar untuk clamp
 * @param panelHeight - perkiraan tinggi untuk clamp
 */
export function useDraggablePanel(resetKey, getDefaultPosition) {
  const [position, setPosition] = useState(() => {
    if (typeof window !== 'undefined' && typeof getDefaultPosition === 'function') {
      return getDefaultPosition();
    }
    return { x: 16, y: 80 };
  });
  const positionRef = useRef(position);
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  const dragRef = useRef(null);

  useEffect(() => {
    if (typeof getDefaultPosition === 'function') {
      setPosition(getDefaultPosition());
    }
  }, [resetKey]);

  const clamp = useCallback((x, y) => ({ x, y }), []);

  const startDrag = useCallback((clientX, clientY) => {
    const p = positionRef.current;
    dragRef.current = {
      dragging: true,
      startX: clientX,
      startY: clientY,
      origX: p.x,
      origY: p.y,
    };
  }, []);

  const onHeaderMouseDown = useCallback(
    (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) return;
      startDrag(e.clientX, e.clientY);
      e.preventDefault();
    },
    [startDrag],
  );

  const onHeaderTouchStart = useCallback(
    (e) => {
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a')) return;
      startDrag(e.touches[0].clientX, e.touches[0].clientY);
      // Do not prevent default here to allow touch clicks on other elements, 
      // but touch-action: none on the header is recommended in CSS
    },
    [startDrag],
  );

  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      if (!d?.dragging) return;
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      const dx = clientX - d.startX;
      const dy = clientY - d.startY;
      setPosition(clamp(d.origX + dx, d.origY + dy));
    };

    const onUp = () => {
      if (dragRef.current) dragRef.current.dragging = false;
    };

    // Use passive: false so we can preventDefault on touchmove if needed
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [clamp]);

  return { 
    position, 
    setPosition, 
    onHeaderMouseDown, 
    onHeaderTouchStart,
    dragHandlers: {
      onMouseDown: onHeaderMouseDown,
      onTouchStart: onHeaderTouchStart
    }
  };
}
