import { useState } from 'react';
import { toDbWriteError } from '../../../core/db/errors';
import { Button } from '../../../ui/primitives/Button';
import { Sheet } from '../../../ui/sheet/Sheet';
import { toast } from '../../../ui/toast/toastStore';
import { archiveExercise } from '../data/exercises';
import { useRoutines } from '../data/routines';
import { archiveImpact } from '../logic/exerciseForm';
import type { Exercise } from '../types';

/** "Delete" (custom) or "Hide" (library) with the routine confirmation of R16.2. */
export function ArchiveControl({ exercise, onArchived }: { exercise: Exercise; onArchived(): void }) {
  const routines = useRoutines();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const verb = exercise.source === 'custom' ? 'Delete' : 'Hide';
  const impact = archiveImpact(routines ?? [], exercise.id);

  const run = async () => {
    setBusy(true);
    try {
      await archiveExercise(exercise);
      setConfirming(false);
      onArchived();
    } catch (error) {
      toast.show({ message: `Could not ${verb.toLowerCase()} the exercise: ${toDbWriteError(error).reason}.`, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="danger" disabled={busy || routines === undefined} onClick={() => (impact.length === 0 ? void run() : setConfirming(true))}>
        {verb}
      </Button>
      <Sheet open={confirming} onRequestClose={() => setConfirming(false)} title={`${verb} ${exercise.name}?`}>
        <p className="mb-2">These routines use this exercise. The exercise items will be removed from them:</p>
        <ul className="mb-4 list-disc pl-5">
          {impact.map((row) => (
            <li key={row.routineId}>
              {row.routineName}: {row.itemCount} {row.itemCount === 1 ? 'item' : 'items'}
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={busy} onClick={() => void run()}>
            {verb}
          </Button>
        </div>
      </Sheet>
    </>
  );
}
