import { Chess } from 'chess.js';
import { CHESSCOM } from '../constants';
import type { ChessComRatings, Colour, GamePlayer, GameRecord, OwnerResult } from '../types';

const ARCHIVE_URL = /\/(\d{4})\/(0[1-9]|1[0-2])$/;

const asObject = (v: unknown): Record<string, unknown> | undefined =>
  typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
const nonEmpty = (v: unknown): string | undefined => (typeof v === 'string' && v !== '' ? v : undefined);

/** 'YYYY/MM' of every archive URL that ends in a four-digit year and a month 01 to 12, ascending, without repeats (R44.1). */
export function parseArchiveMonths(archives: unknown): string[] {
  if (!Array.isArray(archives)) return [];
  const months = new Set<string>();
  for (const entry of archives) {
    if (typeof entry !== 'string') continue;
    const m = ARCHIVE_URL.exec(entry);
    if (m) months.add(`${m[1]}/${m[2]}`);
  }
  return [...months].sort();
}

/** 'YYYY/MM' of an epoch time in UTC. */
export function utcMonthOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCFullYear()).padStart(4, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Listed months that are not complete, plus the current UTC month and the latest stored month when listed; ascending (R44.2). */
export function selectMonths(listed: string[], complete: ReadonlySet<string>, nowUtc: number, latestStoredMonth?: string): string[] {
  const current = utcMonthOf(nowUtc);
  return [...new Set(listed)]
    .filter((m) => !complete.has(m) || m === current || m === latestStoredMonth)
    .sort();
}

/** True when `receivedAt` is more than 24 h after the end of `month` ('YYYY/MM') in UTC (R44.3). */
export function isMonthCompleteAt(month: string, receivedAt: number): boolean {
  const m = /^(\d{4})\/(\d{2})$/.exec(month);
  if (!m) return false;
  const endOfMonth = Date.UTC(Number(m[1]), Number(m[2]), 1);
  return receivedAt > endOfMonth + CHESSCOM.MONTH_COMPLETE_GRACE_MS;
}

const LOSS = new Set(['checkmated', 'resigned', 'timeout', 'abandoned', 'lose', 'bughousepartnerlose']);
const DRAW = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);

/** The Owner's result for a Chess.com result code (R44.8). Unknown codes are 'unknown'. */
export function ownerResult(code: string): OwnerResult {
  if (code === 'win') return 'win';
  if (LOSS.has(code)) return 'loss';
  if (DRAW.has(code)) return 'draw';
  return 'unknown';
}

/** Opening name from the last path segment of an ECO URL, or 'Unknown opening' (R45.2). */
export function openingName(eco?: string): string {
  const fallback = 'Unknown opening';
  if (!eco) return fallback;
  const path = eco.split(/[?#]/)[0] ?? '';
  const last = path.split('/').pop();
  if (last === undefined || last === '') return fallback;
  let decoded = last;
  try {
    decoded = decodeURIComponent(last);
  } catch {
    /* keep the raw segment */
  }
  const name = decoded.replace(/-/g, ' ').trim();
  return name === '' ? fallback : name;
}

function canLoadPgn(pgn: string): boolean {
  try {
    new Chess().loadPgn(pgn);
    return true;
  } catch {
    return false;
  }
}

/** The ECOUrl header of a PGN, used when the game object has no `eco` field. */
function ecoFromPgn(pgn: string): string | undefined {
  return /^\[ECOUrl\s+"([^"]*)"\]/m.exec(pgn)?.[1] || undefined;
}

function playerOf(raw: unknown): (GamePlayer & { present: true }) | undefined {
  const o = asObject(raw);
  const username = nonEmpty(o?.username);
  if (!o || username === undefined) return undefined;
  const rating = typeof o.rating === 'number' && Number.isFinite(o.rating) ? o.rating : undefined;
  return { present: true, username, ...(rating !== undefined ? { rating } : {}), result: typeof o.result === 'string' ? o.result : '' };
}

const asciiLower = (s: string): string => s.replace(/[A-Z]/g, (c) => c.toLowerCase());

export type MappedGame = { kind: 'game'; record: GameRecord } | { kind: 'ignored' } | { kind: 'skipped'; reason: string };

/** Maps one Chess.com game object to a Game_Record (R44.4 to R44.7, R44.10). Pure. */
export function mapGame(raw: unknown, syncedFor: string): MappedGame {
  const g = asObject(raw);
  if (!g || g.rules !== 'chess') return { kind: 'ignored' };
  const uuid = nonEmpty(g.uuid);
  const url = nonEmpty(g.url);
  const key = uuid ?? url;
  if (key === undefined) return { kind: 'skipped', reason: 'no idempotency key' };
  if (typeof g.end_time !== 'number' || !Number.isFinite(g.end_time)) return { kind: 'skipped', reason: 'no end time' };
  const white = playerOf(g.white);
  const black = playerOf(g.black);
  if (!white || !black) return { kind: 'skipped', reason: 'missing player' };
  const me = asciiLower(syncedFor);
  let ownerColour: Colour;
  if (asciiLower(white.username) === me) ownerColour = 'w';
  else if (asciiLower(black.username) === me) ownerColour = 'b';
  else return { kind: 'skipped', reason: 'not the synced user' };
  const pgn = typeof g.pgn === 'string' ? g.pgn : '';
  const eco = nonEmpty(g.eco) ?? ecoFromPgn(pgn);
  const { present: _w, ...whiteP } = white;
  const { present: _b, ...blackP } = black;
  void _w;
  void _b;
  const owner = ownerColour === 'w' ? whiteP : blackP;
  const record: GameRecord = {
    id: key,
    idemKey: key,
    ...(uuid !== undefined ? { uuid } : {}),
    ...(url !== undefined ? { url } : {}),
    pgn,
    timeClass: typeof g.time_class === 'string' ? g.time_class : '',
    timeControl: typeof g.time_control === 'string' ? g.time_control : '',
    endTime: g.end_time,
    rated: g.rated === true,
    white: whiteP,
    black: blackP,
    ...(eco !== undefined ? { eco } : {}),
    syncedFor: asciiLower(syncedFor),
    ownerColour,
    ownerResult: ownerResult(owner.result),
    pgnUnreadable: pgn === '' || !canLoadPgn(pgn),
  };
  return { kind: 'game', record };
}

/** A rating value, or undefined when it is missing, not a finite number or outside 0 to 4000 (R43.3). */
export function mapRating(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 4000 ? Math.round(v) : undefined;
}

/** The five stored ratings from a `/stats` response (R43.2). */
export function mapStats(stats: unknown): Omit<ChessComRatings, 'id' | 'fetchedAt'> {
  const s = asObject(stats);
  const rating = (category: string, part: string, field: string): number | undefined =>
    mapRating(asObject(asObject(asObject(s?.[category])?.[part]))?.[field]);
  const out: Omit<ChessComRatings, 'id' | 'fetchedAt'> = {};
  const rapid = rating('chess_rapid', 'last', 'rating');
  const blitz = rating('chess_blitz', 'last', 'rating');
  const bullet = rating('chess_bullet', 'last', 'rating');
  const high = rating('tactics', 'highest', 'rating');
  const low = rating('tactics', 'lowest', 'rating');
  if (rapid !== undefined) out.rapid = rapid;
  if (blitz !== undefined) out.blitz = blitz;
  if (bullet !== undefined) out.bullet = bullet;
  if (high !== undefined) out.tacticsHigh = high;
  if (low !== undefined) out.tacticsLow = low;
  return out;
}
