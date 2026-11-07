import { createElement } from 'react';
import { z } from 'zod';
import { isMultipleOfStep } from '../../core/math/decimal';
import type { ModuleSettings } from '../../core/registry/types';

/** Full `core_settings` keys of the Nutrition settings. */
export const NUTRITION_SETTING_KEYS = {
  trainingOverride: 'nutrition.trainingOverride',
  goalAdjust: 'nutrition.goalAdjust',
  proteinFactor: 'nutrition.proteinFactor',
} as const;

/**
 * True when the shortest decimal form of `value` (`String(value)`) is an exact multiple of `step`, so that a
 * float such as 0.1 + 0.2 = 0.30000000000000004 is not taken for 0.3. Only for non-negative values.
 */
function onDecimalStep(value: number, step: number): boolean {
  return isMultipleOfStep(String(value), step);
}

/** Manual training hours: 0 to 40 h in 0.5 h steps (R5.2). */
const overrideHoursSchema = z.number().min(0).max(40).refine((v) => onDecimalStep(v, 0.5));

/** Manual training-hours override: an on/off switch plus 0 to 40 h in 0.5 h steps (R5.2). */
export const trainingOverrideSchema = z
  .strictObject({ enabled: z.boolean(), hours: overrideHoursSchema })
  .describe('Accepted values: on or off, with 0 to 40 hours in steps of 0.5 hours.');

/** One goal adjustment: a multiple of 50 kcal from −1000 to +1000 kcal (R30.2). */
const adjustmentSchema = z.number().int().min(-1000).max(1000).refine((v) => v % 50 === 0);

/** Goal adjustment per goal (R30.1, R30.2). */
export const goalAdjustSchema = z
  .strictObject({ cut: adjustmentSchema, maintain: adjustmentSchema, bulk: adjustmentSchema })
  .describe('Accepted values: −1000 to +1000 kcal, in steps of 50 kcal.');

/** One protein factor: "goal default" or 1.6 to 2.2 g/kg in 0.1 steps (R5.2, R30.2). */
const factorSchema = z.union([
  z.literal('default'),
  z.number().min(1.6).max(2.2).refine((v) => onDecimalStep(v, 0.1)),
]);

/** Protein factor per goal (R30.2, R30.5). */
export const proteinFactorSchema = z
  .strictObject({ cut: factorSchema, maintain: factorSchema, bulk: factorSchema })
  .describe('Accepted values: goal default, or 1.6 to 2.2 g/kg in steps of 0.1 g/kg.');

export type TrainingOverride = z.infer<typeof trainingOverrideSchema>;
export type GoalAdjust = z.infer<typeof goalAdjustSchema>;
export type ProteinFactorSetting = z.infer<typeof proteinFactorSchema>;

export const nutritionSettingsSchema = {
  trainingOverride: trainingOverrideSchema,
  goalAdjust: goalAdjustSchema,
  proteinFactor: proteinFactorSchema,
};

export const nutritionSettingsDefaults: {
  trainingOverride: TrainingOverride;
  goalAdjust: GoalAdjust;
  proteinFactor: ProteinFactorSetting;
} = {
  trainingOverride: { enabled: false, hours: 0 },
  goalAdjust: { cut: -500, maintain: 0, bulk: 300 },
  proteinFactor: { cut: 'default', maintain: 'default', bulk: 'default' },
};

// Placeholder: the Nutrition settings screen task replaces this section.
function NutritionSettingsSection() {
  return createElement('section', { 'aria-label': 'Nutrition settings' }, createElement('h2', null, 'Nutrition'));
}

export const nutritionSettings: ModuleSettings = {
  schema: nutritionSettingsSchema,
  defaults: nutritionSettingsDefaults,
  Section: NutritionSettingsSection,
};
