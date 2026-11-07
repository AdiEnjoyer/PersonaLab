import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withFreshDb } from '../../../../test/helpers/db';
import { createCustomExercise, archiveExercise } from '../../data/exercises';
import { resetLibraryCache } from '../../data/library';
import { createRoutine, updateRoutine } from '../../data/routines';
import GymSettingsSection from '../GymSettingsSection';
import LibraryScreen, { MISSING_LIBRARY_MESSAGE } from '../LibraryScreen';
import RoutineEditorScreen from '../RoutineEditorScreen';
import { resetLibraryUiState } from '../libraryUiState';
import { Route, Routes } from 'react-router';

const values = (name: string) => ({ name, primaryMuscles: ['chest' as const], secondaryMuscles: [], equipment: 'cable' as const });

beforeEach(async () => {
  resetLibraryCache();
  resetLibraryUiState();
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('', { status: 404 }))));
  await withFreshDb(async () => undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('Exercise_Library screen', () => {
  it('tells the Owner to run the data script when the file is missing and nothing is stored', async () => {
    render(
      <MemoryRouter>
        <LibraryScreen />
      </MemoryRouter>,
    );
    expect(await screen.findByText(MISSING_LIBRARY_MESSAGE)).toBeInTheDocument();
    expect(screen.getByText(/npm run data:exercises/, { selector: 'div' })).toBeInTheDocument();
  });

  it('lists custom exercises, filters them and clears the filters', async () => {
    await createCustomExercise(values('Cable fly'), 'a');
    await createCustomExercise(values('Cable row'), 'b');
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LibraryScreen />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Cable fly')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search exercises'), 'row');
    await waitFor(() => expect(screen.queryByText('Cable fly')).not.toBeInTheDocument());
    expect(screen.getByText('Cable row')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search exercises'));
    await user.type(screen.getByLabelText('Search exercises'), 'zzz');
    expect(await screen.findByText('No exercises match')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('Cable fly')).toBeInTheDocument();
    expect(screen.getByLabelText('Search exercises')).toHaveValue('');
  });

  it('restores the search text when the screen is opened again', async () => {
    await createCustomExercise(values('Cable fly'), 'a');
    const user = userEvent.setup();
    const first = render(
      <MemoryRouter>
        <LibraryScreen />
      </MemoryRouter>,
    );
    await user.type(await screen.findByLabelText('Search exercises'), 'fly');
    first.unmount();
    render(
      <MemoryRouter>
        <LibraryScreen />
      </MemoryRouter>,
    );
    expect(await screen.findByLabelText('Search exercises')).toHaveValue('fly');
  });
});

describe('Gym settings', () => {
  it('lists archived exercises and restores them', async () => {
    const ex = await createCustomExercise(values('Old move'), 'a');
    await archiveExercise({ id: ex.id, source: 'custom' });
    const user = userEvent.setup();
    render(<GymSettingsSection />);
    expect(await screen.findByText('Old move')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restore Old move' }));
    expect(await screen.findByText('No archived exercises.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download all exercise photos' })).toBeInTheDocument();
  });
});

describe('Routine editor', () => {
  it('shows the rep range rule and keeps the stored value on an invalid change', async () => {
    const ex = await createCustomExercise(values('Cable fly'), 'a');
    const r = await createRoutine('Push', 'k');
    await updateRoutine(r.id, (x) => ({ ...x, items: [{ itemId: 'i1', exerciseId: ex.id, targetSets: 3, repMin: 8, repMax: 12 }] }));
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={[`/gym/routines/${r.id}`]}>
        <Routes>
          <Route path="/gym/routines/:routineId" element={<RoutineEditorScreen />} />
        </Routes>
      </MemoryRouter>,
    );
    const min = await screen.findByLabelText('Min reps');
    await user.clear(min);
    await user.type(min, '20');
    expect(await screen.findByText('Minimum reps must not exceed maximum reps')).toBeInTheDocument();
    await user.tab();
    expect(screen.getByLabelText('Min reps')).toHaveValue('8');
    expect(screen.getByRole('button', { name: /Move Cable fly up/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Move Cable fly down/ })).toBeDisabled();
  });
});
