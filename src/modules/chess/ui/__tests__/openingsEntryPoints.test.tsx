import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../../core/db/db';
import { withFreshDb } from '../../../../test/helpers/db';
import { saveTrees } from '../../data/openingRepo';
import { counterIds } from '../../logic/__tests__/repertoireFixtures';
import { ownerPositions } from '../../logic/repertoire';
import { buildTree } from '../../logic/starter';
import ChessDashboardCard from '../ChessDashboardCard';
import { PuzzleRatingRow } from '../ChessHome';

beforeEach(async () => {
  await withFreshDb(async () => undefined);
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, json: async () => [] })));
});

describe('Chess entry points for openings and puzzles', () => {
  it('shows the due positions on the dashboard card and opens drill mode', async () => {
    const user = userEvent.setup();
    const tree = buildTree({ name: 'T', colour: 'w', lines: [['e4', 'e5', 'Nf3']] }, counterIds(), 1);
    await saveTrees([tree]);
    for (const p of ownerPositions(tree)) await db.table('chess_srs').put({ posKey: p.posKey, E: 250, n: 1, I: 1, due: '2000-01-01' });
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<ChessDashboardCard />} />
          <Route path="/chess/drill" element={<p>Drill route</p>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByTestId('due-positions')).toHaveTextContent('2');
    await user.click(screen.getByRole('button', { name: 'Drill' }));
    expect(await screen.findByText('Drill route')).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it('shows the Puzzle_Rating with a provisional label, or a dash when none is stored', async () => {
    const view = render(
      <dl>
        <PuzzleRatingRow />
      </dl>,
    );
    expect(await screen.findByTestId('home-puzzle-rating')).toHaveTextContent('—');
    await db.table('chess_puzzleRating').put({ id: 'puzzle', rating: 1187.4, rd: 200, vol: 0.06 });
    expect(await screen.findByText('1187 (provisional)')).toBeInTheDocument();
    await db.table('chess_puzzleRating').put({ id: 'puzzle', rating: 1187.4, rd: 90, vol: 0.06 });
    expect(await screen.findByText('1187')).toBeInTheDocument();
    view.unmount();
    vi.unstubAllGlobals();
  });
});
