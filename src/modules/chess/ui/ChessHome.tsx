import { useEffect, useState } from 'react';
import { AppLink } from '../../../app/AppLink';
import { ageLabel } from '../../../core/net/ageLabel';
import { useOnline } from '../../../core/net/online';
import { useRemoteResource } from '../../../core/net/swr';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { CHESSCOM } from '../constants';
import { readLastSyncAt } from '../data/gameSync';
import { readRatings, refreshRatings } from '../data/ratings';
import { useDailyTip } from '../data/view';
import type { ChessComError } from '../net/chesscom';
import { chessComMessage } from '../net/messages';
import type { ChessComRatings } from '../types';
import { SyncControls } from './SyncControls';
import { startSync, useSyncView } from './syncStore';
import { useMinuteClock } from './useMinuteClock';
import { useToday } from './useToday';

const NAV = [
  { to: '/chess/games', label: 'Games' },
  { to: '/chess/board', label: 'Board' },
  { to: '/chess/tips', label: 'Tips' },
  { to: '/chess/puzzles', label: 'Puzzles' },
  { to: '/chess/openings', label: 'Openings' },
  { to: '/chess/analysis', label: 'Analysis' },
] as const;

export const ratingText = (value: number | undefined): string => (value === undefined ? 'No rating' : String(value));

function RatingRow({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{ratingText(value)}</dd>
    </div>
  );
}

type RefreshError = ChessComError | { kind: 'write' };

function RatingsCard() {
  const [error, setError] = useState<RefreshError | null>(null);
  const [forced, setForced] = useState(false);
  const now = useMinuteClock();
  const ratings = useRemoteResource<ChessComRatings | null>({
    key: 'chess-ratings',
    maxAgeMs: forced ? 0 : CHESSCOM.RATINGS_MAX_AGE_MS,
    readCache: async () => {
      const stored = await readRatings();
      return stored === null ? null : { data: stored, fetchedAt: stored.fetchedAt };
    },
    fetchFresh: async () => {
      const result = await refreshRatings();
      if (!result.ok) {
        setError(result.error);
        throw new Error(result.error.kind);
      }
      setError(null);
      return { data: result.ratings, fetchedAt: result.ratings.fetchedAt };
    },
  });
  const r = ratings.data;
  const failed = ratings.state === 'failed';
  const notFound = failed && error?.kind === 'not-found';

  return (
    <CardFrame aria-label="Chess.com ratings" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Chess.com ratings</h2>
        <Button
          variant="secondary"
          disabled={ratings.state === 'refreshing'}
          onClick={() => {
            if (forced) ratings.retry();
            else setForced(true);
          }}
        >
          Refresh
        </Button>
      </div>
      {ratings.state === 'refreshing' && r === null ? (
        <Skeleton rows={3} />
      ) : (
        <dl className="flex flex-col gap-1">
          <RatingRow label="Rapid" value={r?.rapid} />
          <RatingRow label="Blitz" value={r?.blitz} />
          <RatingRow label="Bullet" value={r?.bullet} />
          <RatingRow label="Puzzle (highest)" value={r?.tacticsHigh} />
          <RatingRow label="Puzzle (lowest)" value={r?.tacticsLow} />
        </dl>
      )}
      <p className="text-xs text-muted">
        {ratings.fetchedAt !== null ? ageLabel(ratings.fetchedAt, now) : null}
        {ratings.state === 'refreshing' && r !== null ? ' · Refreshing…' : null}
      </p>
      {failed ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-danger">
          <span>{notFound ? 'Chess.com user not found' : `Couldn't refresh${error && error.kind !== 'write' ? `: ${chessComMessage(error)}` : ''}`}</span>
          {notFound ? (
            <AppLink to="/settings" className="underline">
              Open Chess settings
            </AppLink>
          ) : (
            <Button variant="ghost" onClick={ratings.retry}>
              Retry
            </Button>
          )}
        </div>
      ) : null}
    </CardFrame>
  );
}

export function DailyTipCard() {
  const today = useToday();
  const { view, retry } = useDailyTip(today);
  if (view.status === 'loading') return <Skeleton rows={2} />;
  if (view.status === 'error') return <ErrorPanel message="The daily tip could not be loaded." onRetry={retry} />;
  return (
    <CardFrame aria-label="Daily tip" className="flex flex-col gap-1">
      <h2 className="text-lg font-semibold">Daily tip</h2>
      {view.status === 'none' ? (
        <p className="text-muted">No tips for the band {view.band} yet.</p>
      ) : (
        <>
          <p className="font-medium">{view.tip.title}</p>
          <p>{view.tip.body}</p>
          <p className="text-xs text-muted">{view.tip.band}</p>
        </>
      )}
    </CardFrame>
  );
}

/** `/chess`: ratings, daily tip, sync and links to the Chess screens (R41.7, R43, R44.15). */
export default function ChessHome() {
  const { online } = useOnline();
  const sync = useSyncView();

  // Opening the module starts a background Game_Sync when none exists or the last one is over 6 h old (R44.15).
  useEffect(() => {
    if (!online || sync.running) return;
    let live = true;
    void readLastSyncAt()
      .then((last) => {
        if (live && (last === null || Date.now() - last > CHESSCOM.GAMES_MAX_AGE_MS)) void startSync();
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
    // Only when the screen opens or the device comes online.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);

  return (
    <section className="flex flex-col gap-4">
      <RatingsCard />
      <DailyTipCard />
      <CardFrame aria-label="Games sync">
        <SyncControls />
      </CardFrame>
      <nav aria-label="Chess sections" className="grid grid-cols-2 gap-2">
        {NAV.map((n) => (
          <AppLink key={n.to} to={n.to} className="tap flex items-center justify-center rounded-continuous bg-surface-2 px-4 py-2 text-base font-medium text-fg">
            {n.label}
          </AppLink>
        ))}
      </nav>
    </section>
  );
}
