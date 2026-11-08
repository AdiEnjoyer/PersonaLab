import type { ImageRecord } from '../../../core/backup/base64';
import { db } from '../../../core/db/db';
import { stripUndefined } from '../../../core/db/strip';
import { write } from '../../../core/db/write';
import { newId } from '../../../core/ids';
import type { ProcessedImage } from '../../../core/image/processImage';
import { getSecret, SECRET_KEYS } from '../../../core/settings/secrets';
import type { LocalDate } from '../../../core/time/localDate';
import type { ReviewItem } from '../logic/gemini';
import type { FoodEntry, MealSlot, NutritionStateRecord } from '../types';
import { NUTRITION_TABLES } from './backup';

/** The stored Gemini_Key, or undefined. Only used to build a request header. */
export const readGeminiKey = () => getSecret(SECRET_KEYS.geminiKey);

const state = () => db.table<NutritionStateRecord, string>(NUTRITION_TABLES.state);

/** Whether the free-tier data warning was acknowledged (R36.7). */
export async function readAiWarningAck(): Promise<boolean> {
  return (await state().get('aiWarningAck')) !== undefined;
}

export async function setAiWarningAck(now = Date.now()): Promise<void> {
  await write([NUTRITION_TABLES.state], () => state().put({ key: 'aiWarningAck', value: now }));
}

export interface EstimateThumbnail {
  imageId: string;
  image: ProcessedImage;
}

/**
 * Creates one Food_Entry per item and stores the shared thumbnail, in one transaction (R37.7). Every item keeps
 * its own Idempotency_Key: when any key already exists the earlier attempt is complete (the transaction is
 * atomic) and nothing is written again (R37.8). Returns whether this call created the entries.
 */
export async function saveEstimate(
  items: readonly ReviewItem[],
  ctx: { date: LocalDate; slot: MealSlot; confidence: 'low' | 'medium' | 'high'; thumbnail: EstimateThumbnail; now?: number },
): Promise<boolean> {
  const now = ctx.now ?? Date.now();
  const { imageId, image } = ctx.thumbnail;
  const entries: FoodEntry[] = items.map((i) => ({
    id: newId(),
    idemKey: i.idemKey,
    date: ctx.date,
    slot: ctx.slot,
    name: i.name.trim(),
    kcal: i.kcal,
    protein: i.protein,
    carbs: i.carbs,
    fat: i.fat,
    grams: i.grams,
    source: 'ai',
    confidence: ctx.confidence,
    thumbnail: { imageId, blurhash: image.blurhash, width: image.width, height: image.height },
    createdAt: now,
  }));
  const record: ImageRecord = { id: imageId, mime: image.mime, bytes: image.bytes, width: image.width, height: image.height };
  return write([NUTRITION_TABLES.foodEntries, NUTRITION_TABLES.images], async () => {
    const keys = entries.map((e) => e.idemKey);
    if ((await db.table<FoodEntry>(NUTRITION_TABLES.foodEntries).where('idemKey').anyOf(keys).count()) > 0) return false;
    await db.table<ImageRecord>(NUTRITION_TABLES.images).put(record);
    await db.table<FoodEntry>(NUTRITION_TABLES.foodEntries).bulkAdd(stripUndefined(entries));
    return true;
  });
}
