import { describe, expect, it } from 'vitest';
import { CORE_TABLES, META_KEYS } from '../../db/tables';
import { withFreshDb } from '../../../test/helpers/db';
import { DAY_MS, shouldShowBackupReminder, snoozeReminder } from '../reminder';

const NOW = Date.UTC(2025, 2, 7, 9, 5);
const HOUR = 3_600_000;

describe('shouldShowBackupReminder', () => {
  it('never shows the banner when the reminder is off', () => {
    expect(shouldShowBackupReminder({ intervalDays: 'off', now: NOW, firstDataAt: NOW - 100 * DAY_MS })).toBe(false);
    expect(
      shouldShowBackupReminder({ intervalDays: 'off', now: NOW, lastBackupAt: NOW - 100 * DAY_MS, lastDataChangeAt: NOW - 1 }),
    ).toBe(false);
  });

  it('hides the banner while a snooze is running and checks again once it ends', () => {
    const due = { intervalDays: 7 as const, now: NOW, lastBackupAt: NOW - 8 * DAY_MS, lastDataChangeAt: NOW - HOUR };
    expect(shouldShowBackupReminder({ ...due, snoozeUntil: NOW + 1 })).toBe(false);
    expect(shouldShowBackupReminder({ ...due, snoozeUntil: NOW })).toBe(true);
    expect(shouldShowBackupReminder(due)).toBe(true);
  });

  it('without a backup, shows the banner only once the first record is more than 72 h old', () => {
    expect(shouldShowBackupReminder({ intervalDays: 7, now: NOW, firstDataAt: NOW - 72 * HOUR })).toBe(false);
    expect(shouldShowBackupReminder({ intervalDays: 7, now: NOW, firstDataAt: NOW - 72 * HOUR - 1 })).toBe(true);
    expect(shouldShowBackupReminder({ intervalDays: 7, now: NOW })).toBe(false);
  });

  it('with a backup, needs more than the interval since it and a data change after it', () => {
    const base = { intervalDays: 3 as const, now: NOW, lastBackupAt: NOW - 72 * HOUR, lastDataChangeAt: NOW - HOUR };
    expect(shouldShowBackupReminder(base)).toBe(false);
    expect(shouldShowBackupReminder({ ...base, lastBackupAt: NOW - 72 * HOUR - 1 })).toBe(true);
    expect(shouldShowBackupReminder({ ...base, lastBackupAt: NOW - 30 * DAY_MS, lastDataChangeAt: NOW - 30 * DAY_MS })).toBe(false);
    expect(shouldShowBackupReminder({ ...base, lastBackupAt: NOW - 30 * DAY_MS, lastDataChangeAt: undefined })).toBe(false);
  });
});

describe('snoozeReminder', () => {
  it('stores the snooze end 24 hours after the tap in core_meta', async () => {
    await withFreshDb(async (database) => {
      expect(await snoozeReminder(NOW, database)).toBe(NOW + 86_400_000);
      expect(await database.table(CORE_TABLES.meta).get(META_KEYS.reminderSnoozeUntil)).toEqual({
        key: META_KEYS.reminderSnoozeUntil,
        value: NOW + 86_400_000,
      });
    });
  });
});
