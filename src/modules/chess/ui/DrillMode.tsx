import { useEffect, useMemo, useRef, useState } from 'react';
import { newId } from '../../../core/ids';
import type { LocalDate } from '../../../core/time/localDate';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { toast } from '../../../ui/toast/toastStore';
import { OPENING } from '../constants';
import { countFirstReviews, recordReview } from '../data/openingRepo';
import type { MoveInput } from '../logic/board';
import { buildDrillQueue, drillContext, drillSummary, expectedByColour, gradeFor, pickDrillTree, stepAt, type DrillStep } from '../logic/drill';
import { indexTree, ownerPositions, playUci } from '../logic/repertoire';
import type { RepertoireTree, SrsRecord } from '../types';
import { BoardView } from './BoardView';
import { arrowOf, orientationOf, uciOf } from './openingsShared';

export const NOTHING_DUE = 'Nothing due today';
export const REVIEW_NOT_SAVED = 'The review was not saved.';

export interface DrillModeProps {
  trees: readonly RepertoireTree[];
  srs: ReadonlyMap<string, SrsRecord>;
  today: LocalDate;
  onExit(): void;
  onLearn(): void;
  /** Random source for opponent replies; tests fix it (R52.3). */
  rng?: () => number;
}

type Phase = 'loading' | 'failed' | 'empty' | 'opponent' | 'owner' | 'lineDone' | 'summary';

