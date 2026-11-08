import { useEffect, useMemo, useState } from 'react';
import { AppLink } from '../../../app/AppLink';
import { toLocalDate } from '../../../core/time/localDate';
import { Select } from '../../../ui/form/Select';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { toast } from '../../../ui/toast/toastStore';
import { PATTERN, TIME_CLASSES } from '../constants';
import { readPatternReport, readReportSummaries, type ReportSummary } from '../data/analysisRepo';
import { useLiveValue } from '../data/live';
import { loadTips, readAllGames, readChessRating } from '../data/view';
import { getAnalyzer } from '../engine/runtime';
import type { Pattern } from '../logic/analysis/patterns';
import { opponentOf, RESULT_LABEL, sortGames } from '../logic/games';
import type { GameRecord, Tip } from '../types';
import { ALL_ANALYSED_MESSAGE, countsText, DETECTOR_NAME, practiceHref, useAnalyzerState } from './analysisText';
export const NOT_ENOUGH = (n: number): string => `Analyse at least ${PATTERN.MIN_GAMES} games to see patterns (${n} analysed)`;
/** Status line of one game in the list (R55.5, R60.3). */
export function statusText(game: GameRecord, summary: ReportSummary | undefined, state: ReturnType<typeof useAnalyzerState>): string {
  if (state.current?.gameId === game.id) return `Analysing ${state.current.done}/${state.current.total}`;
  if (state.queue.includes(game.id)) return 'Queued';
  if (game.pgnUnreadable) return 'Cannot analyse';
  if (summary === undefined) return 'Not analysed';
  return `${summary.outdated ? 'Outdated' : 'Analysed'} · ${countsText(summary.counts)}`;
}
function GameRow({ game, summary, state }: { game: GameRecord; summary: ReportSummary | undefined; state: ReturnType<typeof useAnalyzerState> }) {
  const opponent = opponentOf(game);
  const busy = state.current?.gameId === game.id || state.queue.includes(game.id);
  const error = state.gameErrors[game.id];
  const title = `${RESULT_LABEL[game.ownerResult]} vs ${opponent.username} · ${toLocalDate(game.endTime * 1000)}`;
  const canAnalyse = !game.pgnUnreadable && !busy;
  return (
    <li className="flex flex-col gap-1 border-b border-line py-2 last:border-0">
      {summary !== undefined ? (
        <AppLink to={`/chess/analysis/${encodeURIComponent(game.id)}`} className="tap font-medium underline">
          {title}
        </AppLink>
      ) : (
        <span className="font-medium">{title}</span>
      )}
      <span className="text-sm text-muted">{statusText(game, summary, state)}</span>
      {error !== undefined ? (
        <span role="alert" className="text-sm text-danger">
          {error}
        </span>
      ) : null}
      {canAnalyse ? (
        <Button
          variant="secondary"
          aria-label={`${summary === undefined ? (error !== undefined ? 'Retry' : 'Analyse') : 'Re-analyse'} game vs ${opponent.username}`}
          onClick={() => getAnalyzer().enqueue([game.id])}
        >
          {summary === undefined ? (error !== undefined ? 'Retry' : 'Analyse') : 'Re-analyse'}
        </Button>
      ) : null}
    </li>
  );
}
function ReadTips({ pattern }: { pattern: Pattern }) {
  const [tips, setTips] = useState<Tip[] | 'failed' | undefined>();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    let live = true;
    Promise.all([loadTips(), readChessRating()]).then(
      ([all, { band }]) => {
        const tagged = all.filter((t) => t.detectors.includes(pattern.detector));
        if (live) setTips([...tagged.filter((t) => t.band === band), ...tagged.filter((t) => t.band !== band)]);
      },
      () => live && setTips('failed'),
    );
    return () => {
      live = false;
    };
  }, [open, pattern.detector]);
  return (
    <div className="flex flex-col gap-1">
      <Button variant="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
        Read tips
      </Button>
      {open && tips === 'failed' ? <p role="alert">The tips could not be loaded.</p> : null}
      {open && Array.isArray(tips) ? (
        tips.length === 0 ? (
          <p className="text-muted">No tips for this pattern yet.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {tips.map((t) => (
              <li key={t.id}>
                <span className="font-medium">{t.title}</span> · {t.body}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
function Patterns() {
  const [scope, setScope] = useState<'20' | '50' | 'all'>('20');
  const [timeClass, setTimeClass] = useState('all');
  const report = useLiveValue(() => readPatternReport(scope === 'all' ? 'all' : (Number(scope) as 20 | 50), timeClass), [scope, timeClass]);
  return (
    <CardFrame aria-label="Patterns" className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Recurring patterns</h2>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Scope"
          value={scope}
          options={[
            { value: '20', label: 'Last 20 games' },
            { value: '50', label: 'Last 50 games' },
            { value: 'all', label: 'All games' },
          ]}
          onChange={(v) => setScope(v as typeof scope)}
        />
        <Select label="Time class" value={timeClass} options={[{ value: 'all', label: 'All' }, ...TIME_CLASSES.map((t) => ({ value: t, label: t }))]} onChange={setTimeClass} />
      </div>
      {report.failed ? (
        <ErrorPanel message="The patterns could not be loaded." onRetry={report.retry} />
      ) : report.value === undefined ? (
        <Skeleton rows={2} />
      ) : report.value.kind === 'too-few' ? (
        <p>{NOT_ENOUGH(report.value.n)}</p>
      ) : report.value.patterns.length === 0 ? (
        <p className="text-muted">No recurring pattern found in these games.</p>
      ) : (
        <ul aria-label="Pattern list" className="flex flex-col gap-3">
          {report.value.patterns.map((p) => (
            <li key={`${p.detector}-${p.bucket}`} className="flex flex-col gap-1">
              <p>{p.text}</p>
              <p className="text-xs text-muted">{DETECTOR_NAME[p.detector]}</p>
              {p.action === 'practice' ? (
                <AppLink to={practiceHref(p.themes)} className="tap flex items-center justify-center rounded-continuous bg-accent px-4 py-2 text-base font-medium text-accent-fg">
                  Practise {p.themes.join(', ')}
                </AppLink>
              ) : (
                <ReadTips pattern={p} />
              )}
            </li>
          ))}
        </ul>
      )}
    </CardFrame>
  );
}
/** `/chess/analysis`: analysis status of every game, the analysis queue and the Pattern_Report (R55, R59, R60). */
export default function AnalysisScreen() {
  const games = useLiveValue(readAllGames, []);
  const summaries = useLiveValue(readReportSummaries, []);
  const state = useAnalyzerState();
  const [allDone, setAllDone] = useState(false);
  const sorted = useMemo(() => sortGames(games.value ?? []), [games.value]);
  useEffect(() => {
    if (state.error?.kind === 'write') toast.show({ message: state.error.message, kind: 'error' });
  }, [state.error]);
  if (games.failed || summaries.failed) return <ErrorPanel message="The games could not be loaded." onRetry={() => (games.failed ? games.retry() : summaries.retry())} />;
  if (games.value === undefined || summaries.value === undefined) return <Skeleton rows={5} />;
  const reports = summaries.value;
  const analyseAll = (): void => {
    const ids = sorted.filter((g) => !g.pgnUnreadable && !reports.has(g.id)).map((g) => g.id);
    setAllDone(ids.length === 0);
    getAnalyzer().enqueue(ids);
  };
  const currentGame = state.current ? sorted.find((g) => g.id === state.current?.gameId) : undefined;
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Analysis</h1>
      {sorted.length === 0 ? (
        <CardFrame>
          <EmptyState title="No games yet">Sync your Chess.com games first, then analyse them here.</EmptyState>
        </CardFrame>
      ) : (
        <>
          <CardFrame aria-label="Analysis queue" className="flex flex-col gap-3">
            <Button disabled={state.running} onClick={analyseAll}>
              Analyse all unanalysed
            </Button>
            {allDone && !state.running ? <p>{ALL_ANALYSED_MESSAGE}</p> : null}
            {state.running && state.current ? (
              <div role="status" className="flex flex-col gap-1">
                <p>
                  Analysing{currentGame ? ` game vs ${opponentOf(currentGame).username}` : ''}: {state.current.done} of {state.current.total} positions
                </p>
                {state.queue.length > 0 ? <p className="text-sm text-muted">{state.queue.length} more queued</p> : null}
                {state.paused ? <p className="text-sm text-muted">Paused while the app is in the background.</p> : null}
              </div>
            ) : null}
            {state.running ? (
              <Button variant="secondary" onClick={() => void getAnalyzer().cancel()}>
                Cancel
              </Button>
            ) : null}
            {state.error ? (
              <div role="alert" className="flex flex-col gap-2">
                <p className="text-danger">{state.error.message}</p>
                <Button variant="secondary" onClick={() => getAnalyzer().retry()}>
                  Retry
                </Button>
              </div>
            ) : null}
            {state.skipped.length > 0 ? <p className="text-sm text-muted">{state.skipped.length} game(s) skipped because their moves could not be read.</p> : null}
          </CardFrame>
          <Patterns />
          <CardFrame aria-label="Analysis list">
            <ul>
              {sorted.map((g) => (
                <GameRow key={g.id} game={g} summary={reports.get(g.id)} state={state} />
              ))}
            </ul>
          </CardFrame>
        </>
      )}
    </section>
  );
}
