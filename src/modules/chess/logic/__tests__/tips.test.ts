import { describe, expect, it } from 'vitest';
import type { Tip, TipState } from '../../types';
import { EMPTY_TIP_STATE, filterTips, selectDailyTip } from '../tips';

const mk = (id: string, band: Tip['band']): Tip => ({ id, band, topics: ['tactics'], title: id, body: id, detectors: [] });

describe('selectDailyTip', () => {
  const tips = [mk('a', '800–999'), mk('b', '800–999'), mk('c', '1000–1199')];

  it('keeps the stored tip for the same date, rotates per band and restarts after a full cycle', () => {
    const d1 = selectDailyTip(EMPTY_TIP_STATE, tips, '800–999', '2025-01-01');
    expect(d1.tipId).toBe('a');
    expect(selectDailyTip(d1.state, tips, '1000–1199', '2025-01-01').tipId).toBe('a');
    const d2 = selectDailyTip(d1.state, tips, '800–999', '2025-01-02');
    expect(d2.tipId).toBe('b');
    const other = selectDailyTip(d2.state, tips, '1000–1199', '2025-01-03');
    expect(other.tipId).toBe('c');
    expect(other.state.shown['800–999']).toEqual(['a', 'b']);
    expect(selectDailyTip(other.state, tips, '800–999', '2025-01-04').tipId).toBe('a');
  });

  it('ignores removed tip ids and reports an empty band', () => {
    const state: TipState = { id: 'tips', shown: { '800–999': ['gone', 'a'] } };
    expect(selectDailyTip(state, tips, '800–999', '2025-02-01').tipId).toBe('b');
    expect(selectDailyTip(EMPTY_TIP_STATE, tips, 'below 800', '2025-02-01').tipId).toBeUndefined();
  });

  it('filters by band and topic', () => {
    expect(filterTips(tips, '800–999', undefined).map((t) => t.id)).toEqual(['a', 'b']);
    expect(filterTips(tips, undefined, 'endgame')).toEqual([]);
  });
});