/** Drill mode (R52.2 to R52.11): the Owner plays the expected move at each Repertoire_Position. */
export function DrillMode({ trees, srs, today, onExit, onLearn, rng = Math.random }: DrillModeProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [attempt, setAttempt] = useState(0);
  const [tree, setTree] = useState<RepertoireTree | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [step, setStep] = useState<DrillStep | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const [, bump] = useState(0);
  const queue = useRef<string[]>([]);
  /** Keys with a grade stored or being stored in this session: graded at most once (R52.4). */
  const pending = useRef(new Set<string>());
  const grades = useRef<number[]>([]);
  const tries = useRef(0);
  const gradedHere = useRef(false);
  const treesRef = useRef(trees);
  treesRef.current = trees;

  const remaining = (): string[] => queue.current.filter((k) => !pending.current.has(k));

  const compute = (t: RepertoireTree, from: string | null): void => {
    const ctx = drillContext(treesRef.current, t, new Set(remaining()), pending.current, rng);
    const s = stepAt(ctx, from);
    setStep(s);
    tries.current = 0;
    gradedHere.current = false;
    setRevealed(false);
    setHint('');
    if (s.kind === 'leaf') setPhase(pickDrillTree(treesRef.current, remaining()) === null ? 'summary' : 'lineDone');
    else setPhase(s.kind === 'owner' ? 'owner' : 'opponent');
  };

  const startLine = (): void => {
    const t = pickDrillTree(treesRef.current, remaining());
    if (t === null) {
      setPhase('summary');
      return;
    }
    setTree(t);
    setAt(null);
    compute(t, null);
  };

  useEffect(() => {
    let live = true;
    setPhase('loading');
    countFirstReviews(today).then(
      (first) => {
        if (!live) return;
        queue.current = buildDrillQueue(treesRef.current, srs, first, today);
        if (queue.current.length === 0) setPhase('empty');
        else startLine();
      },
      () => live && setPhase('failed'),
    );
    return () => {
      live = false;
    };
    // The queue is built once per session; later edits to `srs` are the session's own grades.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const advance = (nodeId: string): void => {
    if (tree === null) return;
    setAt(nodeId);
    compute(tree, nodeId);
  };

  // Opponent replies, and shared opening choices played for the Owner, come 300 ms after the previous move (R52.2).
  useEffect(() => {
    if (phase !== 'opponent' || step === null || step.kind === 'owner' || step.kind === 'leaf') return;
    const nodeId = step.node.id;
    const t = setTimeout(() => advance(nodeId), OPENING.OPPONENT_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step]);

  useEffect(() => {
    if (preview === null) return;
    const t = setTimeout(() => setPreview(null), OPENING.REVERT_MS);
    return () => clearTimeout(t);
  }, [preview]);

  const idx = useMemo(() => (tree === null ? null : indexTree(tree)), [tree]);

  const grade = (posKey: string, q: number): void => {
    if (pending.current.has(posKey)) return;
    pending.current.add(posKey);
    recordReview({ reviewId: newId(), posKey, q, date: today }).then(
      () => {
        grades.current.push(q);
        bump((n) => n + 1);
      },
      () => {
        // Nothing was stored: the position stays in the drill queue (R52.6).
        pending.current.delete(posKey);
        toast.show({ message: REVIEW_NOT_SAVED, kind: 'error' });
      },
    );
  };

  const onMove = (m: MoveInput): void => {
    if (phase !== 'owner' || step === null || step.kind !== 'owner' || idx === null) return;
    if (uciOf(m) === step.node.uci) {
      if (step.gradable && !gradedHere.current) {
        gradedHere.current = true;
        grade(step.posKey, gradeFor(tries.current === 0 ? 'first' : 'second'));
      }
      advance(step.node.id);
      return;
    }
    tries.current += 1;
    const wrong = playUci(idx.fen.get(at) as string, uciOf(m));
    if (wrong !== null) setPreview(wrong.fen);
    if (tries.current === 1) {
      setHint('Not that move. Try once more.');
    } else {
      reveal(step);
    }
  };

  const reveal = (s: Extract<DrillStep, { kind: 'owner' }>): void => {
    if (s.gradable && !gradedHere.current) {
      gradedHere.current = true;
      grade(s.posKey, gradeFor('failed'));
    }
    setRevealed(true);
    setHint('Play the move shown by the arrow.');
  };

  const states = useMemo(() => {
    const expected = expectedByColour(trees);
    const keys = new Set(trees.flatMap((t) => ownerPositions(t, expected[t.colour]).map((p) => p.posKey)));
    return [...srs.values()].filter((s) => keys.has(s.posKey));
  }, [trees, srs]);

  if (phase === 'loading') return <Skeleton rows={4} />;
  if (phase === 'failed') return <ErrorPanel message="The drill queue could not be loaded." onRetry={() => setAttempt((n) => n + 1)} />;
  if (phase === 'empty') {
    const next = drillSummary([], states).nextDue;
    return (
      <CardFrame aria-label="Drill">
        <EmptyState title={NOTHING_DUE}>
          <p data-testid="next-due">Next due: {next ?? 'None'}</p>
        </EmptyState>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onLearn}>Learn</Button>
          <Button variant="ghost" onClick={onExit}>
            Back
          </Button>
        </div>
      </CardFrame>
    );
  }
  if (phase === 'summary') {
    const summary = drillSummary(grades.current, states);
    return (
      <CardFrame aria-label="Drill summary" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Drill finished</h2>
        <dl className="flex flex-col gap-1">
          <div className="flex justify-between">
            <dt className="text-muted">Positions reviewed</dt>
            <dd data-testid="summary-graded">{summary.graded}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">First-try accuracy</dt>
            <dd data-testid="summary-accuracy">{summary.accuracy === undefined ? '—' : `${summary.accuracy}%`}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Next due</dt>
            <dd data-testid="summary-next">{summary.nextDue ?? 'None'}</dd>
          </div>
        </dl>
        <Button onClick={onExit}>Done</Button>
      </CardFrame>
    );
  }
  if (tree === null || idx === null) return <Skeleton rows={4} />;

  const fen = idx.fen.get(at) as string;
  const expectedUci = step?.kind === 'owner' ? step.node.uci : undefined;
  const status =
    phase === 'lineDone' ? 'Line complete' : phase === 'owner' ? (revealed ? 'Play the shown move' : 'Your move') : 'Opponent is moving…';

  return (
    <CardFrame aria-label="Drill" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Drill: {tree.name}</h2>
        <p className="text-sm text-muted" data-testid="drill-left">
          {remaining().length} left
        </p>
      </div>
      <BoardView
        fen={preview ?? fen}
        orientation={orientationOf(tree)}
        movable={phase === 'owner' ? tree.colour : undefined}
        onMove={onMove}
        arrow={revealed && expectedUci ? arrowOf(expectedUci) : undefined}
      />
      <p role="status" className="text-sm">
        {status}
      </p>
      {hint !== '' ? <p className="text-sm text-muted">{hint}</p> : null}
      <div className="flex flex-wrap gap-2">
        {phase === 'owner' && step?.kind === 'owner' ? (
          <Button variant="secondary" disabled={revealed} onClick={() => reveal(step)}>
            Show move
          </Button>
        ) : null}
        {phase === 'lineDone' ? <Button onClick={startLine}>Next line</Button> : null}
        <Button variant="ghost" onClick={() => setPhase('summary')}>
          End
        </Button>
      </div>
    </CardFrame>
  );
}
