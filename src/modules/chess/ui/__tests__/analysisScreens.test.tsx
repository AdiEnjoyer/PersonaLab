import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../../../core/db/db';
import { withFreshDb } from '../../../../test/helpers/db';
import { ANALYSER_VERSION, ANALYSIS_DEPTH } from '../../constants';
import { saveReport } from '../../data/analysisRepo';
import { resetTipsCache } from '../../data/view';
import { GameAnalyzer, type EnginePort } from '../../engine/analyzer';
import { setAnalyzerForTests } from '../../engine/runtime';
import { EngineCancelled, type EngineResult } from '../../engine/client';
import type { Detection } from '../../logic/analysis/detectors';
import type { GameReport } from '../../logic/analysis/report';
import { PGN } from '../../logic/__tests__/fixtures';
import type { GameRecord, Tip } from '../../types';
vi.mock('react-chessboard', () => ({
  Chessboard: ({ options }: { options: { position: string } }) => <div data-testid="mock-board" data-fen={options.position} />,
}));
import { AnalyseLastGame } from '../ChessHome';
import AnalysisScreen from '../AnalysisScreen';
import GameViewerScreen from '../GameViewerScreen';
import ReportScreen from '../ReportScreen';
const game = (id: string, over: Partial<GameRecord> = {}): GameRecord => ({
  id,
  idemKey: id,
  pgn: PGN,
  timeClass: 'rapid',
  timeControl: '600',
  endTime: 1_700_000_000 + Number(id.replace(/\D/g, '')),
  rated: true,
  white: { username: 'adi', rating: 1200, result: 'checkmated' },
  black: { username: `opp${id}`, rating: 1180, result: 'win' },
  syncedFor: 'adi',
  ownerColour: 'w',
  ownerResult: 'loss',
  pgnUnreadable: false,
  ...over,
});
const report = (gameId: string, over: Partial<GameReport> = {}): GameReport => ({
  gameId,
  depth: ANALYSIS_DEPTH,
  version: ANALYSER_VERSION,
  createdAt: 1,
  counts: { inaccuracy: 1, mistake: 0, blunder: 2 },
  labels: [],
  keyMistakes: [],
  detections: [],
  tipIds: [],
  band: '1000–1199',
  ...over,
});
const detection = (n: number, detector: Detection['detector']): Detection => ({ detector, ply: 41, fullMove: n, phase: 'middlegame', explanation: 'x' });
const tip: Tip = { id: 't1', band: '1000–1199', topics: ['tactics'], title: 'Check your loose pieces', body: 'Before each move, look for pieces nobody defends.', detectors: ['hanging-piece'] };
const ok: EngineResult = { eval: { kind: 'cp', cp: 10 }, bestUci: 'e2e4', pv: ['e2e4'] };
/** Engine that never answers until stopped. */
function hangingEngine(): EnginePort {
  const pending: Array<(e: unknown) => void> = [];
  return {
    analyse: () => new Promise<EngineResult>((_, reject) => pending.push(reject)),
    stop: async () => {
      for (const r of pending.splice(0)) r(new EngineCancelled('stop'));
    },
  };
}
function makeAnalyzer(engine: EnginePort = { analyse: async () => ok, stop: async () => undefined }): GameAnalyzer {
  const analyzer = new GameAnalyzer({
    engine,
    store: { readEvals: async () => new Map(), saveEval: async () => undefined, saveReport: async () => undefined },
    loadGame: async (id) => (await db.table<GameRecord, string>('chess_games').get(id)) ?? undefined,
    loadTips: async () => [],
    readBand: async () => '1000–1199',
    now: () => 1,
    visibility: { hidden: () => false, subscribe: () => () => undefined },
  });
  setAnalyzerForTests(analyzer);
  return analyzer;
}
const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/chess/analysis" element={<AnalysisScreen />} />
        <Route path="/chess/analysis/:gameId" element={<ReportScreen />} />
        <Route path="/chess/games/:gameId" element={<GameViewerScreen />} />
      </Routes>
    </MemoryRouter>,
  );
