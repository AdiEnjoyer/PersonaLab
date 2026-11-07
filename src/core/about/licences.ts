export interface LicenceEntry {
  name: string;
  /** Licence name as recorded in the project's own licence file or package metadata. */
  licence: string;
  /** Project or licence page. */
  url: string;
  /** Extra link to the source code (required by the GPL for Stockfish). */
  sourceUrl?: string;
}

/**
 * Projects the App uses or ships (R5.4). Licence names checked against `node_modules/<pkg>/LICENSE` and
 * package.json for chess.js (BSD-2-Clause), react-chessboard (MIT) and stockfish (GPL-3.0), and against the
 * projects' own pages for the datasets.
 */
export const LICENCES: readonly LicenceEntry[] = [
  {
    name: 'free-exercise-db',
    licence: 'Unlicense',
    url: 'https://github.com/yuhonas/free-exercise-db/blob/main/LICENSE.md',
  },
  {
    name: 'Lichess puzzle database',
    licence: 'CC0',
    url: 'https://database.lichess.org/#puzzles',
  },
  {
    name: 'Open Food Facts',
    licence: 'ODbL',
    url: 'https://world.openfoodfacts.org/terms-of-use',
  },
  {
    name: 'Stockfish',
    licence: 'GPLv3',
    url: 'https://github.com/nmrugg/stockfish.js/blob/master/Copying.txt',
    sourceUrl: 'https://github.com/nmrugg/stockfish.js',
  },
  {
    name: 'chess.js',
    licence: 'BSD-2-Clause',
    url: 'https://github.com/jhlywa/chess.js/blob/master/LICENSE',
  },
  {
    name: 'react-chessboard',
    licence: 'MIT',
    url: 'https://github.com/Clariity/react-chessboard/blob/main/LICENSE',
  },
];
