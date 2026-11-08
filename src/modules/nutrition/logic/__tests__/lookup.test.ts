import { describe, expect, it } from 'vitest';
import { GEMINI_PROMPT } from '../../constants';
import { gs1CheckDigit, normaliseBarcode, validateTyped } from '../barcode';
import {
  buildRequestBody,
  consistencyWarning,
  extractText,
  httpErrorKind,
  reviewSaveBlockers,
  reviewTotals,
  setGrams,
  validateEstimate,
  type ReviewItem,
} from '../gemini';
import { classifyOffResponse, mapOffProduct, needsManualForm, parseNutrient, validateProductForm, EMPTY_PRODUCT_FORM } from '../off';
import { validateGrams, validateServings } from '../portion';

describe('typed barcodes', () => {
  it('accepts EAN-13 (with spaces and hyphens), UPC-A, EAN-8 and UPC-E and normalises them', () => {
    expect(validateTyped('3017620422003')).toEqual({ ok: true, format: 'EAN_13', normalised: '3017620422003' });
    expect(validateTyped('3017-6204 22003')).toMatchObject({ ok: true, normalised: '3017620422003' });
    expect(validateTyped('036000291452')).toEqual({ ok: true, format: 'UPC_A', normalised: '0036000291452' });
    expect(validateTyped('96385074')).toEqual({ ok: true, format: 'EAN_8', normalised: '96385074' });
    // 01234565 is also a valid EAN-8, which wins (R33.5). 04252614 is only valid as UPC-E (042100005264).
    expect(validateTyped('01234565')).toMatchObject({ ok: true, format: 'EAN_8' });
    expect(validateTyped('04252614')).toEqual({ ok: true, format: 'UPC_E', normalised: '0042100005264' });
    expect(normaliseBarcode('04252614', 'UPC_E')).toBe('0042100005264');
  });
  it('names the failed check', () => {
    expect(validateTyped('30176204x2003')).toEqual({ ok: false, reason: 'characters' });
    expect(validateTyped('301762042200')).toMatchObject({ ok: false, reason: 'check-digit' });
    expect(validateTyped('123456789')).toEqual({ ok: false, reason: 'length' });
    expect(validateTyped('3017620422004')).toEqual({ ok: false, reason: 'check-digit' });
    expect(gs1CheckDigit('301762042200')).toBe(3);
  });
});

describe('Open Food Facts mapping', () => {
  it('reads nested and flat keys, trims, and rejects invalid values', () => {
    const nested = mapOffProduct({ product_name: '  Nutella ', brands: ' Ferrero ', serving_quantity: '15', nutriments: { 'energy-kcal_100g': 539, proteins_100g: '6.3', carbohydrates_100g: 57.5, fat_100g: 30.9 } });
    expect(nested).toEqual({ name: 'Nutella', brand: 'Ferrero', servingQuantity: 15, kcalPer100: 539, proteinPer100: 6.3, carbsPer100: 57.5, fatPer100: 30.9 });
    expect(mapOffProduct({ product_name: 'X', 'energy-kcal_100g': 100, fat_100g: 5 })).toEqual({ name: 'X', kcalPer100: 100, fatPer100: 5 });
    expect(mapOffProduct({ product_name: ' ', brands: 3, serving_quantity: 0, proteins_100g: 120, fat_100g: -1, carbohydrates_100g: '1,5' })).toEqual({});
  });
  it('falls back to kJ / 4.184 when kcal is missing or above 1000', () => {
    expect(mapOffProduct({ 'energy-kj_100g': 2092 }).kcalPer100).toBeCloseTo(500, 10);
    expect(mapOffProduct({ 'energy-kcal_100g': 1001, 'energy-kj_100g': '1000' }).kcalPer100).toBeCloseTo(1000 / 4.184, 10);
    expect(mapOffProduct({ 'energy-kj_100g': 4185 }).kcalPer100).toBeUndefined();
    expect(mapOffProduct({ 'energy-kj_100g': 4184 }).kcalPer100).toBeLessThanOrEqual(1000);
  });
  it('never throws and parses nutrients strictly', () => {
    for (const v of [null, 1, 'x', [], undefined, { nutriments: 5 }]) expect(() => mapOffProduct(v)).not.toThrow();
    expect(parseNutrient('')).toBeUndefined();
    expect(parseNutrient(' 12.5 ')).toBe(12.5);
    expect(parseNutrient('1e3')).toBeUndefined();
    expect(parseNutrient(Infinity)).toBeUndefined();
  });
  it('classifies responses and decides when the manual form is needed', () => {
    expect(classifyOffResponse(200, { status: 1, product: { product_name: 'A', 'energy-kcal_100g': 1 } }).kind).toBe('found');
    expect(classifyOffResponse(404, { status: 0 }).kind).toBe('not-found');
    expect(classifyOffResponse(200, { status: 0 }).kind).toBe('not-found');
    expect(classifyOffResponse(500, 'oops').kind).toBe('unreadable');
    expect(needsManualForm({ name: 'A' })).toBe(true);
    expect(needsManualForm({ kcalPer100: 1 })).toBe(true);
    expect(needsManualForm({ name: 'A', kcalPer100: 0 })).toBe(false);
  });
  it('validates the manual product form', () => {
    expect(validateProductForm({ ...EMPTY_PRODUCT_FORM, name: ' Oats ', kcal: '370', protein: '13', serving: '40' })).toEqual({ ok: true, fields: { name: 'Oats', kcalPer100: 370, proteinPer100: 13, servingQuantity: 40 } });
    const bad = validateProductForm({ ...EMPTY_PRODUCT_FORM, name: '', kcal: '1001', fat: '101', serving: '0' });
    expect(bad).toMatchObject({ ok: false });
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['fat', 'kcal', 'name', 'serving']);
  });
});