beforeEach(async () => {
  resetTipsCache();
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [tip] })));
  await withFreshDb(async () => undefined);
  makeAnalyzer();
});
afterEach(async () => {
  setAnalyzerForTests(null);
  vi.unstubAllGlobals();
});
describe('AnalysisScreen list', () => {
  it('shows the status of each game', async () => {
    await db.table('chess_games').bulkPut([game('g1'), game('g2'), game('g3'), game('g4', { pgnUnreadable: true })]);
    await saveReport(report('g2'));
    await db.table('chess_reports').put(report('g3', { version: ANALYSER_VERSION - 1 }));
    renderAt('/chess/analysis');
    const list = await screen.findByLabelText('Analysis list');
    await waitFor(() => expect(list).toHaveTextContent('Analysed · 1 inaccuracy, 0 mistakes, 2 blunders'));
    expect(list).toHaveTextContent('Outdated · 1 inaccuracy, 0 mistakes, 2 blunders');
    expect(list).toHaveTextContent('Cannot analyse');
    expect(within(list).getAllByText('Not analysed')).toHaveLength(1);
    expect(within(list).getByRole('button', { name: 'Analyse game vs oppg1' })).toBeInTheDocument();
    expect(within(list).getByRole('button', { name: 'Re-analyse game vs oppg3' })).toBeInTheDocument();
    expect(within(list).queryByRole('button', { name: /oppg4/ })).toBeNull();
  });
  it('shows Analysing n/m with Cancel, and returns to Not analysed after Cancel', async () => {
    makeAnalyzer(hangingEngine());
    const user = userEvent.setup();
    await db.table('chess_games').put(game('g1'));
    renderAt('/chess/analysis');
    await user.click(await screen.findByRole('button', { name: 'Analyse game vs oppg1' }));
    expect(await screen.findByText('Analysing 0/5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyse all unanalysed' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.getByLabelText('Analysis list')).toHaveTextContent('Not analysed'));
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
  });
  it('analyses all unanalysed games and says so when none are left', async () => {
    const user = userEvent.setup();
    await db.table('chess_games').bulkPut([game('g1'), game('g2')]);
    await saveReport(report('g1'));
    await saveReport(report('g2'));
    renderAt('/chess/analysis');
    await user.click(await screen.findByRole('button', { name: 'Analyse all unanalysed' }));
    expect(await screen.findByText('All synced games are analysed.')).toBeInTheDocument();
  });
  it('shows the engine failure with Retry', async () => {
    const { EngineStartError } = await import('../../engine/client');
    makeAnalyzer({
      analyse: () => Promise.reject(new EngineStartError('x')),
      stop: async () => undefined,
    });
    const user = userEvent.setup();
    await db.table('chess_games').put(game('g1'));
    renderAt('/chess/analysis');
    await user.click(await screen.findByRole('button', { name: 'Analyse all unanalysed' }));
    expect(await screen.findByText('The analysis engine could not start on this device.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
describe('Pattern_Report section', () => {
  it('asks for more analysed games below 5', async () => {
    await db.table('chess_games').bulkPut([game('g1'), game('g2')]);
    await saveReport(report('g1'));
    await saveReport(report('g2'));
    renderAt('/chess/analysis');
    expect(await screen.findByText('Analyse at least 5 games to see patterns (2 analysed)')).toBeInTheDocument();
  });
  it('lists a pattern with its sentence and a Practise link to the puzzle themes; others offer Read tips', async () => {
    const user = userEvent.setup();
    for (let i = 1; i <= 5; i++) {
      await db.table('chess_games').put(game(`g${i}`));
      await saveReport(report(`g${i}`, { detections: [detection(25, 'hanging-piece'), detection(25, 'time-pressure')] }));
    }
    renderAt('/chess/analysis');
    const patterns = await screen.findByLabelText('Pattern list');
    expect(patterns).toHaveTextContent('You hang pieces in moves 21–30 in 100 % of losses (5 of 5)');
    const link = within(patterns).getByRole('link', { name: 'Practise hangingPiece' });
    expect(link.getAttribute('href')).toContain('/chess/puzzles?theme=hangingPiece');
    await user.click(within(patterns).getByRole('button', { name: 'Read tips' }));
    expect(await within(patterns).findByText(/No tips for this pattern yet/)).toBeInTheDocument();
  });
});
describe('ReportScreen', () => {
  it('shows counts, key mistakes, detector, explanation, tips and the viewer link', async () => {
    await db.table('chess_games').put(game('g1'));
    await saveReport(
      report('g1', {
        tipIds: ['t1'],
        keyMistakes: [
          { ply: 27, moveNo: '14.', san: 'Qxd5', wBefore: 62, wAfter: 21, better: ['Nxd5', 'exd5'], detectors: ['hanging-piece'], explanation: 'A piece was left unprotected.' },
        ],
      }),
    );
    renderAt('/chess/analysis/g1');
    const counts = await screen.findByLabelText('Move counts');
    expect(counts).toHaveTextContent('Inaccuracies1');
    expect(counts).toHaveTextContent('Blunders2');
    const key = screen.getByLabelText('Key mistakes');
    expect(key).toHaveTextContent('14. Qxd5');
    expect(key).toHaveTextContent('62 % → 21 %');
    expect(key).toHaveTextContent('Better: Nxd5 exd5');
    expect(key).toHaveTextContent('Hanging piece');
    expect(key).toHaveTextContent('A piece was left unprotected.');
    expect(within(key).getByRole('link', { name: '14. Qxd5' }).getAttribute('href')).toContain('/chess/games/g1?ply=26');
    expect(await screen.findByText('Check your loose pieces')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Step through the game' }).getAttribute('href')).toContain('/chess/games/g1');
    expect(screen.queryByText('Outdated')).toBeNull();
  });
  it('says so when there are no mistakes, and flags an outdated report with Re-analyse', async () => {
    await db.table('chess_games').put(game('g1'));
    await db.table('chess_reports').put(report('g1', { version: ANALYSER_VERSION - 1, counts: { inaccuracy: 0, mistake: 0, blunder: 0 } }));
    renderAt('/chess/analysis/g1');
    expect(await screen.findByText('No mistakes or blunders found')).toBeInTheDocument();
    expect(screen.getByText('Outdated')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Re-analyse' })).toBeInTheDocument();
  });
  it('offers Analyse when the game has no report', async () => {
    await db.table('chess_games').put(game('g1'));
    renderAt('/chess/analysis/g1');
    expect(await screen.findByText('Not analysed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyse' })).toBeInTheDocument();
  });
});
describe('Game_Viewer with a report', () => {
  it('marks labelled Owner moves and shows the best move when one is selected', async () => {
    const user = userEvent.setup();
    await db.table('chess_games').put(game('g1'));
    await saveReport(report('g1', { labels: [{ ply: 3, label: 'mistake', drop: 12, bestSan: 'd4' }] }));
    renderAt('/chess/games/g1');
    const marked = await screen.findByRole('button', { name: '2. Nf3 (your move), mistake' });
    expect(marked).toHaveTextContent('?');
    expect(screen.queryByTestId('move-label')).toBeNull();
    await user.click(marked);
    expect(screen.getByTestId('move-label')).toHaveTextContent('Mistake. Best move: d4');
    expect(screen.getByRole('button', { name: '1. e4 (your move)' })).toBeInTheDocument();
  });
  it('starts at the position before the move named by ?ply=', async () => {
    await db.table('chess_games').put(game('g1'));
    renderAt('/chess/games/g1?ply=2');
    await screen.findByTestId('mock-board');
    await waitFor(() => expect(screen.getByRole('button', { name: 'e5' }).getAttribute('aria-current')).toBe('step'));
  });
});
describe('Chess Home shortcut', () => {
  it('links to the report of the newest game', async () => {
    await db.table('chess_games').bulkPut([game('g1'), game('g2')]);
    render(
      <MemoryRouter>
        <AnalyseLastGame />
      </MemoryRouter>,
    );
    const link = await screen.findByRole('link', { name: 'Analyse my last game' });
    expect(link.getAttribute('href')).toBe('/chess/analysis/g2');
    await act(async () => undefined);
  });
});
