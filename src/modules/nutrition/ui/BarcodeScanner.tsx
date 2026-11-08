import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { TextField } from '../../../ui/form/TextField';
import { Button } from '../../../ui/primitives/Button';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { isValidFor, normaliseBarcode, TYPED_BARCODE_MESSAGES, validateTyped, type BarcodeFormat } from '../logic/barcode';
import { startScan, stopAllTracks, type ScanHandle } from './scannerEngine';

export const CAMERA_START_TIMEOUT_MS = 10_000;

export type CameraProblem = 'denied' | 'no-camera' | 'in-use' | 'timeout' | 'other';

/** Maps a getUserMedia failure to one of the causes of R33.4. */
export function cameraProblemOf(error: unknown): CameraProblem {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String((error as { name: unknown }).name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'DevicesNotFoundError') return 'no-camera';
  if (name === 'NotReadableError' || name === 'TrackStartError' || name === 'AbortError') return 'in-use';
  return 'other';
}

const PROBLEM_TEXT: Record<CameraProblem, string> = {
  denied: 'Camera access was denied.',
  'no-camera': 'This device has no usable camera.',
  'in-use': 'The camera is in use by another app. Close that app and try again.',
  timeout: 'The camera did not start within 10 seconds.',
  other: 'The camera could not be started.',
};

type Status = 'starting' | 'scanning' | CameraProblem;

/** Camera barcode scanner at `/nutrition/scan` (R33). Opens the product screen for the normalised barcode. */
export default function BarcodeScanner() {
  const navigate = useAppNavigate();
  const [params] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const handleRef = useRef<ScanHandle | null>(null);
  const attemptRef = useRef(0);
  const lockedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [status, setStatus] = useState<Status>('starting');
  const [typedOpen, setTypedOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<string>();

  const query = params.toString();
  const open = useCallback(
    (barcode: string) => {
      navigate(`/nutrition/product/${barcode}${query === '' ? '' : `?${query}`}`);
    },
    [navigate, query],
  );

  /** Stops decoding and every camera track now (R33.6). Invalidates a start that is still pending. */
  const stop = useCallback(() => {
    attemptRef.current += 1;
    if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    timerRef.current = undefined;
    handleRef.current?.stop();
    handleRef.current = null;
    if (videoRef.current) stopAllTracks(videoRef.current);
  }, []);

  const start = useCallback(() => {
    const video = videoRef.current;
    if (!video || lockedRef.current) return;
    stop();
    const mine = attemptRef.current;
    setStatus('starting');
    const fail = (problem: CameraProblem) => {
      stop();
      setStatus(problem);
      setTypedOpen(true);
    };
    const onMeta = () => {
      if (attemptRef.current !== mine) return;
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
      timerRef.current = undefined;
      setStatus('scanning');
    };
    video.addEventListener('loadedmetadata', onMeta, { once: true });
    timerRef.current = setTimeout(() => {
      if (attemptRef.current === mine) fail('timeout');
    }, CAMERA_START_TIMEOUT_MS);
    startScan(video, (text: string, format: BarcodeFormat) => {
      if (attemptRef.current !== mine || lockedRef.current) return;
      // An invalid check digit is discarded without a message; scanning goes on (R33.3).
      if (!isValidFor(format, text)) return;
      lockedRef.current = true;
      stop();
      open(normaliseBarcode(text, format));
    }).then(
      (handle) => {
        if (attemptRef.current !== mine) {
          handle.stop();
          return;
        }
        handleRef.current = handle;
      },
      (error: unknown) => {
        if (attemptRef.current === mine) fail(cameraProblemOf(error));
      },
    );
  }, [open, stop]);

  useEffect(() => {
    start();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop();
      else if (!lockedRef.current) start();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stop();
    };
  }, [start, stop]);

  const submitTyped = () => {
    const result = validateTyped(typed);
    if (!result.ok) {
      setTypedError(TYPED_BARCODE_MESSAGES[result.reason]);
      return;
    }
    setTypedError(undefined);
    lockedRef.current = true;
    stop();
    open(result.normalised);
  };

  const problem = status === 'starting' || status === 'scanning' ? undefined : status;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Scan barcode</h1>
        <Button
          variant="secondary"
          onClick={() => {
            stop();
            navigate('/nutrition');
          }}
        >
          Close
        </Button>
      </div>
      <video ref={videoRef} playsInline muted autoPlay aria-label="Camera preview" className={`aspect-[3/4] w-full rounded-continuous bg-black object-cover ${problem ? 'hidden' : ''}`} />
      {status === 'starting' ? <p className="text-sm text-muted">Starting the camera…</p> : null}
      {status === 'scanning' ? <p className="text-sm text-muted">Point the camera at the barcode.</p> : null}
      <div role="alert" aria-live="assertive">
        {problem ? (
          <div className="flex flex-col gap-2 rounded-continuous bg-surface-2 p-3 text-sm">
            <p>{PROBLEM_TEXT[problem]}</p>
            {problem === 'denied' ? (
              <p className="text-muted">
                To allow it on iPhone: open Settings, scroll to Safari (or this app on the Home Screen), tap Camera, choose Ask or Allow, then come back and tap Try again.
              </p>
            ) : null}
            <Button onClick={start}>Try again</Button>
          </div>
        ) : null}
      </div>
      {!typedOpen ? (
        <Button variant="secondary" onClick={() => setTypedOpen(true)}>
          Type barcode
        </Button>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submitTyped();
          }}
        >
          <TextField label="Barcode" value={typed} onChange={setTyped} error={typedError} inputMode="numeric" autoComplete="off" />
          <Button type="submit">Look up</Button>
        </form>
      )}
    </section>
  );
}
