import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../../core/db/db';
import { withFreshDb } from '../../../../test/helpers/db';
import { resetTipsCache } from '../../data/view';
import type { GameRecord } from '../../types';
import { PGN } from '../../logic/__tests__/fixtures';

type Options = {
  position: string;
  onPieceDrop: (a: { piece: { pieceType: string; isSparePiece: boolean; position: string }; sourceSquare: string; targetSquare: string | null }) => boolean;
};
const holder = vi.hoisted(() => ({ options: undefined as unknown, runner: undefined as unknown }));

vi.mock('react-chessboard', () => ({
  Chessboard: ({ options }: { options: Options }) => {
    holder.options = options;
    return <div data-testid="mock-board" data-fen={options.position} />;
  },
}));
vi.mock('../../data/gameSync', () => ({
  runGameSync: (...args: unknown[]) => (holder.runner as (...a: unknown[]) => unknown)(...args),
  readLastSyncAt: async () => null,
}));

import BoardScreen from '../BoardScreen';
import ChessDashboardCard from '../ChessDashboardCard';
import GamesScreen from '../GamesScreen';
import GameViewerScreen, { UNREADABLE_NOTICE } from '../GameViewerScreen';
import { MIN_RATED_MESSAGE, NO_RANGE_MESSAGE } from '../RatingHistory';
import { resetSyncStore } from '../syncStore';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const fenOf = () => screen.getByTestId('mock-board').getAttribute('data-fen');
const drop = (from: string, to: string): boolean => {
  let accepted = false;
  act(() => {
    accepted = (holder.options as Options).onPieceDrop({ piece: { pieceType: 'wP', isSparePiece: false, position: from }, sourceSquare: from, targetSquare: to });
  });
  return accepted;
};

const game = (over: Partial<GameRecord>): GameRecord => ({
  id: 'g1',
  idemKey: 'g1',
  pgn: PGN,
  timeClass: 'rapid',
  timeControl: '600',
  endTime: Math.floor(Date.now() / 1000) - 86_400,
  rated: true,
  white: { username: 'adi', rating: 1200, result: 'win' },
  black: { username: 'bob', rating: 1180, result: 'resigned' },
  eco: 'https://www.chess.com/openings/Italian-Game',
  syncedFor: 'adi',
  ownerColour: 'w',
  ownerResult: 'win',
  pgnUnreadable: false,
  ...over,
});

beforeEach(async () => {
  holder.options = undefined;
  holder.runner = async () => ({ ok: true, created: 0, skipped: 0, months: 0, empty: false });
  resetSyncStore();
  resetTipsCache();
  await withFreshDb(async () => undefined);
});

