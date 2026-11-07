import type { ImportPlan } from '../../core/backup/import';
import { Button } from '../../ui/primitives/Button';
import { Sheet } from '../../ui/sheet/Sheet';

export interface ImportSheetProps {
  plan: ImportPlan | null;
  busy: boolean;
  onCancel(): void;
  onConfirm(): void;
}

const records = (n: number) => `${n} ${n === 1 ? 'record' : 'records'}`;

/** The confirmation before an import replaces data: export time, counts per present module, absent modules (R7.8). */
export function ImportSheet({ plan, busy, onCancel, onConfirm }: ImportSheetProps) {
  return (
    <Sheet open={plan !== null} onRequestClose={onCancel} title="Import backup?">
      {plan ? (
        <div className="flex flex-col gap-3">
          <p>
            Backup exported <span className="tabular-nums">{new Date(plan.exportedAt).toLocaleString()}</span>.
          </p>
          <ul className="list-disc pl-5">
            {plan.present.map((m) => (
              <li key={m.id}>
                {m.name}: <span className="tabular-nums">{records(m.recordCount)}</span>
              </li>
            ))}
            {plan.absent.map((name) => (
              <li key={name} className="text-muted">
                {name}: not in this file, unchanged
              </li>
            ))}
          </ul>
          <p className="text-danger">Importing replaces your current profile, settings and the data of the modules listed with records.</p>
          <div className="flex gap-2">
            <Button variant="danger" disabled={busy} onClick={onConfirm}>
              Replace my data
            </Button>
            <Button variant="secondary" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
