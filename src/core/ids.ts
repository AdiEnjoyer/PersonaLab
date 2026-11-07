/** Primary key for a new record: a random v4 UUID. */
export const newId = (): string => crypto.randomUUID();

/**
 * Idempotency_Key for a new draft (R11.1): a random v4 UUID, attached to every
 * create operation submitted for that draft, including retries.
 */
export const newIdemKey = (): string => crypto.randomUUID();
