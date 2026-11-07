import { createElement } from 'react';
import { z } from 'zod';
import type { ModuleSettings } from '../../core/registry/types';

/** Full `core_settings` keys of the Gym settings. */
export const GYM_SETTING_KEYS = {
  defaultRestSec: 'gym.defaultRestSec',
  restSound: 'gym.restSound',
} as const;

/** Default rest time: an integer from 30 to 600 seconds in 15-second steps (R5.2, R20). */
export const defaultRestSecSchema = z
  .number()
  .int()
  .min(30)
  .max(600)
  .multipleOf(15)
  .describe('Accepted values: 30 to 600 seconds, in steps of 15 seconds.');

/** Rest timer sound on or off (R5.2). */
export const restSoundSchema = z.boolean().describe('Accepted values: on or off.');

export const gymSettingsSchema = {
  defaultRestSec: defaultRestSecSchema,
  restSound: restSoundSchema,
};

export const gymSettingsDefaults: { defaultRestSec: number; restSound: boolean } = {
  defaultRestSec: 90,
  restSound: true,
};

// Placeholder: the Gym settings screen task replaces this section.
function GymSettingsSection() {
  return createElement('section', { 'aria-label': 'Gym settings' }, createElement('h2', null, 'Gym'));
}

export const gymSettings: ModuleSettings = {
  schema: gymSettingsSchema,
  defaults: gymSettingsDefaults,
  Section: GymSettingsSection,
};
