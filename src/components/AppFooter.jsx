import React from 'react';

/*
  antislop filter applied:
  - Footer is structural, not decorative (C-3: exists because the page needs it).
  - No gradient, no shadow, no border-radius (footer sits flat at the bottom).
  - Single border-top — separates footer from page content. Not decorative.
  - Text is minimal and honest: product name + version + year.
  - No marketing copy, no "Realtime Surveillance" hype (R-02, C-5).
*/
export default function AppFooter() {
  return (
    <footer
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--surface-0)',
      }}
    >
      <div
        className="mx-auto flex max-w-7xl flex-col gap-1 px-4 py-2.5 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left"
      >
        <div className="flex items-center justify-center gap-2 sm:justify-start">
          <span className="text-[11px] font-semibold" style={{ color: 'var(--text-mid)' }}>
            CCTV Command
          </span>
          <span style={{ color: 'var(--text-lo)' }}>·</span>
          <span className="text-[11px]" style={{ color: 'var(--text-lo)' }}>
            TMC Surakarta
          </span>
        </div>

        <span className="text-[10px]" style={{ color: 'var(--text-lo)' }}>
          © {new Date().getFullYear()}
        </span>
      </div>
    </footer>
  );
}
