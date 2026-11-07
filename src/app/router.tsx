import { Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';
import { deriveRoutes } from '../core/registry/derive';
import { MODULES } from '../core/registry/modules';
import type { ModuleDefinition } from '../core/registry/types';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { ErrorPanel } from '../ui/status/ErrorPanel';
import { Skeleton } from '../ui/status/Skeleton';
import { HomeDashboard } from './HomeDashboard';
import { SettingsScreen } from './SettingsScreen';

/**
 * Core routes `/` and `/settings` plus every module route (lazy components suspend into a skeleton).
 * Each screen sits in a route-level error boundary that resets on navigation. The 200 ms fallback
 * animation (120 ms opacity under reduced motion) is the `.pl-route` class keyed by `location.key` (R67.2).
 */
export function AppRoutes({ modules = MODULES }: { modules?: readonly Pick<ModuleDefinition, 'id' | 'routes'>[] }) {
  const location = useLocation();
  return (
    <ErrorBoundary key={location.key} fallback={(reset) => <ErrorPanel message="This screen could not be loaded." onRetry={reset} />}>
      <Suspense fallback={<Skeleton />}>
        <div key={location.key} className="pl-route">
          <Routes location={location}>
            <Route path="/" element={<HomeDashboard />} />
            <Route path="/settings" element={<SettingsScreen />} />
            {deriveRoutes(modules).map(({ moduleId, path, Component }) => (
              <Route key={`${moduleId}:${path}`} path={path} element={<Component />} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </div>
      </Suspense>
    </ErrorBoundary>
  );
}
