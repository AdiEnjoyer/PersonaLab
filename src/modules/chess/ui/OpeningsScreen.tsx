import { useEffect, useMemo, useState } from 'react';
import { newId } from '../../../core/ids';
import { undoService } from '../../../core/undo/undoService';
import { Select } from '../../../ui/form/Select';
import { TextField } from '../../../ui/form/TextField';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { Sheet } from '../../../ui/sheet/Sheet';
import { EmptyState } from '../../../ui/status/EmptyState';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { toast } from '../../../ui/toast/toastStore';
import { useLiveValue } from '../data/live';
import { loadStarterFile, readRepertoire, resetToStarter, restoreSnapshot, saveTrees, seedStarterOnce, snapshot } from '../data/openingRepo';
import { readAllGames } from '../data/view';
import { dueCount, treeDueCount } from '../logic/drill';
import { mastery, nameRows, treeAccuracy, treeScores } from '../logic/openingStats';
import { checkTreeName, newTree } from '../logic/repertoire';
import type { Colour, RepertoireTree } from '../types';
import { DrillMode } from './DrillMode';
import { EditMode } from './EditMode';
import { LearnMode } from './LearnMode';
import { useToday } from './useToday';

export const NOT_SAVED = 'The change was not saved.';
export const NO_DRILLS = 'No drills in the last 30 days';
export const RESET_WARNING = 'Every tree and its review history will be replaced by the starter repertoire.';

type Mode = { kind: 'list' } | { kind: 'learn'; treeId: string } | { kind: 'edit'; treeId: string } | { kind: 'drill' };

const percent = (v: number | undefined): string => (v === undefined ? '—' : `${v}%`);

