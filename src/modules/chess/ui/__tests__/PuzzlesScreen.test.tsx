import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../../core/db/db';
import { withFreshDb } from '../../../../test/helpers/db';
import { resetPuzzlesCache } from '../../data/puzzles';
import { FIXTURE_PUZZLES, LINE_PUZZLE, MATE_PUZZLE } from '../../logic/__tests__/puzzleFixtures';
import type { PuzzleAttempt, PuzzleRatingRecord } from '../../types';

type Options = {
  position: string;
  squareStyles: Record<string, unknown>;
  arrows: Array<{ startSquare: string; endSquare: string }>;
  onPieceDrop: (a: { piece: { pieceType: string; isSparePiece: boolean; position: string }; sourceSquare: string; targetSquare: string | null }) => boolean;
};
const holder = vi.hoisted(() => ({ options: undefined as unknown }));

vi.mock('react-chessboard', () => ({
  Chessboard: ({ options }: { options: Options }) => {
    holder.options = options;
    return <div data-testid="mock-board" data-fen={options.position} />;
  },
}));

import PuzzlesScreen, { ALL_SOLVED_MESSAGE, CHART_MESSAGE, EMPTY_TITLE, NOT_LOADED_MESSAGE, STATS_MESSAGE } from '../PuzzlesScreen';

const opts = () => holder.options as Options;
const drop = (from: string, to: string): boolean => {
  let accepted = false;
  act(() => {
    accepted = opts().onPieceDrop({ piece: { pieceType: 'wR', isSparePiece: false, position: from }, sourceSquare: from, targetSquare: to });
  });
  return accepted;
};
const fenOf = () => screen.getByTestId('mock-board').getAttribute('data-fen');

const respond = (status: number, body: unknown, contentType = 'application/json') =>
  vi.fn(async () => ({ ok: status >= 200 && status < 300, status, headers: { get: () => contentType }, json: async () => body }));

const attempts = () => db.table<PuzzleAttempt, string>('chess_puzzleAttempts').toArray();
const ratingRecord = () => db.table<PuzzleRatingRecord, string>('chess_puzzleRating').get('puzzle');

const renderScreen = () =>
  render(
    <MemoryRouter>
      <PuzzlesScreen />
    </MemoryRouter>,
  );
const ownerTurn = () => screen.findByText('Your move');

beforeEach(async () => {
  holder.options = undefined;
  resetPuzzlesCache();
  await withFreshDb(async () => undefined);
  vi.stubGlobal('fetch', respond(200, [MATE_PUZZLE]));
});
afterEach(() => vi.unstubAllGlobals());

describe('PuzzlesScreen data', () => {
  it('explains how to generate the data when the file is missing or empty', async () => {
    vi.stubGlobal('fetch', respond(404, null));
    const first = renderScreen();
    expect(await screen.findByText(EMPTY_TITLE)).toBeInTheDocument();
    expect(screen.getByText(/npm run data:puzzles/)).toBeInTheDocument();
    expect(screen.getByTestId('puzzle-rating')).toHaveTextContent('—');
    first.unmount();
    resetPuzzlesCache();
    vi.stubGlobal('fetch', respond(200, []));
    renderScreen();
    expect(await screen.findByText(EMPTY_TITLE)).toBeInTheDocument();
    expect(await attempts()).toEqual([]);
  });

  it('shows "Puzzles could not be loaded." with Retry for an unreadable file', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', respond(200, { not: 'a list' }));
    renderScreen();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(NOT_LOADED_MESSAGE);
    vi.stubGlobal('fetch', respond(200, [MATE_PUZZLE]));
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await ownerTurn();
  });
});

