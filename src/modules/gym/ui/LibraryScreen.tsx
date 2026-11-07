import { useCallback, useState } from 'react';
import { AppLink } from '../../../app/AppLink';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { Skeleton } from '../../../ui/status/Skeleton';
import { useExercises } from '../data/exercises';
import type { LibraryQuery } from '../logic/library';
import { ExerciseBrowser } from './ExerciseBrowser';
import { getLibraryUiState, setLibraryUiState } from './libraryUiState';

export const MISSING_LIBRARY_MESSAGE = 'The exercise library file was not found. Run npm run data:exercises on the PC to build it, then rebuild the app.';

/** Exercise_Library: search, filters, list; state survives opening an exercise (R14). */
export default function LibraryScreen() {
  const { exercises, libraryStatus } = useExercises();
  const [query, setQuery] = useState<LibraryQuery>(() => getLibraryUiState().query);
  const [initialScrollTop] = useState(() => getLibraryUiState().scrollTop);
  const onQueryChange = useCallback((next: LibraryQuery) => {
    setQuery(next);
    setLibraryUiState({ query: next });
  }, []);
  const onScrollTop = useCallback((scrollTop: number) => setLibraryUiState({ scrollTop }), []);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Exercises</h1>
        <AppLink to="/gym/exercises/new" className="tap flex items-center rounded-continuous bg-accent px-4 text-accent-fg">
          Add exercise
        </AppLink>
      </div>
      {exercises === undefined ? (
        <Skeleton rows={6} />
      ) : (
        <>
          {libraryStatus === 'missing' ? (
            <CardFrame role="status" className="text-sm text-muted">
              {MISSING_LIBRARY_MESSAGE}
            </CardFrame>
          ) : null}
          {exercises.filter((x) => !x.archived).length === 0 ? (
            <EmptyState title="No exercises yet">
              {libraryStatus === 'missing' ? 'Run npm run data:exercises to build the library, or add your own exercise.' : 'Add your own exercise to get started.'}
            </EmptyState>
          ) : (
            <ExerciseBrowser mode="link" exercises={exercises} query={query} onQueryChange={onQueryChange} initialScrollTop={initialScrollTop} onScrollTop={onScrollTop} />
          )}
        </>
      )}
    </section>
  );
}
