import { describe, expect, it } from 'vitest';
import tipsRaw from '../../../../public/data/tips.json?raw';
import { RATING_BANDS, TOPICS } from '../constants';
import { TipsFileSchema } from '../schema';

const file = TipsFileSchema.parse(JSON.parse(tipsRaw));

describe('tips file', () => {
  it('is valid, has unique ids, known topics and enough tips per band', () => {
    expect(new Set(file.map((t) => t.id)).size).toBe(file.length);
    for (const t of file) for (const topic of t.topics) expect(TOPICS as readonly string[]).toContain(topic);
    const count = (b: string) => file.filter((t) => t.band === b).length;
    for (const b of ['800–999', '1000–1199', '1200–1399', '1400–1599']) expect(count(b)).toBeGreaterThanOrEqual(5);
    for (const b of RATING_BANDS) expect(count(b)).toBeGreaterThanOrEqual(3);
  });
});

