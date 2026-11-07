import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../../core/db/db';
import { withFreshDb } from '../../../../test/helpers/db';
import { changeActive, resetActiveStore } from '../../data/activeStore';
import { resetLibraryCache } from '../../data/library';
import { startSession } from '../../data/sessions';
import { addExercises } from '../../logic/session';
import type { Session } from '../../types';
import SessionLogger from '../SessionLogger';
const previous: Session = {
  id: 'old',
  status: 'finished',
  startedAt: 1000,
  finishedAt: 2000,
  lastChangeAt: 2000,
  entries: [{ entryId: 'oe', exerciseId: 'bench', sets: [{ id: 's0', idemKey: 's0', weight: 50, reps: 5, weightSource: 'owner', repsSource: 'owner', completed: true, completedAt: 1500 }] }],
};
beforeEach(async () => {
  resetLibraryCache();
  resetActiveStore();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 404 }))));
  await withFreshDb(async () => undefined);
  await db.table('gym_sessions').add(previous);
});
afterEach(() => vi.unstubAllGlobals());
describe('Session_Logger', () => {
  it('pre-fills from the last session, validates completion and shows a PR in the same render', async () => {
    await startSession({ type: 'empty' });
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <SessionLogger />
      </MemoryRouter>,
    );
    await screen.findByText('No exercises yet');
    changeActive((s) => addExercises(s, ['bench'], [previous], { now: Date.now(), newId: () => crypto.randomUUID() }));
    const weight = await screen.findByLabelText('Set 1 weight in kg');
    expect(weight).toHaveValue('50');
    expect(weight).toHaveClass('text-muted');
    expect(screen.getByText('Previous: 50 kg \u00d7 5')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Set 1 reps'));
    await user.click(screen.getByRole('button', { name: 'Complete set 1' }));
    expect(screen.getByLabelText('Set 1 reps')).toHaveAttribute('aria-invalid', 'true');
    await user.type(screen.getByLabelText('Set 1 reps'), '5');
    await user.clear(weight);
    await user.type(weight, '60,5');
    expect(weight).not.toHaveClass('text-muted');
    await user.click(screen.getByRole('button', { name: 'Complete set 1' }));
    await waitFor(() => expect(screen.getByText('Weight PR')).toBeInTheDocument());
    expect(screen.getByRole('timer')).toBeInTheDocument();
  });
});
