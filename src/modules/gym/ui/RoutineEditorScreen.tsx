import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { AppLink } from '../../../app/AppLink';
import { toDbWriteError } from '../../../core/db/errors';
import { newId } from '../../../core/ids';
import { NumberField } from '../../../ui/form/NumberField';
import { TextField } from '../../../ui/form/TextField';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { Skeleton } from '../../../ui/status/Skeleton';
import { Sheet } from '../../../ui/sheet/Sheet';
import { toast } from '../../../ui/toast/toastStore';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { deleteRoutine, updateRoutine, useRoutine } from '../data/routines';
import { useExercises } from '../data/exercises';
import { displayName } from '../logic/format';
import { EMPTY_QUERY, type LibraryQuery } from '../logic/library';
import { appendItems, canMoveDown, canMoveUp, moveItem, remainingSlots, setItemField, validateItemField, validateRoutineName, type ItemField } from '../logic/routines';
import type { Exercise, Routine, RoutineItem } from '../types';
import { ExerciseBrowser } from './ExerciseBrowser';
import { ExercisePhoto } from './ExercisePhoto';

function reportFailure(action: string, error: unknown): void {
  toast.show({ message: `${action}: ${toDbWriteError(error).reason}.`, kind: 'error' });
}

const FIELDS: Array<{ field: ItemField; label: string; hint?: string }> = [
  { field: 'targetSets', label: 'Sets', hint: '1 to 10' },
  { field: 'repMin', label: 'Min reps', hint: '1 to 100' },
  { field: 'repMax', label: 'Max reps', hint: '1 to 100' },
  { field: 'restSec', label: 'Rest (s)', hint: '15 to 600, steps of 15, or empty' },
];

const textOf = (item: RoutineItem, field: ItemField): string => (item[field] === undefined ? '' : String(item[field]));

/**
 * One settings field of an item. The text is checked while typing; a valid value is stored when the field
 * loses focus, an invalid one shows its rule and the stored value stays (R17.3, R17.4, R17.10).
 */
function ItemFieldInput({ routineId, item, field, label, hint }: { routineId: string; item: RoutineItem; field: ItemField; label: string; hint?: string }) {
  const [text, setText] = useState<string | undefined>();
  const [error, setError] = useState<string>();
  const stored = textOf(item, field);
  useEffect(() => setText(undefined), [stored]);
  const commit = () => {
    if (text === undefined) return;
    const result = validateItemField(field, text, item);
    if (!result.ok || result.value === item[field]) {
      setText(undefined);
      setError(undefined);
      return;
    }
    const value = result.value;
    void updateRoutine(routineId, (r) => ({ ...r, items: r.items.map((i) => (i.itemId === item.itemId ? setItemField(i, field, value) : i)) })).catch((e: unknown) => {
      setText(undefined);
      reportFailure('The change was not saved', e);
    });
  };
  return (
    <NumberField
      label={label}
      value={text ?? stored}
      {...(error !== undefined ? { error } : hint !== undefined ? { hint } : {})}
      onChange={(next) => {
        setText(next);
        const result = validateItemField(field, next, item);
        setError(result.ok ? undefined : result.message);
      }}
      onBlur={() => {
        commit();
        setError(undefined);
      }}
    />
  );
}

function ItemCard({ routine, item, index, exercise }: { routine: Routine; item: RoutineItem; index: number; exercise: Exercise | undefined }) {
  const move = (delta: number) =>
    void updateRoutine(routine.id, (r) => {
      const from = r.items.findIndex((i) => i.itemId === item.itemId);
      return from === -1 ? r : { ...r, items: moveItem(r.items, from, from + delta) };
    }).catch((e: unknown) => reportFailure('The change was not saved', e));
  const remove = () =>
    void updateRoutine(routine.id, (r) => ({ ...r, items: r.items.filter((i) => i.itemId !== item.itemId) })).catch((e: unknown) => reportFailure('The exercise was not removed', e));
  const name = exercise === undefined ? 'Unknown exercise' : displayName(exercise.name, exercise.archived);
  return (
    <CardFrame className="flex flex-col gap-3" aria-label={name}>
      <div className="flex items-center gap-3">
        <div className="w-14 shrink-0">
          <ExercisePhoto photo={exercise?.photos[0]} alt="" size={56} />
        </div>
        <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <ItemFieldInput key={f.field} routineId={routine.id} item={item} {...f} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" aria-label={`Move ${name} up`} disabled={!canMoveUp(index)} onClick={() => move(-1)}>
          Move up
        </Button>
        <Button variant="secondary" aria-label={`Move ${name} down`} disabled={!canMoveDown(index, routine.items.length)} onClick={() => move(1)}>
          Move down
        </Button>
        <Button variant="ghost" aria-label={`Remove ${name}`} onClick={remove}>
          Remove
        </Button>
      </div>
    </CardFrame>
  );
}

