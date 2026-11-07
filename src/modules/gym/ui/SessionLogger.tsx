import { useEffect, useMemo, useState } from 'react';
import { AppLink } from '../../../app/AppLink';
import { toDbWriteError } from '../../../core/db/errors';
import { useSetting } from '../../../core/settings/useSetting';
import { undoService } from '../../../core/undo/undoService';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { Skeleton } from '../../../ui/status/Skeleton';
import { toast } from '../../../ui/toast/toastStore';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { newId } from '../../../core/ids';
import { changeActive, getActiveSession, loadActive, useActiveStore } from '../data/activeStore';
import { useExercises } from '../data/exercises';
import { discardActive, finishActive, useFinishedSessions } from '../data/sessions';
import { elapsedLabel } from '../logic/dashboard';
import { canComplete } from '../logic/entry';
import { displayName, formatWeight } from '../logic/format';
import { prMarksForExercise, PR_LABELS, type PrType } from '../logic/pr';
import { previousLabel, referenceSets } from '../logic/prefill';
import {
  addExercises,
  addSet,
  adjustRest,
  canAddSet,
  completeSet,
  editSetField,
  finishPlan,
  isFieldTextValid,
  moveEntry,
  removeEntry,
  removeSet,
  restoreRemoved,
  restSecFor,
  uncompleteSet,
  type Removed,
  type RestAction,
} from '../logic/session';
import { GYM_SETTING_KEYS } from '../settings';
import type { Exercise, Session, SessionEntry, SetRecord } from '../types';
import { ConfirmSheet } from './ConfirmSheet';
import { ExercisePickerSheet } from './ExercisePickerSheet';
import { RestTimerBar } from './RestTimerBar';
import { primeRestSound } from './restSound';
import { useNow } from './useNow';
const ctx = () => ({ now: Date.now(), newId });
const INVALID = 'border-danger';
const field = 'tap w-full rounded-continuous border bg-surface-2 px-3 text-base tabular-nums';
function SetRow({
  n,
  set,
  entry,
  previous,
  marks,
  defaultRestSec,
}: {
  n: number;
  set: SetRecord;
  entry: SessionEntry;
  previous: string;
  marks: readonly PrType[];
  defaultRestSec: number;
}) {
  const [texts, setTexts] = useState<{ weight?: string; reps?: string }>({});
  const [flagged, setFlagged] = useState<Array<'weight' | 'reps'>>([]);
  const shown = (f: 'weight' | 'reps'): string => texts[f] ?? (set[f] === undefined ? '' : f === 'weight' ? formatWeight(set.weight as number) : String(set.reps));
  const invalid = (f: 'weight' | 'reps') => (texts[f] !== undefined && !isFieldTextValid(f, texts[f]!)) || flagged.includes(f);
  const edit = (f: 'weight' | 'reps', text: string) => {
    setTexts((t) => ({ ...t, [f]: text }));
    setFlagged((x) => x.filter((y) => y !== f));
    changeActive((s) => editSetField(s, entry.entryId, set.id, f, text));
  };
  const settle = (f: 'weight' | 'reps') => {
    if (texts[f] !== undefined && isFieldTextValid(f, texts[f]!)) setTexts((t) => ({ ...t, [f]: undefined }));
  };
  const toggle = () => {
    primeRestSound();
    if (set.completed) {
      changeActive((s) => uncompleteSet(s, entry.entryId, set.id));
      return;
    }
    const bad = (['weight', 'reps'] as const).filter((f) => texts[f] !== undefined && !isFieldTextValid(f, texts[f]!));
    if (bad.length > 0) {
      setFlagged(bad);
      return;
    }
    const check = canComplete(set);
    if (!check.ok) {
      setFlagged(check.invalid);
      return;
    }
    setFlagged([]);
    changeActive((s) => {
      const result = completeSet(s, entry.entryId, set.id, Date.now(), restSecFor(entry, defaultRestSec));
      return result.ok ? result.session : s;
    });
    setTexts({});
  };
  const removeIt = () => {
    const current = getActiveSession();
    const result = current ? removeSet(current, entry.entryId, set.id) : undefined;
    if (!result) return;
    changeActive(() => result.session);
    pushUndo('Set removed', result.undo);
  };
  const prefilled = (f: 'weight' | 'reps') => !set.completed && texts[f] === undefined && (f === 'weight' ? set.weightSource : set.repsSource) === 'prefill';
  const style = (f: 'weight' | 'reps') => `${field} ${invalid(f) ? INVALID : 'border-line'} ${prefilled(f) ? 'text-muted' : 'text-fg'}`;
  return (
    <li className={`flex flex-col gap-1 rounded-continuous p-2 ${marks.length > 0 ? 'bg-accent/10' : ''}`}>
      <div className="grid grid-cols-[2rem_1fr_1fr_auto_auto] items-center gap-2">
        <span className="text-sm text-muted">{n}</span>
        <input
          aria-label={`Set ${n} weight in kg`}
          aria-invalid={invalid('weight') ? true : undefined}
          inputMode="decimal"
          autoComplete="off"
          className={style('weight')}
          value={shown('weight')}
          onChange={(e) => edit('weight', e.target.value.replace(/,/g, '.'))}
          onBlur={() => settle('weight')}
        />
        <input
          aria-label={`Set ${n} reps`}
          aria-invalid={invalid('reps') ? true : undefined}
          inputMode="numeric"
          autoComplete="off"
          className={style('reps')}
          value={shown('reps')}
          onChange={(e) => edit('reps', e.target.value)}
          onBlur={() => settle('reps')}
        />
        <Button variant={set.completed ? 'primary' : 'secondary'} aria-pressed={set.completed} aria-label={set.completed ? `Set ${n} completed, tap to undo` : `Complete set ${n}`} onClick={toggle}>
          {'\u2713'}
        </Button>
        <Button variant="ghost" aria-label={`Remove set ${n}`} onClick={removeIt}>
          {'\u00d7'}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-10 text-xs text-muted">
        <span>Previous: {previous}</span>
        {marks.map((t) => (
          <span key={t} className="rounded-full bg-accent px-2 py-0.5 font-medium text-accent-fg">
            {PR_LABELS[t]}
          </span>
        ))}
      </div>
    </li>
  );
}
function pushUndo(label: string, removed: Removed): void {
  undoService.push({
    label,
    undo: async () => {
      changeActive((s) => restoreRemoved(s, removed));
    },
  });
}
function EntryCard({
  entry,
  index,
  count,
  exercise,
  history,
  session,
  defaultRestSec,
}: {
  entry: SessionEntry;
  index: number;
  count: number;
  exercise: Exercise | undefined;
  history: readonly Session[];
  session: Session;
  defaultRestSec: number;
}) {
  const ref = useMemo(() => referenceSets(entry.exerciseId, history), [entry.exerciseId, history]);
  const marks = useMemo(() => prMarksForExercise([...history, session], entry.exerciseId), [history, session, entry.exerciseId]);
  const name = exercise === undefined ? 'Unknown exercise' : displayName(exercise.name, exercise.archived);
  const removeIt = () => {
    const current = getActiveSession();
    const result = current ? removeEntry(current, entry.entryId) : undefined;
    if (!result) return;
    changeActive(() => result.session);
    pushUndo('Exercise removed', result.undo);
  };
  return (
    <CardFrame className="flex flex-col gap-2" aria-label={name}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 text-lg font-semibold">{name}</h2>
        <Button variant="ghost" aria-label={`Move ${name} up`} disabled={index === 0} onClick={() => changeActive((s) => moveEntry(s, index, index - 1))}>
          Move up
        </Button>
        <Button variant="ghost" aria-label={`Move ${name} down`} disabled={index === count - 1} onClick={() => changeActive((s) => moveEntry(s, index, index + 1))}>
          Move down
        </Button>
      </div>
      {entry.repMin !== undefined && entry.repMax !== undefined ? (
        <p className="text-sm text-muted">
          Target {entry.repMin === entry.repMax ? entry.repMin : `${entry.repMin}\u2013${entry.repMax}`} reps
        </p>
      ) : null}
      <ul className="flex flex-col gap-1">
        {entry.sets.map((set, i) => (
          <SetRow key={set.id} n={i + 1} set={set} entry={entry} previous={previousLabel(i + 1, ref)} marks={marks.get(set.id) ?? []} defaultRestSec={defaultRestSec} />
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!canAddSet(entry)} onClick={() => changeActive((s) => addSet(s, entry.entryId, history, ctx()))}>
          Add set
        </Button>
        <Button variant="ghost" aria-label={`Remove ${name}`} onClick={removeIt}>
          Remove exercise
        </Button>
      </div>
    </CardFrame>
  );
}
/** The Session_Logger: exercise cards, set rows, rest timer and the finish flow (R18 to R22). */
export default function SessionLogger() {
  const session = useActiveStore();
  const { exercises } = useExercises();
  const history = useFinishedSessions();
  const [defaultRestSec] = useSetting<number>(GYM_SETTING_KEYS.defaultRestSec);
  const navigate = useAppNavigate();
  const [picking, setPicking] = useState(false);
  const [prompt, setPrompt] = useState<'incomplete' | 'none-completed'>();
  const [busy, setBusy] = useState(false);
  const now = useNow(1000, session !== null && session !== undefined);
  useEffect(() => {
    void loadActive(true).catch((e: unknown) => toast.show({ message: `The workout could not be loaded: ${toDbWriteError(e).reason}.`, kind: 'error' }));
  }, []);
  useEffect(() => {
    if (session === undefined) void loadActive().catch(() => undefined);
  }, [session]);
  if (session === undefined || exercises === undefined || history === undefined) return <Skeleton rows={5} />;
  if (session === null) {
    return (
      <EmptyState title="No active workout">
        <AppLink to="/gym" className="text-accent underline">
          Back to Gym
        </AppLink>
      </EmptyState>
    );
  }
  const byId = new Map(exercises.map((x) => [x.id, x]));
  const finishNow = async () => {
    if (busy) return;
    setBusy(true);
    setPrompt(undefined);
    try {
      const done = await finishActive();
      navigate(`/gym/summary/${encodeURIComponent(done.id)}`, { replace: true });
    } catch (error) {
      toast.show({ message: `Finishing the session failed: ${toDbWriteError(error).reason}.`, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const onFinish = () => {
    const plan = finishPlan(session);
    if (plan.completed === 0) setPrompt('none-completed');
    else if (plan.incomplete > 0) setPrompt('incomplete');
    else void finishNow();
  };
  const discard = async () => {
    setPrompt(undefined);
    try {
      await discardActive();
      navigate('/gym', { replace: true });
    } catch (error) {
      toast.show({ message: `The session was not discarded: ${toDbWriteError(error).reason}.`, kind: 'error' });
    }
  };
  const plan = finishPlan(session);
  return (
    <section className="flex flex-col gap-3" onPointerDown={primeRestSound}>
      <div className="flex items-baseline justify-between gap-2">
        <h1 className="text-xl font-semibold">{session.routineName ?? 'Workout'}</h1>
        <span className="tabular-nums text-muted" aria-label="Elapsed time">
          {elapsedLabel(session.startedAt, now)}
        </span>
      </div>
      <RestTimerBar timer={session.restTimer} onAction={(a: RestAction) => changeActive((s) => adjustRest(s, a, Date.now()))} />
      {session.entries.length === 0 ? <EmptyState title="No exercises yet">Add exercises to start logging.</EmptyState> : null}
      {session.entries.map((entry, i) => (
        <EntryCard key={entry.entryId} entry={entry} index={i} count={session.entries.length} exercise={byId.get(entry.exerciseId)} history={history} session={session} defaultRestSec={defaultRestSec} />
      ))}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setPicking(true)}>
          Add exercise
        </Button>
        <Button disabled={busy} onClick={onFinish}>
          Finish
        </Button>
      </div>
      <ExercisePickerSheet exercises={exercises} open={picking} onClose={() => setPicking(false)} onConfirm={(ids) => changeActive((s) => addExercises(s, ids, history, ctx()))} />
      <ConfirmSheet
        open={prompt === 'incomplete'}
        title="Finish workout?"
        onClose={() => setPrompt(undefined)}
        actions={[
          { label: 'Finish and discard', variant: 'primary', onClick: () => void finishNow() },
          { label: 'Cancel', onClick: () => setPrompt(undefined) },
        ]}
      >
        {plan.incomplete} {plan.incomplete === 1 ? 'set is' : 'sets are'} not completed and will be discarded.
      </ConfirmSheet>
      <ConfirmSheet
        open={prompt === 'none-completed'}
        title="No completed sets"
        onClose={() => setPrompt(undefined)}
        actions={[
          { label: 'Discard session', variant: 'danger', onClick: () => void discard() },
          { label: 'Keep logging', onClick: () => setPrompt(undefined) },
        ]}
      >
        This session has no completed sets, so it cannot be saved.
      </ConfirmSheet>
    </section>
  );
}
