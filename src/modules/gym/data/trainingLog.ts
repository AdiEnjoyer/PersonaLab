import { db } from '../../../core/db/db';
import type { TrainingSessionSummary } from '../../../core/registry/capabilities';
import type { Session } from '../types';
import { GYM_TABLES } from './backup';
/** The `trainingLog` capability: Finished Sessions only (Nutrition, R29.3). */
export async function listFinishedSessions(): Promise<TrainingSessionSummary[]> {
  const finished = await db.table<Session>(GYM_TABLES.sessions).where('status').equals('finished').toArray();
  return finished.flatMap((s) => (s.finishedAt === undefined ? [] : [{ startedAt: s.startedAt, finishedAt: s.finishedAt }]));
}
