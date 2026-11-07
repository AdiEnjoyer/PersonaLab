import { useMemo } from 'react';
import { AppLink } from '../../../app/AppLink';
import { Switch } from '../../../ui/form/Switch';
import { TextField } from '../../../ui/form/TextField';
import { VirtualList } from '../../../ui/list/VirtualList';
import { Button } from '../../../ui/primitives/Button';
import { EmptyState } from '../../../ui/status/EmptyState';
import { LIMITS } from '../constants';
import { clearFilters, equipmentOptions, filterExercises, muscleOptions, type LibraryQuery } from '../logic/library';
import type { Exercise } from '../types';
import { ExercisePhoto } from './ExercisePhoto';
import { ToggleChips } from './ToggleChips';

export const ROW_HEIGHT = 72;

export interface ExerciseBrowserProps {
  exercises: readonly Exercise[];
  query: LibraryQuery;
  onQueryChange(next: LibraryQuery): void;
  /** `link`: rows open the detail screen. `pick`: rows toggle selection. */
  mode: 'link' | 'pick';
  selected?: ReadonlySet<string>;
  onToggle?(exercise: Exercise): void;
  /** In pick mode: no further exercise can be selected (R17.2). */
  selectionFull?: boolean;
  initialScrollTop?: number;
  onScrollTop?(top: number): void;
  /** CSS height of the list area. */
  listHeight?: string;
}

function RowBody({ exercise }: { exercise: Exercise }) {
  return (
    <>
      <div className="w-14 shrink-0">
        <ExercisePhoto photo={exercise.photos[0]} alt="" size={56} />
      </div>
      <div className="min-w-0 flex-1 text-left">
        <div className="truncate font-medium">{exercise.name}</div>
        <div className="truncate text-sm text-muted">
          {exercise.primaryMuscles.join(', ')} · {exercise.equipment}
        </div>
      </div>
    </>
  );
}

/** Search, muscle and equipment filters and the windowed exercise list (R14). Shared by the library and pickers. */
export function ExerciseBrowser({ exercises, query, onQueryChange, mode, selected, onToggle, selectionFull = false, initialScrollTop, onScrollTop, listHeight = 'calc(100dvh - 22rem)' }: ExerciseBrowserProps) {
  const visible = useMemo(() => filterExercises(exercises, query), [exercises, query]);
  const muscles = useMemo(() => muscleOptions(exercises), [exercises]);
  const equipment = useMemo(() => equipmentOptions(exercises), [exercises]);
  const listProps = {
    ...(initialScrollTop !== undefined ? { initialScrollTop } : {}),
    ...(onScrollTop !== undefined ? { onScrollTop } : {}),
  };

  return (
    <div className="flex flex-col gap-3">
      <TextField label="Search exercises" value={query.text} maxLength={LIMITS.SEARCH_TEXT} onChange={(text) => onQueryChange({ ...query, text })} type="search" />
      <ToggleChips label="Muscle" options={muscles} selected={query.muscles} onChange={(next) => onQueryChange({ ...query, muscles: next })} />
      <Switch label="Include secondary muscles" checked={query.includeSecondary} onChange={(includeSecondary) => onQueryChange({ ...query, includeSecondary })} />
      <ToggleChips label="Equipment" options={equipment} selected={query.equipment} onChange={(next) => onQueryChange({ ...query, equipment: next })} />
      {visible.length === 0 ? (
        <EmptyState title="No exercises match">
          <Button variant="secondary" onClick={() => onQueryChange(clearFilters(query))}>
            Clear filters
          </Button>
        </EmptyState>
      ) : (
        <VirtualList
          aria-label="Exercises"
          items={visible}
          rowHeight={ROW_HEIGHT}
          height={listHeight}
          keyOf={(x) => `${x.source}:${x.id}`}
          {...listProps}
          renderRow={(x) => {
            const base = 'tap flex h-full w-full items-center gap-3 border-b border-line px-1';
            if (mode === 'link') {
              return (
                <AppLink to={`/gym/library/${encodeURIComponent(x.id)}`} className={base}>
                  <RowBody exercise={x} />
                </AppLink>
              );
            }
            const on = selected?.has(x.id) === true;
            const disabled = !on && selectionFull;
            return (
              <button type="button" aria-pressed={on} disabled={disabled} onClick={() => onToggle?.(x)} className={`${base} disabled:opacity-40 ${on ? 'bg-surface-2' : ''}`}>
                <RowBody exercise={x} />
                <span aria-hidden="true" className="w-6 text-accent">
                  {on ? '✓' : ''}
                </span>
              </button>
            );
          }}
        />
      )}
    </div>
  );
}
