import { Chess } from 'chess.js';
import { OPENING } from '../constants';
import type { Colour, MoveNode, RepertoireTree } from '../types';

export const START_POSITION_FEN = new Chess().fen();

type Pos = string | null;

/** Lookup tables of one tree. A position is identified by the node that reaches it (`null` is the start position). */
export interface TreeIndex {
  /** Children of each position, earlier-added first. */
  children: Map<Pos, MoveNode[]>;
  byId: Map<string, MoveNode>;
  /** FEN of the position after the node. */
  fen: Map<Pos, string>;
  /** Plies played to reach the position. */
  depth: Map<Pos, number>;
}

const moveInput = (uci: string): { from: string; to: string; promotion?: string } => ({
  from: uci.slice(0, 2),
  to: uci.slice(2, 4),
  ...(uci.length > 4 ? { promotion: uci.slice(4, 5) } : {}),
});

/** SAN and resulting FEN of a legal move from `fen`, or null when chess.js rejects it (R51.5). */
export function playUci(fen: string, uci: string): { san: string; fen: string } | null {
  if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) return null;
  try {
    const chess = new Chess(fen);
    const move = chess.move(moveInput(uci));
    return { san: move.san, fen: chess.fen() };
  } catch {
    return null;
  }
}

/** En passant field of the key: "-" unless an en passant capture is legal (R51.6). */
export function normaliseEp(fen: string): string {
  const ep = fen.split(' ')[3] ?? '-';
  if (ep === '-') return '-';
  try {
    const legal = new Chess(fen).moves({ verbose: true }).some((m) => m.flags.includes('e'));
    return legal ? ep : '-';
  } catch {
    return '-';
  }
}

/** Key of a Repertoire_Position: colour and the first four FEN fields (R51.6). */
export function positionKey(fen: string, colour: Colour): string {
  const [placement, side, castling] = fen.split(' ');
  return `${colour}|${placement} ${side} ${castling} ${normaliseEp(fen)}`;
}

const sideToMove = (fen: string): Colour => (fen.split(' ')[1] === 'b' ? 'b' : 'w');

export function indexTree(tree: RepertoireTree): TreeIndex {
  const byId = new Map(tree.nodes.map((n) => [n.id, n]));
  const grouped = new Map<Pos, MoveNode[]>();
  for (const n of [...tree.nodes].sort((a, b) => a.seq - b.seq)) {
    const parent = n.parentId !== null && byId.has(n.parentId) ? n.parentId : n.parentId === null ? null : undefined;
    if (parent === undefined) continue;
    const list = grouped.get(parent) ?? [];
    list.push(n);
    grouped.set(parent, list);
  }
  const children = new Map<Pos, MoveNode[]>();
  const fen = new Map<Pos, string>([[null, START_POSITION_FEN]]);
  const depth = new Map<Pos, number>([[null, 0]]);
  const queue: Pos[] = [null];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i] as Pos;
    const parentFen = fen.get(at) as string;
    const legal: MoveNode[] = [];
    for (const n of grouped.get(at) ?? []) {
      const played = playUci(parentFen, n.uci);
      if (played === null) continue;
      legal.push(n);
      fen.set(n.id, played.fen);
      depth.set(n.id, (depth.get(at) as number) + 1);
      queue.push(n.id);
    }
    if (legal.length > 0) children.set(at, legal);
  }
  return { children, byId, fen, depth };
}

/** Number of nodes reachable from the start position through legal moves. */
export const reachableCount = (idx: TreeIndex): number => idx.fen.size - 1;

export interface OwnerPosition {
  posKey: string;
  depth: number;
  /** Node that reaches the position, `null` for the start position. */
  at: Pos;
  /** The expected Owner move of this tree. */
  move: MoveNode;
}

function positionsOf(tree: RepertoireTree, idx: TreeIndex): OwnerPosition[] {
  const out: OwnerPosition[] = [];
  const seen = new Set<string>();
  const queue: Pos[] = [null];
  for (let i = 0; i < queue.length; i++) {
    const at = queue[i] as Pos;
    const kids = idx.children.get(at) ?? [];
    for (const k of kids) queue.push(k.id);
    const fen = idx.fen.get(at) as string;
    const first = kids[0];
    if (first === undefined || sideToMove(fen) !== tree.colour) continue;
    const posKey = positionKey(fen, tree.colour);
    if (seen.has(posKey)) continue;
    seen.add(posKey);
    out.push({ posKey, depth: idx.depth.get(at) as number, at, move: first });
  }
  return out;
}

/**
 * The positions of the tree where the Owner is to move and a move is expected, by depth. With `expected`, positions
 * whose expected move belongs to another tree of the colour are left out (they are shared opening choices).
 */
