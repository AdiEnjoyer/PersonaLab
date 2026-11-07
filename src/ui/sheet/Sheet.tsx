import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useDrag } from '../gestures/useDrag';
import { useReducedMotion } from '../motion/useReducedMotion';
import { Button } from '../primitives/Button';

export interface SheetProps {
  open: boolean;
  onRequestClose(): void;
  /** Unsaved changes: dismissing then asks "Discard changes?" first (R68.7). */
  dirty?: boolean;
  title?: string;
  children: ReactNode;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onRequestClose, dirty = false, title, children }: SheetProps) {
  const reduced = useReducedMotion();
  const [confirming, setConfirming] = useState(false);
  const onRequestCloseRef = useRef(onRequestClose);
  onRequestCloseRef.current = onRequestClose;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const released = useRef<(offset: number) => void>(() => undefined);
  const drag = useDrag<HTMLDivElement>({
    axis: 'y',
    direction: 'positive',
    reducedMotion: reduced,
    onDismiss: (offset) => released.current(offset),
  });
  released.current = (offset) => {
    if (dirtyRef.current) {
      drag.snapBack();
      setConfirming(true);
    } else {
      const height = drag.ref.current?.getBoundingClientRect().height ?? offset;
      drag.slideOut(Math.max(height, offset), () => onRequestCloseRef.current());
    }
  };
  const panelRef = drag.ref;

  /** Backdrop tap and Escape (R68.6, R68.7). */
  const requestDismiss = useCallback(() => {
    if (dirtyRef.current) setConfirming(true);
    else onRequestCloseRef.current();
  }, []);

  useEffect(() => {
    if (!open) {
      setConfirming(false);
      return undefined;
    }
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => previous?.focus();
  }, [open, panelRef]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      requestDismiss();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center" onKeyDown={onKeyDown}>
      <div
        data-testid="sheet-backdrop"
        className="absolute inset-0 bg-black/50"
        style={{ animation: reduced ? undefined : 'pl-fade-in 150ms linear' }}
        onClick={requestDismiss}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Dialog'}
        tabIndex={-1}
        className="pb-sheet relative max-h-[90dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-surface px-4 pt-2 shadow-xl outline-none"
        {...drag.handlers}
      >
        <div className="flex flex-col items-center" style={{ touchAction: 'none' }}>
          <div className="mt-1 mb-2 h-1.5 w-10 rounded-full bg-line" aria-hidden="true" />
          {title ? <h2 className="mb-2 self-start text-lg font-semibold">{title}</h2> : null}
        </div>
        {children}
        {confirming ? (
          <div role="alertdialog" aria-label="Discard changes?" className="mt-4 rounded-continuous bg-surface-2 p-4">
            <p className="font-medium">Discard changes?</p>
            <div className="mt-3 flex gap-2">
              <Button variant="danger" onClick={() => onRequestCloseRef.current()}>
                Discard
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Keep editing
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
