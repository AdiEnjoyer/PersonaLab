import type Dexie from 'dexie';
import { useSyncExternalStore } from 'react';
import { APP_VERSION } from '../about/buildInfo';
import { db } from '../db/db';
import { CORE_TABLES, META_KEYS, type MetaRecord } from '../db/tables';
import { write } from '../db/write';
import { fetchWithTimeout } from '../net/fetchWithTimeout';
import { MODULES } from '../registry/modules';

export const UPDATE_MESSAGES = {
  available: 'A new version is available',
  reload: 'Reload',
  postponed: 'The workout could not be saved, so the update was postponed.',
} as const;

const CHECK_INTERVAL_MS = 3_600_000;
const CHECK_TIMEOUT_MS = 10_000;
const FLUSH_TIMEOUT_MS = 5000;

export interface UpdateState {
  /** A new worker is waiting. */
  available: boolean;
  /** The update Toast is shown ("A new version is available" / "Reload"). */
  visible: boolean;
  /** Error Toast text after a postponed update, else null. */
  notice: string | null;
}

export interface UpdateDeps {
  /** `registerSW` from `virtual:pwa-register`. */
  register: (options: {
    onNeedRefresh: () => void;
    onRegisteredSW: (url: string, registration: { update(): Promise<unknown> } | undefined) => void;
  }) => (reloadPage?: boolean) => Promise<void>;
  database: Dexie;
  now: () => number;
  isOnline: () => boolean;
  fetchRemoteVersion: () => Promise<string>;
  flushAll: () => Promise<unknown>;
  appVersion: string;
}

const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

export function createUpdateService(deps: UpdateDeps) {
  let state: UpdateState = { available: false, visible: false, notice: null };
  let registration: { update(): Promise<unknown> } | undefined;
  let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
  const listeners = new Set<() => void>();
  const meta = () => deps.database.table<MetaRecord<number>, string>(CORE_TABLES.meta);

  const set = (patch: Partial<UpdateState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  async function onNeedRefresh(): Promise<void> {
    set({ available: true });
    try {
      const remote = await deps.fetchRemoteVersion();
      if (remote === deps.appVersion) return; // same build: nothing to offer
    } catch {
      /* the Toast is shown anyway (design: onNeedRefresh) */
    }
    set({ visible: true });
  }

  async function checkIfDue(): Promise<void> {
    if (!deps.isOnline() || !registration) return;
    try {
      const last = (await meta().get(META_KEYS.lastUpdateCheckAt))?.value;
      const now = deps.now();
      if (last !== undefined && now - last < CHECK_INTERVAL_MS) return;
      await Promise.race([registration.update(), timeout(CHECK_TIMEOUT_MS)]);
      const record: MetaRecord<number> = { key: META_KEYS.lastUpdateCheckAt, value: now };
      await write([CORE_TABLES.meta], () => meta().put(record), deps.database);
    } catch {
      /* offline or slow: silent, lastUpdateCheckAt unchanged (R10.6, R10.7) */
    }
  }

  /** Brings a dismissed Toast back when the app starts or returns to the foreground while a worker waits. */
  function onForeground(): void {
    if (state.available && !state.visible) set({ visible: true });
    void checkIfDue();
  }

  return {
    start(): void {
      updateSW = deps.register({
        onNeedRefresh: () => void onNeedRefresh(),
        onRegisteredSW: (_url, reg) => {
          registration = reg;
          void checkIfDue();
        },
      });
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') onForeground();
        });
      }
    },
    checkIfDue,
    /** Hides the Toast until the next start or foreground while the worker still waits (R10.2). */
    dismiss(): void {
      set({ visible: false, notice: null });
    },
    async reload(): Promise<void> {
      try {
        await Promise.race([deps.flushAll(), timeout(FLUSH_TIMEOUT_MS)]);
      } catch {
        set({ visible: true, notice: UPDATE_MESSAGES.postponed });
        return;
      }
      set({ notice: null });
      await updateSW?.(true); // posts SKIP_WAITING and reloads on controllerchange
    },
    getState: (): UpdateState => state,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type UpdateService = ReturnType<typeof createUpdateService>;

let singleton: UpdateService | null = null;

/** The App's update service, created on first use. */
export function getUpdateService(): UpdateService {
  if (singleton) return singleton;
  singleton = createUpdateService({
    register: (options) => {
      let update: (reloadPage?: boolean) => Promise<void> = async () => undefined;
      // Imported lazily so tests and dev builds without the PWA virtual module still load this file.
      void import('virtual:pwa-register').then(({ registerSW }) => {
        update = registerSW(options);
      });
      return (reloadPage) => update(reloadPage);
    },
    database: db,
    now: () => Date.now(),
    isOnline: () => typeof navigator === 'undefined' || navigator.onLine,
    fetchRemoteVersion: async () => {
      const response = await fetchWithTimeout(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' }, CHECK_TIMEOUT_MS);
      return ((await response.json()) as { version: string }).version;
    },
    flushAll: () => Promise.all(MODULES.map((m) => m.lifecycle?.flushPendingWrites?.())),
    appVersion: APP_VERSION,
  });
  return singleton;
}

/** State of the update Toast for the UI: show `UPDATE_MESSAGES.available` with a Reload action. */
export function useUpdateState(): UpdateState & { reload: () => Promise<void>; dismiss: () => void } {
  const service = getUpdateService();
  const state = useSyncExternalStore(service.subscribe, service.getState);
  return { ...state, reload: service.reload, dismiss: service.dismiss };
}