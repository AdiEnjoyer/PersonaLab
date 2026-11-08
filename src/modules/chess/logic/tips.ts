import type { LocalDate } from '../../../core/time/localDate';
import type { RatingBand, Tip, TipState } from '../types';

export const EMPTY_TIP_STATE: TipState = { id: 'tips', shown: {} };

/**
 * Daily tip (R41.4, R41.5): keeps the stored tip for the same date, else takes the first tip of the band
 * (file order) not yet shown in the band's cycle; an exhausted cycle restarts at the band's first tip.
 * Returns `tipId: undefined` when the band has no tips. Other bands' sets are untouched.
 */
export function selectDailyTip(
  state: TipState,
  tips: readonly Tip[],
  band: RatingBand,
  today: LocalDate,
): { tipId: string | undefined; state: TipState } {
  if (state.dailyDate === today && state.dailyTipId !== undefined && tips.some((t) => t.id === state.dailyTipId)) {
    return { tipId: state.dailyTipId, state };
  }
  const bandTips = tips.filter((t) => t.band === band);
  const first = bandTips[0];
  if (first === undefined) return { tipId: undefined, state };
  const ids = new Set(bandTips.map((t) => t.id));
  let shown = new Set((state.shown[band] ?? []).filter((id) => ids.has(id)));
  let next = bandTips.find((t) => !shown.has(t.id));
  if (next === undefined) {
    shown = new Set();
    next = first;
  }
  shown.add(next.id);
  return { tipId: next.id, state: { ...state, dailyDate: today, dailyTipId: next.id, shown: { ...state.shown, [band]: [...shown] } } };
}

/** Tips matching the band and topic filters, in file order (R41.8). `undefined` means "all". */
export function filterTips(tips: readonly Tip[], band: RatingBand | undefined, topic: string | undefined): Tip[] {
  return tips.filter((t) => (band === undefined || t.band === band) && (topic === undefined || t.topics.includes(topic)));
}
