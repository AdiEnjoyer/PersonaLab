import { useEffect, useState } from 'react';
import { db } from '../../../core/db/db';
import { write } from '../../../core/db/write';
import { readSetting } from '../../../core/settings/repo';
import type { LocalDate } from '../../../core/time/localDate';
import { chessRating, ratingBand } from '../logic/ratingBand';
import { EMPTY_TIP_STATE, selectDailyTip } from '../logic/tips';
import { TipsFileSchema } from '../schema';
import { CHESS_SETTING_KEYS, type RatingSource } from '../settings';
import type { ChessComRatings, GameRecord, RatingBand, Tip, TipState } from '../types';
import { CHESS_TABLES } from './backup';

/** The Owner's Chess_Rating (R40.9) and its band, read from settings and the stored ratings. */
export async function readChessRating(): Promise<{ rating: number; band: RatingBand }> {
  const [source, manual, ratings] = await Promise.all([
    readSetting<RatingSource>(CHESS_SETTING_KEYS.ratingSource),
    readSetting<number>(CHESS_SETTING_KEYS.manualRating),
    db.table<ChessComRatings, string>(CHESS_TABLES.ratings).get('chesscom'),
  ]);
  const rating = chessRating({ source, rapid: ratings?.rapid, manual });
  return { rating, band: ratingBand(rating) };
}

export const readAllGames = (): Promise<GameRecord[]> => db.table<GameRecord, string>(CHESS_TABLES.games).toArray();

export const readGame = (id: string): Promise<GameRecord | undefined> => db.table<GameRecord, string>(CHESS_TABLES.games).get(id);

/** Analyser version of each stored Game_Report, by game id. */
export async function readReportVersions(): Promise<Map<string, number>> {
  const versions = new Map<string, number>();
  await db.table<{ gameId: string; version: number }, string>(CHESS_TABLES.reports).each((r) => {
    versions.set(r.gameId, r.version);
  });
  return versions;
}

/** URL of the bundled `data/tips.json` under the app base. */
export const tipsUrl = (): string => `${import.meta.env.BASE_URL}data/tips.json`;

let cachedTips: Promise<Tip[]> | null = null;

/** Loads the Tips_Library once per App run. A failed load is not cached, so the next call tries again. */
export function loadTips(fetchFn: typeof fetch = fetch): Promise<Tip[]> {
  if (cachedTips !== null) return cachedTips;
  const attempt = (async (): Promise<Tip[]> => {
    const response = await fetchFn(tipsUrl());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return TipsFileSchema.parse(await response.json());
  })();
  cachedTips = attempt;
  attempt.catch(() => {
    if (cachedTips === attempt) cachedTips = null;
  });
  return attempt;
}

/** For tests. */
export function resetTipsCache(): void {
  cachedTips = null;
}

export type DailyTipView =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'none'; band: RatingBand }
  | { status: 'ready'; tip: Tip; band: RatingBand };

/**
 * Today's tip (R41.4, R41.5, R41.9): the stored tip of the Local_Date, else the next tip of the Chess_Rating's
 * band. When storing the selection fails the tip is still shown and the selection repeats the next time.
 */
export async function ensureDailyTip(today: LocalDate): Promise<DailyTipView> {
  const [tips, { band }] = await Promise.all([loadTips(), readChessRating()]);
  const table = db.table<TipState, string>(CHESS_TABLES.tipState);
  const state = (await table.get('tips')) ?? EMPTY_TIP_STATE;
  const selected = selectDailyTip(state, tips, band, today);
  const tip = tips.find((t) => t.id === selected.tipId);
  if (tip === undefined) return { status: 'none', band };
  if (selected.state !== state) {
    try {
      await write([CHESS_TABLES.tipState], () => table.put(selected.state));
    } catch {
      /* shown anyway; the selection repeats next time */
    }
  }
  return { status: 'ready', tip, band };
}

export function useDailyTip(today: LocalDate): { view: DailyTipView; retry(): void } {
  const [view, setView] = useState<DailyTipView>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    ensureDailyTip(today).then(
      (v) => live && setView(v),
      () => live && setView({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [today, attempt]);
  return { view, retry: () => setAttempt((n) => n + 1) };
}
