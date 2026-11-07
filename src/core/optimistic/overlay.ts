/** A Local_Database change shown on screen before its write completes (R63.1). */
export interface PendingOp<T> {
  /** The record's write-queue key; writes with the same key apply in call order (R63.3). */
  key: string;
  /** Pure: returns the list with this change applied. Must not mutate `list`. */
  apply(list: readonly T[]): T[];
  /** Writes the change to the Local_Database. */
  write(): Promise<void>;
}

/** Pure: `stored` with every op applied in order. `stored` is not changed. */
export function applyOverlay<T>(stored: readonly T[], ops: readonly Pick<PendingOp<T>, 'apply'>[]): T[] {
  let list: readonly T[] = stored;
  for (const op of ops) list = op.apply(list);
  return list === stored ? [...stored] : (list as T[]);
}

/**
 * Pure: keeps one item per key, at the position of its first occurrence with the value of its last
 * occurrence. This covers the moment when a created record already arrived in the stored list while its op
 * is still applied on top.
 */
export function dedupeByKey<T>(list: readonly T[], keyOf: (item: T) => string): T[] {
  const latest = new Map<string, T>();
  for (const item of list) latest.set(keyOf(item), item);
  if (latest.size === list.length) return [...list];
  const out: T[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(latest.get(key)!);
  }
  return out;
}
