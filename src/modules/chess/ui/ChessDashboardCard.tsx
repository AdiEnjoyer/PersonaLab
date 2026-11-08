import { AppLink } from '../../../app/AppLink';
import { ageLabel } from '../../../core/net/ageLabel';
import { useOnline } from '../../../core/net/online';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { useLiveValue } from '../data/live';
import { useToday } from './useToday';
import { db } from '../../../core/db/db';
import { CHESS_TABLES } from '../data/backup';
import { readLastSyncAt } from '../data/gameSync';
import { useDailyTip } from '../data/view';
import type { ChessComRatings } from '../types';
import { ratingText } from './ChessHome';
import { startSync, useSyncView } from './syncStore';
import { useMinuteClock } from './useMinuteClock';

const readSummary = async (): Promise<{ ratings: ChessComRatings | null; lastSyncAt: number | null }> => {
  const [ratings, lastSyncAt] = await Promise.all([db.table<ChessComRatings, string>(CHESS_TABLES.ratings).get('chesscom'), readLastSyncAt(db)]);
  return { ratings: ratings ?? null, lastSyncAt };
};

/** Chess card of the Home_Dashboard: ratings, last sync age, today's tip headline and "Sync games" (R61). */
export default function ChessDashboardCard() {
  const summary = useLiveValue(readSummary, []);
  const today = useToday();
  const { view } = useDailyTip(today);
  const sync = useSyncView();
  const { online } = useOnline();
  const now = useMinuteClock();
  const navigate = useAppNavigate();

  if (summary.failed) return <ErrorPanel message="The chess summary could not be loaded." onRetry={summary.retry} />;
  if (summary.value === undefined) return <Skeleton rows={3} />;
  const { ratings, lastSyncAt } = summary.value;
  const tip = view.status === 'ready' ? view.tip.title : view.status === 'loading' ? '…' : 'No tip today';

  return (
    <CardFrame aria-label="Chess" className="flex flex-col gap-3">
      {/* A tap outside the links and buttons opens the Chess start screen (R61.4). */}
      <div
        className="flex flex-col gap-2"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('a,button')) navigate('/chess');
        }}
      >
        <h2 className="text-lg font-semibold">
          <AppLink to="/chess">Chess</AppLink>
        </h2>
        <dl className="grid grid-cols-3 gap-2 text-center">
          {(
            [
              ['Rapid', ratings?.rapid],
              ['Blitz', ratings?.blitz],
              ['Bullet', ratings?.bullet],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="font-semibold tabular-nums">{ratingText(value)}</dd>
            </div>
          ))}
        </dl>
        {ratings !== null ? <p className="text-xs text-muted">{ageLabel(ratings.fetchedAt, now)}</p> : null}
        <p className="text-xs text-muted">{lastSyncAt === null ? 'Games not synced yet' : `Games: ${ageLabel(lastSyncAt, now).replace('Updated', 'synced')}`}</p>
        <p className="text-sm">
          <span className="text-muted">Daily tip: </span>
          {tip}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={() => void startSync()} disabled={sync.running || !online}>
          Sync games
        </Button>
        {sync.running ? (
          <p role="status" className="text-sm text-muted">
            {sync.total > 0 ? `Syncing month ${sync.done} of ${sync.total}` : 'Syncing…'}
          </p>
        ) : null}
      </div>
    </CardFrame>
  );
}
