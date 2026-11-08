import type Dexie from 'dexie';
import { db as appDb } from '../../../core/db/db';
import { stripUndefined } from '../../../core/db/strip';
import { write } from '../../../core/db/write';
import { ANALYSER_VERSION, ANALYSIS_DEPTH } from '../constants';
import { patternReport, type PatternInput, type PatternOutput, type PatternReportEntry } from '../logic/analysis/patterns';
import type { GameReport } from '../logic/analysis/report';
import type { EvalRecord, GameRecord } from '../types';
import { CHESS_TABLES } from './backup';
const evalsOf = (d: Dexie) => d.table<EvalRecord, [string, number, number, number]>(CHESS_TABLES.evals);
const reportsOf = (d: Dexie) => d.table<GameReport, string>(CHESS_TABLES.reports);
/** True when a stored report was made with another depth or analyser version (R60.3). */
export const isOutdated = (r: { depth: number; version: number }): boolean => r.depth !== ANALYSIS_DEPTH || r.version !== ANALYSER_VERSION;
/** Current-depth, current-version evaluations of a game by position index (R60.1). */
export async function readEvals(gameId: string, database: Dexie = appDb): Promise<Map<number, EvalRecord>> {
  const rows = await evalsOf(database)
    .where('gameId')
    .equals(gameId)
    .filter((e) => e.depth === ANALYSIS_DEPTH && e.version === ANALYSER_VERSION)
    .toArray();
  return new Map(rows.map((e) => [e.ply, e]));
}
/** Stores one evaluation before the next position is searched (R60.4). The key makes a repeated write harmless. */
export async function saveEval(record: EvalRecord, database: Dexie = appDb): Promise<void> {
  await write([CHESS_TABLES.evals], () => evalsOf(database).put(stripUndefined(record)), database);
}
/**
 * Stores the finished report and, in the same transaction, deletes the game's evaluations of another depth or
 * version, so a game keeps at most one report (R60.3).
 */
export async function saveReport(report: GameReport, database: Dexie = appDb): Promise<void> {
  await write(
    [CHESS_TABLES.reports, CHESS_TABLES.evals],
    async () => {
      await reportsOf(database).put(stripUndefined(report));
      await evalsOf(database)
        .where('gameId')
        .equals(report.gameId)
        .filter((e) => e.depth !== report.depth || e.version !== report.version)
        .delete();
    },
    database,
  );
}
export const readReport = async (gameId: string, database: Dexie = appDb): Promise<GameReport | undefined> => reportsOf(database).get(gameId);
export const readReports = (database: Dexie = appDb): Promise<GameReport[]> => reportsOf(database).toArray();
export interface ReportSummary {
  gameId: string;
  depth: number;
  version: number;
  outdated: boolean;
  counts: GameReport['counts'];
}
/** Report summaries by game id, for the list (R60.3). */
export async function readReportSummaries(database: Dexie = appDb): Promise<Map<string, ReportSummary>> {
  const out = new Map<string, ReportSummary>();
  await reportsOf(database).each((r) => {
    out.set(r.gameId, { gameId: r.gameId, depth: r.depth, version: r.version, outdated: isOutdated(r), counts: r.counts });
  });
  return out;
}
/** The Pattern_Report from the cached reports (R59); reports of games that no longer exist are left out. */
export async function readPatternReport(scope: PatternInput['scope'], timeClass: string, database: Dexie = appDb): Promise<PatternOutput> {
  const [reports, games] = await Promise.all([readReports(database), database.table<GameRecord, string>(CHESS_TABLES.games).toArray()]);
  const byId = new Map(games.map((g) => [g.id, g]));
  const entries: PatternReportEntry[] = [];
  for (const r of reports) {
    const g = byId.get(r.gameId);
    if (g === undefined) continue;
    entries.push({
      gameId: g.id,
      endTime: g.endTime,
      timeClass: g.timeClass,
      ownerResult: g.ownerResult,
      detections: (r.detections ?? []).map((d) => ({ detector: d.detector, fullMove: d.fullMove })),
    });
  }
  return patternReport({ reports: entries, scope, timeClass });
}