describe('BoardScreen', () => {
  it('plays legal moves only and supports undo and redo', async () => {
    const user = userEvent.setup();
    render(<BoardScreen />);
    expect(fenOf()).toBe(START);
    expect(drop('e2', 'e5')).toBe(false);
    expect(fenOf()).toBe(START);
    expect(drop('e2', 'e4')).toBe(true);
    expect(fenOf()).not.toBe(START);
    expect(screen.getByLabelText('Moves')).toHaveTextContent('1. e4');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(fenOf()).toBe(START);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Redo' }));
    expect(fenOf()).not.toBe(START);
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });

  it('keeps the position and the text when a FEN or PGN is rejected', async () => {
    const user = userEvent.setup();
    render(<BoardScreen />);
    drop('e2', 'e4');
    const before = fenOf();
    const input = screen.getByLabelText('FEN or PGN');
    await user.type(input, 'not a position');
    await user.click(screen.getByRole('button', { name: 'Load' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(fenOf()).toBe(before);
    expect(input).toHaveValue('not a position');
    await user.clear(input);
    await user.click(screen.getByRole('button', { name: 'Load' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a FEN or PGN');
    expect(fenOf()).toBe(before);
  });

  it('loads a PGN so Undo steps back through it', async () => {
    const user = userEvent.setup();
    render(<BoardScreen />);
    await user.click(screen.getByLabelText('FEN or PGN'));
    await user.paste(PGN);
    await user.click(screen.getByRole('button', { name: 'Load' }));
    expect(screen.getByLabelText('Moves')).toHaveTextContent('1. e4 e5 2. Nf3 Nc6');
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.getByLabelText('Moves')).toHaveTextContent('1. e4 e5 2. Nf3');
  });

  it('asks for the promotion piece and cancels without a move', async () => {
    const user = userEvent.setup();
    render(<BoardScreen />);
    await user.click(screen.getByLabelText('FEN or PGN'));
    await user.paste('8/P7/8/8/8/8/k6K/8 w - - 0 1');
    await user.click(screen.getByRole('button', { name: 'Load' }));
    const before = fenOf();
    expect(drop('a7', 'a8')).toBe(false);
    const picker = await screen.findByRole('group', { name: 'Promote to' });
    await user.click(within(picker).getByRole('button', { name: 'Cancel' }));
    expect(fenOf()).toBe(before);
    drop('a7', 'a8');
    await user.click(await screen.findByRole('button', { name: 'Knight' }));
    expect(fenOf()).toContain('N7');
  });
});

describe('GamesScreen', () => {
  const renderGames = () =>
    render(
      <MemoryRouter>
        <GamesScreen />
      </MemoryRouter>,
    );

  it('shows the empty state with Sync games when nothing is stored', async () => {
    renderGames();
    expect(await screen.findByText('No games yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Sync games' }).length).toBeGreaterThan(0);
  });

  it('lists games newest first, filters them and clears the filters', async () => {
    const user = userEvent.setup();
    const now = Math.floor(Date.now() / 1000);
    await db.table('chess_games').bulkPut([
      game({ id: 'old', idemKey: 'old', endTime: now - 5 * 86_400, ownerResult: 'loss', white: { username: 'adi', rating: 1190, result: 'timeout' }, black: { username: 'zed', rating: 1250, result: 'win' } }),
      game({ id: 'new', idemKey: 'new', endTime: now - 86_400, timeClass: 'blitz' }),
    ]);
    renderGames();
    const list = await screen.findByLabelText('Game list');
    const rows = within(list).getAllByRole('link');
    expect(rows[0]).toHaveTextContent('vs bob (1180)');
    expect(rows[1]).toHaveTextContent('vs zed (1250)');
    expect(rows[0]).toHaveTextContent('Italian Game');
    expect(rows[0]).toHaveTextContent('Not analysed');

    // The rating chart has its own "Time class" select; the list filter is the last one.
    await user.selectOptions(screen.getAllByLabelText('Time class').at(-1) as HTMLElement, 'blitz');
    expect(within(screen.getByLabelText('Game list')).getAllByRole('link')).toHaveLength(1);

    await user.selectOptions(screen.getByLabelText('Result'), 'draw');
    expect(await screen.findByText('No games match')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(within(screen.getByLabelText('Game list')).getAllByRole('link')).toHaveLength(2);
  });

  it('shows a month-level error and a retry when the sync stops', async () => {
    const user = userEvent.setup();
    holder.runner = async (deps: { onProgress?: (d: number, t: number) => void }) => {
      deps.onProgress?.(1, 3);
      return { ok: false, error: { kind: 'timeout' }, done: 1, total: 3, created: 4, skipped: 0 };
    };
    renderGames();
    await user.click((await screen.findAllByRole('button', { name: 'Sync games' }))[0] as HTMLElement);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Chess.com did not respond. Try again later.');
    expect(alert).toHaveTextContent('Stopped at month 2 of 3');
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('shows the chart message when fewer than 2 rated games exist, and when none is in range', async () => {
    await db.table('chess_games').put(game({}));
    const first = renderGames();
    expect(await screen.findByText(MIN_RATED_MESSAGE)).toBeInTheDocument();
    first.unmount();
    const old = Math.floor(Date.now() / 1000) - 800 * 86_400;
    await db.table('chess_games').bulkPut([game({ id: 'o1', idemKey: 'o1', endTime: old }), game({ id: 'o2', idemKey: 'o2', endTime: old + 1 })]);
    await db.table('chess_games').delete('g1');
    renderGames();
    expect(await screen.findByText(NO_RANGE_MESSAGE)).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All time' })).toBeInTheDocument();
  });
});

describe('GameViewerScreen', () => {
  const renderViewer = (id: string) =>
    render(
      <MemoryRouter initialEntries={[`/chess/games/${encodeURIComponent(id)}`]}>
        <Routes>
          <Route path="/chess/games/:gameId" element={<GameViewerScreen />} />
        </Routes>
      </MemoryRouter>,
    );

  it('steps through the moves, marks the Owner’s moves and shows clocks', async () => {
    const user = userEvent.setup();
    await db.table('chess_games').put(game({ id: 'https://chess.com/game/1', idemKey: 'https://chess.com/game/1' }));
    renderViewer('https://chess.com/game/1');
    await screen.findByTestId('mock-board');
    const start = fenOf();
    expect(screen.getByRole('button', { name: 'First' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByLabelText('Your clock')).toHaveTextContent('10:00');

    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(fenOf()).not.toBe(start);
    expect(screen.getByLabelText('Your clock')).toHaveTextContent('9:58');

    await user.click(screen.getByRole('button', { name: 'Last' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Last' })).toBeDisabled();
    expect(screen.getByLabelText('Opponent clock')).toHaveTextContent('9:40');

    expect(screen.getByRole('button', { name: '1. e4 (your move)' })).toHaveAttribute('data-owner', 'true');
    expect(screen.getByRole('button', { name: 'e5' })).not.toHaveAttribute('data-owner');
    await user.click(screen.getByRole('button', { name: '1. e4 (your move)' }));
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  it('shows a notice instead of a board when the PGN is unreadable', async () => {
    await db.table('chess_games').put(game({ pgn: '', pgnUnreadable: true }));
    renderViewer('g1');
    expect(await screen.findByText(UNREADABLE_NOTICE)).toBeInTheDocument();
    expect(screen.queryByTestId('mock-board')).toBeNull();
  });
});

describe('ChessDashboardCard', () => {
  const renderCard = () =>
    render(
      <MemoryRouter>
        <ChessDashboardCard />
      </MemoryRouter>,
    );

  it('shows "No rating" and an unsynced note before the first refresh', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => [] })));
    renderCard();
    expect(await screen.findByText('Games not synced yet')).toBeInTheDocument();
    expect(screen.getAllByText('No rating')).toHaveLength(3);
    expect(await screen.findByText('No tip today')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('shows stored ratings with their age, the tip headline and starts a sync', async () => {
    const user = userEvent.setup();
    const tip = { id: 't1', band: '1200–1399', topics: ['tactics'], title: 'Check the forks', body: 'Look for forks.', detectors: [] };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [tip] })));
    await db.table('chess_ratings').put({ id: 'chesscom', rapid: 1234, blitz: 1000, fetchedAt: Date.now() - 5 * 60_000 });
    let started = 0;
    holder.runner = async () => {
      started += 1;
      return { ok: true, created: 0, skipped: 0, months: 0, empty: false };
    };
    renderCard();
    expect(await screen.findByText('1234')).toBeInTheDocument();
    expect(screen.getByText('Updated 5 min ago')).toBeInTheDocument();
    expect(await screen.findByText('Check the forks')).toBeInTheDocument();
    expect(screen.getAllByText('No rating')).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Sync games' }));
    await waitFor(() => expect(started).toBe(1));
    vi.unstubAllGlobals();
  });
});
