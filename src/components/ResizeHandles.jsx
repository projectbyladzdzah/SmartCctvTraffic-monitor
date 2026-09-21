import React from 'react';

// Resize handles placed safely around edges without blocking header window controls
const handles = [
  ['s', 'absolute bottom-0 left-4 right-4 h-4 cursor-ns-resize'],
  ['e', 'absolute bottom-4 right-0 top-12 w-4 cursor-ew-resize'],
  ['w', 'absolute bottom-4 left-0 top-12 w-4 cursor-ew-resize'],
  ['se', 'absolute bottom-0 right-0 h-10 w-10 cursor-nwse-resize z-20'],
  ['sw', 'absolute bottom-0 left-0 h-8 w-8 cursor-nesw-resize'],
];

export default function ResizeHandles({ onResize, onStartResize }) {
  const handler = onStartResize || onResize;
  if (typeof handler !== 'function') return null;

  return handles.map(([direction, className]) => {
    const handlePointerDown = (e) => {
      try {
        const res = handler(direction);
        if (typeof res === 'function') {
          res(e);
        }
      } catch (err) {
        console.warn('Resize handle error:', err);
      }
    };

    return (
      <div
        key={direction}
        role="presentation"
        title="Ubah ukuran panel"
        onPointerDown={handlePointerDown}
        className={`${className} z-10 touch-none flex items-end justify-end`}
      >
        {direction === 'se' && (
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-slate-400 opacity-50 m-1"
          >
            <path d="M21 15v6h-6" />
            <path d="M21 21l-7-7" />
            <path d="M15 3h6v6" />
            <path d="M21 3l-7 7" />
            <path d="M9 21H3v-6" />
            <path d="M3 21l7-7" />
          </svg>
        )}
      </div>
    );
  });
}