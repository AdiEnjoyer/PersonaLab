import { useEffect, useState } from 'react';
import { APP_VERSION, BUILD_DATE } from '../../core/about/buildInfo';
import { LICENCES } from '../../core/about/licences';
import { getPersistStatus, type PersistStatus } from '../../core/storage/persist';
import { getOfflineReady } from '../../core/update/precacheStatus';
import { Button } from '../../ui/primitives/Button';
import { CardFrame } from '../../ui/primitives/CardFrame';

const STORAGE_TEXT: Record<PersistStatus, string> = {
  granted: 'Persistent storage: granted',
  denied: 'Persistent storage: not granted',
  unsupported: 'Persistent storage: not supported',
  unknown: 'Persistent storage: not asked yet',
};

export function AboutSection() {
  const [storage, setStorage] = useState<PersistStatus | null>(null);
  const [offlineReady, setOfflineReady] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    void getPersistStatus().then((s) => alive && setStorage(s));
    void getOfflineReady().then((r) => alive && setOfflineReady(r));
    return () => {
      alive = false;
    };
  }, []);

  return (
    <CardFrame aria-labelledby="settings-about" className="flex flex-col gap-3">
      <h2 id="settings-about" className="text-lg font-semibold">
        About
      </h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular-nums">
        <dt className="text-muted">Version</dt>
        <dd>{APP_VERSION}</dd>
        <dt className="text-muted">Build date</dt>
        <dd>{BUILD_DATE}</dd>
      </dl>
      <p>{storage === null ? 'Persistent storage: checking…' : STORAGE_TEXT[storage]}</p>
      <p>Offline ready: {offlineReady === null ? '…' : offlineReady ? 'yes' : 'no'}</p>
      <div>
        {/* Gym wires this control later (offline exercise photos). */}
        <Button variant="secondary" disabled aria-describedby="photos-note">
          Download all exercise photos
        </Button>
        <p id="photos-note" className="mt-1 text-sm text-muted">
          Available once the Gym module is ready.
        </p>
      </div>
      <h3 className="font-semibold">Open source and data</h3>
      <ul className="flex flex-col gap-2">
        {LICENCES.map((l) => (
          <li key={l.name}>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="tap inline-flex items-center text-accent underline">
              {l.name}
            </a>{' '}
            <span className="text-muted">{l.licence}</span>
            {l.sourceUrl ? (
              <>
                {' · '}
                <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-accent underline">
                  Source code
                </a>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </CardFrame>
  );
}
