import { useState } from 'react';
import { toDbWriteError } from '../../../core/db/errors';
import { Button, type ButtonVariant } from '../../../ui/primitives/Button';
import { Sheet } from '../../../ui/sheet/Sheet';
import { toast } from '../../../ui/toast/toastStore';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { discardAndStart, startSession, useActiveSession, type StartKind } from '../data/sessions';
import { useRoutines } from '../data/routines';
import { completedSetCount } from '../logic/session';
import type { Session } from '../types';
import { ConfirmSheet } from './ConfirmSheet';
type Dialog = { step: 'choose' } | { step: 'conflict'; existing: Session; kind: StartKind } | { step: 'confirm-discard'; existing: Session; kind: StartKind };
/** Start choice (a routine or an empty session) with the resume/discard/cancel dialog (R18.2, R18.6, R18.10, R28.3). */
export function StartWorkoutButton({ label = 'Start workout', variant = 'primary' }: { label?: string; variant?: ButtonVariant }) {
  const navigate = useAppNavigate();
  const routines = useRoutines();
  const active = useActiveSession();
  const [dialog, setDialog] = useState<Dialog>();
  const [busy, setBusy] = useState(false);
  const fail = (error: unknown) => toast.show({ message: `The workout could not be started: ${toDbWriteError(error).reason}.`, kind: 'error' });
  const begin = async (kind: StartKind) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await startSession(kind);
      if (result.status === 'conflict') {
        setDialog({ step: 'conflict', existing: result.existing, kind });
      } else {
        setDialog(undefined);
        navigate('/gym/session');
      }
    } catch (error) {
      setDialog(undefined);
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  const discard = async (existing: Session, kind: StartKind) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await discardAndStart(existing.id, kind);
      setDialog(undefined);
      if (result.status === 'conflict') setDialog({ step: 'conflict', existing: result.existing, kind });
      else navigate('/gym/session');
    } catch (error) {
      setDialog(undefined);
      fail(error);
    } finally {
      setBusy(false);
    }
  };
  const close = () => setDialog(undefined);
  return (
    <>
      <Button variant={variant} onClick={() => setDialog({ step: 'choose' })} disabled={active === undefined}>
        {label}
      </Button>
      <Sheet open={dialog?.step === 'choose'} onRequestClose={close} title="Start workout">
        <div className="flex flex-col gap-2">
          {(routines ?? []).map((r) => (
            <Button key={r.id} variant="secondary" disabled={busy} onClick={() => void begin({ type: 'routine', routineId: r.id })}>
              {r.name}
            </Button>
          ))}
          <Button disabled={busy} onClick={() => void begin({ type: 'empty' })}>
            Empty session
          </Button>
        </div>
      </Sheet>
      <ConfirmSheet
        open={dialog?.step === 'conflict'}
        title="A workout is already active"
        onClose={close}
        actions={[
          {
            label: 'Resume current session',
            variant: 'primary',
            onClick: () => {
              close();
              navigate('/gym/session');
            },
          },
          { label: 'Discard current session', variant: 'danger', onClick: () => dialog?.step === 'conflict' && setDialog({ ...dialog, step: 'confirm-discard' }) },
          { label: 'Cancel', onClick: close },
        ]}
      >
        Finish or discard it before starting another one.
      </ConfirmSheet>
      <ConfirmSheet
        open={dialog?.step === 'confirm-discard'}
        title="Discard current session?"
        onClose={close}
        actions={[
          { label: 'Discard and start', variant: 'danger', onClick: () => dialog?.step === 'confirm-discard' && void discard(dialog.existing, dialog.kind) },
          { label: 'Cancel', onClick: close },
        ]}
      >
        {dialog?.step === 'confirm-discard' ? `${completedSetCount(dialog.existing)} completed ${completedSetCount(dialog.existing) === 1 ? 'set' : 'sets'} will be deleted.` : null}
      </ConfirmSheet>
    </>
  );
}
