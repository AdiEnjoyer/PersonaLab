import { decFromEnteredText, decOnGrid } from './decimal';

/**
 * Oracle for Property 5: which entered Profile forms R4.2 accepts. A typed field is accepted when its trimmed
 * text is a non-negative decimal (`.` or `,` separator) whose exact value lies in the inclusive range and is a
 * multiple of the step. Independent of production code.
 */
const NUMERIC_RULES = {
  age: { min: '13', max: '100', step: '1' },
  heightCm: { min: '100', max: '250', step: '1' },
  weightKg: { min: '30', max: '300', step: '0.1' },
  weeklyTrainingHours: { min: '0', max: '40', step: '0.5' },
} as const;

const OPTIONS = {
  sex: ['male', 'female'],
  goal: ['cut', 'maintain', 'bulk'],
} as const;

export type OracleProfileTexts = Record<'age' | 'sex' | 'heightCm' | 'weightKg' | 'weeklyTrainingHours' | 'goal', string>;

export type OracleProfileResult =
  | { ok: true; values: { age: number; sex: string; heightCm: number; weightKg: number; weeklyTrainingHours: number; goal: string } }
  | { ok: false; invalid: string[] };

export function profileOracle(texts: OracleProfileTexts): OracleProfileResult {
  const invalid: string[] = [];
  for (const [field, rule] of Object.entries(NUMERIC_RULES)) {
    const value = decFromEnteredText(texts[field as keyof typeof NUMERIC_RULES]);
    if (value === null || !decOnGrid(value, rule.min, rule.max, rule.step)) invalid.push(field);
  }
  for (const [field, options] of Object.entries(OPTIONS)) {
    if (!(options as readonly string[]).includes(texts[field as keyof typeof OPTIONS])) invalid.push(field);
  }
  if (invalid.length > 0) return { ok: false, invalid: invalid.sort() };
  const num = (text: string) => Number(text.trim().replace(',', '.'));
  return {
    ok: true,
    values: {
      age: num(texts.age),
      sex: texts.sex,
      heightCm: num(texts.heightCm),
      weightKg: num(texts.weightKg),
      weeklyTrainingHours: num(texts.weeklyTrainingHours),
      goal: texts.goal,
    },
  };
}
