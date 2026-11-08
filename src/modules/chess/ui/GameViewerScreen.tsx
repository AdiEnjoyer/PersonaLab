import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';
import { toLocalDate } from '../../../core/time/localDate';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { ErrorPanel } from '../../../ui/status/ErrorPanel';
import { Skeleton } from '../../../ui/status/Skeleton';
import { readGame } from '../data/view';
import { clocksAt, parseGame } from '../logic/gameView';
import { gameOpening, opponentOf, ownerOf, RESULT_LABEL } from '../logic/games';
import type { GameRecord } from '../types';
import { BoardView } from './BoardView';

export const UNREADABLE_NOTICE = 'This game’s PGN could not be read, so it cannot be replayed or analysed.';

function Viewer({ game }: { game: GameRecord }) {
  const parsed = useMemo(() => (game.pgnUnreadable ? null : parseGame(game.pgn)), [game]);
  const [index, setIndex] = useState(0);
  const total = parsed?.moves.length ?? 0;
  const fen = index === 0 ? (parsed?.startFen ?? '') : (parsed?.moves[index - 1]?.fen ?? '');
  const move = index > 0 ? parsed?.moves[index - 1] : undefined;
  const clocks = parsed ? clocksAt(game, index) : null;
  const owner = ownerOf(game);
  const opponent = opponentOf(game);

  useEffect(() => {
    if (!parsed) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(total, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [parsed, total]);

  const orientation = game.ownerColour === 'w' ? 'white' : 'black';
  const ownerClock = clocks ? (game.ownerColour === 'w' ? clocks.w : clocks.b) : undefined;
  const opponentClock = clocks ? (game.ownerColour === 'w' ? clocks.b : clocks.w) : undefined;

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">
          {RESULT_LABEL[game.ownerResult]} vs {opponent.username}
          {opponent.rating !== undefined ? ` (${opponent.rating})` : ''}
        </h1>
        <p className="text-sm text-muted">
          {gameOpening(game)} · {game.timeClass} {game.timeControl} · {toLocalDate(game.endTime * 1000)} · You played {game.ownerColour === 'w' ? 'White' : 'Black'}
          {owner.rating !== undefined ? ` (${owner.rating})` : ''}
        </p>
      </header>

      {parsed === null ? (
        <CardFrame>
          <p role="alert">{UNREADABLE_NOTICE}</p>
        </CardFrame>
      ) : (
        <>
          {opponentClock !== undefined ? (
            <p aria-label="Opponent clock" className="text-lg font-semibold tabular-nums">
              {opponent.username} {opponentClock}
            </p>
          ) : null}
          <BoardView fen={fen} orientation={orientation} lastMove={move ? { from: move.from, to: move.to } : undefined} />
          {ownerClock !== undefined ? (
            <p aria-label="Your clock" className="text-lg font-semibold tabular-nums">
              You {ownerClock}
            </p>
          ) : null}
          <div className="flex gap-2">
            <Button variant="secondary" disabled={index === 0} onClick={() => setIndex(0)}>
              First
            </Button>
            <Button variant="secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}>
              Previous
            </Button>
            <Button variant="secondary" disabled={index >= total} onClick={() => setIndex(index + 1)}>
              Next
            </Button>
            <Button variant="secondary" disabled={index >= total} onClick={() => setIndex(total)}>
              Last
            </Button>
          </div>
          <CardFrame aria-label="Moves">
            {total === 0 ? (
              <p className="text-muted">This game has no moves.</p>
            ) : (
              <ol className="flex flex-wrap gap-1">
                {parsed.moves.map((m, i) => {
                  const mine = m.colour === game.ownerColour;
                  const label = `${i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ` : ''}${m.san}`;
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        aria-current={index === i + 1 ? 'step' : undefined}
                        aria-label={`${label}${mine ? ' (your move)' : ''}`}
                        data-owner={mine ? 'true' : undefined}
                        onClick={() => setIndex(i + 1)}
                        className={`tap rounded-continuous px-2 tabular-nums ${index === i + 1 ? 'bg-accent text-accent-fg' : mine ? 'bg-surface-2 font-semibold underline' : 'bg-surface-2'}`}
                      >
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardFrame>
        </>
      )}
    </section>
  );
}

/** `/chess/games/:gameId`: step through a game (R45.5, R45.6). */
export default function GameViewerScreen() {
  const { gameId = '' } = useParams();
  const [state, setState] = useState<{ game: GameRecord | null } | 'failed'>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState(undefined);
    readGame(gameId).then(
      (game) => live && setState({ game: game ?? null }),
      () => live && setState('failed'),
    );
    return () => {
      live = false;
    };
  }, [gameId, attempt]);

  if (state === 'failed') return <ErrorPanel message="The game could not be loaded." onRetry={() => setAttempt((n) => n + 1)} />;
  if (state === undefined) return <Skeleton rows={5} />;
  if (state.game === null) {
    return (
      <CardFrame>
        <EmptyState title="Game not found" />
      </CardFrame>
    );
  }
  return <Viewer game={state.game} />;
}
