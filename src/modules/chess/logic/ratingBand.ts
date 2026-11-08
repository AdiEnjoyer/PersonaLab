import { RATING_BANDS } from '../constants';
import type { RatingBand } from '../types';

/** Rating_Band of an integer rating (R40.10). */
export function ratingBand(r: number): RatingBand {
  if (r < 800) return 'below 800';
  if (r >= 2000) return '2000 and above';
  const low = 200 * Math.floor(r / 200);
  return `${low}–${low + 199}` as RatingBand;
}

/** Position of a band in the Glossary order. */
export function bandIndex(band: RatingBand): number {
  return RATING_BANDS.indexOf(band);
}

/** Chess_Rating: the stored Rapid rating while the source is "rapid" and one is stored, else the manual rating (R40.9). */
export function chessRating(i: { source: 'rapid' | 'manual'; rapid?: number | undefined; manual: number }): number {
  return i.source === 'rapid' && i.rapid !== undefined ? i.rapid : i.manual;
}
