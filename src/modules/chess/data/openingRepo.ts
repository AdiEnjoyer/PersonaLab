import type Dexie from 'dexie';
import { db as appDb } from '../../../core/db/db';
import { newId } from '../../../core/ids';
import { stripUndefined } from '../../../core/db/strip';
import { write } from '../../../core/db/write';
import type { LocalDate } from '../../../core/time/localDate';
import { sm2Review, SRS_INITIAL } from '../logic/sm2';
import { buildRepertoire, type StarterFile } from '../logic/starter';
import { StarterFileSchema } from '../schema';
import type { RepertoireTree, ReviewRecord, SrsRecord } from '../types';
import { CHESS_TABLES } from './backup';

export interface RepertoireData {
  trees: RepertoireTree[];
  srs: Map<string, SrsRecord>;
  reviews: ReviewRecord[];
}

const treeTable = (d: Dexie) => d.table<RepertoireTree, string>(CHESS_TABLES.trees);
const srsTable = (d: Dexie) => d.table<SrsRecord, string>(CHESS_TABLES.srs);
const reviewTable = (d: Dexie) => d.table<ReviewRecord, string>(CHESS_TABLES.reviews);
const ALL = [CHESS_TABLES.trees, CHESS_TABLES.srs, CHESS_TABLES.reviews];

/** Trees in creation order, SRS records by position key and all review records. Safe inside `liveQuery`. */
export async function readRepertoire(database: Dexie = appDb): Promise<RepertoireData> {
  const [trees, srs, reviews] = await Promise.all([treeTable(database).orderBy('createdAt').toArray(), srsTable(database).toArray(), reviewTable(database).toArray()]);
  return { trees, srs: new Map(srs.map((s) => [s.posKey, s])), reviews };
}

/** Number of positions whose first review was on `today` (R52.7). */
export async function countFirstReviews(today: LocalDate, database: Dexie = appDb): Promise<number> {
  const reviews = await reviewTable(database).where('date').equals(today).toArray();
  const keys = [...new Set(reviews.map((r) => r.posKey))];
  let first = 0;
  for (const key of keys) {
    const earlier = await reviewTable(database).where('posKey').equals(key).filter((r) => r.date < today).count();
    if (earlier === 0) first++;
  }
  return first;
}

/** Stores `next` as the whole set of trees in one transaction: trees that are absent are deleted. */
export async function saveTrees(next: readonly RepertoireTree[], database: Dexie = appDb): Promise<void> {
  await write(
    [CHESS_TABLES.trees],
    async () => {
      const keep = new Set(next.map((t) => t.id));
      const stored = await treeTable(database).toCollection().primaryKeys();
      await treeTable(database).bulkDelete(stored.filter((id) => !keep.has(id)));
      await treeTable(database).bulkPut(stripUndefined([...next]));
    },
    database,
  );
}

export interface RepertoireSnapshot {
  trees: RepertoireTree[];
  srs: SrsRecord[];
  reviews: ReviewRecord[];
}

export async function snapshot(database: Dexie = appDb): Promise<RepertoireSnapshot> {
  const data = await readRepertoire(database);
  return { trees: data.trees, srs: [...data.srs.values()], reviews: data.reviews };
}

/** Replaces trees, SRS states and review records by `s` in one transaction (Undo of a reset). */
export async function restoreSnapshot(s: RepertoireSnapshot, database: Dexie = appDb): Promise<void> {
  await write(
    ALL,
    async () => {
      await Promise.all([treeTable(database).clear(), srsTable(database).clear(), reviewTable(database).clear()]);
      await treeTable(database).bulkAdd(stripUndefined(s.trees));
      await srsTable(database).bulkAdd(stripUndefined(s.srs));
      await reviewTable(database).bulkAdd(stripUndefined(s.reviews));
    },
    database,
  );
}

/** URL of the bundled starter repertoire under the app base. */
export const starterUrl = (): string => `${import.meta.env.BASE_URL}data/repertoire-starter.json`;

export async function loadStarterFile(fetchFn: typeof fetch = fetch): Promise<StarterFile> {
  const response = await fetchFn(starterUrl());
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return StarterFileSchema.parse(await response.json());
}

/** Replaces the whole repertoire, SRS states and review history with the starter trees (R51.4). */
export async function resetToStarter(file: StarterFile, now: number = Date.now(), database: Dexie = appDb): Promise<void> {
  await restoreSnapshot({ trees: buildRepertoire(file, newId, now), srs: [], reviews: [] }, database);
}

const SEEDED_KEY = 'personallab.chess.openings.seeded';
const seededFlag = {
  get(): boolean {
    try {
      return globalThis.localStorage?.getItem(SEEDED_KEY) === '1';
    } catch {
      return false;
    }
  },
  set(): void {
    try {
      globalThis.localStorage?.setItem(SEEDED_KEY, '1');
    } catch {
      /* the seed then repeats only while the repertoire is empty */
    }
  },
};

/** For tests. */
export function clearSeededFlag(): void {
  try {
    globalThis.localStorage?.removeItem(SEEDED_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Seeds the starter repertoire once, on the first open while no tree is stored. An Owner who later deletes every
 * tree sees the empty state instead of a new seed (R51.11). Returns true when it seeded.
 */
export async function seedStarterOnce(load: () => Promise<StarterFile> = loadStarterFile, now: number = Date.now(), database: Dexie = appDb): Promise<boolean> {
  if (seededFlag.get()) return false;
  if ((await treeTable(database).count()) > 0) {
    seededFlag.set();
    return false;
  }
  const trees = buildRepertoire(await load(), newId, now);
  const seeded = await write(
    [CHESS_TABLES.trees],
    async () => {
      if ((await treeTable(database).count()) > 0) return false;
      await treeTable(database).bulkAdd(stripUndefined(trees));
      return true;
    },
    database,
  );
  seededFlag.set();
  return seeded;
}

export interface RecordedReview {
  srs: SrsRecord;
  /** False when a review with this id was stored already; nothing changed then. */
  created: boolean;
}

/**
 * Stores one drill grade (R52.6): the updated SRS state and a review record in one transaction. A repeated
 * `reviewId` stores nothing and changes nothing. An invalid quality or state throws and stores nothing.
 */
export async function recordReview(input: { reviewId: string; posKey: string; q: number; date: LocalDate }, database: Dexie = appDb): Promise<RecordedReview> {
  return write(
    [CHESS_TABLES.srs, CHESS_TABLES.reviews],
    async () => {
      const known = await reviewTable(database).get(input.reviewId);
      const stored = await srsTable(database).get(input.posKey);
      const current = stored ?? { posKey: input.posKey, ...SRS_INITIAL };
      if (known !== undefined) return { srs: current, created: false };
      const next = sm2Review({ E: current.E, n: current.n, I: current.I }, input.q, input.date);
      const record: SrsRecord = { posKey: input.posKey, E: next.E, n: next.n, I: next.I, ...(next.due !== undefined ? { due: next.due } : {}) };
      await srsTable(database).put(record);
      await reviewTable(database).add({ id: input.reviewId, posKey: input.posKey, date: input.date, q: input.q });
      return { srs: record, created: true };
    },
    database,
  );
}
