import { db } from '../../../core/db/db';
import { write } from '../../../core/db/write';
import type { LocalDate } from '../../../core/time/localDate';
import type { NutritionStateRecord } from '../types';
import { NUTRITION_TABLES } from './backup';

const table = () => db.table<NutritionStateRecord, string>(NUTRITION_TABLES.state);

/** Burn_Offset in whole kcal; 0 when unset (R39.9). */
export async function readBurnOffset(): Promise<number> {
  const r = await table().get('burnOffset');
  return r?.key === 'burnOffset' ? r.value : 0;
}

/** Last day of the Ignore period of the burn suggestion, if any (R39.10). */
export async function readIgnoreUntil(): Promise<LocalDate | undefined> {
  const r = await table().get('trendIgnoreUntil');
  return r?.key === 'trendIgnoreUntil' ? r.value : undefined;
}

/** Replaces the Burn_Offset (R39.9, R39.11). */
export async function setBurnOffset(value: number): Promise<void> {
  await write([NUTRITION_TABLES.state], () => table().put({ key: 'burnOffset', value }));
}

export async function setIgnoreUntil(date: LocalDate): Promise<void> {
  await write([NUTRITION_TABLES.state], () => table().put({ key: 'trendIgnoreUntil', value: date }));
}