import { describe, expect, it } from 'vitest';
import { gamePhase } from '../phase';

describe('gamePhase', () => {
  it('classifies opening, middlegame and endgame', () => {
    expect(gamePhase('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe('opening');
    expect(gamePhase('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 12')).toBe('opening');
    expect(gamePhase('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 13')).toBe('middlegame');
    // 6 pieces: endgame regardless of move number
    expect(gamePhase('rnb1k3/8/8/8/8/8/8/RNB1K3 w - - 0 5')).toBe('endgame');
    expect(gamePhase('rnbqk3/8/8/8/8/8/8/RNB1K3 w - - 0 5')).toBe('opening');
    expect(gamePhase('rnbqk3/8/8/8/8/8/8/RNB1K3 w - - 0 20')).toBe('middlegame');
  });
});
