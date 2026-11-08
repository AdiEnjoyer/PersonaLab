import { z } from 'zod';
import { AI_LIMITS, CONSISTENCY, FOOD_LIMITS, GEMINI_PROMPT } from '../constants';
import type { MealSlot } from '../types';

/** The `generateContent` request body: the photo, the fixed prompt and the JSON response schema (R36.3). No other Owner data. */
export function buildRequestBody(imageBase64: string): unknown {
  return {
    contents: [
      {
        role: 'user',
        parts: [{ inline_data: { mime_type: 'image/jpeg', data: imageBase64 } }, { text: GEMINI_PROMPT }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          items: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                grams: { type: 'NUMBER' },
                kcal: { type: 'NUMBER' },
                protein_g: { type: 'NUMBER' },
                carbs_g: { type: 'NUMBER' },
                fat_g: { type: 'NUMBER' },
              },
              required: ['name', 'grams', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
            },
          },
          confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
        },
        required: ['items', 'confidence'],
      },
    },
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Joined answer text of the first candidate, leaving out "thought" parts; undefined when there is none (R37.1). */
export function extractText(body: unknown): string | undefined {
  if (!isRecord(body) || !Array.isArray(body['candidates'])) return undefined;
  const first: unknown = body['candidates'][0];
  if (!isRecord(first) || !isRecord(first['content']) || !Array.isArray(first['content']['parts'])) return undefined;
  const texts = (first['content']['parts'] as unknown[]).flatMap((p) => (isRecord(p) && typeof p['text'] === 'string' && p['thought'] !== true ? [p['text']] : []));
  return texts.length === 0 ? undefined : texts.join('');
}

const amount = (max: number) => z.number().finite().min(0).max(max);

/** The accepted answer; unknown keys are stripped (R37.1). */
export const EstimateSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().refine((s) => s.trim().length > 0),
        grams: amount(AI_LIMITS.GRAMS),
        kcal: amount(AI_LIMITS.KCAL),
        protein_g: amount(AI_LIMITS.MACRO),
        carbs_g: amount(AI_LIMITS.MACRO),
        fat_g: amount(AI_LIMITS.MACRO),
      }),
    )
    .min(1)
    .max(AI_LIMITS.ITEMS),
  confidence: z.enum(['low', 'medium', 'high']),
});
export type Estimate = z.infer<typeof EstimateSchema>;

/** Parses and validates the answer text; null when it is missing, not JSON or does not satisfy R37.1. */
export function validateEstimate(text: string | undefined): Estimate | null {
  if (text === undefined) return null;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = EstimateSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export type GeminiErrorKind = 'key-rejected' | 'rate-limited' | 'service';

/** 400, 401, 403: key rejected; 429: rate limit; every other status: service (R37.12 to R37.14). */
export function httpErrorKind(status: number): GeminiErrorKind {
  if (status === 400 || status === 401 || status === 403) return 'key-rejected';
  if (status === 429) return 'rate-limited';
  return 'service';
}

/** Fixed Owner-facing messages; none can contain the key (R36.5, R37.10 to R37.15). */
export const ESTIMATE_MESSAGES = {
  offline: 'You are offline. AI estimates need a connection.',
  'no-key': 'Add your Gemini API key in Settings',
  'key-rejected': 'Your Gemini API key was rejected. Check it in Settings.',
  'rate-limited': 'Free-tier limit reached. Try again later.',
  service: 'The AI service did not respond.',
  unusable: 'The AI returned an unusable answer.',
  'photo-unreadable': 'The photo could not be read.',
} as const;

export interface ReviewItem {
  idemKey: string;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

/** New grams value: kcal and macros scale by new / old when old > 0, otherwise only grams change (R37.3). */
export function setGrams(item: ReviewItem, grams: number): ReviewItem {
  if (!(item.grams > 0)) return { ...item, grams };
  const k = grams / item.grams;
  return { ...item, grams, kcal: item.kcal * k, protein: item.protein * k, carbs: item.carbs * k, fat: item.fat * k };
}

/** kcal differs from 4P + 4C + 9F by more than 20 % of kcal and by more than 50 kcal (R37.5). */
export function consistencyWarning(item: ReviewItem): boolean {
  const d = Math.abs(item.kcal - (4 * item.protein + 4 * item.carbs + 9 * item.fat));
  return d > CONSISTENCY.REL * item.kcal && d > CONSISTENCY.ABS_KCAL;
}

export function reviewTotals(items: readonly ReviewItem[]): { kcal: number; protein: number; carbs: number; fat: number } {
  const t = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const i of items) {
    t.kcal += i.kcal;
    t.protein += i.protein;
    t.carbs += i.carbs;
    t.fat += i.fat;
  }
  return t;
}

export type ReviewField = 'name' | 'grams' | 'kcal' | 'protein' | 'carbs' | 'fat';
export interface Blockers {
  noItems: boolean;
  noSlot: boolean;
  items: Record<string, Partial<Record<ReviewField, string>>>;
  /** True when Save must be disabled. */
  blocked: boolean;
}

const inRange = (v: number, min: number, max: number) => Number.isFinite(v) && v >= min && v <= max;

/** What keeps Save disabled (R37.18). */
export function reviewSaveBlockers(items: readonly ReviewItem[], slot: MealSlot | undefined): Blockers {
  const out: Blockers = { noItems: items.length === 0, noSlot: slot === undefined, items: {}, blocked: false };
  for (const i of items) {
    const e: Partial<Record<ReviewField, string>> = {};
    const name = i.name.trim();
    if (name === '' || name.length > FOOD_LIMITS.NAME) e.name = `Enter a name of 1 to ${FOOD_LIMITS.NAME} characters.`;
    if (!inRange(i.grams, AI_LIMITS.REVIEW_GRAMS_MIN, AI_LIMITS.REVIEW_GRAMS_MAX)) e.grams = 'Grams: 1 to 5000.';
    if (!inRange(i.kcal, 0, AI_LIMITS.KCAL)) e.kcal = 'Energy: 0 to 5000 kcal.';
    if (!inRange(i.protein, 0, AI_LIMITS.MACRO)) e.protein = 'Protein: 0 to 500 g.';
    if (!inRange(i.carbs, 0, AI_LIMITS.MACRO)) e.carbs = 'Carbs: 0 to 500 g.';
    if (!inRange(i.fat, 0, AI_LIMITS.MACRO)) e.fat = 'Fat: 0 to 500 g.';
    if (Object.keys(e).length > 0) out.items[i.idemKey] = e;
  }
  out.blocked = out.noItems || out.noSlot || Object.keys(out.items).length > 0;
  return out;
}

/** Review items from an accepted answer, each with its own Idempotency_Key (R37.8). */
export function reviewItemsFrom(estimate: Estimate, newKey: () => string): ReviewItem[] {
  return estimate.items.map((i) => ({ idemKey: newKey(), name: i.name, grams: i.grams, kcal: i.kcal, protein: i.protein_g, carbs: i.carbs_g, fat: i.fat_g }));
}
