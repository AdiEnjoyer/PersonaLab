import { errorChain, errorName } from './errorChain';

/** Names browsers use for an exceeded storage quota (Firefox used its own name before the standard one). */
const QUOTA_NAMES = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);

/** Short, fixed reasons by error name, for the "Not saved: {reason}." Toast (R3.5). Never raw error text. */
const REASONS: Record<string, string> = {
  ConstraintError: 'a record with the same key already exists',
  DatabaseClosedError: 'the local database is closed',
  AbortError: 'the save was interrupted',
  TransactionInactiveError: 'the save was interrupted',
  InvalidStateError: 'the local database is not available',
  DataCloneError: 'the data could not be stored',
  DataError: 'the data could not be stored',
  MissingIdempotencyKeyError: 'the record has no idempotency key',
};
const DEFAULT_REASON = 'the local database could not be written';

/** True when any error in the cause chain is a storage quota error. */
export function isQuotaError(error: unknown): boolean {
  return errorChain(error).some((e) => {
    const name = errorName(e);
    return name !== undefined && QUOTA_NAMES.has(name);
  });
}

function reasonFor(cause: unknown, quota: boolean): string {
  if (quota) return 'device storage is full';
  for (const e of errorChain(cause)) {
    const name = errorName(e);
    if (name !== undefined && Object.hasOwn(REASONS, name)) return REASONS[name]!;
  }
  return DEFAULT_REASON;
}

/** A failed Local_Database write. Every write path throws this so callers handle one error type (R3.5). */
export class DbWriteError extends Error {
  override readonly name = 'DbWriteError';
  /** Short, fixed reason, e.g. "device storage is full". */
  readonly reason: string;

  constructor(
    override readonly cause: unknown,
    readonly quota: boolean,
  ) {
    const reason = reasonFor(cause, quota);
    super(`Not saved: ${reason}.`, { cause });
    this.reason = reason;
  }
}

/** Wraps any write failure in a `DbWriteError`; `quota` is set when the cause chain holds a quota error. */
export function toDbWriteError(error: unknown): DbWriteError {
  if (error instanceof DbWriteError) return error;
  return new DbWriteError(error, isQuotaError(error));
}
