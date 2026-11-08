import type { LocalDate } from '../../../core/time/localDate';
import { SM2 } from '../constants';
import type { Colour, MoveNode, RepertoireTree } from '../types';
import { expectedMoves, indexTree, ownerPositions, positionKey, type TreeIndex } from './repertoire';
import type { SrsState } from './sm2';

export type Tries = 'first' | 'second' | 'failed';

/** SM-2 quality of a drilled position (R52.4). */
export const gradeFor = (tries: Tries): 5 | 3 | 1 => (tries === 'first' ? 5 : tries === 'second' ? 3 : 1);

/** Expected-move maps of both colours. */
export function expectedByColour(trees: readonly RepertoireTree[]): Record<Colour, Map<string, string>> {
  return { w: expectedMoves(trees, 'w'), b: expectedMoves(trees, 'b') };
}

/**
 * The drill queue of `today` as position keys (R52.7): positions due on or before today by due date, tree creation
 * order and depth, then never-reviewed positions in tree and depth order, at most `NEW_PER_DAY - firstReviewsToday`.
 */
export function buildDrillQueue(
  trees: readonly RepertoireTree[],
  srs: ReadonlyMap<string, SrsState>,
  firstReviewsToday: number,
  today: LocalDate,
): string[] {
  const expected = expectedByColour(trees);
  const seen = new Set<string>();
  const due: Array<{ posKey: string; due: LocalDate; order: number; depth: number }> = [];
  const fresh: Array<{ posKey: string; order: number; depth: number }> = [];
  [...trees]
    .sort((a, b) => a.createdAt - b.createdAt)
    .forEach((tree, order) => {
      for (const p of ownerPositions(tree, expected[tree.colour])) {
        if (seen.has(p.posKey)) continue;
        seen.add(p.posKey);
        const state = srs.get(p.posKey);
        if (state === undefined || state.due === undefined) fresh.push({ posKey: p.posKey, order, depth: p.depth });
        else if (state.due <= today) due.push({ posKey: p.posKey, due: state.due, order, depth: p.depth });
      }
    });
  due.sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : a.order - b.order || a.depth - b.depth));
  fresh.sort((a, b) => a.order - b.order || a.depth - b.depth);
  const room = Math.max(0, SM2.NEW_PER_DAY - firstReviewsToday);
  return [...due.map((d) => d.posKey), ...fresh.slice(0, room).map((f) => f.posKey)];
}

/** Uniform choice among the replies that still reach a queued position, else among all replies (R52.3). */
export function chooseReply<T extends MoveNode>(replies: readonly T[], reachesQueued: (n: T) => boolean, rng: () => number): T {
  if (replies.length === 0) throw new RangeError('No replies to choose from');
  const reaching = replies.filter(reachesQueued);
  const pool = reaching.length > 0 ? reaching : replies;
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))] as T;
}

export interface DrillSummary {
  graded: number;
  /** Whole percent of first-try grades, undefined when nothing was graded. */
  accuracy?: number;
  /** Earliest due date among all positions. */
  nextDue?: LocalDate;
}

export function drillSummary(grades: readonly number[], srs: Iterable<SrsState>): DrillSummary {
  let nextDue: LocalDate | undefined;
  for (const s of srs) if (s.due !== undefined && (nextDue === undefined || s.due < nextDue)) nextDue = s.due;
  const accuracy = grades.length === 0 ? undefined : Math.round((100 * grades.filter((q) => q === 5).length) / grades.length);
  return { graded: grades.length, ...(accuracy !== undefined ? { accuracy } : {}), ...(nextDue !== undefined ? { nextDue } : {}) };
}

/** The first tree that has a drillable position still in the queue, with the remaining keys that tree holds. */
export function pickDrillTree(trees: readonly RepertoireTree[], remaining: readonly string[]): RepertoireTree | null {
  const expected = expectedByColour(trees);
  const sorted = [...trees].sort((a, b) => a.createdAt - b.createdAt);
  for (const key of remaining) {
    const tree = sorted.find((t) => ownerPositions(t, expected[t.colour]).some((p) => p.posKey === key));
    if (tree !== undefined) return tree;
  }
  return null;
}

