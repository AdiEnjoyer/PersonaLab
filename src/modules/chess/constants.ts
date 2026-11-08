export const RATING_BANDS = ['below 800', '800–999', '1000–1199', '1200–1399', '1400–1599', '1600–1799', '1800–1999', '2000 and above'] as const;
export const TOPICS = ['opening', 'tactics', 'strategy', 'endgame', 'time management', 'calculation', 'psychology'] as const;
export const DETECTOR_IDS = [
  'hanging-piece',
  'missed-opponent-fork',
  'missed-opponent-mate',
  'missed-own-tactic',
  'delayed-castling',
  'early-queen',
  'endgame-technique',
  'time-pressure',
] as const;
export const DETECTOR_THEMES = {
  'hanging-piece': ['hangingPiece'],
  'missed-opponent-fork': ['fork'],
  'missed-opponent-mate': ['mateIn1', 'mateIn2'],
  'missed-own-tactic': ['fork', 'pin', 'skewer', 'discoveredAttack'],
  'endgame-technique': ['endgame'],
} as const;
export const CHESSCOM = {
  BASE: 'https://api.chess.com',
  TIMEOUT_MS: 15_000,
  RETRY_WAITS_MS: [1000, 2000, 4000],
  RATINGS_MAX_AGE_MS: 3_600_000,
  GAMES_MAX_AGE_MS: 6 * 3_600_000,
  MONTH_COMPLETE_GRACE_MS: 86_400_000,
} as const;
export const GLICKO = { SCALE: 173.7178, TAU: 0.5, EPS: 0.000001, MAX_ITER: 100, INIT_RD: 350, INIT_VOL: 0.06, RD_MIN: 60, RD_MAX: 350, PROVISIONAL_RD: 110 };
export const SM2 = { E_INIT: 250, E_MIN: 130, INTERVAL_CAP: 36_500, NEW_PER_DAY: 10, MASTERY_DAYS: 21 };
export const ANALYSIS_DEPTH = 12;
export const ANALYSER_VERSION = 1;
export const ENGINE = { READY_TIMEOUT_MS: 10_000, MOVE_TIMEOUT_MS: 60_000, STOP_TIMEOUT_MS: 1_000, HASH_MB: 16 };
export const WIN_K = 0.00368208;
export const CLASS_THRESHOLDS = { inaccuracy: 5, mistake: 10, blunder: 15 };
export const MATE_CP = 10_000;
export const TACTIC_MIN_GAIN_CP = 200;
export const PHASE = { ENDGAME_MAX_MINORS_MAJORS: 6, OPENING_MAX_FULLMOVE: 12 };
export const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
export const PATTERN = {
  MIN_GAMES: 5,
  MIN_SHARE: 25,
  MIN_NUMERATOR: 3,
  BUCKETS: [
    [1, 10],
    [11, 20],
    [21, 30],
    [31, Infinity],
  ],
};
export const PUZZLE = { OPPONENT_DELAY_MS: 300, REVERT_MS: 500, SOLUTION_STEP_MS: 500, WINDOW_STEP: 100 };
export const OPENING = { OPPONENT_DELAY_MS: 300, EXPLANATION_MAX: 300, TREE_NAME_MAX: 60, DEVIATION_LIST: 10 };
export const BOARD_LIMITS = { FEN: 100, PGN: 100_000 };

/** Time classes offered in filters and the rating chart (R45.3, R45.8). */
export const TIME_CLASSES = ['rapid', 'blitz', 'bullet', 'daily'] as const;
