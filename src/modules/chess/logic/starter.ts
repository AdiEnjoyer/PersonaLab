import { Chess } from 'chess.js';
import { OPENING } from '../constants';
import type { Colour, MoveNode, RepertoireTree } from '../types';

/** One tree of `public/data/repertoire-starter.json`: lines of SAN moves, each optionally followed by ` # idea note`. */
export interface StarterTree {
  name: string;
  colour: Colour;
  lines: string[][];
}

export interface StarterFile {
  trees: StarterTree[];
}

/** An authored line is illegal, repeats an Owner position with two moves, or has a note that is too long. */
export class StarterError extends Error {
  override readonly name = 'StarterError';
}

/** Builds a tree from authored lines; lines share the nodes of their common prefix. */
export function buildTree(def: StarterTree, ids: () => string, createdAt: number): RepertoireTree {
  const nodes: MoveNode[] = [];
  let nextSeq = 0;
  for (const [lineNo, line] of def.lines.entries()) {
    const chess = new Chess();
    let parentId: string | null = null;
    for (const entry of line) {
      const [sanText = '', ...noteParts] = entry.split('#');
      const note = noteParts.join('#').trim();
      if (note.length > OPENING.EXPLANATION_MAX) throw new StarterError(`${def.name}, line ${lineNo + 1}: note too long.`);
      let move;
      try {
        move = chess.move(sanText.trim());
      } catch {
        throw new StarterError(`${def.name}, line ${lineNo + 1}: illegal move "${sanText.trim()}".`);
      }
      const uci = `${move.from}${move.to}${move.promotion ?? ''}`;
      const siblings: MoveNode[] = nodes.filter((n) => n.parentId === parentId);
      let node: MoveNode | undefined = siblings.find((n) => n.uci === uci);
      if (node === undefined) {
        if (move.color === def.colour && siblings.length > 0) {
          throw new StarterError(`${def.name}, line ${lineNo + 1}: two Owner moves at one position (${move.san}).`);
        }
        node = { id: ids(), parentId, uci, san: move.san, seq: nextSeq++ };
        nodes.push(node);
      }
      if (note !== '' && node.explanation === undefined) node.explanation = note;
      parentId = node.id;
    }
  }
  return { id: ids(), name: def.name, colour: def.colour, createdAt, nodes, nextSeq };
}

/** All starter trees; creation times ascend so that earlier trees come first. */
export function buildRepertoire(file: StarterFile, ids: () => string, now: number): RepertoireTree[] {
  return file.trees.map((t, i) => buildTree(t, ids, now + i));
}
