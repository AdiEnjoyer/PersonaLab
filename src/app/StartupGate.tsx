import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { openDatabase, type OpenResult } from '../core/db/db';
import { emergencyExport } from '../core/db/rawDump';
import { downloadFile } from '../core/backup/share';
import { useProfile } from '../core/profile/repo';
import { MODULES } from '../core/registry/modules';
import type { ModuleDefinition } from '../core/registry/types';
import { validateRegistry, type RegistryProblem } from '../core/registry/validate';
import { requestPersistOnce } from '../core/storage/persist';
import { Button } from '../ui/primitives/Button';
import { FirstRunProfile } from './FirstRunProfile';

export const STARTUP_MESSAGES = {
  newer: 'This data was saved by a newer version of PersonalLab. Reload the app to get the latest version.',
  migrationFailed: 'The data update failed. No data was lost: everything is still stored on this device.',
  unavailable: 'Local storage is unavailable, so PersonalLab cannot open your data.',
  exportFailed: 'The emergency export failed. Your data is still on this device.',
} as const;

function FullScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main role="alert" className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      {children}
    </main>
  );
}

export function describeProblem(problem: RegistryProblem): string {
  switch (problem.kind) {
    case 'invalid-id':
      return `Invalid module id "${problem.id}": use 1 to 20 lowercase letters or digits, starting with a letter.`;
    case 'duplicate-id':
      return `Duplicate module id "${problem.id}".`;
    case 'duplicate-route':
      return `Route ${problem.path} is declared more than once (${(problem.declaredBy ?? []).join(', ')}).`;
  }
}

export function RegistryErrorScreen({ problems }: { problems: readonly RegistryProblem[] }) {
  return (
    <FullScreen title="Module registry error">
      <p>PersonalLab did not start because the module list has problems. Your data was not touched.</p>
      <ul className="list-disc pl-5">
        {problems.map((p, i) => (
          <li key={i}>{describeProblem(p)}</li>
        ))}
      </ul>
    </FullScreen>
  );
}

type Failure = Extract<OpenResult, { ok: false }>;

function OpenFailureScreen({ failure, onRetry, exporter }: { failure: Failure; onRetry(): void; exporter: () => Promise<File> }) {
  const [exportError, setExportError] = useState(false);
  if (failure.reason === 'newer-version') {
    return (
      <FullScreen title="Update needed">
        <p>{STARTUP_MESSAGES.newer}</p>
        <Button onClick={() => window.location.reload()}>Reload</Button>
      </FullScreen>
    );
  }
  if (failure.reason === 'migration-failed') {
    return (
      <FullScreen title="Data update failed">
        <p>{STARTUP_MESSAGES.migrationFailed}</p>
        <Button
          onClick={() => {
            setExportError(false);
            exporter().then(downloadFile, () => setExportError(true));
          }}
        >
          Export my data
        </Button>
        {exportError ? <p className="text-danger">{STARTUP_MESSAGES.exportFailed}</p> : null}
      </FullScreen>
    );
  }
  return (
    <FullScreen title="Storage unavailable">
      <p>{STARTUP_MESSAGES.unavailable}</p>
      <Button onClick={onRetry}>Retry</Button>
    </FullScreen>
  );
}

function ProfileGate({ children }: { children: ReactNode }) {
  const profile = useProfile();
  if (profile === undefined) return null;
  if (profile === null) return <FirstRunProfile />;
  return <>{children}</>;
}

export interface StartupGateProps {
  children: ReactNode;
  modules?: readonly Pick<ModuleDefinition, 'id' | 'routes'>[];
  open?: () => Promise<OpenResult>;
  exporter?: () => Promise<File>;
}

/**
 * Start-up order (R2.5, R3, R4.4): registry check (database untouched on failure), `openDatabase()` with its
 * three blocking screens, persistent-storage request without waiting, then the first-run Profile when none exists.
 */
export function StartupGate({ children, modules = MODULES, open = openDatabase, exporter = emergencyExport }: StartupGateProps) {
  const problems = useMemo(() => validateRegistry(modules), [modules]);
  const [result, setResult] = useState<OpenResult | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => {
    setResult(null);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (problems.length > 0) return undefined;
    let cancelled = false;
    open().then(
      (r) => {
        if (cancelled) return;
        if (r.ok) void requestPersistOnce();
        setResult(r);
      },
      (error: unknown) => {
        if (!cancelled) setResult({ ok: false, reason: 'unavailable', error: String(error) });
      },
    );
    return () => {
      cancelled = true;
    };
    // `open` is a stable prop in the App; a retry re-runs the effect through `attempt`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problems, attempt]);

  if (problems.length > 0) return <RegistryErrorScreen problems={problems} />;
  if (result === null) return null;
  if (!result.ok) return <OpenFailureScreen failure={result} onRetry={retry} exporter={exporter} />;
  return <ProfileGate>{children}</ProfileGate>;
}
