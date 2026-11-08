import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from 'chess.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../../core/db/db';
import { undoService } from '../../../../core/undo/undoService';
import { installWriteFailures, withFreshDb } from '../../../../test/helpers/db';
import { toast } from '../../../../ui/toast/toastStore';
import { clearSeededFlag, readRepertoire, saveTrees } from '../../data/openingRepo';
import { counterIds, fixtureTrees } from '../../logic/__tests__/repertoireFixtures';
import { ownerPositions } from '../../logic/repertoire';
import { buildTree } from '../../logic/starter';
import type { GameRecord, RepertoireTree, ReviewRecord } from '../../types';

type Options = {
  position: string;
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
import OpeningsScreen from '../OpeningsScreen';

const opts = () => holder.options as Options;
const drop = (from: string, to: string): void => {
  act(() => {
    opts().onPieceDrop({ piece: { pieceType: 'wP', isSparePiece: false, position: from }, sourceSquare: from, targetSquare: to });
  });
};
const fenOf = () => screen.getByTestId('mock-board').getAttribute('data-fen');
const arrows = () => opts().arrows.map((a) => `${a.startSquare}${a.endSquare}`);

/** One White tree with notes: 1.e4 e5 2.Nf3 (two Owner positions). */
const small = (): RepertoireTree =>
  buildTree({ name: 'Small', colour: 'w', lines: [['e4 # Take the centre.', 'e5', 'Nf3 # Develop with tempo.']] }, counterIds('s'), 1000);

const failures = installWriteFailures(db);
const reviews = () => db.table<ReviewRecord, string>('chess_reviews').toArray();
const srsDue = async () => (await db.table<{ posKey: string; due: string }, string>('chess_srs').toArray()).map((s) => s.due);

beforeEach(async () => {
  failures.clear();
  toast.dismiss();
  clearSeededFlag();
  holder.options = undefined;
  undoService.dismiss();
  await withFreshDb(async () => undefined);
});
afterEach(() => undoService.dismiss());

describe('OpeningsScreen list', () => {
  it('shows the trees with the score from the Owner games and the due count', async () => {
    const tree = small();
    await saveTrees([tree]);
    const game: GameRecord = {
      id: 'g1',
      idemKey: 'g1',
      pgn: '1. e4 e5 2. Nf3 Nc6',
      timeClass: 'rapid',
      timeControl: '600',
      endTime: 1,
      rated: true,
      white: { username: 'adi', result: 'win' },
      black: { username: 'bob', result: 'resigned' },
      syncedFor: 'adi',
      ownerColour: 'w',
      ownerResult: 'win',
      pgnUnreadable: false,
    };
    await db.table('chess_games').add(game);
    const key = ownerPositions(tree)[0]!.posKey;
    await db.table('chess_srs').put({ posKey: key, E: 250, n: 1, I: 1, due: '2000-01-01' });
    render(<OpeningsScreen />);
    expect(await screen.findByRole('heading', { name: 'Small' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId(`score-${tree.id}`)).toHaveTextContent('100% score in 1 game'));
    expect(screen.getByTestId(`due-${tree.id}`)).toHaveTextContent('1 due');
    expect(screen.getByTestId('due-total')).toHaveTextContent('1 due today');
  });

  it('seeds nothing and offers Create tree and Reset when the stored repertoire is empty', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) })),
    );
    render(<OpeningsScreen />);
    expect(await screen.findByText('No opening trees')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset to starter repertoire' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'My tree');
    await user.click(screen.getByRole('button', { name: 'Create tree' }));
    expect(await screen.findByRole('heading', { name: 'My tree' })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

describe('OpeningsScreen learn mode', () => {
  it('steps through a line with notes, arrows for the Owner move and a wrong move that returns', async () => {
    const user = userEvent.setup();
    await saveTrees([small()]);
    render(<OpeningsScreen />);
    await user.click(await screen.findByRole('button', { name: 'Learn Small' }));
    await screen.findByText('Play the move shown by the arrow');
    expect(arrows()).toEqual(['e2e4']);
    // A wrong (but legal) move goes back and keeps the arrow.
    const start = fenOf();
    drop('d2', 'd4');
    await waitFor(() => expect(fenOf()).toBe(start));
    expect(arrows()).toEqual(['e2e4']);
    drop('e2', 'e4');
    await waitFor(() => expect(screen.getByTestId('learn-note')).toHaveTextContent('Idea: Take the centre.'));
    expect(screen.getByTestId('learn-moves')).toHaveTextContent('1. e4');
    // The opponent answers after 300 ms, then the next Owner move is shown.
    await waitFor(() => expect(screen.getByTestId('learn-moves')).toHaveTextContent('1. e4 e5'));
    await screen.findByText('Play the move shown by the arrow');
    expect(arrows()).toEqual(['g1f3']);
    drop('g1', 'f3');
    expect(await screen.findByText('Line complete')).toBeInTheDocument();
    expect(screen.getByTestId('learn-note')).toHaveTextContent('Idea: Develop with tempo.');
    expect(await reviews()).toEqual([]); // learn mode changes no SRS state
  });
});

describe('OpeningsScreen drill mode', () => {
  it('grades 5 for a first-try move and 3 for a second-try move, then summarises', async () => {
    const user = userEvent.setup();
    await saveTrees([small()]);
    render(<OpeningsScreen />);
    await user.click(await screen.findByRole('button', { name: 'Drill' }));
    await screen.findByText('Your move');
    drop('e2', 'e4');
    await waitFor(async () => expect((await reviews()).map((r) => r.q)).toEqual([5]));
    await screen.findByText('Your move'); // after the opponent's 300 ms reply
    const before = fenOf();
    drop('d2', 'd3'); // wrong first try
    await screen.findByText('Not that move. Try once more.');
    await waitFor(() => expect(fenOf()).toBe(before));
    expect(opts().arrows).toEqual([]);
    drop('g1', 'f3');
    expect(await screen.findByText('Drill finished')).toBeInTheDocument();
    await waitFor(async () => expect((await reviews()).map((r) => r.q).sort()).toEqual([3, 5]));
    await waitFor(() => expect(screen.getByTestId('summary-graded')).toHaveTextContent('2'));
    expect(screen.getByTestId('summary-accuracy')).toHaveTextContent('50%');
    expect(screen.getByTestId('summary-next')).not.toHaveTextContent('None');
    expect((await srsDue()).length).toBe(2);
  });

  it('grades 1 after a second wrong move or "Show move", shows the arrow and grades the position once', async () => {
    const user = userEvent.setup();
    await saveTrees([small()]);
    render(<OpeningsScreen />);
    await user.click(await screen.findByRole('button', { name: 'Drill' }));
    await screen.findByText('Your move');
    const start = fenOf();
    drop('d2', 'd4');
    await screen.findByText('Not that move. Try once more.');
    await waitFor(() => expect(fenOf()).toBe(start));
    drop('c2', 'c4');
    await screen.findByText('Play the shown move');
    expect(arrows()).toEqual(['e2e4']);
    await waitFor(async () => expect((await reviews()).map((r) => r.q)).toEqual([1]));
    await waitFor(() => expect(fenOf()).toBe(start));
    drop('e2', 'e4'); // continues without a second grade
    await screen.findByText('Your move');
    await user.click(screen.getByRole('button', { name: 'Show move' }));
    expect(arrows()).toEqual(['g1f3']);
    drop('g1', 'f3');
    expect(await screen.findByText('Drill finished')).toBeInTheDocument();
    await waitFor(async () => expect((await reviews()).map((r) => r.q)).toEqual([1, 1]));
    await waitFor(() => expect(screen.getByTestId('summary-accuracy')).toHaveTextContent('0%'));
  });

  it('shows "Nothing due today", the next due date and a Learn action when the queue is empty', async () => {
    const user = userEvent.setup();
    const tree = small();
    await saveTrees([tree]);
    for (const p of ownerPositions(tree)) await db.table('chess_srs').put({ posKey: p.posKey, E: 250, n: 1, I: 1, due: '2999-01-02' });
    render(<OpeningsScreen />);
    await user.click(await screen.findByRole('button', { name: 'Drill' }));
    expect(await screen.findByText('Nothing due today')).toBeInTheDocument();
    expect(screen.getByTestId('next-due')).toHaveTextContent('2999-01-02');
    await user.click(screen.getByRole('button', { name: 'Learn' }));
    expect(await screen.findByText('Learn: Small')).toBeInTheDocument();
  });

  it('keeps the position in the queue when the review is not saved', async () => {
    const user = userEvent.setup();
    await saveTrees([small()]);
    failures.failNext('chess_reviews', () => new Error('disk full'));
    render(<OpeningsScreen />);
    await user.click(await screen.findByRole('button', { name: 'Drill' }));
    await screen.findByText('Your move');
    drop('e2', 'e4');
    await screen.findByText('Your move');
    expect(await reviews()).toEqual([]);
    expect(toast.getState()?.message).toBe('The review was not saved.');
  });
});

describe('OpeningsScreen edit mode', () => {
  const setup = async () => {
    const user = userEvent.setup();
    const trees = fixtureTrees();
    await saveTrees(trees);
    render(<OpeningsScreen />);
    await user.click(await screen.findByRole('button', { name: 'Edit Italian' }));
    await user.click((await screen.findAllByRole('button', { name: '2... Nc6' }))[0]!);
    return { user, trees };
  };
  const italianSans = async () => (await readRepertoire()).trees.find((t) => t.name === 'Italian')!.nodes.map((n) => n.san);

  it('asks before replacing an expected move, changes nothing on cancel and offers Undo after a replace', async () => {
    const { user } = await setup();
    const sans = await italianSans();
    drop('b1', 'c3'); // 3.Nc3 where the trees expect 3.Bc4 or 3.d4
    const dialog = await screen.findByRole('dialog', { name: 'Replace the expected move?' });
    expect(within(dialog).getByText('Bc4')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('Italian, Scotch');
    expect(within(dialog).getByTestId('removed-count')).toHaveTextContent('10 moves will be removed.');
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(await italianSans()).toEqual(sans);

    drop('b1', 'c3');
    await user.click(await screen.findByRole('button', { name: 'Replace' }));
    await waitFor(async () => expect(await italianSans()).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Nc3']));
    const scotch = (await readRepertoire()).trees.find((t) => t.name === 'Scotch')!;
    expect(scotch.nodes.map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Nc3']);
    expect(undoService.getState()).toMatchObject({ status: 'shown', label: 'Move replaced' });
    await act(async () => {
      await undoService.undo();
    });
    expect(await italianSans()).toEqual(sans);
  });

  it('adds a move without a prompt when the position has no expected move yet', async () => {
    const { user } = await setup();
    await user.click(screen.getAllByRole('button', { name: '3. Bc4' })[0]!);
    expect(new Chess(fenOf()!).turn()).toBe('b');
    drop('h7', 'h6');
    await waitFor(async () => expect(await italianSans()).toContain('h6'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('deletes a branch with an Undo toast', async () => {
    const { user } = await setup();
    await user.click(screen.getAllByRole('button', { name: '3. Bc4' })[0]!);
    await user.click(screen.getByRole('button', { name: 'Delete branch' }));
    await waitFor(async () => expect(await italianSans()).toEqual(['e4', 'e5', 'Nf3', 'Nc6']));
    expect(undoService.getState()).toMatchObject({ status: 'shown', label: 'Branch deleted' });
  });

  it('refuses an explanation over 300 characters and keeps the text', async () => {
    const { user } = await setup();
    await user.click(screen.getAllByRole('button', { name: '3. Bc4' })[0]!);
    const field = screen.getByLabelText('Explanation');
    await user.clear(field);
    await user.click(field);
    await user.paste('x'.repeat(301));
    await user.click(screen.getByRole('button', { name: 'Save explanation' }));
    expect(await screen.findByText(/at most 300 characters/)).toBeInTheDocument();
    expect(field).toHaveValue('x'.repeat(301));
    expect((await readRepertoire()).trees[0]!.nodes.find((n) => n.san === 'Bc4')!.explanation).toBe('Aim at f7.');
  });
});
