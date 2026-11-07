import { describe, expect, it } from 'vitest';
import { newId, newIdemKey } from '../ids';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('ids', () => {
  it('creates v4 UUIDs', () => {
    expect(newId()).toMatch(UUID_V4);
    expect(newIdemKey()).toMatch(UUID_V4);
  });

  it('creates a different key each time', () => {
    const keys = new Set(Array.from({ length: 1000 }, () => newIdemKey()));
    expect(keys.size).toBe(1000);
  });
});
