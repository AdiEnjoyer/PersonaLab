import { AppLink } from '../../../app/AppLink';
import { useOnline } from '../../../core/net/online';
import { Button } from '../../../ui/primitives/Button';
import { startSync, syncMessage, useSyncView } from './syncStore';

/** "Sync games" with "Syncing month N of M" progress and the last result (R44.16). */
export function SyncControls({ label = 'Sync games' }: { label?: string }) {
  const sync = useSyncView();
  const { online } = useOnline();
  const message = syncMessage(sync);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Button onClick={() => void startSync()} disabled={sync.running || !online}>
          {label}
        </Button>
        {sync.running ? (
          <p role="status" className="text-sm text-muted">
            {sync.total > 0 ? `Syncing month ${sync.done} of ${sync.total}` : 'Syncing…'}
          </p>
        ) : null}
        {!online && !sync.running ? <p className="text-sm text-muted">You are offline.</p> : null}
      </div>
      {message !== null && !sync.running ? (
        <p role={message.error ? 'alert' : 'status'} className={`text-sm ${message.error ? 'text-danger' : 'text-muted'}`}>
          {message.text}{' '}
          {message.notFound ? (
            <AppLink to="/settings" className="underline">
              Open Chess settings
            </AppLink>
          ) : null}
          {message.error && !message.notFound ? (
            <Button variant="ghost" onClick={() => void startSync()} disabled={!online}>
              Retry
            </Button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