describe('portion input validation', () => {
  it('accepts grams 1 to 5000 with one decimal and servings in quarters within range', () => {
    expect(validateGrams('1')).toEqual({ ok: true, grams: 1 });
    expect(validateGrams('5000')).toEqual({ ok: true, grams: 5000 });
    for (const t of ['', '0.9', '5000.1', '12.25', 'abc', '1,5']) expect(validateGrams(t).ok, t).toBe(false);
    expect(validateServings('1.5', 30)).toEqual({ ok: true, grams: 45 });
    for (const t of ['0', '0.2', '20.25', '1.3', '']) expect(validateServings(t, 30).ok, t).toBe(false);
    expect(validateServings('0.25', 1).ok).toBe(false); // 0.25 g
    expect(validateServings('20', 300).ok).toBe(false); // 6000 g
  });
});

describe('Gemini estimate', () => {
  const answer = { items: [{ name: 'Rice', grams: 150, kcal: 200, protein_g: 4, carbs_g: 44, fat_g: 0.5, extra: 1 }], confidence: 'medium' };
  it('accepts exactly the valid answers', () => {
    expect(validateEstimate(JSON.stringify(answer))?.items[0]).not.toHaveProperty('extra');
    expect(validateEstimate(undefined)).toBeNull();
    expect(validateEstimate('not json')).toBeNull();
    const bad = (patch: object) => validateEstimate(JSON.stringify({ ...answer, items: [{ ...answer.items[0], ...patch }] }));
    expect(bad({ name: '  ' })).toBeNull();
    expect(bad({ grams: 3001 })).toBeNull();
    expect(bad({ kcal: 5001 })).toBeNull();
    expect(bad({ fat_g: 501 })).toBeNull();
    expect(bad({ protein_g: -1 })).toBeNull();
    expect(bad({ carbs_g: '4' })).toBeNull();
    expect(bad({ grams: 3000, kcal: 5000, fat_g: 500 })).not.toBeNull();
    expect(validateEstimate(JSON.stringify({ ...answer, items: [] }))).toBeNull();
    expect(validateEstimate(JSON.stringify({ ...answer, items: Array(21).fill(answer.items[0]) }))).toBeNull();
    expect(validateEstimate(JSON.stringify({ ...answer, confidence: 'certain' }))).toBeNull();
  });
  it('extracts the text parts that are not thoughts', () => {
    const body = { candidates: [{ content: { parts: [{ text: 'hidden', thought: true }, { text: '{"a"' }, { text: ':1}' }] } }] };
    expect(extractText(body)).toBe('{"a":1}');
    expect(extractText({ candidates: [] })).toBeUndefined();
    expect(extractText(null)).toBeUndefined();
  });
  it('maps HTTP statuses', () => {
    for (const s of [400, 401, 403]) expect(httpErrorKind(s)).toBe('key-rejected');
    expect(httpErrorKind(404)).toBe('model-not-found');
    expect(httpErrorKind(429)).toBe('rate-limited');
    for (const s of [408, 500, 503, 302]) expect(httpErrorKind(s)).toBe('service');
  });
  it('builds a request with the photo, the prompt and the schema, and nothing else', () => {
    const body = buildRequestBody('QUJD') as { contents: { parts: unknown[] }[]; generationConfig: { responseSchema: { required: string[] } } };
    expect(body.contents[0]?.parts).toEqual([{ inline_data: { mime_type: 'image/jpeg', data: 'QUJD' } }, { text: GEMINI_PROMPT }]);
    expect(body.generationConfig.responseSchema.required).toEqual(['items', 'confidence']);
  });
});

describe('review logic', () => {
  const item: ReviewItem = { idemKey: 'k', name: 'Rice', grams: 100, kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 };
  it('rescales on grams edits unless the old grams are 0', () => {
    expect(setGrams(item, 250)).toMatchObject({ grams: 250, kcal: 325 });
    expect(setGrams({ ...item, grams: 0 }, 250)).toMatchObject({ grams: 250, kcal: 130, fat: 0.3 });
  });
  it('warns when kcal deviates from the macros by more than 20 % and 50 kcal', () => {
    expect(consistencyWarning(item)).toBe(false);
    expect(consistencyWarning({ ...item, kcal: 400 })).toBe(true);
    expect(consistencyWarning({ ...item, kcal: 40, protein: 0, carbs: 0, fat: 0 })).toBe(false); // 40 kcal off is not > 50
    expect(consistencyWarning({ ...item, kcal: 200, protein: 0, carbs: 0, fat: 0 })).toBe(true);
  });
  it('totals and blockers', () => {
    expect(reviewTotals([item, item]).kcal).toBe(260);
    expect(reviewSaveBlockers([item], 'lunch').blocked).toBe(false);
    expect(reviewSaveBlockers([item], undefined)).toMatchObject({ noSlot: true, blocked: true });
    expect(reviewSaveBlockers([], 'lunch')).toMatchObject({ noItems: true, blocked: true });
    const b = reviewSaveBlockers([{ ...item, name: ' ', grams: 0, kcal: 5001, fat: 501 }], 'lunch');
    expect(Object.keys(b.items['k'] ?? {}).sort()).toEqual(['fat', 'grams', 'kcal', 'name']);
  });
});
