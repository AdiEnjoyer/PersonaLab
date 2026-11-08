import { useSyncExternalStore } from 'react';
import type { AnalyzerState } from '../engine/analyzer';
import { getAnalyzer } from '../engine/runtime';
import type { DetectorId } from '../types';
export const LABEL_NAME = { inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' } as const;
export const LABEL_MARK = { inaccuracy: '?!', mistake: '?', blunder: '??' } as const;
export const DETECTOR_NAME: Record<DetectorId, string> = {
  'hanging-piece': 'Hanging piece',
  'missed-opponent-fork': 'Missed opponent fork',
  'missed-opponent-mate': 'Missed mating threat',
  'missed-own-tactic': 'Missed tactic',
  'delayed-castling': 'Delayed castling',
  'early-queen': 'Early queen',
  'endgame-technique': 'Endgame technique',
  'time-pressure': 'Time pressure',
};
export const ALL_ANALYSED_MESSAGE = 'All synced games are analysed.';
/** Plural-aware counts line, e.g. "2 inaccuracies, 1 mistake, 0 blunders". */
export function countsText(c: { inaccuracy: number; mistake: number; blunder: number }): string {
  const n = (v: number, one: string, many: string): string => `${v} ${v === 1 ? one : many}`;
  return `${n(c.inaccuracy, 'inaccuracy', 'inaccuracies')}, ${n(c.mistake, 'mistake', 'mistakes')}, ${n(c.blunder, 'blunder', 'blunders')}`;
}
/** Live state of the app-wide Game_Analyzer. */
export function useAnalyzerState(): AnalyzerState {
  const analyzer = getAnalyzer();
  return useSyncExternalStore(analyzer.subscribe, analyzer.getState, analyzer.getState);
}
/** Puzzle route that practises `themes` (R59.6). */
export const practiceHref = (themes: readonly string[]): string => `/chess/puzzles?theme=${encodeURIComponent(themes.join(','))}`;
