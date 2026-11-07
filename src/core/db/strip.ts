function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) {
    if (field !== undefined) out[key] = strip(field);
  }
  return out;
}

/**
 * A copy of `value` in which every plain-object property whose value is `undefined` is absent, at any depth
 * (inside nested objects and arrays). Array elements keep their positions; non-plain objects such as
 * `ArrayBuffer`, typed arrays, `Date` and `Blob` are kept as they are. Repositories call this before every
 * write so `importData(exportData())` is structurally equal to the stored data (R8.4).
 */
export function stripUndefined<T>(value: T): T {
  return strip(value) as T;
}
