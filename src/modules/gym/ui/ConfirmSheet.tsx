import type { ReactNode } from 'react';
import { Sheet } from '../../../ui/sheet/Sheet';
import { Button, type ButtonVariant } from '../../../ui/primitives/Button';
export interface ConfirmAction {
  label: string;
  variant?: ButtonVariant;
  onClick(): void;
}
/** A small decision dialog built on the Bottom_Sheet: a message and one button per choice. */
export function ConfirmSheet({ open, title, onClose, actions, children }: { open: boolean; title: string; onClose(): void; actions: ConfirmAction[]; children?: ReactNode }) {
  return (
    <Sheet open={open} onRequestClose={onClose} title={title}>
      {children ? <div className="mb-3 text-base">{children}</div> : null}
      <div className="flex flex-col gap-2">
        {actions.map((a) => (
          <Button key={a.label} variant={a.variant ?? 'secondary'} onClick={a.onClick}>
            {a.label}
          </Button>
        ))}
      </div>
    </Sheet>
  );
}
