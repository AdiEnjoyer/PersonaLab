/** One short beep (under 2 s) for the end of a rest countdown. Failures are swallowed (R20.6, R20.8). */
let context: AudioContext | undefined;
function getContext(): AudioContext | undefined {
  if (context !== undefined) return context;
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (Ctor === undefined) return undefined;
  try {
    context = new Ctor();
  } catch {
    context = undefined;
  }
  return context;
}
/** iOS only starts audio after a tap, so the first tap in a Session creates and resumes the context. */
export function primeRestSound(): void {
  try {
    void getContext()?.resume();
  } catch {
    // Ignored: the visual alert still shows.
  }
}
export function playRestSound(): void {
  try {
    const ctx = getContext();
    if (ctx === undefined) return;
    void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 1);
  } catch {
    // Ignored: the visual alert still shows.
  }
}
