import { EMPTY_PROFILE_TEXTS } from '../core/profile/schema';
import { CardFrame } from '../ui/primitives/CardFrame';
import { ProfileForm } from './ProfileForm';

/**
 * Six empty fields. Nothing is stored until all are valid (R4.8). After a save the live Profile query in
 * `StartupGate` swaps this screen for the app.
 */
export function FirstRunProfile() {
  return (
    <main className="pt-safe pb-safe pl-safe pr-safe mx-auto flex min-h-dvh max-w-xl flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Welcome to PersonalLab</h1>
      <p className="text-muted">Enter your details once. They set your calorie and protein targets and stay on this device.</p>
      <CardFrame>
        <ProfileForm initial={{ ...EMPTY_PROFILE_TEXTS }} submitLabel="Save and continue" />
      </CardFrame>
    </main>
  );
}
