import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

export interface VirtualListProps<T> {
  items: readonly T[];
  /** Fixed row height in px. */
  rowHeight: number;
  keyOf(item: T): string;
  renderRow(item: T, index: number): ReactNode;
  /** Height of the scroll area; a CSS length. */
  height: string;
  /** Rows drawn above and below the visible rows. */
  overscan?: number;
  /** Scroll offset to start at (restored when returning to a screen). */
  initialScrollTop?: number;
  onScrollTop?(top: number): void;
  className?: string;
  'aria-label'?: string;
}

/**
 * A fixed-row-height windowed list: only the rows in view (plus overscan) are in the DOM, so filtering and
 * scrolling stay fast with 1,000+ rows (R14.2).
 */
export function VirtualList<T>({ items, rowHeight, keyOf, renderRow, height, overscan = 6, initialScrollTop = 0, onScrollTop, className = '', ...rest }: VirtualListProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(initialScrollTop);
  const [viewport, setViewport] = useState(640);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el === null) return;
    el.scrollTop = initialScrollTop;
    setViewport(el.clientHeight || 640);
    // Only on mount: later changes of `initialScrollTop` must not move the list.
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => setViewport(el.clientHeight || 640));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const first = Math.max(0, Math.floor(top / rowHeight) - overscan);
  const last = Math.min(items.length, Math.ceil((top + viewport) / rowHeight) + overscan);
  const rows: ReactNode[] = [];
  for (let i = first; i < last; i += 1) {
    const item = items[i]!;
    const style: CSSProperties = { position: 'absolute', top: i * rowHeight, height: rowHeight, left: 0, right: 0 };
    rows.push(
      <div key={keyOf(item)} style={style}>
        {renderRow(item, i)}
      </div>,
    );
  }
  return (
    <div
      ref={ref}
      className={`overflow-y-auto overscroll-contain ${className}`}
      style={{ height }}
      onScroll={(e) => {
        const next = e.currentTarget.scrollTop;
        setTop(next);
        onScrollTop?.(next);
      }}
      {...rest}
    >
      <div style={{ position: 'relative', height: items.length * rowHeight }}>{rows}</div>
    </div>
  );
}
