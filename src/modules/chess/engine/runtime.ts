import { readEvals, saveEval, saveReport } from '../data/analysisRepo';
import { loadTips, readChessRating, readGame } from '../data/view';
import { GameAnalyzer } from './analyzer';
import { getEngineClient } from './engineWorker';
let analyzer: GameAnalyzer | null = null;
/** The app-wide Game_Analyzer, wired to the engine worker, the Analysis_Cache and the document visibility. */
export function getAnalyzer(): GameAnalyzer {
  analyzer ??= new GameAnalyzer({
    engine: getEngineClient(),
    store: { readEvals: (id) => readEvals(id), saveEval: (r) => saveEval(r), saveReport: (r) => saveReport(r) },
    loadGame: (id) => readGame(id),
    loadTips: () => loadTips(),
    readBand: async () => (await readChessRating()).band,
    now: () => Date.now(),
    visibility: {
      hidden: () => typeof document !== 'undefined' && document.visibilityState === 'hidden',
      subscribe: (cb) => {
        document.addEventListener('visibilitychange', cb);
        return () => document.removeEventListener('visibilitychange', cb);
      },
    },
  });
  return analyzer;
}
/** For tests: replaces the shared analyzer. */
export function setAnalyzerForTests(next: GameAnalyzer | null): void {
  analyzer = next;
}
