import { useState, type FormEvent } from 'react';
import { saveProfile } from '../core/profile/repo';
import {
  GOALS,
  PROFILE_FIELD_RULES,
  PROFILE_NUMERIC_RULES,
  SEXES,
  type NumericProfileField,
  type Profile,
  type ProfileField,
  type ProfileTexts,
} from '../core/profile/schema';
import { NumberField } from '../ui/form/NumberField';
import { Select } from '../ui/form/Select';
import { Button } from '../ui/primitives/Button';
import { toast } from '../ui/toast/toastStore';

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export interface ProfileFormProps {
  initial: ProfileTexts;
  submitLabel: string;
  onSaved?(profile: Profile): void;
}

/** The six Profile fields. An invalid save stores nothing and keeps what was typed (R4.3). */
export function ProfileForm({ initial, submitLabel, onSaved }: ProfileFormProps) {
  const [texts, setTexts] = useState<ProfileTexts>(initial);
  const [errors, setErrors] = useState<Partial<Record<ProfileField, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = (field: ProfileField) => (value: string) => {
    setTexts((t) => ({ ...t, [field]: value }));
    setErrors((e) => (e[field] === undefined ? e : { ...e, [field]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      const result = await saveProfile(texts);
      if (result.ok) {
        setErrors({});
        onSaved?.(result.profile);
      } else if (result.reason === 'invalid') {
        setErrors(result.errors);
      } else {
        toast.show({ message: result.error.message, kind: 'error' });
      }
    } finally {
      setSaving(false);
    }
  };

  const numeric = (field: NumericProfileField, label: string) => (
    <NumberField
      key={field}
      label={label}
      unit={PROFILE_NUMERIC_RULES[field].unit}
      value={texts[field]}
      onChange={set(field)}
      error={errors[field]}
      hint={PROFILE_FIELD_RULES[field]}
    />
  );

  return (
    <form onSubmit={(e) => void submit(e)} className="flex flex-col gap-4" noValidate>
      {numeric('age', 'Age')}
      <Select
        label="Sex"
        value={texts.sex}
        options={SEXES.map((s) => ({ value: s, label: capitalise(s) }))}
        onChange={set('sex')}
        placeholder="Choose…"
        error={errors.sex}
      />
      {numeric('heightCm', 'Height')}
      {numeric('weightKg', 'Weight')}
      {numeric('weeklyTrainingHours', 'Weekly training hours')}
      <Select
        label="Goal"
        value={texts.goal}
        options={GOALS.map((g) => ({ value: g, label: capitalise(g) }))}
        onChange={set('goal')}
        placeholder="Choose…"
        error={errors.goal}
      />
      <Button type="submit" disabled={saving}>
        {submitLabel}
      </Button>
    </form>
  );
}
