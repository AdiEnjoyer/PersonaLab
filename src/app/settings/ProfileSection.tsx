import { useProfile } from '../../core/profile/repo';
import { profileToTexts } from '../../core/profile/schema';
import { CardFrame } from '../../ui/primitives/CardFrame';
import { toast } from '../../ui/toast/toastStore';
import { ProfileForm } from '../ProfileForm';

export function ProfileSection() {
  const profile = useProfile();
  return (
    <CardFrame aria-labelledby="settings-profile" className="flex flex-col gap-3">
      <h2 id="settings-profile" className="text-lg font-semibold">
        Profile
      </h2>
      {profile === undefined ? null : (
        <ProfileForm initial={profileToTexts(profile)} submitLabel="Save profile" onSaved={() => toast.show({ message: 'Profile saved.' })} />
      )}
    </CardFrame>
  );
}
