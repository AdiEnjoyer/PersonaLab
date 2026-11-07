/**
 * Every error reachable from `error`: the error itself, then Dexie's `inner`, the standard `cause` and the
 * per-operation `failures` of a Dexie `BulkError`, depth first. Cycles are visited once.
 */
export function errorChain(error: unknown): unknown[] {
  const seen = new Set<unknown>();
  const out: unknown[] = [];
  const visit = (e: unknown, depth: number) => {
    if (e === undefined || e === null || seen.has(e) || depth > 20) return;
    seen.add(e);
    out.push(e);
    if (typeof e !== 'object') return;
    const record = e as { inner?: unknown; cause?: unknown; failures?: unknown };
    visit(record.inner, depth + 1);
    visit(record.cause, depth + 1);
    const failures = record.failures;
    if (Array.isArray(failures)) for (const f of failures) visit(f, depth + 1);
    else if (failures !== null && typeof failures === 'object') for (const f of Object.values(failures)) visit(f, depth + 1);
  };
  visit(error, 0);
  return out;
}

/** The `name` of an error-like value, or `undefined`. */
export function errorName(error: unknown): string | undefined {
  if (error !== null && typeof error === 'object' && 'name' in error && typeof error.name === 'string') return error.name;
  return undefined;
}

/** True when any error in the chain has one of `names`. */
export function hasErrorNamed(error: unknown, ...names: string[]): boolean {
  return errorChain(error).some((e) => {
    const name = errorName(e);
    return name !== undefined && names.includes(name);
  });
}

/** A one-line description of the innermost error that carries a message, for diagnostics screens. */
export function errorText(error: unknown): string {
  const chain = errorChain(error);
  for (let i = chain.length - 1; i >= 0; i--) {
    const e = chain[i];
    if (e instanceof Error || (e !== null && typeof e === 'object' && 'message' in e)) {
      const message = String((e as { message: unknown }).message ?? '').trim();
      const name = errorName(e);
      if (message !== '') return name !== undefined && name !== 'Error' ? `${name}: ${message}` : message;
      if (name !== undefined) return name;
    }
  }
  if (typeof error === 'string' && error !== '') return error;
  return 'Unknown error';
}
