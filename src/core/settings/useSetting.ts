import { useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { commitSetting, readSetting } from './repo';
import { settingDefinition, type SettingResult } from './schema';

/**
 * The live value of setting `fullKey` and a `commit` function.
 *
 * - `value` is the stored value, or the key's default while the key is unset (and while the first read is
 *   pending). It updates without a reload when any window commits a new value (R5.5).
 * - `commit(v)` validates `v` with the key's schema. An accepted value is stored; a rejected one stores
 *   nothing, keeps the stored value and resolves with the accepted-values text to show next to the field
 *   (R5.6). A failed write rejects with `DbWriteError`, also keeping the stored value.
 */
export function useSetting<T>(fullKey: string): [value: T, commit: (v: unknown) => Promise<SettingResult>] {
  const def = settingDefinition(fullKey);
  const stored = useLiveQuery(() => readSetting<T>(fullKey), [fullKey]);
  const commit = useCallback((v: unknown) => commitSetting(fullKey, v), [fullKey]);
  return [stored === undefined ? (def.defaultValue as T) : stored, commit];
}
