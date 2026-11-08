import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { SM2 } from '../../constants';
import type { GameRecord, RepertoireTree } from '../../types';
import { buildDrillQueue, chooseReply, drillContext, drillSummary, gradeFor, pickDrillTree, stepAt } from '../drill';
import { matchGame, nameRows, scoreOf, treeAccuracy, treeScores, mastery } from '../openingStats';
import {
  addMove,
  checkExplanation,
  checkTreeName,
  deleteBranch,
  expectedMoves,
  indexTree,
  invariantHolds,
  linesOf,
  normaliseEp,
  ownerPositions,
  positionKey,
  replaceExpected,
} from '../repertoire';
import type { SrsState } from '../sm2';
import { counterIds, fixtureTrees } from './repertoireFixtures';

const fenAfter = (...sans: string[]): string => {
  const c = new Chess();
  for (const s of sans) c.move(s);
  return c.fen();
};
const uci = (...sans: string[]): string[] => {
  const c = new Chess();
  return sans.map((s) => {
    const m = c.move(s);
    return `${m.from}${m.to}${m.promotion ?? ''}`;
  });
};
const keyAfter = (colour: 'w' | 'b', ...sans: string[]): string => positionKey(fenAfter(...sans), colour);

describe('position keys', () => {
  it('shares one key between transpositions and ignores the move counters', () => {
    expect(keyAfter('w', 'Nf3', 'd5', 'd4')).toBe(keyAfter('w', 'd4', 'd5', 'Nf3'));
    expect(keyAfter('w', 'e4')).toBe('w|rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq -');
  });

  it('keeps the en passant square only when a capture is legal', () => {
    expect(normaliseEp(fenAfter('e4'))).toBe('-');
    expect(normaliseEp(fenAfter('e4', 'a6', 'e5', 'd5'))).toBe('d6');
  });
});

