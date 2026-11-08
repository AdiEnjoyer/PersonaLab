import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../../core/db/db';
import { withFreshDb } from '../../../../test/helpers/db';
import type { ChessComClient, ChessComResult } from '../../net/chesscom';
import { CHESS_SETTING_KEYS } from '../../settings';
import { verifyUsername } from '../../data/ratings';
import ChessSettingsSection from '../ChessSettingsSection';

const holder = vi.hoisted(() => ({ client: undefined as unknown }));
vi.mock('../../data/client', () => ({
  getChessComClient: () => holder.client,
  resetChessComRoute: () => undefined,
}));

beforeEach(async () => {
  await withFreshDb(async () => undefined);
});

function clientReplying(...results: Array<ChessComResult<unknown>>): ChessComClient & { paths: string[] } {
  const paths: string[] = [];
  return {
    paths,
    resetRoute: () => undefined,
    get: (async (path: string) => {
      paths.push(path);
      return results.shift();
    }) as <T>() => Promise<ChessComResult<T>>,
  };
}

const stored = async (key: string) => (await db.table('core_settings').get(key))?.value;

describe('verifyUsername', () => {
  it('stores the name as typed after a 200, clears ratings when the name changes, keeps games', async () => {
    await db.table('chess_ratings').put({ id: 'chesscom', rapid: 1200, fetchedAt: 1 });
    await db.table('chess_games').put({ id: 'g', syncedFor: 'adichesslarper', endTime: 1 });
    const client = clientReplying({ ok: true, data: {}, receivedAt: 1 });
    const result = await verifyUsername('NewName', { client });
    expect(result).toEqual({ ok: true, username: 'NewName', changed: true });
    expect(client.paths).toEqual(['/pub/player/newname']);
    expect(await stored(CHESS_SETTING_KEYS.username)).toBe('NewName');
    expect(await db.table('chess_ratings').count()).toBe(0);
    expect(await db.table('chess_games').count()).toBe(1);
  });

  it('keeps ratings when only the letter case changes', async () => {
    await db.table('core_settings').put({ key: CHESS_SETTING_KEYS.username, value: 'adichesslarper' });
    await db.table('chess_ratings').put({ id: 'chesscom', rapid: 1200, fetchedAt: 1 });
    await verifyUsername('AdiChessLarper', { client: clientReplying({ ok: true, data: {}, receivedAt: 1 }) });
    expect(await stored(CHESS_SETTING_KEYS.username)).toBe('AdiChessLarper');
    expect(await db.table('chess_ratings').count()).toBe(1);
  });

  it('sends no request for a bad format', async () => {
    const client = clientReplying();
    expect(await verifyUsername('a b', { client })).toEqual({ ok: false, error: { kind: 'format' } });
    expect(client.paths).toEqual([]);
  });
});

describe('Chess settings section: username verify flow', () => {
  it('shows the failure with Retry, keeps the text and the old name, then stores after a successful retry', async () => {
    const client = clientReplying({ ok: false, error: { kind: 'timeout' } }, { ok: true, data: {}, receivedAt: 1 });
    const user = userEvent.setup();
    holder.client = client;
    try {
      render(<ChessSettingsSection />);
      const input = await screen.findByLabelText('Chess.com username');
      await user.clear(input);
      await user.type(input, 'SomeoneNew');
      await user.click(screen.getByRole('button', { name: 'Save username' }));
      expect(await screen.findByText('Chess.com did not respond. Try again later.')).toBeInTheDocument();
      expect(screen.getByLabelText('Chess.com username')).toHaveValue('SomeoneNew');
      expect(await stored(CHESS_SETTING_KEYS.username)).toBeUndefined();
      await user.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(async () => expect(await stored(CHESS_SETTING_KEYS.username)).toBe('SomeoneNew'));
    } finally {
      holder.client = undefined;
    }
  });

  it('rejects a bad username without a request and shows the allowed format', async () => {
    const user = userEvent.setup();
    render(<ChessSettingsSection />);
    const input = await screen.findByLabelText('Chess.com username');
    await user.clear(input);
    await user.type(input, 'ab');
    await user.click(screen.getByRole('button', { name: 'Save username' }));
    expect(await screen.findByText(/3 to 25 characters/, { selector: '[id$="-error"]' })).toBeInTheDocument();
    expect(input).toHaveValue('ab');
  });
});
