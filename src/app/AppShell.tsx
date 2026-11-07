import { useLocation } from 'react-router';
import { deriveRoutes, deriveTabs } from '../core/registry/derive';
import { MODULES } from '../core/registry/modules';
import type { ModuleDefinition } from '../core/registry/types';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { OfflineNotice } from '../ui/status/OfflineNotice';
import { ToastHost } from '../ui/toast/ToastHost';
import { AppLink } from './AppLink';
import { AppRoutes } from './router';

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M3 11l9-8 9 8M5 10v10h14V10" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" />
    </svg>
  );
}

const isUnder = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

export function AppShell({ modules = MODULES }: { modules?: readonly ModuleDefinition[] }) {
  const { pathname } = useLocation();
  const tabs = deriveTabs(modules);
  const routes = deriveRoutes(modules);
  const title =
    pathname === '/' ? 'Home' : pathname === '/settings' ? 'Settings' : (routes.find((r) => r.path === pathname)?.title ?? 'PersonalLab');

  const tabClass = (active: boolean) =>
    `tap flex flex-1 flex-col items-center justify-center gap-0.5 py-1 text-xs ${active ? 'text-accent' : 'text-muted'}`;

  return (
    <div className="pt-safe pl-safe pr-safe flex min-h-dvh flex-col">
      <OfflineNotice />
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/90 px-4 py-2 backdrop-blur">
        <h1 className="text-xl font-bold">{title}</h1>
        {pathname === '/' ? (
          <AppLink to="/settings" aria-label="Settings" className="tap flex items-center justify-center text-muted">
            <SettingsIcon />
          </AppLink>
        ) : null}
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 p-4" style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom))' }}>
        <AppRoutes modules={modules} />
      </main>
      <nav
        aria-label="Main"
        className="pb-safe pl-safe pr-safe fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface"
      >
        <AppLink to="/" aria-current={pathname === '/' ? 'page' : undefined} className={tabClass(pathname === '/')}>
          <HomeIcon />
          <span>Home</span>
        </AppLink>
        {tabs.map(({ moduleId, name, icon: Icon, path }) =>
          path === null ? null : (
            <AppLink key={moduleId} to={path} aria-current={isUnder(pathname, path) ? 'page' : undefined} className={tabClass(isUnder(pathname, path))}>
              <Icon className="h-6 w-6" />
              <span>{name}</span>
            </AppLink>
          ),
        )}
      </nav>
      {modules.map(({ id, Overlay, StartupPrompt }) => (
        <ErrorBoundary key={id} fallback={null}>
          {Overlay ? <Overlay /> : null}
          {StartupPrompt ? <StartupPrompt /> : null}
        </ErrorBoundary>
      ))}
      <ToastHost />
    </div>
  );
}
