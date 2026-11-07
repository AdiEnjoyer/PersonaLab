import { createElement } from 'react';
import { z } from 'zod';
import type { ModuleSettings } from '../../core/registry/types';

/** Full `core_settings` keys of the Chess settings. */
export const CHESS_SETTING_KEYS = {
  username: 'chess.username',
  proxyUrl: 'chess.proxyUrl',
  ratingSource: 'chess.ratingSource',
  manualRating: 'chess.manualRating',
} as const;

/** The username used while the Owner has never stored another one (R40.1). */
export const DEFAULT_CHESS_USERNAME = 'AdiChessLarper';

/**
 * Chess.com username: after leading and trailing whitespace is removed, 3 to 25 characters from
 * A–Z, a–z, 0–9, "_" and "-" (R40.2). The parsed value is the trimmed text with its letter case kept (R40.4).
 */
export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{3,25}$/)
  .describe('Accepted values: 3 to 25 characters, using only letters A–Z, digits 0–9, "_" and "-".');

/** True when `text` parses as an absolute URL. */
function parsesAsUrl(text: string): boolean {
  try {
    new URL(text);
    return true;
  } catch {
    return false;
  }
}

/** CORS_Proxy URL: empty (not configured) or an absolute URL starting with "https://", at most 2048 characters (R5.2). */
export const proxyUrlSchema = z
  .string()
  .max(2048)
  .refine((s) => s === '' || (s.startsWith('https://') && parsesAsUrl(s)))
  .describe('Accepted values: empty, or an address starting with "https://" of at most 2048 characters.');

/** Chess_Rating source: "Chess.com Rapid" or "Manual" (R5.2, R40.9). */
export const ratingSourceSchema = z.enum(['rapid', 'manual']).describe('Accepted values: Chess.com Rapid or Manual.');

/** Manual rating: an integer from 100 to 3000 (R40.8). */
export const manualRatingSchema = z
  .number()
  .int()
  .min(100)
  .max(3000)
  .describe('Accepted values: whole numbers from 100 to 3000.');

export type RatingSource = z.infer<typeof ratingSourceSchema>;

export const chessSettingsSchema = {
  username: usernameSchema,
  proxyUrl: proxyUrlSchema,
  ratingSource: ratingSourceSchema,
  manualRating: manualRatingSchema,
};

export const chessSettingsDefaults: { username: string; proxyUrl: string; ratingSource: RatingSource; manualRating: number } = {
  username: DEFAULT_CHESS_USERNAME,
  proxyUrl: '',
  ratingSource: 'rapid',
  manualRating: 1100,
};

// Placeholder: the Chess settings screen task replaces this section.
function ChessSettingsSection() {
  return createElement('section', { 'aria-label': 'Chess settings' }, createElement('h2', null, 'Chess'));
}

export const chessSettings: ModuleSettings = {
  schema: chessSettingsSchema,
  defaults: chessSettingsDefaults,
  Section: ChessSettingsSection,
};
