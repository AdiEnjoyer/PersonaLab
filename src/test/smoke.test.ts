import { describe, expect, it } from 'vitest';

describe('test environment', () => {
  it('runs in the Asia/Jerusalem time zone', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('Asia/Jerusalem');
  });
});
