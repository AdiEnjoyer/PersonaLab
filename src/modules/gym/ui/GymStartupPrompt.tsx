import { useEffect, useState } from 'react';
import { toDbWriteError } from '../../../core/db/errors';
import { toast } from '../../../ui/toast/toastStore';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { loadActive } from '../data/activeStore';
import { discardActive, finishActive } from '../data/sessions';
import { lastCompletionTime, resumeDecision, type ResumeDecision } from '../logic/session';
import type { Session } from '../types';
import { ConfirmSheet } from './ConfirmSheet';
/** Asked once per page load, so a dismissed prompt returns at the next app start (R21.2, R21.4). */
let asked = false;
/** The resume prompt shown at app start when a Session is Active (R21.2, R21.4 to R21.6). */
export default function GymStartupPrompt() {
  const navigate = useAppNavigate();
  const [found, setFound] = useState<{ session: Session; decision: ResumeDecision }>();
  useEffect(() => {
    if (asked) return;
    asked = true;
    void loadActive()
      .then((session) => {
        if (session !== null) setFound({ session, decision: resumeDecision(session, Date.now()) });
      })
      .catch(() => undefined);
  }, []);
  if (found === undefined) return null;
  const close = () => setFound(undefined);
  const resume = () => {
    close();
    navigate('/gym/session');
  };
  const finishAtLast = async () => {
    close();
    try {
      const done = await finishActive(lastCompletionTime(found.session));
      navigate(`/gym/summary/${encodeURIComponent(done.id)}`);
    } catch (error) {
      toast.show({ message: `Finishing the session failed: ${toDbWriteError(error).reason}.`, kind: 'error' });
    }
  };
  const discard = async () => {
    close();
    try {
      await discardActive();
    } catch (error) {
      toast.show({ message: `The session was not discarded: ${toDbWriteError(error).reason}.`, kind: 'error' });
    }
  };
  if (found.decision === 'resume') {
    return (
      <ConfirmSheet
        open
        title="Workout in progress"
        onClose={close}
        actions={[
          { label: 'Resume', variant: 'primary', onClick: resume },
          { label: 'Not now', onClick: close },
        ]}
      >
        You have a workout that was not finished.
      </ConfirmSheet>
    );
  }
  return (
    <ConfirmSheet
      open
      title="Old workout found"
      onClose={close}
      actions={[
        ...(found.decision === 'stale-with-finish' ? [{ label: 'Finish at last set time', variant: 'primary' as const, onClick: () => void finishAtLast() }] : []),
        { label: 'Resume', onClick: resume },
        { label: 'Discard', variant: 'danger' as const, onClick: () => void discard() },
      ]}
    >
      This workout has not changed for more than 3 hours.
    </ConfirmSheet>
  );
}
