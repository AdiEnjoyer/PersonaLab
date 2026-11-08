import type { Puzzle } from '../../types';

/** Black plays Kh8; White mates with either rook (Ra8# expected, Rb8# also mates). */
export const MATE_PUZZLE: Puzzle = {
  id: 'mate1',
  fen: '6k1/5ppp/8/8/8/8/5PPP/RR4K1 b - - 0 1',
  moves: ['g8h8', 'a1a8'],
  rating: 800,
  rd: 80,
  themes: ['mateIn1', 'backRankMate'],
};

/** Four moves from the start position: the opponent is White, the Owner Black. */
export const LINE_PUZZLE: Puzzle = {
  id: 'line1',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  moves: ['e2e4', 'e7e5', 'g1f3', 'b8c6'],
  rating: 900,
  rd: 80,
  themes: ['opening', 'short'],
};

/** Scholar's-mate style: after 3...Nf6 White plays Qxf7#. */
export const SCHOLAR_PUZZLE: Puzzle = {
  id: 'scholar',
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 1',
  moves: ['g8f6', 'h5f7'],
  rating: 1000,
  rd: 90,
  themes: ['mateIn1', 'short'],
};

export const FIXTURE_PUZZLES: Puzzle[] = [MATE_PUZZLE, LINE_PUZZLE, SCHOLAR_PUZZLE];
