import { decFromNumber, decOnGrid } from './decimal';

/**
 * Oracle for Property 6: the accepted values of every setting (R5.2, R9.1, R30.2, R40.2, R40.8) and of the
 * Gemini_Key, restated from the requirements, and the value that a successful commit stores.
 * Independent of production code.
 */
export type SettingOracleResult = { ok: true; stored: unknown } | { ok: false };

const ACCEPT = (stored: unknown): SettingOracleResult => ({ ok: true, stored });
const REJECT: SettingOracleResult = { ok: false };

function numberOnGrid(v: unknown, min: string, max: string, step: string): boolean {
  if (typeof v !== 'number') return false;
  const d = decFromNumber(v);
  return d !== null && decOnGrid(d, min, max, step);
}

/** A plain object whose own keys are exactly `keys`. */
function isRecordWithKeys(v: unknown, keys: readonly string[]): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  if (proto !== Object.prototype && proto !== null) return false;
  const own = Reflect.ownKeys(v);
  return own.length === keys.length && keys.every((k) => Object.hasOwn(v, k));
}

function hasWhitespace(s: string): boolean {
  return /\s/.test(s);
}

function parsesAsUrl(s: string): boolean {
  try {
    new URL(s);
    return true;
  } catch {
    return false;
  }
}

const GOALS = ['cut', 'maintain', 'bulk'] as const;

const ORACLES: Record<string, (v: unknown) => SettingOracleResult> = {
  // Backup reminder interval: 3, 7, 14 or 30 days, or off.
  'core.backupReminderDays': (v) => ([3, 7, 14, 30, 'off'] as unknown[]).includes(v) ? ACCEPT(v) : REJECT,
  // Default rest time: 30 to 600 s in 15 s steps.
  'gym.defaultRestSec': (v) => (numberOnGrid(v, '30', '600', '15') ? ACCEPT(v) : REJECT),
  // Rest timer sound: on/off switch.
  'gym.restSound': (v) => (typeof v === 'boolean' ? ACCEPT(v) : REJECT),
  // Manual training-hours override: on/off plus 0 to 40 h in 0.5 h steps.
  'nutrition.trainingOverride': (v) =>
    isRecordWithKeys(v, ['enabled', 'hours']) && typeof v['enabled'] === 'boolean' && numberOnGrid(v['hours'], '0', '40', '0.5')
      ? ACCEPT(v)
      : REJECT,
  // Goal adjustment per goal: multiples of 50 kcal from −1000 to +1000.
  'nutrition.goalAdjust': (v) =>
    isRecordWithKeys(v, GOALS) && GOALS.every((g) => numberOnGrid(v[g], '-1000', '1000', '50')) ? ACCEPT(v) : REJECT,
  // Protein factor per goal: "goal default" or multiples of 0.1 g/kg from 1.6 to 2.2.
  'nutrition.proteinFactor': (v) =>
    isRecordWithKeys(v, GOALS) && GOALS.every((g) => v[g] === 'default' || numberOnGrid(v[g], '1.6', '2.2', '0.1'))
      ? ACCEPT(v)
      : REJECT,
  // Gemini model id: after trimming, 1 to 80 of A–Z, a–z, 0–9, ".", "_" and "-"; stored trimmed.
  'nutrition.geminiModel': (v) => {
    if (typeof v !== 'string') return REJECT;
    const t = v.trim();
    return /^[A-Za-z0-9._-]{1,80}$/.test(t) ? ACCEPT(t) : REJECT;
  },
  // Chess.com username: after trimming, 3 to 25 of A–Z, a–z, 0–9, "_" and "-"; stored trimmed.
  'chess.username': (v) => {
    if (typeof v !== 'string') return REJECT;
    const t = v.trim();
    return /^[A-Za-z0-9_-]{3,25}$/.test(t) ? ACCEPT(t) : REJECT;
  },
  // CORS_Proxy URL: empty, or an absolute URL starting with "https://" of at most 2048 characters.
  'chess.proxyUrl': (v) => {
    if (typeof v !== 'string') return REJECT;
    if (v === '') return ACCEPT(v);
    return v.length <= 2048 && v.startsWith('https://') && parsesAsUrl(v) ? ACCEPT(v) : REJECT;
  },
  // Chess_Rating source: Chess.com Rapid or Manual.
  'chess.ratingSource': (v) => (v === 'rapid' || v === 'manual' ? ACCEPT(v) : REJECT),
  // Manual rating: integer from 100 to 3000.
  'chess.manualRating': (v) => (numberOnGrid(v, '100', '3000', '1') ? ACCEPT(v) : REJECT),
};

/** The oracle verdict for committing `value` to setting `key`. */
export function settingOracle(key: string, value: unknown): SettingOracleResult {
  const oracle = ORACLES[key];
  if (oracle === undefined) throw new Error(`No oracle for setting ${key}`);
  return oracle(value);
}

/** Every setting key the oracle covers. */
export const ORACLE_SETTING_KEYS: readonly string[] = Object.keys(ORACLES);

/**
 * Gemini_Key: after trimming, empty or 1 to 200 characters with no whitespace. `stored` is the trimmed key,
 * or `undefined` when the trimmed key is empty (not set).
 */
export function geminiKeyOracle(value: unknown): SettingOracleResult {
  if (typeof value !== 'string') return REJECT;
  const t = value.trim();
  if (t.length > 200 || hasWhitespace(t)) return REJECT;
  return ACCEPT(t === '' ? undefined : t);
}
