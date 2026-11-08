import { useMemo, useState } from 'react';
import { AppLink } from '../../../app/AppLink';
import { toLocalDate } from '../../../core/time/localDate';
import { Select } from '../../../ui/form/Select';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { TIME_CLASSES } from '../constants';
import { readAllGames, readReportVersions } from '../data/view';
import {
  analysisStatus,
  filterGames,
  filtersActive,
  gameOpening,
  NO_FILTERS,
  openingNames,
  opponentOf,
  RESULT_LABEL,
  sortGames,
  type GameFilters,
} from '../logic/games';
import type { GameRecord } from '../types';
import { useLiveValue } from '../data/live';
import { useToday } from './useToday';
import { RatingHistory } from './RatingHistory';
import { SyncControls } from './SyncControls';

const PAGE = 50;

export function GameRow({ game, reportVersion }: { game: GameRecord; reportVersion: number | undefined }) {
  const opponent = opponentOf(game);
  return (
    <AppLink to={`/chess/games/${encodeURIComponent(game.id)}`} className="tap flex flex-col gap-0.5 border-b border-line py-2 last:border-0">
      <span className="flex items-center justify-between gap-2">
        <span className="font-medium">
          {RESULT_LABEL[game.ownerResult]} · {game.ownerColour === 'w' ? 'White' : 'Black'} · {game.timeClass}
        </span>
        <span className="text-sm text-muted tabular-nums">{toLocalDate(game.endTime * 1000)}</span>
      </span>
      <span className="text-sm">
        vs {opponent.username}
        {opponent.rating !== undefined ? ` (${opponent.rating})` : ''} · {gameOpening(game)}
      </span>
      <span className="text-xs text-muted">{analysisStatus(game, reportVersion)}</span>
    </AppLink>
  );
}

const choice = (all: string, values: readonly string[]) => [{ value: 'all', label: all }, ...values.map((v) => ({ value: v, label: v }))];

/** `/chess/games`: synced games with filters, sync action and rating history (R45). */
export default function GamesScreen() {
  const games = useLiveValue(readAllGames, []);
  const reports = useLiveValue(readReportVersions, []);
  const today = useToday();
  const [filters, setFilters] = useState<GameFilters>(NO_FILTERS);
  const [shown, setShown] = useState(PAGE);

  const sorted = useMemo(() => sortGames(games.value ?? []), [games.value]);
  const filtered = useMemo(() => filterGames(sorted, filters), [sorted, filters]);
  const openings = useMemo(() => openingNames(sorted), [sorted]);

  if (games.failed) return <ErrorPanel message="The games could not be loaded." onRetry={games.retry} />;
  if (games.value === undefined) return <Skeleton rows={5} />;

  const set = (patch: Partial<GameFilters>) => {
    setFilters({ ...filters, ...patch });
    setShown(PAGE);
  };

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Games</h1>
      <CardFrame aria-label="Games sync">
        <SyncControls />
      </CardFrame>

      {sorted.length === 0 ? (
        <CardFrame>
          <EmptyState title="No games yet">Use “Sync games” to download your Chess.com games.</EmptyState>
        </CardFrame>
      ) : (
        <>
          <RatingHistory games={sorted} today={today} />
          <div className="grid grid-cols-2 gap-3">
            <Select label="Time class" value={filters.timeClass} options={choice('All', TIME_CLASSES)} onChange={(timeClass) => set({ timeClass })} />
            <Select label="Result" value={filters.result} options={choice('All', ['win', 'loss', 'draw'])} onChange={(result) => set({ result })} />
            <Select label="Colour" value={filters.colour} options={choice('All', ['white', 'black'])} onChange={(colour) => set({ colour })} />
            <Select label="Opening" value={filters.opening} options={choice('All', openings)} onChange={(opening) => set({ opening })} />
          </div>
          {filtered.length === 0 ? (
            <CardFrame>
              <EmptyState title="No games match">
                {filtersActive(filters) ? (
                  <Button
                    onClick={() => {
                      setFilters(NO_FILTERS);
                      setShown(PAGE);
                    }}
                  >
                    Clear filters
                  </Button>
                ) : null}
              </EmptyState>
            </CardFrame>
          ) : (
            <CardFrame aria-label="Game list">
              <ul>
                {filtered.slice(0, shown).map((g) => (
                  <li key={g.id}>
                    <GameRow game={g} reportVersion={reports.value?.get(g.id)} />
                  </li>
                ))}
              </ul>
              {filtered.length > shown ? (
                <Button variant="secondary" className="mt-2" onClick={() => setShown(shown + PAGE)}>
                  Show more
                </Button>
              ) : null}
            </CardFrame>
          )}
        </>
      )}
    </section>
  );
}
