import type { RepertoireTree } from '../../types';
import { buildTree } from '../starter';

export const counterIds = (prefix = 'n'): (() => string) => {
  let n = 0;
  return () => `${prefix}${++n}`;
};

/** Small fixture repertoire: two White trees that disagree at 3.Bc4 / 3.d4, and one Black tree. */
export function fixtureTrees(ids: () => string = counterIds()): RepertoireTree[] {
  return [
    buildTree(
      {
        name: 'Italian',
        colour: 'w',
        lines: [
          ['e4 # Take the centre.', 'e5', 'Nf3', 'Nc6', 'Bc4 # Aim at f7.', 'Bc5', 'c3', 'Nf6', 'd4'],
          ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6', 'd3'],
        ],
      },
      ids,
      1000,
    ),
    buildTree({ name: 'Scotch', colour: 'w', lines: [['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4']] }, ids, 2000),
    buildTree(
      {
        name: 'Caro-Kann',
        colour: 'b',
        lines: [
          ['e4', 'c6 # Prepare d5.', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'],
          ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5'],
        ],
      },
      ids,
      3000,
    ),
  ];
}
