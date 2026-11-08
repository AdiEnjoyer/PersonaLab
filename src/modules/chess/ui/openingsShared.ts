import type { MoveInput } from '../logic/board';
import type { RepertoireTree } from '../types';

export const uciOf = (m: MoveInput): string => `${m.from}${m.to}${m.promotion ?? ''}`;

export const arrowOf = (uci: string): { from: string; to: string } => ({ from: uci.slice(0, 2), to: uci.slice(2, 4) });

/** True when the move that starts at 0-based ply `ply` of a line is the Owner's. */
export const isOwnerPly = (tree: RepertoireTree, ply: number): boolean => (ply % 2 === 0) === (tree.colour === 'w');

export const orientationOf = (tree: RepertoireTree): 'white' | 'black' => (tree.colour === 'w' ? 'white' : 'black');

export const turnOf = (fen: string): 'w' | 'b' => (fen.split(' ')[1] === 'b' ? 'b' : 'w');
