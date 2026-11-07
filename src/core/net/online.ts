import { useSyncExternalStore } from 'react';

const PROBE_INTERVAL_MS = 5000;

let unreachable = false;
let snapshot = computeOnline();
let probeTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function computeOnline(): boolean {
  return (typeof navigator === 'undefined' || navigator.onLine) && !unreachable;
}

function refresh(): void {
  const next = computeOnline();
  if (next === snapshot) return;
  snapshot = next;
  listeners.forEach((l) => l());
}

async function probe(): Promise<void> {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' });
    if (response.ok) setUnreachable(false);
  } catch {
    /* still unreachable */
  }
}

function setUnreachable(value: boolean): void {
  unreachable = value;
  if (value && probeTimer === null) probeTimer = setInterval(() => void probe(), PROBE_INTERVAL_MS);
  if (!value && probeTimer !== null) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
  refresh();
}

/** Clients call this on a network error while `navigator.onLine` is true (R1.9). Probes every 5 s until reachable. */
export function reportUnreachable(): void {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  setUnreachable(true);
}

/** Current online state without React. */
export function isOnline(): boolean {
  return snapshot;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => setUnreachable(false));
  window.addEventListener('offline', refresh);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** `online = navigator.onLine && !unreachable` (R1.5, R1.9, R1.10). */
export function useOnline(): { online: boolean } {
  const online = useSyncExternalStore(subscribe, () => snapshot);
  return { online };
}