import { useOnline } from '../../core/net/online';

/** A slim banner shown while the device is offline (R1.5). Local features keep working. */
export function OfflineNotice() {
  const { online } = useOnline();
  if (online) return null;
  return (
    <div role="status" className="bg-surface-2 px-4 py-1 text-center text-sm text-muted">
      You are offline. Your saved data is available.
    </div>
  );
}