export function ownerPositions(tree: RepertoireTree, expected?: ReadonlyMap<string, string>): OwnerPosition[] {
  const all = positionsOf(tree, indexTree(tree));
  return expected ? all.filter((p) => expected.get(p.posKey) === p.move.uci) : all;
}

const byCreation = (a: RepertoireTree, b: RepertoireTree): number => a.createdAt - b.createdAt;

/** The expected Owner move (UCI) of each Repertoire_Position of a colour; the earliest-created tree wins a clash. */
export function expectedMoves(trees: readonly RepertoireTree[], colour: Colour): Map<string, string> {
  const out = new Map<string, string>();
  for (const tree of [...trees].filter((t) => t.colour === colour).sort(byCreation)) {
    for (const p of ownerPositions(tree)) if (!out.has(p.posKey)) out.set(p.posKey, p.move.uci);
  }
  return out;
}

/** Position keys that two trees of a colour answer with different Owner moves. */
export function conflictingKeys(trees: readonly RepertoireTree[], colour: Colour): string[] {
  const seen = new Map<string, string>();
  const bad = new Set<string>();
  for (const tree of trees.filter((t) => t.colour === colour)) {
    for (const p of ownerPositions(tree)) {
      const previous = seen.get(p.posKey);
      if (previous !== undefined && previous !== p.move.uci) bad.add(p.posKey);
      seen.set(p.posKey, previous ?? p.move.uci);
    }
  }
  return [...bad];
}

/** True when every node of every tree is a legal move from its parent and no position has two expected Owner moves (R51.9). */
export function invariantHolds(trees: readonly RepertoireTree[], opts: { ignoreSharedChoices?: boolean } = {}): boolean {
  for (const tree of trees) {
    const idx = indexTree(tree);
    if (reachableCount(idx) !== tree.nodes.length) return false;
    for (const [at, kids] of idx.children) {
      if (sideToMove(idx.fen.get(at) as string) === tree.colour && kids.length > 1) return false;
    }
  }
  if (opts.ignoreSharedChoices) return true;
  return conflictingKeys(trees, 'w').length === 0 && conflictingKeys(trees, 'b').length === 0;
}

/** Lines of a tree: root-to-leaf paths in depth-first order, earlier-added moves first (R52.1). */
export function linesOf(tree: RepertoireTree): MoveNode[][] {
  const idx = indexTree(tree);
  const lines: MoveNode[][] = [];
  const walk = (at: Pos, path: MoveNode[]): void => {
    const kids = idx.children.get(at);
    if (kids === undefined) {
      if (path.length > 0) lines.push(path);
      return;
    }
    for (const k of kids) walk(k.id, [...path, k]);
  };
  walk(null, []);
  return lines;
}

const subtreeIds = (idx: TreeIndex, id: string): string[] => [id, ...(idx.children.get(id) ?? []).flatMap((k) => subtreeIds(idx, k.id))];

/** Removes a move and every move after it (R51.4). */
export function deleteBranch(tree: RepertoireTree, nodeId: string): RepertoireTree {
  const idx = indexTree(tree);
  if (!idx.byId.has(nodeId)) return tree;
  const gone = new Set(subtreeIds(idx, nodeId));
  return { ...tree, nodes: tree.nodes.filter((n) => !gone.has(n.id)) };
}

export type AddResult =
  | { kind: 'added'; trees: RepertoireTree[] }
  | { kind: 'exists' }
  | { kind: 'illegal' }
  | { kind: 'conflict'; existing: string; treeNames: string[]; removedCount: number };

/** Occurrences of an expected Owner move at `posKey` across the trees of a colour. */
function occurrences(trees: readonly RepertoireTree[], colour: Colour, posKey: string): Array<{ tree: RepertoireTree; idx: TreeIndex; at: Pos; kids: MoveNode[] }> {
  const out: Array<{ tree: RepertoireTree; idx: TreeIndex; at: Pos; kids: MoveNode[] }> = [];
  for (const tree of trees) {
    if (tree.colour !== colour) continue;
    const idx = indexTree(tree);
    for (const [at, kids] of idx.children) {
      const fen = idx.fen.get(at) as string;
      if (sideToMove(fen) === colour && positionKey(fen, colour) === posKey) out.push({ tree, idx, at, kids });
    }
  }
  return out;
}

/**
 * Adds the move `uci` after `parentId` of a tree (R51.4, R51.5, R51.8). An Owner move that differs from the move
 * already expected at its position is reported as a conflict and changes nothing.
 */
