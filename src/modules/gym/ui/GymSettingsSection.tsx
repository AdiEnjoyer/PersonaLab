import { useState } from 'react';
import { toDbWriteError } from '../../../core/db/errors';
import { useSetting } from '../../../core/settings/useSetting';
import { Select } from '../../../ui/form/Select';
import { Switch } from '../../../ui/form/Switch';
import { Button } from '../../../ui/primitives/Button';
import { toast } from '../../../ui/toast/toastStore';
import { restoreExercise, useArchivedExercises } from '../data/exercises';
import { loadLibrary } from '../data/library';
import { GYM_SETTING_KEYS } from '../settings';
import { browserDeps, downloadAllPhotos, downloadMessage, libraryImageUrls } from '../data/photoDownload';

function PhotoDownload() {
  const [progress, setProgress] = useState<{ cached: number; total: number }>();
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const library = await loadLibrary();
      const urls = libraryImageUrls(library ?? []);
      if (urls.length === 0) {
        toast.show({ message: 'There are no exercise photos to download.' });
        return;
      }
      const result = await downloadAllPhotos(urls, await browserDeps(), (cached, total) => setProgress({ cached, total }));
      toast.show({ message: downloadMessage(result), ...(result.cached < result.total ? { kind: 'error' as const } : {}) });
    } catch {
      toast.show({ message: 'Exercise photos could not be downloaded.', kind: 'error' });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">Exercise photos</h3>
      <p className="text-sm text-muted">Save all exercise photos on this phone to see them offline.</p>
      <Button variant="secondary" disabled={running} onClick={() => void run()}>
        Download all exercise photos
      </Button>
      {progress ? (
        <p role="status" className="text-sm text-muted">
          {progress.cached} of {progress.total}
        </p>
      ) : null}
    </div>
  );
}

function ArchivedExercises() {
  const { archived } = useArchivedExercises();
  const restore = async (x: NonNullable<typeof archived>[number]) => {
    try {
      await restoreExercise(x);
    } catch (error) {
      toast.show({ message: `Could not restore ${x.name}: ${toDbWriteError(error).reason}.`, kind: 'error' });
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-medium">Archived exercises</h3>
      {archived === undefined ? null : archived.length === 0 ? (
        <p className="text-sm text-muted">No archived exercises.</p>
      ) : (
        <ul className="flex flex-col">
          {archived.map((x) => (
            <li key={`${x.source}:${x.id}`} className="flex items-center justify-between gap-2 border-b border-line last:border-0">
              <span className="min-w-0 truncate">{x.name}</span>
              <Button variant="ghost" aria-label={`Restore ${x.name}`} onClick={() => void restore(x)}>
                Restore
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const REST_OPTIONS = Array.from({ length: (600 - 30) / 15 + 1 }, (_, i) => {
  const sec = 30 + i * 15;
  return { value: String(sec), label: `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}` };
});
/** Default rest time and rest sound (R5.2, R20.2, R20.6). */
function RestSettings() {
  const [restSec, commitRest] = useSetting<number>(GYM_SETTING_KEYS.defaultRestSec);
  const [sound, commitSound] = useSetting<boolean>(GYM_SETTING_KEYS.restSound);
  const [error, setError] = useState<string>();
  const save = async (commit: (v: unknown) => Promise<{ ok: true } | { ok: false; error: string }>, value: unknown) => {
    try {
      const result = await commit(value);
      setError(result.ok ? undefined : result.error);
    } catch (e) {
      toast.show({ message: `Not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <Select label="Default rest time" value={String(restSec)} options={REST_OPTIONS} error={error} onChange={(v) => void save(commitRest, Number(v))} />
      <Switch label="Rest timer sound" checked={sound} onChange={(v) => void save(commitSound, v)} />
    </div>
  );
}
/** Gym part of the Settings_Screen: archived exercises and photo download (R13.7, R16.8, R16.9). */
export default function GymSettingsSection() {
  return (
    <section aria-label="Gym settings" className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Gym</h2>
      <RestSettings />
      <ArchivedExercises />
      <PhotoDownload />
    </section>
  );
}
