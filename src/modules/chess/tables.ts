/** Chess tables, database version 1. Stored as `chess_${short}` (R2.6). */
export const chessTables = {
  games: '&id, endTime, syncedFor',
  syncState: '&username',
  ratings: '&id',
  puzzleAttempts: '&id, &idemKey, puzzleId, ts',
  puzzleRating: '&id',
  trees: '&id, colour, createdAt',
  srs: '&posKey, due',
  reviews: '&id, posKey, date',
  tipState: '&id',
  evals: '&[gameId+depth+version+ply], gameId',
  reports: '&gameId',
} as const satisfies Record<string, string>;
