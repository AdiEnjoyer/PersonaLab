/**
 * Fold text for search and sorting: decompose (NFD), drop every combining
 * mark (`\p{M}`, which also removes Hebrew niqqud) and lower-case.
 * Deterministic across Node and Safari, unlike `Intl.Collator`.
 */
export const fold = (s: string): string => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
