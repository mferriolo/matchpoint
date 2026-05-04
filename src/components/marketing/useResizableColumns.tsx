import { useCallback, useEffect, useRef, useState } from 'react';

export interface ColumnDef {
  key: string;
  defaultWidth: number;
  minWidth?: number;
}

export interface UseResizableColumnsResult {
  widths: Record<string, number>;
  startResize: (key: string, e: React.MouseEvent) => void;
  reset: () => void;
  ResizeHandle: React.FC<{ columnKey: string }>;
}

const DEFAULT_MIN = 60;

/** Persist + drive a set of resizable column widths. Stores under
 *  `column-widths:{storageKey}` so multiple tables can coexist. The
 *  hook returns:
 *    - widths: current pixel width per column key
 *    - startResize: low-level mousedown handler if you want to render
 *      your own handle
 *    - ResizeHandle: a drop-in 4px-wide handle for use inside a th
 *      that already has `position: relative`
 *    - reset: clear back to defaults */
export function useResizableColumns(
  storageKey: string,
  columns: ColumnDef[]
): UseResizableColumnsResult {
  const persistKey = `column-widths:${storageKey}`;

  const [widths, setWidths] = useState<Record<string, number>>(() => {
    const fallback: Record<string, number> = {};
    for (const c of columns) fallback[c.key] = c.defaultWidth;
    if (typeof window === 'undefined') return fallback;
    try {
      const raw = window.localStorage.getItem(persistKey);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Record<string, number>;
      // Merge — defaults win for any column added after persistence.
      return { ...fallback, ...parsed };
    } catch {
      return fallback;
    }
  });

  const minByKey = useRef<Record<string, number>>({});
  for (const c of columns) {
    minByKey.current[c.key] = c.minWidth ?? DEFAULT_MIN;
  }

  // Persist whenever widths change. Keep this lazy so initial render
  // doesn't write the default set back unnecessarily.
  const initialRef = useRef(true);
  useEffect(() => {
    if (initialRef.current) { initialRef.current = false; return; }
    if (typeof window === 'undefined') return;
    try { window.localStorage.setItem(persistKey, JSON.stringify(widths)); } catch {}
  }, [widths, persistKey]);

  const startResize = useCallback((key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[key] ?? DEFAULT_MIN;
    const min = minByKey.current[key] ?? DEFAULT_MIN;

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const next = Math.max(min, startW + dx);
      setWidths(prev => (prev[key] === next ? prev : { ...prev, [key]: next }));
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [widths]);

  const reset = useCallback(() => {
    const fallback: Record<string, number> = {};
    for (const c of columns) fallback[c.key] = c.defaultWidth;
    setWidths(fallback);
  }, [columns]);

  const ResizeHandle: React.FC<{ columnKey: string }> = ({ columnKey }) => (
    <span
      role="separator"
      aria-orientation="vertical"
      onMouseDown={(e) => startResize(columnKey, e)}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize select-none hover:bg-[#911406]/30 active:bg-[#911406]/50"
      title="Drag to resize"
    />
  );

  return { widths, startResize, reset, ResizeHandle };
}
