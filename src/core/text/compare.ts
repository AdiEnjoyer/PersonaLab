import { fold } from './fold';

/**
 * Compare two strings by their folded forms using code-unit order.
 * Returns −1, 0 or 1, so it can be passed to `Array.prototype.sort`.
 */
export const compareFolded = (a: string, b: string): -1 | 0 | 1 => {
  const fa = fold(a);
  const fb = fold(b);
  return fa < fb ? -1 : fa > fb ? 1 : 0;
};
