import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { db } from '../../db/db';
import { CORE_TABLES } from '../../db/tables';
import { withFreshDb } from '../../../test/helpers/db';
import { commitSetting } from '../repo';
import { useSetting } from '../useSetting';

beforeEach(async () => {
  await withFreshDb(async () => undefined);
});

describe('useSetting', () => {
  it('returns the default while the key is unset', async () => {
    const { result } = renderHook(() => useSetting<number>('gym.defaultRestSec'));
    expect(result.current[0]).toBe(90);
    await waitFor(() => expect(result.current[0]).toBe(90));
  });

  it('shows a committed value without a reload', async () => {
    const { result } = renderHook(() => useSetting<number>('gym.defaultRestSec'));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current[1](45);
    });
    expect(outcome).toEqual({ ok: true });
    await waitFor(() => expect(result.current[0]).toBe(45));
  });

  it('keeps the stored value and returns the accepted values on an invalid commit', async () => {
    await commitSetting('gym.defaultRestSec', 120);
    const { result } = renderHook(() => useSetting<number>('gym.defaultRestSec'));
    await waitFor(() => expect(result.current[0]).toBe(120));
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current[1](50);
    });
    expect(outcome).toEqual({ ok: false, error: 'Accepted values: 30 to 600 seconds, in steps of 15 seconds.' });
    expect(result.current[0]).toBe(120);
    await expect(db.table(CORE_TABLES.settings).get('gym.defaultRestSec')).resolves.toEqual({ key: 'gym.defaultRestSec', value: 120 });
  });

  it('follows changes made outside the hook', async () => {
    const { result } = renderHook(() => useSetting<string>('chess.ratingSource'));
    await waitFor(() => expect(result.current[0]).toBe('rapid'));
    await act(async () => {
      await commitSetting('chess.ratingSource', 'manual');
    });
    await waitFor(() => expect(result.current[0]).toBe('manual'));
  });

  it('throws for an undeclared key', () => {
    expect(() => renderHook(() => useSetting('gym.nope'))).toThrow(/Unknown setting/);
  });
});
