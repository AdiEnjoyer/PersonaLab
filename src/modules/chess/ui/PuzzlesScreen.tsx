import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { newIdemKey } from '../../../core/ids';
import { useSearchParams } from 'react-router';
import { Select } from '../../../ui/form/Select';
import { LineChartCard } from '../../../ui/chart/LineChartCard';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { toast } from '../../../ui/toast/toastStore';
import { PUZZLE } from '../constants';
import { useLiveValue } from '../data/live';
import { readPuzzleData, recordAttempt, type RecordedAttempt } from '../data/puzzleRepo';
import { loadPuzzles, type PuzzleLoad } from '../data/puzzles';
import { readChessRating } from '../data/view';
import { displayRating, isProvisional } from '../logic/glicko2';
import {
  filterByThemes,
  hintOf,
  initialPuzzleState,
  ownerColour,
  pickPuzzle,
  puzzleReducer,
  reviewQueue,
  themeStats,
  weakestThemes,
} from '../logic/puzzles';
import type { Puzzle, PuzzleAttempt } from '../types';
import { BoardView } from './BoardView';

export const NOT_LOADED_MESSAGE = 'Puzzles could not be loaded.';
export const EMPTY_TITLE = 'No puzzles available';
export const EMPTY_HELP = 'Generate public/data/puzzles.json with "npm run data:puzzles -- --in <lichess_db_puzzle.csv>" and rebuild the app.';
export const ALL_SOLVED_MESSAGE = 'You have solved every puzzle in this set.';
export const CHART_MESSAGE = 'Solve at least 2 puzzles to see a chart';
export const STATS_MESSAGE = 'Solve puzzles to see theme statistics';
export const SAVE_FAILED_MESSAGE = 'The result was not saved.';

export function ratingLabel(rating: { rating: number; rd: number } | null | undefined): string {
  if (!rating) return '—';
  return `${displayRating(rating.rating)}${isProvisional(rating.rd) ? ' (provisional)' : ''}`;
}

interface SessionProps {
  puzzle: Puzzle;
  chessRating: number;
  onNext(): void;
}

