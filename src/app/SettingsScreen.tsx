import { MODULES } from '../core/registry/modules';
import type { ModuleDefinition } from '../core/registry/types';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { CardFrame } from '../ui/primitives/CardFrame';
import { AboutSection } from './settings/AboutSection';
import { BackupSection } from './settings/BackupSection';
import { ProfileSection } from './settings/ProfileSection';

/** Sections in this order: Profile, Backup, one per module (registry order), About (R5.1). */
export function SettingsScreen({ modules = MODULES }: { modules?: readonly Pick<ModuleDefinition, 'id' | 'name' | 'settings'>[] }) {
  return (
    <div className="flex flex-col gap-4">
      <ProfileSection />
      <BackupSection />
      {modules.map(({ id, name, settings }) =>
        settings ? (
          <ErrorBoundary key={id} fallback={<CardFrame role="alert">{name} settings failed to load</CardFrame>}>
            <CardFrame>
              <settings.Section />
            </CardFrame>
          </ErrorBoundary>
        ) : null,
      )}
      <AboutSection />
    </div>
  );
}
