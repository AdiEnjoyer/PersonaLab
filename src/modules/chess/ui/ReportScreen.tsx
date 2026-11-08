import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { AppLink } from '../../../app/AppLink';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { toast } from '../../../ui/toast/toastStore';
import { isOutdated, readReport } from '../data/analysisRepo';
import { useLiveValue } from '../data/live';
import { loadTips, readGame } from '../data/view';
import { getAnalyzer } from '../engine/runtime';
import { opponentOf, RESULT_LABEL } from '../logic/games';
import type { Tip } from '../types';
import { UNREADABLE_NOTICE } from './GameViewerScreen';
import { DETECTOR_NAME, useAnalyzerState } from './analysisText';
export const NO_MISTAKES = 'No mistakes or blunders found';
/** `/chess/analysis/:gameId`: the Game_Report (R58, R60.2, R60.3). */
export default function ReportScreen() {
  const { gameId = '' } = useParams();
  const game = useLiveValue(async () => (await readGame(gameId)) ?? null, [gameId]);
  const report = useLiveValue(async () => (await readReport(gameId)) ?? null, [gameId]);
  const state = useAnalyzerState();
  const [tips, setTips] = useState<Tip[]>([]);
  useEffect(() => {
    let live = true;
    loadTips().then(
      (t) => live && setTips(t),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    if (state.error?.kind === 'write') toast.show({ message: state.error.message, kind: 'error' });
  }, [state.error]);
  if (game.failed || report.failed) return <ErrorPanel message="The report could not be loaded." onRetry={() => (game.failed ? game.retry() : report.retry())} />;
  if (game.value === undefined || report.value === undefined) return <Skeleton rows={5} />;
  const g = game.value;
  if (g === null) {
    return (
      <CardFrame>
        <EmptyState title="Game not found" />
      </CardFrame>
    );
  }
  const r = report.value;
  const running = state.current?.gameId === g.id;
  const queued = state.queue.includes(g.id);
  const opponent = opponentOf(g);
  const header = (
    <header className="flex flex-col gap-1">
      <h1 className="text-xl font-semibold">
        Game report: {RESULT_LABEL[g.ownerResult]} vs {opponent.username}
      </h1>
    </header>
  );
  if (g.pgnUnreadable) {
    return (
      <section className="flex flex-col gap-4">
        {header}
        <CardFrame>
          <p role="alert">{UNREADABLE_NOTICE}</p>
        </CardFrame>
      </section>
    );
  }
  const analyse = (
    <>
      {running ? (
        <p role="status">
          Analysing: {state.current?.done} of {state.current?.total} positions
        </p>
      ) : queued ? (
        <p role="status">Queued</p>
      ) : (
        <Button onClick={() => getAnalyzer().enqueue([g.id])}>{r === null ? 'Analyse' : 'Re-analyse'}</Button>
      )}
      {state.error && !running ? (
        <p role="alert" className="text-danger">
          {state.error.message}
        </p>
      ) : null}
      {state.gameErrors[g.id] ? (
        <p role="alert" className="text-danger">
          {state.gameErrors[g.id]}
        </p>
      ) : null}
    </>
  );
  if (r === null) {
    return (
      <section className="flex flex-col gap-4">
        {header}
        <CardFrame className="flex flex-col gap-3" aria-label="Not analysed">
          <p>Not analysed</p>
          {analyse}
        </CardFrame>
      </section>
    );
  }
  const reportTips = r.tipIds.map((id) => tips.find((t) => t.id === id)).filter((t): t is Tip => t !== undefined);
  const id = encodeURIComponent(g.id);
  return (
    <section className="flex flex-col gap-4">
      {header}
      {isOutdated(r) ? (
        <CardFrame className="flex flex-col gap-2" aria-label="Outdated report">
          <p className="font-medium">Outdated</p>
          <p className="text-sm text-muted">This report was made by an older version of the analysis.</p>
          {analyse}
        </CardFrame>
      ) : null}
      <CardFrame aria-label="Move counts">
        <dl className="grid grid-cols-3 gap-2 text-center">
          <div>
            <dt className="text-xs text-muted">Inaccuracies</dt>
            <dd className="text-2xl font-semibold tabular-nums">{r.counts.inaccuracy}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Mistakes</dt>
            <dd className="text-2xl font-semibold tabular-nums">{r.counts.mistake}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Blunders</dt>
            <dd className="text-2xl font-semibold tabular-nums">{r.counts.blunder}</dd>
          </div>
        </dl>
      </CardFrame>
      <CardFrame aria-label="Key mistakes" className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Key mistakes</h2>
        {r.keyMistakes.length === 0 ? (
          <p>{NO_MISTAKES}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {r.keyMistakes.map((m) => (
              <li key={m.ply} className="flex flex-col gap-1">
                <AppLink to={`/chess/games/${id}?ply=${m.ply - 1}`} className="tap font-medium underline">
                  {m.moveNo} {m.san}
                </AppLink>
                <p className="text-sm tabular-nums">
                  Winning chances {m.wBefore} % → {m.wAfter} %
                </p>
                {m.better.length > 0 ? <p className="text-sm">Better: {m.better.join(' ')}</p> : null}
                {m.detectors.length > 0 ? <p className="text-xs text-muted">{m.detectors.map((d) => DETECTOR_NAME[d]).join(', ')}</p> : null}
                <p className="text-sm">{m.explanation}</p>
              </li>
            ))}
          </ol>
        )}
      </CardFrame>
      {reportTips.length > 0 ? (
        <CardFrame aria-label="Tips" className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Tips for {r.band}</h2>
          <ul className="flex flex-col gap-2">
            {reportTips.map((t) => (
              <li key={t.id}>
                <p className="font-medium">{t.title}</p>
                <p className="text-sm">{t.body}</p>
              </li>
            ))}
          </ul>
        </CardFrame>
      ) : null}
      <AppLink to={`/chess/games/${id}`} className="tap flex items-center justify-center rounded-continuous bg-accent px-4 py-2 text-base font-medium text-accent-fg">
        Step through the game
      </AppLink>
    </section>
  );
}
