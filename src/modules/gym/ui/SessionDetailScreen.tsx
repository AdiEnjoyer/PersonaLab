import { useState } from 'react';
import { useParams } from 'react-router';
import { AppLink } from '../../../app/AppLink';
import { toDbWriteError } from '../../../core/db/errors';
import { toLocalDate } from '../../../core/time/localDate';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { Skeleton } from '../../../ui/status/Skeleton';
import { toast } from '../../../ui/toast/toastStore';
import { useExercises } from '../data/exercises';
import { deleteFinishedSet, editFinishedSet, useFinishedSessions, useSession } from '../data/sessions';
import { EMPTY_SESSION_NAME } from '../logic/dashboard';
import { displayName, formatWeight } from '../logic/format';
import { isCompletedSet } from '../logic/metrics';
import { prMarksForExercise, PR_LABELS, type PrType } from '../logic/pr';
import type { SetRecord } from '../types';
const input = 'tap w-24 rounded-continuous border bg-surface-2 px-3 text-base tabular-nums';
function EditableValue({ label, value, onCommit }: { label: string; value: number; onCommit(text: string): Promise<boolean> }) {
  const [text, setText] = useState<string>();
  const [invalid, setInvalid] = useState(false);
  const commit = async () => {
    if (text === undefined) return;
    const ok = await onCommit(text);
    setInvalid(!ok);
    if (ok) setText(undefined);
  };
  return (
    <input
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
      inputMode="decimal"
      autoComplete="off"
      className={`${input} ${invalid ? 'border-danger' : 'border-line'}`}
      value={text ?? formatWeight(value)}
      onChange={(e) => {
        setText(e.target.value.replace(/,/g, '.'));
        setInvalid(false);
      }}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void commit();
      }}
    />
  );
}
function SetLine({ sessionId, entryId, set, n, marks }: { sessionId: string; entryId: string; set: SetRecord & { weight: number; reps: number }; n: number; marks: readonly PrType[] }) {
  const save = (field: 'weight' | 'reps') => async (text: string) => {
    try {
      const result = await editFinishedSet(sessionId, entryId, set.id, field, text);
      return result.ok;
    } catch (error) {
      toast.show({ message: `Not saved: ${toDbWriteError(error).reason}.`, kind: 'error' });
      return true;
    }
  };
  const remove = () =>
    void deleteFinishedSet(sessionId, entryId, set.id).catch((error: unknown) => toast.show({ message: `The set was not deleted: ${toDbWriteError(error).reason}.`, kind: 'error' }));
  return (
    <li className="flex flex-wrap items-center gap-2">
      <span className="w-6 text-sm text-muted">{n}</span>
      <EditableValue label={`Set ${n} weight in kg`} value={set.weight} onCommit={save('weight')} />
      <EditableValue label={`Set ${n} reps`} value={set.reps} onCommit={save('reps')} />
      {marks.map((t) => (
        <span key={t} className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-fg">
          {PR_LABELS[t]}
        </span>
      ))}
      <Button variant="ghost" aria-label={`Delete set ${n}`} onClick={remove}>
        Delete
      </Button>
    </li>
  );
}
/** One Finished Session with its sets and PR labels; weight and reps can be edited or deleted (R25.2, R22.6). */
export default function SessionDetailScreen() {
  const { sessionId = '' } = useParams();
  const session = useSession(sessionId);
  const finished = useFinishedSessions();
  const { exercises } = useExercises();
  if (session === undefined || finished === undefined || exercises === undefined) return <Skeleton rows={4} />;
  if (session === null || session.status !== 'finished') {
    return (
      <EmptyState title="Session not found">
        <AppLink to="/gym/history" className="text-accent underline">
          Back to history
        </AppLink>
      </EmptyState>
    );
  }
  const byId = new Map(exercises.map((x) => [x.id, x]));
  const marksByExercise = new Map<string, Map<string, PrType[]>>();
  const marksFor = (exerciseId: string) => {
    let marks = marksByExercise.get(exerciseId);
    if (marks === undefined) {
      marks = prMarksForExercise(finished, exerciseId);
      marksByExercise.set(exerciseId, marks);
    }
    return marks;
  };
  return (
    <section className="flex flex-col gap-3">
      <h1 className="text-xl font-semibold">
        {toLocalDate(session.startedAt)} · {session.routineName ?? EMPTY_SESSION_NAME}
      </h1>
      {session.entries.map((entry) => {
        const exercise = byId.get(entry.exerciseId);
        const sets = entry.sets.filter(isCompletedSet);
        return (
          <CardFrame key={entry.entryId} className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold">{exercise === undefined ? 'Unknown exercise' : displayName(exercise.name, exercise.archived)}</h2>
            <ul className="flex flex-col gap-2">
              {sets.map((set, i) => (
                <SetLine key={set.id} sessionId={session.id} entryId={entry.entryId} set={set} n={i + 1} marks={marksFor(entry.exerciseId).get(set.id) ?? []} />
              ))}
            </ul>
          </CardFrame>
        );
      })}
    </section>
  );
}
