import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { AppLink } from '../../../app/AppLink';
import { useSetting } from '../../../core/settings/useSetting';
import { useActiveSession } from '../data/sessions';
import { restView } from '../logic/restTimer';
import { GYM_SETTING_KEYS } from '../settings';
import { RestTimerBar } from './RestTimerBar';
import { playRestSound } from './restSound';
import { useNow } from './useNow';
/** Always mounted: the Active Session link with a compact rest timer, and the rest-over sound (R20.6, R20.7). */
export default function GymOverlay() {
  const session = useActiveSession();
  const { pathname } = useLocation();
  const [soundOn] = useSetting<boolean>(GYM_SETTING_KEYS.restSound);
  const timer = session?.restTimer;
  const now = useNow(250, timer !== undefined);
  const kind = restView(timer, now).kind;
  const previous = useRef(kind);
  useEffect(() => {
    // Only a countdown that ends while the app is visible plays the sound (R20.6).
    if (previous.current === 'running' && kind === 'alert' && soundOn && timer !== undefined && document.visibilityState === 'visible' && Date.now() - timer.endAt < 1500) {
      playRestSound();
    }
    previous.current = kind;
  }, [kind, soundOn, timer]);
  if (!session || pathname.startsWith('/gym/session')) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-10 flex justify-center px-3">
      <AppLink to="/gym/session" className="tap pointer-events-auto flex items-center gap-3 rounded-full border border-line bg-surface px-4 py-2 shadow-lg">
        <span className="font-medium">Workout in progress</span>
        <RestTimerBar timer={timer} compact />
      </AppLink>
    </div>
  );
}
