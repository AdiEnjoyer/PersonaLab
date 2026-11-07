import { useState } from 'react';
import { Sheet } from '../../../ui/sheet/Sheet';
import { Button } from '../../../ui/primitives/Button';
import { EMPTY_QUERY, type LibraryQuery } from '../logic/library';
import type { Exercise } from '../types';
import { ExerciseBrowser } from './ExerciseBrowser';
/** Exercise picker of the Session_Logger: non-archived exercises with the library search and filters (R18.3). */
export function ExercisePickerSheet({ exercises, open, onClose, onConfirm }: { exercises: readonly Exercise[]; open: boolean; onClose(): void; onConfirm(ids: string[]): void }) {
  const [query, setQuery] = useState<LibraryQuery>(EMPTY_QUERY);
  const [picked, setPicked] = useState<string[]>([]);
  const close = () => {
    setPicked([]);
    onClose();
  };
  const confirm = () => {
    const ids = picked;
    close();
    onConfirm(ids);
  };
  return (
    <Sheet open={open} onRequestClose={close} dirty={picked.length > 0} title="Add exercises">
      <p className="mb-2 text-sm text-muted">{picked.length} selected</p>
      <ExerciseBrowser
        mode="pick"
        exercises={exercises.filter((x) => !x.archived)}
        query={query}
        onQueryChange={setQuery}
        selected={new Set(picked)}
        listHeight="calc(100dvh - 30rem)"
        onToggle={(x) => setPicked((p) => (p.includes(x.id) ? p.filter((id) => id !== x.id) : [...p, x.id]))}
      />
      <div className="mt-3 flex gap-2">
        <Button variant="secondary" onClick={close}>
          Cancel
        </Button>
        <Button disabled={picked.length === 0} onClick={confirm}>
          Add {picked.length || ''}
        </Button>
      </div>
    </Sheet>
  );
}
