import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadFile } from '../../core/backup/share';
import type { OpenResult } from '../../core/db/db';
import { saveProfile } from '../../core/profile/repo';
import { withFreshDb } from '../../test/helpers/db';
import { StartupGate } from '../StartupGate';

vi.mock('../../core/backup/share', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../core/backup/share')>()),
  downloadFile: vi.fn(),
}));

const Child = () => <p>App content</p>;
const noop = () => null;
const route = (path: string) => ({ path, Component: noop, title: path });

beforeEach(async () => {
  await withFreshDb(async () => undefined);
});

describe('StartupGate', () => {
  it('shows the registry error screen and never opens the database', () => {
    const open = vi.fn<() => Promise<OpenResult>>();
    render(
      <StartupGate open={open} modules={[{ id: 'gym', routes: [route('/a')] }, { id: 'gym', routes: [route('/b')] }]}>
        <Child />
      </StartupGate>,
    );
    expect(screen.getByText('Module registry error')).toBeInTheDocument();
    expect(screen.getByText(/Duplicate module id "gym"/)).toBeInTheDocument();
    expect(open).not.toHaveBeenCalled();
    expect(screen.queryByText('App content')).toBeNull();
  });

  it('asks for a reload when the stored data is newer', async () => {
    render(
      <StartupGate open={async () => ({ ok: false, reason: 'newer-version', storedVersion: 9 })} modules={[]}>
        <Child />
      </StartupGate>,
    );
    expect(await screen.findByText(/saved by a newer version/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
  });

  it('says no data was lost after a failed migration and offers the emergency export', async () => {
    const file = new File(['{}'], 'emergency.json');
    const exporter = vi.fn(async () => file);
    render(
      <StartupGate open={async () => ({ ok: false, reason: 'migration-failed', storedVersion: 1, error: 'x' })} exporter={exporter} modules={[]}>
        <Child />
      </StartupGate>,
    );
    expect(await screen.findByText(/No data was lost/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Export my data' }));
    await waitFor(() => expect(downloadFile).toHaveBeenCalledWith(file));
  });

  it('offers Retry when storage is unavailable and opens again on tap', async () => {
    const open = vi
      .fn<() => Promise<OpenResult>>()
      .mockResolvedValueOnce({ ok: false, reason: 'unavailable', error: 'private mode' })
      .mockResolvedValue({ ok: true });
    render(
      <StartupGate open={open} modules={[]}>
        <Child />
      </StartupGate>,
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('Welcome to PersonalLab')).toBeInTheDocument();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('shows the first-run profile without a Profile and the app with one', async () => {
    const { unmount } = render(
      <StartupGate open={async () => ({ ok: true })} modules={[]}>
        <Child />
      </StartupGate>,
    );
    expect(await screen.findByText('Welcome to PersonalLab')).toBeInTheDocument();
    unmount();
    const saved = await saveProfile({ age: '30', sex: 'male', heightCm: '180', weightKg: '80', weeklyTrainingHours: '4', goal: 'maintain' });
    expect(saved.ok).toBe(true);
    render(
      <StartupGate open={async () => ({ ok: true })} modules={[]}>
        <Child />
      </StartupGate>,
    );
    expect(await screen.findByText('App content')).toBeInTheDocument();
  });
});
