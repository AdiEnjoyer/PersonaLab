import { EMPTY_QUERY, type LibraryQuery } from '../logic/library';

/**
 * Exercise_Library screen state kept in memory, so returning from an opened exercise restores search text,
 * filters, the secondary toggle and scroll position (R14.10). A new App launch starts empty, with the
 * toggle off (R14.4).
 */
export interface LibraryUiState {
  query: LibraryQuery;
  scrollTop: number;
}

let state: LibraryUiState = { query: EMPTY_QUERY, scrollTop: 0 };

export const getLibraryUiState = (): LibraryUiState => state;

export function setLibraryUiState(patch: Partial<LibraryUiState>): void {
  state = { ...state, ...patch };
}

export function resetLibraryUiState(): void {
  state = { query: EMPTY_QUERY, scrollTop: 0 };
}
