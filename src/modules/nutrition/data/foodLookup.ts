import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '../../../core/db/db';
import { stripUndefined } from '../../../core/db/strip';
import { write } from '../../../core/db/write';
import { isOnline } from '../../../core/net/online';
import { OFF } from '../constants';
import { isLookupBarcode } from '../logic/barcode';
import { classifyOffResponse, needsManualForm, type ProductFields } from '../logic/off';
import type { Product } from '../types';
import { NUTRITION_TABLES } from './backup';

const products = () => db.table<Product, string>(NUTRITION_TABLES.products);

/** Why a lookup ended in the manual form after a failed request (R34.11). */
export type LookupNotice = 'offline' | 'failed' | 'timeout' | 'unreadable';

export type LookupResult =
  | { kind: 'invalid' }
  | { kind: 'product'; product: Product }
  | { kind: 'manual'; fields: ProductFields; notice?: LookupNotice };

export interface LookupDeps {
  online?: boolean;
  fetchImpl?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  /** Called when a background revalidation replaced the cached product (R34.6). */
  onRevalidated?(product: Product): void;
}

export const readProduct = (barcode: string) => products().get(barcode);

export const offUrl = (barcode: string): string => `${OFF.URL}${barcode}.json?fields=${OFF.FIELDS.join(',')}`;

type FetchOutcome = { kind: 'found'; fields: ProductFields } | { kind: 'not-found' } | { kind: LookupNotice };

/** One request with a timeout; a response after the timeout is dropped (R34.11). */
async function fetchOff(barcode: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<FetchOutcome> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<FetchOutcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: 'timeout' });
    }, timeoutMs);
  });
  const request = (async (): Promise<FetchOutcome> => {
    let response: Response;
    try {
      response = await fetchImpl(offUrl(barcode), { credentials: 'omit', signal: controller.signal });
    } catch {
      return { kind: 'failed' };
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const outcome = classifyOffResponse(response.status, body);
    if (outcome.kind === 'found') return { kind: 'found', fields: outcome.fields };
    if (outcome.kind === 'not-found') return { kind: 'not-found' };
    return { kind: response.ok ? 'unreadable' : 'failed' };
  })();
  try {
    return await Promise.race([request, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const inflight = new Map<string, Promise<FetchOutcome>>();
/** One in-flight request per barcode (R65.2). */
function fetchShared(barcode: string, fetchImpl: typeof fetch, timeoutMs: number): Promise<FetchOutcome> {
  const running = inflight.get(barcode);
  if (running !== undefined) return running;
  const p = fetchOff(barcode, fetchImpl, timeoutMs).finally(() => inflight.delete(barcode));
  inflight.set(barcode, p);
  return p;
}

/** Stores an Open Food Facts record unless a manual record exists meanwhile (R34.6, R34.10). */
async function storeOff(barcode: string, fields: ProductFields, fetchedAt: number): Promise<Product | undefined> {
  return write([NUTRITION_TABLES.products], async () => {
    const existing = await products().get(barcode);
    if (existing?.source === 'manual') return undefined;
    const record: Product = stripUndefined({ barcode, source: 'Open Food Facts' as const, ...fields, fetchedAt });
    await products().put(record);
    return record;
  });
}

const isComplete = (p: Product): boolean => p.kcalPer100 !== undefined && p.name !== undefined;
const fieldsOf = (p: Product): ProductFields => {
  const { barcode: _b, source: _s, fetchedAt: _f, ...rest } = p;
  return rest;
};

/** Background refresh of a stale Open Food Facts record: every failure is silent (R34.13). */
async function revalidate(barcode: string, deps: Required<Pick<LookupDeps, 'fetchImpl' | 'now' | 'timeoutMs'>> & LookupDeps): Promise<void> {
  try {
    const outcome = await fetchShared(barcode, deps.fetchImpl, deps.timeoutMs);
    if (outcome.kind !== 'found' || outcome.fields.kcalPer100 === undefined) return;
    const stored = await storeOff(barcode, outcome.fields, deps.now());
    if (stored !== undefined) deps.onRevalidated?.(stored);
  } catch {
    /* keep the cached product */
  }
}

/** The Food_Lookup flow of the design (R34.1 to R34.14). Never throws for network problems. */
export async function lookupProduct(barcode: unknown, deps: LookupDeps = {}): Promise<LookupResult> {
  if (!isLookupBarcode(barcode)) return { kind: 'invalid' };
  const online = deps.online ?? isOnline();
  const now = deps.now ?? Date.now;
  const fetchImpl = deps.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = deps.timeoutMs ?? OFF.TIMEOUT_MS;
  const cached = await readProduct(barcode);
  if (cached !== undefined) {
    if (cached.source === 'Open Food Facts' && online && now() - cached.fetchedAt > OFF.STALE_MS) {
      void revalidate(barcode, { ...deps, fetchImpl, now, timeoutMs });
    }
    return isComplete(cached) ? { kind: 'product', product: cached } : { kind: 'manual', fields: fieldsOf(cached) };
  }
  if (!online) return { kind: 'manual', fields: {}, notice: 'offline' };
  const outcome = await fetchShared(barcode, fetchImpl, timeoutMs);
  if (outcome.kind === 'not-found') return { kind: 'manual', fields: {} };
  if (outcome.kind !== 'found') return { kind: 'manual', fields: {}, notice: outcome.kind };
  const stored = await storeOff(barcode, outcome.fields, now());
  if (stored === undefined) {
    // A manual record appeared while the request ran.
    const manual = await readProduct(barcode);
    if (manual !== undefined && isComplete(manual)) return { kind: 'product', product: manual };
    return { kind: 'manual', fields: outcome.fields };
  }
  return needsManualForm(outcome.fields) ? { kind: 'manual', fields: outcome.fields } : { kind: 'product', product: stored };
}

/** Saves the manual product form; replaces any Open Food Facts record (R34.9). */
export async function saveManualProduct(barcode: string, fields: ProductFields & { name: string; kcalPer100: number }, now = Date.now()): Promise<Product> {
  const record: Product = stripUndefined({ barcode, source: 'manual' as const, ...fields, fetchedAt: now });
  await write([NUTRITION_TABLES.products], async () => {
    await products().put(record);
  });
  return record;
}

export type LookupState = { status: 'loading' } | ({ status: 'done' } & LookupResult);

/** Runs the lookup for `barcode`; `retry` restarts it. A result of an older run is ignored. */
export function useFoodLookup(barcode: string | undefined): { state: LookupState; retry(): void } {
  const [state, setState] = useState<LookupState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const run = useRef(0);
  useEffect(() => {
    const mine = ++run.current;
    setState({ status: 'loading' });
    const live = () => run.current === mine;
    lookupProduct(barcode, {
      onRevalidated: (product) => {
        if (live()) setState((s) => (s.status === 'done' && s.kind === 'product' ? { status: 'done', kind: 'product', product } : s));
      },
    }).then(
      (result) => live() && setState({ status: 'done', ...result }),
      () => live() && setState({ status: 'done', kind: 'manual', fields: {}, notice: 'failed' }),
    );
    return () => {
      run.current += 1;
    };
  }, [barcode, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, retry };
}