/** What the drill does at a position of a tree. */
export interface DrillContext {
  tree: RepertoireTree;
  idx: TreeIndex;
  /** Expected moves of the tree's colour. */
  expected: ReadonlyMap<string, string>;
  /** Queue keys not yet answered in this session. */
  remaining: ReadonlySet<string>;
  /** Keys graded in this session. */
  graded: ReadonlySet<string>;
  rng: () => number;
}

export type DrillStep =
  | { kind: 'leaf' }
  | { kind: 'opponent'; node: MoveNode }
  | { kind: 'owner'; node: MoveNode; posKey: string; gradable: boolean }
  /** A shared opening choice, another tree's expected move: played for the Owner, not graded. */
  | { kind: 'auto'; node: MoveNode };

export function drillContext(trees: readonly RepertoireTree[], tree: RepertoireTree, remaining: ReadonlySet<string>, graded: ReadonlySet<string>, rng: () => number): DrillContext {
  return { tree, idx: indexTree(tree), expected: expectedMoves(trees, tree.colour), remaining, graded, rng };
}

/** Whether the subtree below each node holds a queued, drillable position. */
function reachMap(ctx: DrillContext): Map<string | null, boolean> {
  const reach = new Map<string | null, boolean>();
  const visit = (at: string | null): boolean => {
    const fen = ctx.idx.fen.get(at) as string;
    const kids = ctx.idx.children.get(at) ?? [];
    let here = false;
    if (kids.length > 0 && fen.split(' ')[1] === ctx.tree.colour) {
      const key = positionKey(fen, ctx.tree.colour);
      here = ctx.remaining.has(key) && ctx.expected.get(key) === kids[0]?.uci;
    }
    let below = false;
    for (const k of kids) if (visit(k.id)) below = true;
    const result = here || below;
    reach.set(at, result);
    return result;
  };
  visit(null);
  return reach;
}

/** The next step of a drilled line from the position reached by `at` (`null` is the start position) (R52.2, R52.3). */
export function stepAt(ctx: DrillContext, at: string | null, reach: Map<string | null, boolean> = reachMap(ctx)): DrillStep {
  const kids = ctx.idx.children.get(at) ?? [];
  const first = kids[0];
  if (first === undefined) return { kind: 'leaf' };
  const fen = ctx.idx.fen.get(at) as string;
  if (fen.split(' ')[1] !== ctx.tree.colour) {
    return { kind: 'opponent', node: chooseReply(kids, (n) => reach.get(n.id) === true, ctx.rng) };
  }
  const posKey = positionKey(fen, ctx.tree.colour);
  if (ctx.expected.get(posKey) !== first.uci) return { kind: 'auto', node: first };
  return { kind: 'owner', node: first, posKey, gradable: !ctx.graded.has(posKey) };
}

export { reachMap };

/** Number of drillable positions whose due date is on or before 	oday (R61.1). */
export function dueCount(trees: readonly RepertoireTree[], srs: ReadonlyMap<string, { due?: LocalDate }>, today: LocalDate): number {
  const expected = expectedByColour(trees);
  const seen = new Set<string>();
  for (const tree of trees) {
    for (const p of ownerPositions(tree, expected[tree.colour])) {
      const due = srs.get(p.posKey)?.due;
      if (due !== undefined && due <= today) seen.add(p.posKey);
    }
  }
  return seen.size;
}

/** Drillable positions of one tree whose due date is on or before 	oday. */
export function treeDueCount(tree: RepertoireTree, trees: readonly RepertoireTree[], srs: ReadonlyMap<string, { due?: LocalDate }>, today: LocalDate): number {
  return ownerPositions(tree, expectedMoves(trees, tree.colour)).filter((p) => {
    const due = srs.get(p.posKey)?.due;
    return due !== undefined && due <= today;
  }).length;
}
