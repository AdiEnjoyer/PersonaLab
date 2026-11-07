const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** "Updated just now" / "Updated N min ago" / "Updated N h ago" / "Updated N d ago" (R65.1). */
export function ageLabel(fetchedAt: number, now: number): string {
  const d = Math.max(0, now - fetchedAt);
  if (d < MINUTE) return 'Updated just now';
  if (d < HOUR) return `Updated ${Math.floor(d / MINUTE)} min ago`;
  if (d < DAY) return `Updated ${Math.floor(d / HOUR)} h ago`;
  return `Updated ${Math.floor(d / DAY)} d ago`;
}