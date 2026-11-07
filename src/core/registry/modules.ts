import { gymModule } from '../../modules/gym';
import { nutritionModule } from '../../modules/nutrition';
import { chessModule } from '../../modules/chess';
import type { ModuleDefinition } from './types';

/**
 * THE Module_Registry (R2.2): Gym, Nutrition and Chess, in that order. Module order everywhere in the app
 * is this list's order (R2.3). This is the only core file allowed to import from `src/modules` (R2.8).
 */
export const MODULES: readonly ModuleDefinition[] = [gymModule, nutritionModule, chessModule];