function RoutineNameField({ routine }: { routine: Routine }) {
  const [text, setText] = useState<string | undefined>();
  const [error, setError] = useState<string>();
  const commit = () => {
    if (text === undefined) return;
    const result = validateRoutineName(text);
    if (!result.ok) {
      setError(result.message); // the entered text stays in the field (R17.9)
      return;
    }
    setError(undefined);
    setText(undefined);
    if (result.name !== routine.name) {
      void updateRoutine(routine.id, (r) => ({ ...r, name: result.name })).catch((e: unknown) => reportFailure('The name was not saved', e));
    }
  };
  return (
    <TextField
      label="Routine name"
      value={text ?? routine.name}
      error={error}
      autoComplete="off"
      onChange={(next) => {
        setText(next);
        setError(undefined);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit();
      }}
    />
  );
}

function PickerSheet({ routine, exercises, open, onClose }: { routine: Routine; exercises: readonly Exercise[]; open: boolean; onClose(): void }) {
  const [query, setQuery] = useState<LibraryQuery>(EMPTY_QUERY);
  const [picked, setPicked] = useState<string[]>([]);
  const slots = remainingSlots(routine);
  const close = () => {
    setPicked([]);
    onClose();
  };
  const confirm = () => {
    const ids = picked;
    close();
    void updateRoutine(routine.id, (r) => appendItems(r, ids, newId)).catch((e: unknown) => reportFailure('The exercises were not added', e));
  };
  return (
    <Sheet open={open} onRequestClose={close} dirty={picked.length > 0} title="Add exercises">
      <p className="mb-2 text-sm text-muted">
        {picked.length} selected, {slots - picked.length} more can be added
      </p>
      <ExerciseBrowser
        mode="pick"
        exercises={exercises}
        query={query}
        onQueryChange={setQuery}
        selected={new Set(picked)}
        selectionFull={picked.length >= slots}
        listHeight="calc(100dvh - 30rem)"
        onToggle={(x) => setPicked((p) => (p.includes(x.id) ? p.filter((id) => id !== x.id) : p.length < slots ? [...p, x.id] : p))}
      />
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button disabled={picked.length === 0} onClick={confirm}>
          Add {picked.length || ''}
        </Button>
      </div>
    </Sheet>
  );
}

/** Routine builder (R17.2 to R17.11). */
export default function RoutineEditorScreen() {
  const { routineId = '' } = useParams();
  const routine = useRoutine(routineId);
  const { exercises } = useExercises();
  const navigate = useAppNavigate();
  const [picking, setPicking] = useState(false);

  if (routine === undefined || exercises === undefined) return <Skeleton rows={4} />;
  if (routine === null) {
    return (
      <EmptyState title="Routine not found">
        <AppLink to="/gym/routines" className="text-accent underline">
          Back to routines
        </AppLink>
      </EmptyState>
    );
  }
  const byId = new Map(exercises.map((x) => [x.id, x]));
  const remove = async () => {
    try {
      await deleteRoutine(routine.id);
      navigate('/gym/routines', { replace: true });
    } catch (e) {
      reportFailure('Could not delete the routine', e);
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Edit routine</h1>
      <RoutineNameField key={routine.id} routine={routine} />
      {routine.items.length === 0 ? (
        <EmptyState title="No exercises in this routine">Add exercises from the library.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {routine.items.map((item, index) => (
            <li key={item.itemId}>
              <ItemCard routine={routine} item={item} index={index} exercise={byId.get(item.exerciseId)} />
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={remainingSlots(routine) === 0} onClick={() => setPicking(true)}>
          Add exercises
        </Button>
        <Button variant="danger" onClick={() => void remove()}>
          Delete routine
        </Button>
      </div>
      {remainingSlots(routine) === 0 ? <p className="text-sm text-muted">A routine can have at most 50 exercises.</p> : null}
      <PickerSheet routine={routine} exercises={exercises} open={picking} onClose={() => setPicking(false)} />
    </section>
  );
}