/** `/chess/openings`: the Opening_Trainer with its trees, learn, drill and edit modes (R51 to R54). */
function OpeningsApp({ initial }: { initial: Mode['kind'] }) {
  const today = useToday();
  const rep = useLiveValue(readRepertoire, []);
  const games = useLiveValue(readAllGames, []);
  const [mode, setMode] = useState<Mode>({ kind: initial === 'drill' ? 'drill' : 'list' });
  const [seed, setSeed] = useState<'pending' | 'done' | 'failed'>('pending');
  const [seedAttempt, setSeedAttempt] = useState(0);
  const [name, setName] = useState('');
  const [colour, setColour] = useState<Colour>('w');
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    let live = true;
    seedStarterOnce().then(
      () => live && setSeed('done'),
      () => live && setSeed('failed'),
    );
    return () => {
      live = false;
    };
  }, [seedAttempt]);

  const trees = rep.value?.trees;
  const srs = rep.value?.srs;
  const reviews = rep.value?.reviews;
  const scores = useMemo(() => (trees && games.value ? treeScores(games.value, trees) : undefined), [trees, games.value]);
  const rows = useMemo(() => (games.value ? nameRows(games.value).slice(0, 5) : []), [games.value]);

  const commit = async (next: RepertoireTree[], undoLabel?: string): Promise<boolean> => {
    const prev = trees ?? [];
    try {
      await saveTrees(next);
    } catch {
      toast.show({ message: NOT_SAVED, kind: 'error' });
      return false;
    }
    if (undoLabel) undoService.push({ label: undoLabel, undo: () => saveTrees(prev) });
    return true;
  };

  const create = async (): Promise<void> => {
    const checked = checkTreeName(name);
    if (!checked.ok) {
      setNameError(checked.error);
      return;
    }
    setNameError(undefined);
    if (await commit([...(trees ?? []), newTree(newId(), checked.value, colour, Date.now())])) setName('');
  };

  const reset = async (): Promise<void> => {
    setResetting(false);
    try {
      const before = await snapshot();
      await resetToStarter(await loadStarterFile());
      undoService.push({ label: 'Repertoire reset', undo: () => restoreSnapshot(before) });
    } catch {
      toast.show({ message: NOT_SAVED, kind: 'error' });
    }
  };

  if (rep.failed) return <ErrorPanel message="Your repertoire could not be loaded." onRetry={rep.retry} />;
  if (trees === undefined || srs === undefined || reviews === undefined || (seed === 'pending' && trees.length === 0)) return <Skeleton rows={4} />;

  const find = (id: string): RepertoireTree | undefined => trees.find((t) => t.id === id);
  const back = (): void => setMode({ kind: 'list' });
  const learnTree = mode.kind === 'learn' ? find(mode.treeId) : undefined;
  const editTree = mode.kind === 'edit' ? find(mode.treeId) : undefined;

  let body;
  if (mode.kind === 'drill') {
    body = <DrillMode trees={trees} srs={srs} today={today} onExit={back} onLearn={() => (trees[0] ? setMode({ kind: 'learn', treeId: trees[0].id }) : back())} />;
  } else if (mode.kind === 'learn' && learnTree) {
    body = <LearnMode key={learnTree.id} tree={learnTree} onExit={back} />;
  } else if (mode.kind === 'edit' && editTree) {
    body = <EditMode key={editTree.id} tree={editTree} trees={trees} commit={commit} onExit={back} />;
  } else {
    const due = dueCount(trees, srs, today);
    body = (
      <>
        {trees.length === 0 ? (
          <CardFrame aria-label="No trees">
            <EmptyState title="No opening trees">
              {seed === 'failed' ? <p>The starter repertoire could not be loaded.</p> : <p>Create a tree or load the starter repertoire.</p>}
            </EmptyState>
          </CardFrame>
        ) : (
          <>
            <CardFrame aria-label="Drill" className="flex items-center justify-between gap-3">
              <p data-testid="due-total">{due} due today</p>
              <Button onClick={() => setMode({ kind: 'drill' })}>Drill</Button>
            </CardFrame>
            <ul aria-label="Opening trees" className="flex flex-col gap-3">
              {trees.map((tree) => {
                const stat = scores?.get(tree.id);
                const accuracy = treeAccuracy(reviews, tree, today);
                return (
                  <li key={tree.id}>
                    <CardFrame aria-label={tree.name} className="flex flex-col gap-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <h2 className="text-base font-semibold">{tree.name}</h2>
                        <span className="text-xs text-muted">{tree.colour === 'w' ? 'White' : 'Black'}</span>
                      </div>
                      <p className="text-sm" data-testid={`score-${tree.id}`}>
                        Your games: {stat && stat.games > 0 ? `${percent(stat.score)} score in ${stat.games} ${stat.games === 1 ? 'game' : 'games'}` : 'no games yet'}
                      </p>
                      <p className="text-sm" data-testid={`due-${tree.id}`}>
                        {treeDueCount(tree, trees, srs, today)} due · mastery {percent(mastery(tree, srs))}
                      </p>
                      <p className="text-xs text-muted">{accuracy === undefined ? NO_DRILLS : `First-try accuracy ${accuracy}% (30 days)`}</p>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" aria-label={`Learn ${tree.name}`} onClick={() => setMode({ kind: 'learn', treeId: tree.id })}>
                          Learn
                        </Button>
                        <Button variant="secondary" aria-label={`Edit ${tree.name}`} onClick={() => setMode({ kind: 'edit', treeId: tree.id })}>
                          Edit
                        </Button>
                      </div>
                    </CardFrame>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        <CardFrame aria-label="Create tree" className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">Create tree</h2>
          <TextField label="Name" value={name} onChange={setName} error={nameError} />
          <Select
            label="Colour"
            value={colour}
            options={[
              { value: 'w', label: 'White' },
              { value: 'b', label: 'Black' },
            ]}
            onChange={(v) => setColour(v === 'b' ? 'b' : 'w')}
          />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void create()}>Create tree</Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (trees.length === 0) void reset();
                else setResetting(true);
              }}
            >
              Reset to starter repertoire
            </Button>
          </div>
        </CardFrame>
        {rows.length > 0 ? (
          <CardFrame aria-label="Games by opening" className="flex flex-col gap-1">
            <h2 className="text-base font-semibold">Your games by Chess.com opening</h2>
            <ul className="text-sm">
              {rows.map((r) => (
                <li key={r.name} className="flex justify-between gap-2">
                  <span>{r.name}</span>
                  <span className="tabular-nums">
                    {r.games} · {percent(r.score)}
                  </span>
                </li>
              ))}
            </ul>
          </CardFrame>
        ) : null}
      </>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Openings</h1>
      {body}
      <Sheet open={resetting} onRequestClose={() => setResetting(false)} title="Reset to starter repertoire?">
        <div className="flex flex-col gap-3 pb-4">
          <p>{RESET_WARNING}</p>
          <div className="flex gap-2">
            <Button variant="danger" onClick={() => void reset()}>
              Reset
            </Button>
            <Button variant="secondary" onClick={() => setResetting(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Sheet>
      {seed === 'failed' && trees.length === 0 ? (
        <Button variant="ghost" onClick={() => setSeedAttempt((n) => n + 1)}>
          Try loading the starter again
        </Button>
      ) : null}
    </section>
  );
}

export default function OpeningsScreen() {
  return <OpeningsApp initial="list" />;
}

/** `/chess/drill`: opens the Opening_Trainer straight in drill mode. */
export function DrillScreen() {
  return <OpeningsApp initial="drill" />;
}
