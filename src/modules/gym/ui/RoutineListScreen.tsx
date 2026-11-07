import { useRef, useState } from 'react';
import { AppLink } from '../../../app/AppLink';
import { toDbWriteError } from '../../../core/db/errors';
import { newIdemKey } from '../../../core/ids';
import { TextField } from '../../../ui/form/TextField';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { Skeleton } from '../../../ui/status/Skeleton';
import { toast } from '../../../ui/toast/toastStore';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { createRoutine, deleteRoutine, useRoutines } from '../data/routines';
import { validateRoutineName } from '../logic/routines';

/** Routine list with a "new routine" form (R17.1, R17.8, R17.9). */
export default function RoutineListScreen() {
  const routines = useRoutines();
  const navigate = useAppNavigate();
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // The key belongs to the draft: a retry after a failed save reuses it (R11.6).
  const idemKey = useRef(newIdemKey());

  const create = async () => {
    const result = validateRoutineName(name);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setError(undefined);
    setBusy(true);
    try {
      const routine = await createRoutine(result.name, idemKey.current);
      idemKey.current = newIdemKey();
      setName('');
      navigate(`/gym/routines/${routine.id}`);
    } catch (e) {
      toast.show({ message: `The routine was not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteRoutine(id);
    } catch (e) {
      toast.show({ message: `Could not delete the routine: ${toDbWriteError(e).reason}.`, kind: 'error' });
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Routines</h1>
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <div className="flex-1">
          <TextField label="New routine name" value={name} onChange={setName} error={error} autoComplete="off" />
        </div>
        <Button type="submit" disabled={busy}>
          Create
        </Button>
      </form>
      {routines === undefined ? (
        <Skeleton rows={3} />
      ) : routines.length === 0 ? (
        <EmptyState title="No routines yet">Create a routine to start planned workouts in one tap.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {routines.map((r) => (
            <li key={r.id}>
              <CardFrame className="flex items-center justify-between gap-2">
                <AppLink to={`/gym/routines/${r.id}`} className="tap flex min-w-0 flex-1 flex-col justify-center">
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="text-sm text-muted">{r.items.length === 1 ? '1 exercise' : `${r.items.length} exercises`}</span>
                </AppLink>
                <Button variant="ghost" aria-label={`Delete ${r.name}`} onClick={() => void remove(r.id)}>
                  Delete
                </Button>
              </CardFrame>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