/** One puzzle: board, hint, solution, Try again and the one-time storing of the decided score (R48). */
function PuzzleSession({ puzzle, chessRating, onNext }: SessionProps) {
  const [state, dispatch] = useReducer(puzzleReducer, puzzle, initialPuzzleState);
  const idemKey = useRef(newIdemKey());
  const started = useRef(false);
  const [saved, setSaved] = useState<RecordedAttempt | null>(null);
  const { phase, ply } = state;

  useEffect(() => {
    if (phase !== 'opponent') return;
    const t = setTimeout(() => dispatch({ type: 'opponent' }), PUZZLE.OPPONENT_DELAY_MS);
    return () => clearTimeout(t);
  }, [phase, ply]);

  useEffect(() => {
    if (state.wrong === undefined) return;
    const t = setTimeout(() => dispatch({ type: 'clearWrong' }), PUZZLE.REVERT_MS);
    return () => clearTimeout(t);
  }, [state.wrong]);

  useEffect(() => {
    if (phase !== 'revealing') return;
    const t = setTimeout(() => dispatch({ type: 'reveal' }), PUZZLE.SOLUTION_STEP_MS);
    return () => clearTimeout(t);
  }, [phase, ply]);

  const decided = state.scoreDecided;
  useEffect(() => {
    if (decided === undefined || started.current) return;
    started.current = true;
    const hintsUsed = state.hintsUsed;
    const save = async (): Promise<void> => {
      try {
        setSaved(await recordAttempt({ puzzle, score: decided, hintsUsed, idemKey: idemKey.current, chessRating }));
      } catch {
        toast.show({ message: SAVE_FAILED_MESSAGE, kind: 'error', action: { label: 'Retry', run: () => void save() } });
      }
    };
    void save();
    // The score is decided once per puzzle session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decided]);

  const owner = ownerColour(puzzle);
  const hint = hintOf(state);
  const marks = [
    ...(hint ? [{ square: hint.from, kind: 'hint' as const }] : []),
    ...(state.wrong ? [{ square: state.wrong.from, kind: 'wrong' as const }, { square: state.wrong.to, kind: 'wrong' as const }] : []),
  ];
  const finished = phase === 'solved' || phase === 'ended';
  const status =
    phase === 'solved'
      ? 'Solved'
      : phase === 'ended'
        ? 'Not solved'
        : phase === 'wrong'
          ? 'Wrong move'
          : phase === 'revealing'
            ? 'Solution'
            : phase === 'opponent'
              ? 'Opponent is moving…'
              : 'Your move';

  return (
    <CardFrame aria-label="Puzzle" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Puzzle {puzzle.rating}</h2>
        <p role="status" className="text-sm">
          {status}
        </p>
      </div>
      <BoardView
        fen={state.fen}
        orientation={owner === 'w' ? 'white' : 'black'}
        lastMove={state.lastMove}
        movable={phase === 'owner' ? owner : undefined}
        onMove={(move) => dispatch({ type: 'move', move })}
        marks={marks}
        arrow={hint?.to !== undefined ? { from: hint.from, to: hint.to } : undefined}
      />
      <div className="flex flex-wrap gap-2">
        {phase === 'wrong' ? <Button onClick={() => dispatch({ type: 'tryAgain' })}>Try again</Button> : null}
        <Button variant="secondary" disabled={phase !== 'owner'} onClick={() => dispatch({ type: 'hint' })}>
          Hint
        </Button>
        <Button variant="secondary" disabled={finished || phase === 'revealing'} onClick={() => dispatch({ type: 'show' })}>
          Show solution
        </Button>
        {finished ? <Button onClick={onNext}>Next puzzle</Button> : <Button variant="ghost" onClick={onNext}>Skip</Button>}
      </div>
      {saved !== null ? (
        <p className="text-sm text-muted" data-testid="attempt-result">
          {saved.attempt.rated
            ? `Rated: ${displayRating(saved.attempt.before.rating)} → ${displayRating(saved.attempt.after.rating)}`
            : 'Unrated: you attempted this puzzle before.'}
        </p>
      ) : null}
    </CardFrame>
  );
}

function RatingHistoryChart({ attempts }: { attempts: readonly PuzzleAttempt[] }) {
  const rated = useMemo(() => attempts.filter((a) => a.rated).sort((a, b) => a.ts - b.ts), [attempts]);
  if (rated.length < 2) {
    return (
      <CardFrame aria-label="Puzzle rating history" className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">Rating history</h2>
        <p className="text-muted">{CHART_MESSAGE}</p>
      </CardFrame>
    );
  }
  return (
    <LineChartCard
      title="Puzzle rating history"
      data={rated.map((a) => ({ x: a.ts, y: displayRating(a.after.rating) }))}
      xFormatter={(x) => new Date(Number(x)).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' })}
    />
  );
}

function ThemeStats({ attempts, puzzlesById, onPractice }: { attempts: readonly PuzzleAttempt[]; puzzlesById: ReadonlyMap<string, Puzzle>; onPractice(theme: string): void }) {
  const stats = useMemo(() => themeStats(attempts, puzzlesById), [attempts, puzzlesById]);
  const weakest = useMemo(() => weakestThemes(stats), [stats]);
  if (stats.length === 0) {
    return (
      <CardFrame aria-label="Theme statistics">
        <p className="text-muted">{STATS_MESSAGE}</p>
      </CardFrame>
    );
  }
  return (
    <CardFrame aria-label="Theme statistics" className="flex flex-col gap-3">
      <h2 className="text-base font-semibold">Weakest themes</h2>
      {weakest.length === 0 ? (
        <p className="text-muted">Themes appear here after 5 rated attempts.</p>
      ) : (
        <ul aria-label="Weakest themes" className="flex flex-col gap-2">
          {weakest.slice(0, 5).map((s) => (
            <li key={s.theme} className="flex items-center justify-between gap-2">
              <span>
                {s.theme} · {s.percent}% ({s.solved}/{s.rated})
              </span>
              <Button variant="secondary" aria-label={`Practice ${s.theme}`} onClick={() => onPractice(s.theme)}>
                Practice
              </Button>
            </li>
          ))}
        </ul>
      )}
      <h2 className="text-base font-semibold">All themes</h2>
      <ul aria-label="Theme statistics list" className="flex flex-col gap-1 text-sm">
        {stats.map((s) => (
          <li key={s.theme} className="flex justify-between gap-2">
            <span>{s.theme}</span>
            <span className="tabular-nums">
              {s.rated} rated · {s.solved} solved · {s.percent}%
            </span>
          </li>
        ))}
      </ul>
    </CardFrame>
  );
}

type Load = { status: 'loading' } | { status: 'error' } | PuzzleLoad;

/** `/chess/puzzles`: the Puzzle_Trainer, theme practice, statistics and the rating history (R47 to R50). */
export default function PuzzlesScreen() {
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [chessRating, setChessRating] = useState<number | undefined>(undefined);
  const [params] = useSearchParams();
  // `?theme=fork,pin` opens theme practice for those themes (R59.6); several themes are kept comma-separated.
  const [theme, setTheme] = useState(() => params.get('theme') ?? '');
  const [current, setCurrent] = useState<Puzzle | null | undefined>(undefined);
  const [sessionKey, setSessionKey] = useState(0);
  const review = useRef<{ queue: Puzzle[]; index: number } | null>(null);
  const seen = useRef(new Set<string>());
  const data = useLiveValue(readPuzzleData, []);

  useEffect(() => {
    let live = true;
    setLoad({ status: 'loading' });
    loadPuzzles().then(
      (r) => live && setLoad(r),
      () => live && setLoad({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  useEffect(() => {
    let live = true;
    readChessRating().then(
      (r) => live && setChessRating(r.rating),
      () => live && setChessRating(1200),
    );
    return () => {
      live = false;
    };
  }, []);

  const puzzles = load.status === 'ready' ? load.puzzles : undefined;
  const puzzlesById = useMemo(() => new Map((puzzles ?? []).map((p) => [p.id, p])), [puzzles]);
  const pool = useMemo(() => filterByThemes(puzzles ?? [], theme.split(',').filter((t) => t !== '')), [puzzles, theme]);
  const themes = useMemo(() => {
    const all = [...new Set((puzzles ?? []).flatMap((p) => p.themes))].sort();
    return theme.includes(',') ? [theme, ...all] : all;
  }, [puzzles, theme]);
  const attempts = data.value?.attempts;
  const target = data.value?.rating?.rating ?? chessRating;

  const next = (): void => {
    if (attempts === undefined || target === undefined) return;
    if (review.current !== null) {
      review.current.index += 1;
      const queued = review.current.queue[review.current.index];
      if (queued !== undefined) {
        setCurrent(queued);
        setSessionKey((k) => k + 1);
        return;
      }
      review.current = null;
    }
    const attempted = new Set(attempts.map((a) => a.puzzleId));
    const picked = pickPuzzle(pool, new Set([...attempted, ...seen.current]), target, Math.random) ?? pickPuzzle(pool, attempted, target, Math.random);
    if (picked) seen.current.add(picked.id);
    setCurrent(picked ?? null);
    setSessionKey((k) => k + 1);
  };

  // Picks the first puzzle, and again after the theme changes.
  useEffect(() => {
    if (current === undefined && puzzles !== undefined && attempts !== undefined && target !== undefined) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, puzzles, attempts, target]);

  const changeTheme = (value: string): void => {
    review.current = null;
    setTheme(value);
    setCurrent(undefined);
  };

  const startReview = (): void => {
    if (attempts === undefined) return;
    const rated = new Map(attempts.filter((a) => a.rated).map((a) => [a.puzzleId, a]));
    const queue = reviewQueue(pool, rated, Math.random);
    review.current = { queue, index: 0 };
    setCurrent(queue[0] ?? null);
    setSessionKey((k) => k + 1);
  };

  const missed = useMemo(() => {
    if (attempts === undefined) return 0;
    const rated = new Map(attempts.filter((a) => a.rated).map((a) => [a.puzzleId, a]));
    return reviewQueue(pool, rated, () => 0).length;
  }, [attempts, pool]);

  let body;
  if (load.status === 'loading' || (data.value === undefined && !data.failed)) body = <Skeleton rows={4} />;
  else if (load.status === 'error') body = <ErrorPanel message={NOT_LOADED_MESSAGE} onRetry={() => setAttempt((n) => n + 1)} />;
  else if (data.failed) body = <ErrorPanel message="Your puzzle history could not be loaded." onRetry={data.retry} />;
  else if (load.status === 'empty') {
    body = (
      <CardFrame>
        <EmptyState title={EMPTY_TITLE}>{EMPTY_HELP}</EmptyState>
      </CardFrame>
    );
  } else if (current === undefined || chessRating === undefined) body = <Skeleton rows={4} />;
  else if (current === null) {
    body = (
      <CardFrame aria-label="Puzzle" className="flex flex-col gap-3">
        {missed > 0 ? (
          <>
            <p>Every puzzle in this set has been attempted. Review the {missed} you missed?</p>
            <Button onClick={startReview}>Review missed puzzles</Button>
          </>
        ) : (
          <p>{ALL_SOLVED_MESSAGE}</p>
        )}
      </CardFrame>
    );
  } else body = <PuzzleSession key={`${sessionKey}-${current.id}`} puzzle={current} chessRating={chessRating} onNext={next} />;

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Puzzles</h1>
      <CardFrame aria-label="Puzzle rating" className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted">Puzzle rating</p>
          <p className="text-2xl font-semibold tabular-nums" data-testid="puzzle-rating">
            {ratingLabel(data.value?.rating)}
          </p>
        </div>
        {puzzles !== undefined ? <p className="text-sm text-muted">{puzzles.length.toLocaleString('en-US')} puzzles</p> : null}
        {puzzles !== undefined ? <Select label="Theme" value={theme} placeholder="All themes" options={themes.map((t) => ({ value: t, label: t }))} onChange={changeTheme} /> : null}
      </CardFrame>
      {body}
      {data.value !== undefined && puzzles !== undefined ? (
        <>
          <ThemeStats attempts={data.value.attempts} puzzlesById={puzzlesById} onPractice={changeTheme} />
          <RatingHistoryChart attempts={data.value.attempts} />
        </>
      ) : null}
    </section>
  );
}
