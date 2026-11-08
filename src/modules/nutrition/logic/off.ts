import { OFF } from '../constants';

/** A product as read from Open Food Facts or the manual form; `undefined` means missing. */
export interface ProductFields {
  name?: string;
  brand?: string;
  kcalPer100?: number;
  proteinPer100?: number;
  carbsPer100?: number;
  fatPer100?: number;
  servingQuantity?: number;
}

const DECIMAL = /^\s*\d+(\.\d+)?\s*$/;

/** A nutrient value: a finite number >= 0, or a string that is a full decimal with "." (R34.5). Anything else is missing. */
export function parseNutrient(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0 ? v : undefined;
  if (typeof v === 'string' && DECIMAL.test(v)) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function trimOrUndefined(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t === '' ? undefined : t;
}

const cap = (v: number | undefined, max: number): number | undefined => (v !== undefined && v <= max ? v : undefined);

/** Serving size in grams: finite and > 0, from a number or a numeric string (R34.3). */
export function parseServingQuantity(v: unknown): number | undefined {
  const n = parseNutrient(v);
  return n !== undefined && n > 0 ? n : undefined;
}

/**
 * Maps an Open Food Facts `product` object (any JSON value) to product fields (R34.3 to R34.5). Values are read from
 * `product.nutriments[key]` and, failing that, from the flat `product[key]`. Never throws.
 */
export function mapOffProduct(product: unknown): ProductFields {
  if (!isRecord(product)) return {};
  const nutriments = isRecord(product['nutriments']) ? product['nutriments'] : {};
  const read = (key: string): unknown => nutriments[key] ?? product[key];
  const out: ProductFields = {};
  const name = trimOrUndefined(product['product_name']);
  const brand = trimOrUndefined(product['brands']);
  if (name !== undefined) out.name = name;
  if (brand !== undefined) out.brand = brand;
  let kcal = cap(parseNutrient(read('energy-kcal_100g')), OFF.MAX_KCAL);
  if (kcal === undefined) {
    const kj = cap(parseNutrient(read('energy-kj_100g')), OFF.MAX_KJ);
    // 4184 / 4.184 can land a hair above 1000 in floating point.
    if (kj !== undefined) kcal = Math.min(OFF.MAX_KCAL, kj / OFF.KJ_PER_KCAL);
  }
  const protein = cap(parseNutrient(read('proteins_100g')), OFF.MAX_MACRO);
  const carbs = cap(parseNutrient(read('carbohydrates_100g')), OFF.MAX_MACRO);
  const fat = cap(parseNutrient(read('fat_100g')), OFF.MAX_MACRO);
  const serving = parseServingQuantity(product['serving_quantity']);
  if (kcal !== undefined) out.kcalPer100 = kcal;
  if (protein !== undefined) out.proteinPer100 = protein;
  if (carbs !== undefined) out.carbsPer100 = carbs;
  if (fat !== undefined) out.fatPer100 = fat;
  if (serving !== undefined) out.servingQuantity = serving;
  return out;
}

export type OffOutcome = { kind: 'found'; fields: ProductFields } | { kind: 'not-found' } | { kind: 'unreadable' };

/** HTTP status and parsed body to an outcome (R34.6, R34.7, R34.11). */
export function classifyOffResponse(status: number, body: unknown): OffOutcome {
  if (isRecord(body) && body['status'] === 1 && isRecord(body['product'])) return { kind: 'found', fields: mapOffProduct(body['product']) };
  if (status === 404 || (isRecord(body) && body['status'] === 0)) return { kind: 'not-found' };
  return { kind: 'unreadable' };
}

/** The manual product form opens when the name or kcal per 100 g is missing (R34.8). */
export const needsManualForm = (fields: ProductFields): boolean => fields.kcalPer100 === undefined || fields.name === undefined;

export interface ProductFormText {
  name: string;
  brand: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  serving: string;
}
export type ProductFormErrors = Partial<Record<keyof ProductFormText, string>>;

export const EMPTY_PRODUCT_FORM: Readonly<ProductFormText> = { name: '', brand: '', kcal: '', protein: '', carbs: '', fat: '', serving: '' };

/** Form text for the fields already known. */
export function productFormFromFields(f: ProductFields): ProductFormText {
  const s = (n: number | undefined) => (n === undefined ? '' : String(n));
  return { name: f.name ?? '', brand: f.brand ?? '', kcal: s(f.kcalPer100), protein: s(f.proteinPer100), carbs: s(f.carbsPer100), fat: s(f.fatPer100), serving: s(f.servingQuantity) };
}

/** Validates the manual product form (R34.15). Optional values may be empty; entered values must be valid. */
export function validateProductForm(form: ProductFormText): { ok: true; fields: ProductFields & { name: string; kcalPer100: number } } | { ok: false; errors: ProductFormErrors } {
  const errors: ProductFormErrors = {};
  const name = form.name.trim();
  if (name === '' || name.length > 100) errors.name = 'Enter a name of 1 to 100 characters.';
  const kcal = parseNutrient(form.kcal);
  if (kcal === undefined || kcal > OFF.MAX_KCAL) errors.kcal = 'Enter kcal per 100 g from 0 to 1000.';
  const optional = (text: string, max: number, key: 'protein' | 'carbs' | 'fat'): number | undefined => {
    if (text.trim() === '') return undefined;
    const n = parseNutrient(text);
    if (n === undefined || n > max) {
      errors[key] = 'Enter a value from 0 to 100 g per 100 g, or leave empty.';
      return undefined;
    }
    return n;
  };
  const protein = optional(form.protein, OFF.MAX_MACRO, 'protein');
  const carbs = optional(form.carbs, OFF.MAX_MACRO, 'carbs');
  const fat = optional(form.fat, OFF.MAX_MACRO, 'fat');
  let serving: number | undefined;
  if (form.serving.trim() !== '') {
    serving = parseServingQuantity(form.serving);
    if (serving === undefined) errors.serving = 'Enter a serving size greater than 0 g, or leave empty.';
  }
  if (Object.keys(errors).length > 0 || kcal === undefined) return { ok: false, errors };
  const fields: ProductFields & { name: string; kcalPer100: number } = { name, kcalPer100: kcal };
  const brand = form.brand.trim();
  if (brand !== '') fields.brand = brand;
  if (protein !== undefined) fields.proteinPer100 = protein;
  if (carbs !== undefined) fields.carbsPer100 = carbs;
  if (fat !== undefined) fields.fatPer100 = fat;
  if (serving !== undefined) fields.servingQuantity = serving;
  return { ok: true, fields };
}
