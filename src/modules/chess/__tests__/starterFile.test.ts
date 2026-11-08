import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import starterRaw from '../../../../public/data/repertoire-starter.json?raw';
import { OPENING } from '../constants';
import { conflictingKeys, indexTree, invariantHolds, linesOf, positionKey } from '../logic/repertoire';
import { buildRepertoire } from '../logic/starter';
import { StarterFileSchema } from '../schema';
import { counterIds } from '../logic/__tests__/repertoireFixtures';

const file = StarterFileSchema.parse(JSON.parse(starterRaw));
const trees = buildRepertoire(file, counterIds(), 1000);

describe('starter repertoire file', () => {
  it('has the four trees of requirement 51.1', () => {
    expect(trees.map((t) => [t.name, t.colour])).toEqual([
      ['Italian Game / Giuoco Piano', 'w'],
      ['London System', 'w'],
      ['Caro-Kann Defence', 'b'],
      ['Italian Game / Two Knights Defence', 'b'],
    ]);
  });

  it('plays every authored line legally in chess.js, with notes of at most 300 characters', () => {
    for (const tree of file.trees) {
      for (const line of tree.lines) {
        const chess = new Chess();
        for (const entry of line) {
          const [san = ''] = entry.split('#');
          expect(() => chess.move(san.trim()), `${tree.name}: ${entry}`).not.toThrow();
        }
      }
    }
    for (const tree of trees) {
      for (const n of tree.nodes) expect(n.explanation?.length ?? 0).toBeLessThanOrEqual(OPENING.EXPLANATION_MAX);
    }
  });

  it('starts every tree as the Owner needs: first move, and the key moves', () => {
    const first = (i: number) => linesOf(trees[i]!)[0]!.map((n) => n.san);
    expect(first(0).slice(0, 7)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3']);
    expect(first(1).slice(0, 4)).toEqual(['d4', 'd5', 'Bf4', 'Nf6']);
    expect(first(2).slice(0, 8)).toEqual(['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5']);
    expect(first(3).slice(0, 6)).toEqual(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6']);
  });

  it('gives every main line 16 plies and 2 opponent replies at its first 3 opponent positions (R51.2)', () => {
    for (const tree of trees) {
      const idx = indexTree(tree);
      const main = linesOf(tree)[0]!;
      expect(main.length).toBeGreaterThanOrEqual(16);
      // Opponent-to-move positions of the main line: the start position (White opponent) or after the Owner's moves.
      const opponentPositions: Array<string | null> = [];
      let at: string | null = null;
      const opponentIsWhite = tree.colour === 'b';
      for (let ply = 0; ply <= main.length; ply++) {
        const whiteToMove = ply % 2 === 0;
        if (whiteToMove === opponentIsWhite) opponentPositions.push(at);
        const next = main[ply];
        if (next !== undefined) at = next.id;
      }
      for (const p of opponentPositions.slice(0, 3)) expect(idx.children.get(p)?.length ?? 0).toBeGreaterThanOrEqual(2);
    }
  });

  it('keeps one Owner move per position inside every tree, and clashes between trees only at opening choices', () => {
    expect(invariantHolds(trees, { ignoreSharedChoices: true })).toBe(true);
    const startKey = positionKey(new Chess().fen(), 'w');
    const afterE4 = new Chess();
    afterE4.move('e4');
    expect(conflictingKeys(trees, 'w')).toEqual([startKey]);
    expect(conflictingKeys(trees, 'b')).toEqual([positionKey(afterE4.fen(), 'b')]);
  });
});