describe('repertoire edits', () => {
  it('lists lines depth-first in insertion order', () => {
    const [italian] = fixtureTrees();
    const lines = linesOf(italian as RepertoireTree).map((l) => l.map((n) => n.san).join(' '));
    expect(lines).toEqual(['e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4', 'e4 e5 Nf3 Nc6 Bc4 Nf6 d3']);
  });

  it('adds a legal move, rejects an illegal one and reports an existing one', () => {
    const trees = fixtureTrees();
    const caro = trees[2] as RepertoireTree;
    const ids = counterIds('x');
    const added = addMove(trees, caro.id, null, 'd2d4', ids); // White's first move is an opponent move
    expect(added.kind).toBe('added');
    expect(addMove(trees, caro.id, null, 'a1a5', ids).kind).toBe('illegal');
    expect(addMove(trees, caro.id, null, 'e2e4', ids).kind).toBe('exists');
    const afterE4 = indexTree(caro).children.get(null)![0]!.id;
    expect(addMove(trees, caro.id, afterE4, 'e7e5', ids).kind).toBe('conflict'); // Black already answers 1.e4 with ...c6
  });

  it('reports a conflict for a second Owner move and replaces it in every tree of the colour', () => {
    const trees = fixtureTrees();
    const [italian, scotch] = trees as [RepertoireTree, RepertoireTree];
    const iIdx = indexTree(italian);
    const afterNc6 = [...iIdx.fen].find(([, fen]) => fen === fenAfter('e4', 'e5', 'Nf3', 'Nc6'))![0];
    const ids = counterIds('r');
    // 4.Nc3 where the Italian tree expects 4.Bc4 (the Scotch tree answers with 4.d4).
    const result = addMove(trees, italian.id, afterNc6, 'b1c3', ids);
    expect(result.kind).toBe('conflict');
    if (result.kind !== 'conflict') return;
    expect(result.existing).toBe('Bc4');
    expect(result.treeNames).toEqual(['Italian', 'Scotch']);
    expect(result.removedCount).toBe(7 + 3); // Bc4 and 6 more moves; d4 exd4 Nxd4

    const key = keyAfter('w', 'e4', 'e5', 'Nf3', 'Nc6');
    const replaced = replaceExpected(trees, 'w', key, 'b1c3', ids, { treeId: italian.id, parentId: afterNc6 });
    expect(invariantHolds(replaced, { ignoreSharedChoices: true })).toBe(true);
    expect([...expectedMoves(replaced, 'w').entries()].find(([k]) => k === key)![1]).toBe('b1c3');
    const italianAfter = replaced.find((t) => t.id === italian.id)!;
    expect(italianAfter.nodes.map((n) => n.san)).not.toContain('Bc4');
    expect(replaced.find((t) => t.id === scotch.id)!.nodes.map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Nc3']);
    expect(invariantHolds(replaced)).toBe(true);
  });

  it('deletes a move with everything after it and keeps every move legal', () => {
    const [italian] = fixtureTrees();
    const bc4 = italian!.nodes.find((n) => n.san === 'Bc4')!;
    const cut = deleteBranch(italian!, bc4.id);
    expect(cut.nodes.map((n) => n.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6']);
    expect(invariantHolds([cut])).toBe(true);
  });

  it('validates names and explanations', () => {
    expect(checkTreeName('  ').ok).toBe(false);
    expect(checkTreeName('x'.repeat(61)).ok).toBe(false);
    expect(checkTreeName(' Italian ')).toEqual({ ok: true, value: 'Italian' });
    expect(checkExplanation('x'.repeat(301)).ok).toBe(false);
    expect(checkExplanation('  idea  ')).toEqual({ ok: true, value: 'idea' });
  });

  it('marks positions that another tree answers differently as shared choices', () => {
    const trees = fixtureTrees();
    const expected = expectedMoves(trees, 'w');
    const scotchKeys = ownerPositions(trees[1] as RepertoireTree, expected).map((p) => p.posKey);
    expect(scotchKeys).not.toContain(keyAfter('w', 'e4', 'e5', 'Nf3', 'Nc6'));
    expect(scotchKeys).toContain(keyAfter('w', 'e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4'));
  });
});

describe('drill queue and steps', () => {
  const today = '2025-05-10';

  it('puts due positions first by due date, then new positions up to the daily limit', () => {
    const trees = fixtureTrees();
    const k1 = keyAfter('w', 'e4', 'e5');
    const k2 = keyAfter('w', 'e4', 'e5', 'Nf3', 'Nc6');
    const srs = new Map<string, SrsState>([
      [k1, { E: 250, n: 1, I: 1, due: '2025-05-09' }],
      [k2, { E: 250, n: 1, I: 1, due: '2025-05-01' }],
      [keyAfter('w', 'e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'), { E: 250, n: 1, I: 1, due: '2025-05-11' }],
    ]);
    const queue = buildDrillQueue(trees, srs, SM2.NEW_PER_DAY - 2, today);
    expect(queue.slice(0, 2)).toEqual([k2, k1]);
    expect(queue).toHaveLength(2 + 2);
    expect(new Set(queue).size).toBe(queue.length);
    expect(buildDrillQueue(trees, new Map(), SM2.NEW_PER_DAY, today)).toEqual([]);
  });

  it('is empty when nothing is due and the limit is used up', () => {
    expect(buildDrillQueue(fixtureTrees(), new Map(), 10, today)).toEqual([]);
  });

  it('chooses replies that reach the queue, uniformly, else any reply', () => {
    const replies = [{ id: 'a' }, { id: 'b' }, { id: 'c' }].map((r) => ({ ...r, parentId: null, uci: r.id, san: r.id, seq: 0 }));
    const reaches = (n: { id: string }) => n.id !== 'a';
    expect(chooseReply(replies, reaches, () => 0).id).toBe('b');
    expect(chooseReply(replies, reaches, () => 0.99).id).toBe('c');
    expect(chooseReply(replies, () => false, () => 0.5).id).toBe('b');
  });

  it('walks a line: opponent replies come from the tree, the Owner position is gradable once', () => {
    const trees = fixtureTrees();
    const tree = trees[0] as RepertoireTree;
    const queue = buildDrillQueue(trees, new Map(), 0, today);
    expect(pickDrillTree(trees, queue)?.id).toBe(tree.id);
    const ctx = drillContext(trees, tree, new Set(queue), new Set(), () => 0);
    const first = stepAt(ctx, null);
    expect(first.kind).toBe('owner');
    if (first.kind !== 'owner') return;
    expect(first.node.san).toBe('e4');
    expect(first.gradable).toBe(true);
    const graded = drillContext(trees, tree, new Set(queue), new Set([first.posKey]), () => 0);
    expect(stepAt(graded, null)).toMatchObject({ kind: 'owner', gradable: false });
    expect(stepAt(ctx, first.node.id).kind).toBe('opponent');
    const leaf = tree.nodes.find((n) => n.san === 'd3')!;
    expect(stepAt(ctx, leaf.id).kind).toBe('leaf');
  });

  it('plays a shared opening choice for the Owner without grading it', () => {
    const trees = fixtureTrees();
    const scotch = trees[1] as RepertoireTree;
    const queue = buildDrillQueue(trees, new Map(), 0, today);
    const ctx = drillContext(trees, scotch, new Set(queue), new Set(), () => 0);
    const nc6 = [...indexTree(scotch).fen].find(([, fen]) => fen === fenAfter('e4', 'e5', 'Nf3', 'Nc6'))![0];
    expect(stepAt(ctx, nc6)).toMatchObject({ kind: 'auto' });
  });

  it('grades 5, 3 and 1 and summarises a session', () => {
    expect([gradeFor('first'), gradeFor('second'), gradeFor('failed')]).toEqual([5, 3, 1]);
    const states: SrsState[] = [
      { E: 250, n: 1, I: 1, due: '2025-05-12' },
      { E: 250, n: 1, I: 1, due: '2025-05-11' },
      { E: 250, n: 0, I: 0 },
    ];
    expect(drillSummary([5, 3, 1, 5], states)).toEqual({ graded: 4, accuracy: 50, nextDue: '2025-05-11' });
    expect(drillSummary([], [])).toEqual({ graded: 0 });
  });
});

const game = (over: Partial<GameRecord> & { sans: string[] }): GameRecord => {
  const { sans, ...rest } = over;
  const c = new Chess();
  for (const s of sans) c.move(s);
  return {
    id: String(Math.random()),
    idemKey: String(Math.random()),
    pgn: c.pgn(),
    timeClass: 'rapid',
    timeControl: '600',
    endTime: 1,
    rated: true,
    white: { username: 'adi', result: 'win' },
    black: { username: 'bob', result: 'lose' },
    syncedFor: 'adi',
    ownerColour: 'w',
    ownerResult: 'win',
    pgnUnreadable: false,
    ...rest,
  };
};

describe('opening statistics', () => {
  it('matches the tree with the longest shared prefix and reports the exit', () => {
    const trees = fixtureTrees();
    const italian = trees[0]!.id;
    const scotch = trees[1]!.id;
    expect(matchGame(uci('e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Nf6'), 'w', trees)).toMatchObject({ treeId: scotch, k: 7, reason: 'line ended', exitPly: 8 });
    expect(matchGame(uci('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'), 'w', trees)).toMatchObject({ treeId: italian, k: 6, reason: 'Owner left', exitPly: 7 });
    expect(matchGame(uci('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bb4'), 'w', trees)).toMatchObject({ treeId: italian, k: 5, reason: 'opponent left' });
    expect(matchGame(uci('e4', 'e5'), 'w', trees)).toMatchObject({ treeId: italian, reason: 'ended in repertoire' });
    expect(matchGame(uci('d4', 'd5'), 'w', trees)).toBeNull();
    expect(matchGame(uci('e4', 'c6'), 'w', trees.slice(2))).toBeNull();
  });

  it('scores wins plus half draws over decided games and skips unknown results', () => {
    expect(scoreOf(['win', 'draw', 'loss', 'unknown'])).toBe(50);
    expect(scoreOf(['win', 'win', 'draw'])).toBe(83);
    expect(scoreOf(['unknown'])).toBeUndefined();
    expect(scoreOf([])).toBeUndefined();
  });

  it('stays within 0 to 100 for any mix of results', () => {
    const results = ['win', 'loss', 'draw', 'unknown'] as const;
    for (let i = 0; i < 200; i++) {
      const mix = Array.from({ length: (i * 7) % 40 }, (_, j) => results[(i * 31 + j * 17 + (j >> 1)) % 4]!);
      const s = scoreOf(mix);
      if (s !== undefined) {
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
      }
    }
  });

  it('computes tree scores, name rows, accuracy and mastery within bounds', () => {
    const trees = fixtureTrees();
    const games = [
      game({ sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'], ownerResult: 'win', eco: 'https://www.chess.com/openings/Italian-Game-Giuoco-Piano' }),
      game({ sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], ownerResult: 'loss', eco: 'https://www.chess.com/openings/Italian-Game-Giuoco-Piano' }),
      game({ sans: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'], ownerResult: 'unknown', eco: 'https://www.chess.com/openings/Four-Knights-Game' }),
      game({ sans: ['d4', 'd5'], ownerResult: 'win' }),
      game({ sans: ['e4', 'c6'], ownerColour: 'b', ownerResult: 'draw' }),
    ];
    const scores = treeScores(games, trees);
    expect(scores.get(trees[0]!.id)).toMatchObject({ games: 3, score: 50 });
    expect(scores.get(trees[2]!.id)).toMatchObject({ games: 1, score: 50 });
    expect(scores.get(trees[1]!.id)).toEqual({ name: 'Scotch', games: 0 });
    const rows = nameRows(games);
    expect(rows[0]).toMatchObject({ name: 'Italian Game Giuoco Piano', games: 2, score: 50 });
    expect(rows.find((r) => r.name === 'Four Knights Game')).toEqual({ name: 'Four Knights Game', games: 1 });

    const reviews = [
      { id: 'a', posKey: keyAfter('w'), date: '2025-05-09', q: 5 },
      { id: 'b', posKey: keyAfter('w', 'e4', 'e5'), date: '2025-05-09', q: 1 },
      { id: 'c', posKey: keyAfter('w'), date: '2025-03-01', q: 1 },
    ];
    expect(treeAccuracy(reviews, trees[2]!, '2025-05-10')).toBeUndefined();
    expect(treeAccuracy(reviews, trees[0]!, '2025-05-10')).toBe(50);
    const srs = new Map<string, SrsState>([[keyAfter('w', 'e4', 'e5'), { E: 250, n: 3, I: 30, due: '2025-06-01' }]]);
    const m = mastery(trees[0]!, srs)!;
    expect(m).toBeGreaterThan(0);
    expect(m).toBeLessThanOrEqual(100);
    expect(mastery({ ...trees[0]!, nodes: [] }, srs)).toBeUndefined();
  });
});