describe('PuzzlesScreen ?theme= query', () => {
  it('opens theme practice for the themes in the query (R59.6)', async () => {
    vi.stubGlobal('fetch', respond(200, FIXTURE_PUZZLES));
    render(
      <MemoryRouter initialEntries={['/chess/puzzles?theme=opening']}>
        <PuzzlesScreen />
      </MemoryRouter>,
    );
    await ownerTurn();
    expect(screen.getByLabelText('Theme')).toHaveValue('opening');
    expect(fenOf()).toContain('pppppppp/8/8/4P3');
    expect(LINE_PUZZLE.themes).toContain('opening');
  });
  it('accepts several themes, comma-separated', async () => {
    vi.stubGlobal('fetch', respond(200, FIXTURE_PUZZLES));
    render(
      <MemoryRouter initialEntries={['/chess/puzzles?theme=backRankMate,short']}>
        <PuzzlesScreen />
      </MemoryRouter>,
    );
    await ownerTurn();
    expect(screen.getByLabelText('Theme')).toHaveValue('backRankMate,short');
  });
});

describe('PuzzlesScreen trainer', () => {
  it('plays the opponent reply, accepts the solution and rates the first attempt', async () => {
    renderScreen();
    expect(screen.getByTestId('puzzle-rating')).toHaveTextContent('—');
    await ownerTurn();
    expect(fenOf()).toContain('7k/');
    expect(drop('a1', 'a8')).toBe(true);
    expect(await screen.findByText('Solved')).toBeInTheDocument();
    await waitFor(async () => expect(await attempts()).toHaveLength(1));
    const [a] = await attempts();
    expect(a).toMatchObject({ puzzleId: 'mate1', score: 1, hintsUsed: 0, rated: true });
    const stored = await ratingRecord();
    expect(stored?.rating).toBeGreaterThan(a!.before.rating);
    expect(stored?.rd).toBeLessThan(350);
    expect(await screen.findByText(/provisional/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next puzzle' })).toBeInTheDocument();
    expect(screen.getByText(CHART_MESSAGE)).toBeInTheDocument();
  });

  it('accepts an alternative checkmate', async () => {
    renderScreen();
    await ownerTurn();
    expect(drop('b1', 'b8')).toBe(true);
    expect(await screen.findByText('Solved')).toBeInTheDocument();
  });

  it('a wrong move fails at once, reverts the board and is stored once; Try again does not store another', async () => {
    const user = userEvent.setup();
    renderScreen();
    await ownerTurn();
    const before = fenOf();
    drop('a1', 'a7');
    expect(await screen.findByText('Wrong move')).toBeInTheDocument();
    expect(fenOf()).toBe(before);
    await waitFor(async () => expect(await attempts()).toHaveLength(1));
    expect((await attempts())[0]).toMatchObject({ score: 0, rated: true });
    const afterFail = await ratingRecord();
    expect(afterFail!.rating).toBeLessThan((await attempts())[0]!.before.rating);

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Your move')).toBeInTheDocument();
    drop('a1', 'a8');
    expect(await screen.findByText('Solved')).toBeInTheDocument();
    expect(await attempts()).toHaveLength(1);
    expect(await ratingRecord()).toEqual(afterFail);
  });

  it('ignores an illegal move without failing', async () => {
    renderScreen();
    await ownerTurn();
    expect(drop('a1', 'h8')).toBe(false);
    expect(screen.getByText('Your move')).toBeInTheDocument();
    expect(await attempts()).toEqual([]);
  });

  it('a hint decides score 0: square first, arrow second, then no more', async () => {
    const user = userEvent.setup();
    renderScreen();
    await ownerTurn();
    await user.click(screen.getByRole('button', { name: 'Hint' }));
    expect(opts().squareStyles['a1']).toBeDefined();
    expect(opts().arrows).toEqual([]);
    await waitFor(async () => expect(await attempts()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Hint' }));
    expect(opts().arrows).toEqual([expect.objectContaining({ startSquare: 'a1', endSquare: 'a8' })]);
    await user.click(screen.getByRole('button', { name: 'Hint' }));
    drop('a1', 'a8');
    expect(await screen.findByText('Solved')).toBeInTheDocument();
    const stored = await attempts();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ score: 0, hintsUsed: 1 });
  });

  it('show solution plays the rest, ends unsolved and stores score 0', async () => {
    const user = userEvent.setup();
    renderScreen();
    await ownerTurn();
    await user.click(screen.getByRole('button', { name: 'Show solution' }));
    expect(await screen.findByText('Not solved', undefined, { timeout: 3000 })).toBeInTheDocument();
    expect(fenOf()).toContain('R6k');
    await waitFor(async () => expect(await attempts()).toHaveLength(1));
    expect((await attempts())[0]).toMatchObject({ score: 0, rated: true });
  });

  it('leaving before the score is decided stores nothing', async () => {
    const user = userEvent.setup();
    renderScreen();
    await ownerTurn();
    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(await attempts()).toEqual([]);
    expect(await ratingRecord()).toBeUndefined();
  });

  it('rates only the first attempt: a review of a missed puzzle is stored unrated', async () => {
    const user = userEvent.setup();
    const rating = { rating: 1300, rd: 120, vol: 0.06 };
    await db.table('chess_puzzleRating').put({ id: 'puzzle', ...rating });
    await db.table('chess_puzzleAttempts').put({
      id: 'old',
      idemKey: 'old',
      puzzleId: 'mate1',
      ts: 1,
      score: 0,
      hintsUsed: 0,
      rated: true,
      before: rating,
      after: rating,
    });
    renderScreen();
    await user.click(await screen.findByRole('button', { name: 'Review missed puzzles' }));
    await ownerTurn();
    drop('a1', 'a8');
    expect(await screen.findByText('Solved')).toBeInTheDocument();
    await waitFor(async () => expect(await attempts()).toHaveLength(2));
    const second = (await attempts()).find((a) => a.id !== 'old')!;
    expect(second).toMatchObject({ rated: false, score: 1 });
    expect(second.before).toEqual(second.after);
    expect(await ratingRecord()).toEqual({ id: 'puzzle', ...rating });
    expect(screen.getByTestId('attempt-result')).toHaveTextContent('Unrated');
  });

  it('tells the Owner when every puzzle was solved', async () => {
    const rating = { rating: 1300, rd: 120, vol: 0.06 };
    await db.table('chess_puzzleRating').put({ id: 'puzzle', ...rating });
    await db.table('chess_puzzleAttempts').put({ id: 'old', idemKey: 'old', puzzleId: 'mate1', ts: 1, score: 1, hintsUsed: 0, rated: true, before: rating, after: rating });
    renderScreen();
    expect(await screen.findByText(ALL_SOLVED_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByText(STATS_MESSAGE)).toBeNull();
  });
});

describe('PuzzlesScreen statistics', () => {
  it('shows the weakest theme with a Practice action once it has 5 rated attempts', async () => {
    const rating = { rating: 1300, rd: 80, vol: 0.06 };
    await db.table('chess_puzzleRating').put({ id: 'puzzle', ...rating });
    const rows = [1, 0, 0, 1, 0].map((score, i) => ({
      id: `a${i}`,
      idemKey: `a${i}`,
      puzzleId: 'mate1',
      ts: 1000 + i,
      score,
      hintsUsed: 0,
      rated: true,
      before: rating,
      after: { ...rating, rating: 1300 + i },
    }));
    await db.table('chess_puzzleAttempts').bulkPut(rows);
    renderScreen();
    const list = await screen.findByRole('list', { name: 'Weakest themes' });
    expect(list).toHaveTextContent('backRankMate · 40% (2/5)');
    expect(screen.getByRole('button', { name: 'Practice mateIn1' })).toBeInTheDocument();
    expect(screen.getByTestId('puzzle-rating')).toHaveTextContent('1300');
    expect(screen.queryByText(CHART_MESSAGE)).toBeNull();
  });
});