export function addMove(trees: readonly RepertoireTree[], treeId: string, parentId: string | null, uci: string, ids: () => string): AddResult {
  const tree = trees.find((t) => t.id === treeId);
  if (tree === undefined) return { kind: 'illegal' };
  const idx = indexTree(tree);
  const parentFen = idx.fen.get(parentId);
  if (parentFen === undefined) return { kind: 'illegal' };
  const played = playUci(parentFen, uci);
  if (played === null) return { kind: 'illegal' };
  if ((idx.children.get(parentId) ?? []).some((k) => k.uci === uci)) return { kind: 'exists' };
  if (sideToMove(parentFen) === tree.colour) {
    const posKey = positionKey(parentFen, tree.colour);
    const existing = expectedMoves(trees, tree.colour).get(posKey);
    const here = (idx.children.get(parentId) ?? [])[0];
    const clash = here?.uci ?? existing;
    if (clash !== undefined && clash !== uci) {
      const found = occurrences(trees, tree.colour, posKey);
      const treeNames = [...new Set(found.map((o) => o.tree.name))];
      const removedCount = found.reduce((sum, o) => sum + o.kids.reduce((s, k) => s + subtreeIds(o.idx, k.id).length, 0), 0);
      return { kind: 'conflict', existing: playUci(parentFen, clash)?.san ?? clash, treeNames, removedCount };
    }
  }
  const node: MoveNode = { id: ids(), parentId, uci, san: played.san, seq: tree.nextSeq };
  return { kind: 'added', trees: trees.map((t) => (t.id === treeId ? { ...t, nodes: [...t.nodes, node], nextSeq: t.nextSeq + 1 } : t)) };
}

/**
 * Replaces the expected Owner move at `posKey` in every tree of the colour: the old move and the moves after it are
 * removed and `uci` is added (R51.8). `origin` is where the Owner played it; that place gets the move too.
 */
export function replaceExpected(
  trees: readonly RepertoireTree[],
  colour: Colour,
  posKey: string,
  uci: string,
  ids: () => string,
  origin?: { treeId: string; parentId: string | null },
): RepertoireTree[] {
  const found = occurrences(trees, colour, posKey);
  const targets = new Map<string, Array<{ at: Pos; kids: MoveNode[] }>>();
  for (const o of found) targets.set(o.tree.id, [...(targets.get(o.tree.id) ?? []), { at: o.at, kids: o.kids }]);
  if (origin !== undefined) {
    const list = targets.get(origin.treeId) ?? [];
    if (!list.some((t) => t.at === origin.parentId)) targets.set(origin.treeId, [...list, { at: origin.parentId, kids: [] }]);
  }
  return trees.map((tree) => {
    const list = targets.get(tree.id);
    if (list === undefined) return tree;
    const idx = indexTree(tree);
    const gone = new Set(list.flatMap((t) => t.kids.filter((k) => k.uci !== uci).flatMap((k) => subtreeIds(idx, k.id))));
    const nodes = tree.nodes.filter((n) => !gone.has(n.id));
    let nextSeq = tree.nextSeq;
    for (const t of list) {
      if (t.kids.some((k) => k.uci === uci)) continue;
      const played = playUci(idx.fen.get(t.at) as string, uci);
      if (played === null) continue;
      nodes.push({ id: ids(), parentId: t.at, uci, san: played.san, seq: nextSeq++ });
    }
    return { ...tree, nodes, nextSeq };
  });
}

export type TextCheck = { ok: true; value: string } | { ok: false; error: string };

/** Tree name: 1 to 60 characters after trimming (R51.4). */
export function checkTreeName(name: string): TextCheck {
  const value = name.trim();
  if (value.length < 1 || value.length > OPENING.TREE_NAME_MAX) return { ok: false, error: `Use 1 to ${OPENING.TREE_NAME_MAX} characters.` };
  return { ok: true, value };
}

/** Explanation: up to 300 characters after trimming; empty removes it (R51.3). */
export function checkExplanation(text: string): TextCheck {
  const value = text.trim();
  if (value.length > OPENING.EXPLANATION_MAX) return { ok: false, error: `An explanation can have at most ${OPENING.EXPLANATION_MAX} characters.` };
  return { ok: true, value };
}

export function setExplanation(tree: RepertoireTree, nodeId: string, text: string): RepertoireTree {
  const checked = checkExplanation(text);
  if (!checked.ok) return tree;
  return {
    ...tree,
    nodes: tree.nodes.map((n) => {
      if (n.id !== nodeId) return n;
      const { explanation: _old, ...rest } = n;
      return checked.value === '' ? rest : { ...rest, explanation: checked.value };
    }),
  };
}

export function newTree(id: string, name: string, colour: Colour, createdAt: number): RepertoireTree {
  return { id, name: name.trim(), colour, createdAt, nodes: [], nextSeq: 0 };
}
