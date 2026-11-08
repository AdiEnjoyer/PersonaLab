import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { db } from '../../../../core/db/db';
import { withFreshDb } from '../../../../test/helpers/db';
import type { ChessComClient, ChessComResult } from '../../net/chesscom';
import type { GameRecord } from '../../types';
import { CHESS_TABLES } from '../backup';
import { runGameSync, storeMonth } from '../gameSync';

const USER = 'adichesslarper';
const RECEIVED = Date.UTC(2030, 0, 1);

type Raw = Record<string, unknown>;

/** A pool of distinct games; the same pool entry placed in two months has identical content. */
const poolArb = fc.array(
  fc.record({
    kind: fc.constantFrom('uuid', 'url-only', 'no-key', 'other-rules', 'bad-time', 'no-black', 'stranger'),
    result: fc.constantFrom('win', 'resigned', 'agreed', 'weird'),
    owner: fc.constantFrom<'white' | 'black'>('white', 'black'),
    pgn: fc.constantFrom('1. e4 e5 *', '', 'garbage ###'),
  }),
  { minLength: 1, maxLength: 30 },
);

function build(i: number, g: { kind: string; result: string; owner: 'white' | 'black'; pgn: string }): Raw {
  const me = { username: 'AdiChessLarper', rating: 1100, result: g.result };
  const them = { username: 'Opp' + i, rating: 1000, result: 'checkmated' };
  const raw: Raw = {
    uuid: 'u' + i,
    url: 'https://www.chess.com/game/' + i,
    rules: 'chess',
    end_time: 1_600_000_000 + i,
    time_class: 'rapid',
    time_control: '600',
    rated: true,
    pgn: g.pgn,
    white: g.owner === 'white' ? me : them,
    black: g.owner === 'white' ? them : me,
  };
  switch (g.kind) {
    case 'url-only':
      raw.uuid = '';
      break;
    case 'no-key':
      raw.uuid = '';
      raw.url = '';
      break;
    case 'other-rules':
      raw.rules = 'chess960';
      break;
    case 'bad-time':
      raw.end_time = null;
      break;
    case 'no-black':
      raw.black = { rating: 1 };
      break;
    case 'stranger':
      raw.white = them;
      raw.black = { username: 'Else' + i, result: 'win' };
      break;
  }
  return raw;
}

/** Idempotency_Key of a game that must be stored, from the requirements alone (R44.5 to R44.7). */
function expectedKey(raw: Raw): string | undefined {
  if (raw.rules !== 'chess') return undefined;
  const key = raw.uuid || raw.url;
  if (!key || typeof raw.end_time !== 'number') return undefined;
  const w = raw.white as Raw | undefined;
  const b = raw.black as Raw | undefined;
  if (!w?.username || !b?.username) return undefined;
  if (String(w.username).toLowerCase() !== USER && String(b.username).toLowerCase() !== USER) return undefined;
  return String(key);
}

const archivesArb = fc.tuple(poolArb, fc.nat(1e6)).chain(([pool, seed]) =>
  fc
    .uniqueArray(fc.tuple(fc.integer({ min: 2018, max: 2025 }), fc.integer({ min: 1, max: 12 })), {
      maxLength: 24,
      selector: ([y, m]) => `${y}/${m}`,
    })
    .chain((months) =>
      fc.tuple(
        fc.constant(months.map(([y, m]) => `${y}/${String(m).padStart(2, '0')}`).sort()),
        fc.array(fc.array(fc.nat(pool.length - 1), { maxLength: 50 }), { minLength: months.length, maxLength: months.length }),
        fc.constant(pool),
        fc.constant(seed),
      ),
    )
    .map(([months, picks, p]) => ({
      months,
      games: picks.map((ids) => ids.map((i) => build(i, p[i] as (typeof p)[number]))),
    })),
);

function mockClient(months: string[], games: Raw[][]): ChessComClient {
  return {
    resetRoute: () => undefined,
    get: (async (path: string) => {
      if (path.endsWith('/games/archives')) {
        return { ok: true, data: { archives: months.map((m) => `https://api.chess.com/pub/player/${USER}/games/${m}`) }, receivedAt: RECEIVED };
      }
      const idx = months.findIndex((m) => path.endsWith('/games/' + m));
      return { ok: true, data: { games: games[idx] ?? [] }, receivedAt: RECEIVED };
    }) as <T>() => Promise<ChessComResult<T>>,
  };
}

const stored = async (): Promise<GameRecord[]> => (await db.table<GameRecord>(CHESS_TABLES.games).toArray()).sort((a, b) => (a.id < b.id ? -1 : 1));

describe('Game_Sync mapping and store', () => {
  // Feature: personal-lab, Property 116: Game_Sync stores no duplicates (also checked: re-running and month order change nothing)
  it('stores exactly one record per distinct key, whatever the run count or month order', async () => {
    await fc.assert(
      fc.asyncProperty(archivesArb, fc.nat(1e6), async ({ months, games }, shuffleSeed) => {
        const expected = new Set(games.flat().map(expectedKey).filter((k): k is string => k !== undefined));

        const first = await withFreshDb(async () => {
          const client = mockClient(months, games);
          await runGameSync({ client, username: 'AdiChessLarper' });
          const once = await stored();
          await runGameSync({ client, username: 'AdiChessLarper' });
          expect(await stored()).toEqual(once);
          return once;
        });
        expect(first.length).toBe(expected.size);
        expect(new Set(first.map((g) => g.idemKey))).toEqual(expected);

        const order = months.map((_, i) => i).sort((a, b) => ((a * 7919 + shuffleSeed) % 101) - ((b * 7919 + shuffleSeed) % 101));
        const shuffled = await withFreshDb(async () => {
          for (const i of order) await storeMonth(db, USER, months[i] as string, games[i], RECEIVED);
          return stored();
        });
        expect(shuffled).toEqual(first);
      }),
      { numRuns: 100 },
    );
  }, 300_000);
});
