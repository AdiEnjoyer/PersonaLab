import { useSyncExternalStore } from 'react';
import { readSetting } from '../../../core/settings/repo';
import { runGameSync, type GameSyncResult } from '../data/gameSync';
import { chessComMessage } from '../net/messages';
import { CHESS_SETTING_KEYS } from '../settings';

export interface SyncView {
  running: boolean;
  /** Months processed so far and months selected (R44.16). */
  done: number;
  total: number;
  /** Result of the last run in this App session. */
  result: GameSyncResult | null;
  username: string;
}

const IDLE: SyncView = { running: false, done: 0, total: 0, result: null, username: '' };
let view: SyncView = IDLE;
const listeners = new Set<() => void>();

function set(next: SyncView): void {
  view = next;
  for (const l of listeners) l();
}

/**
 * Starts a Game_Sync unless one is running (R44.16). The run stops between months when the App goes to the
 * background (R44.12); the result stays available for the screens.
 */
export async function startSync(run: typeof runGameSync = runGameSync): Promise<void> {
  if (view.running) return;
  set({ ...view, running: true, done: 0, total: 0, result: null });
  const result = await run({
    shouldAbort: () => document.visibilityState === 'hidden',
    onProgress: (done, total) => set({ ...view, running: true, done, total }),
  }).catch((): GameSyncResult => ({ ok: false, error: { kind: 'write' }, done: view.done, total: view.total, created: 0, skipped: 0 }));
  const username = await readSetting<string>(CHESS_SETTING_KEYS.username).catch(() => '');
  set({ running: false, done: result.ok ? 0 : result.done, total: result.ok ? 0 : result.total, result, username });
}

export const useSyncView = (): SyncView =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => view,
  );

/** For tests. */
export function resetSyncStore(): void {
  view = IDLE;
  for (const l of listeners) l();
}

/** One line for the last result of a sync, or null before any run. `notFound` marks the "user not found" case. */
export function syncMessage(v: SyncView): { text: string; error: boolean; notFound: boolean } | null {
  const r = v.result;
  if (r === null) return null;
  if (r.ok) {
    if (r.empty) return { text: `No games found for ${v.username} on Chess.com`, error: false, notFound: false };
    const skipped = r.skipped > 0 ? `, ${r.skipped} skipped` : '';
    return { text: `Sync finished: ${r.created} new ${r.created === 1 ? 'game' : 'games'}${skipped}.`, error: false, notFound: false };
  }
  const e = r.error;
  if (e.kind === 'busy') return null;
  if (e.kind === 'not-found') return { text: 'Chess.com user not found', error: true, notFound: true };
  const base =
    e.kind === 'write' ? 'Not saved: the database write failed.' : e.kind === 'aborted' ? 'Sync paused because the App went to the background.' : chessComMessage(e);
  const progress = r.total > 0 ? ` Stopped at month ${r.done + 1} of ${r.total}; months already saved are kept.` : '';
  return { text: base + progress, error: e.kind !== 'aborted', notFound: false };
}
