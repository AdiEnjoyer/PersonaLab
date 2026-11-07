/** The settled tail of each record's chain of writes. */
const tails = new Map<string, Promise<void>>();

/**
 * Runs `op` after every write enqueued earlier for `recordKey` has settled, so the writes of one record apply
 * in the order the Owner made the changes (R63.3). A failed write does not stop later ones; its rejection is
 * returned to its own caller only. Writes for different keys run independently.
 */
export function enqueueWrite(recordKey: string, op: () => Promise<void>): Promise<void> {
  const previous = tails.get(recordKey) ?? Promise.resolve();
  const result = previous.then(op);
  const tail = result.then(
    () => undefined,
    () => undefined,
  );
  tails.set(recordKey, tail);
  void tail.then(() => {
    if (tails.get(recordKey) === tail) tails.delete(recordKey);
  });
  return result;
}

/** Number of record keys with writes still pending (for tests and diagnostics). */
export function pendingWriteKeys(): number {
  return tails.size;
}
