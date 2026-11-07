import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { AppLink } from '../../../app/AppLink';
import { toDbWriteError } from '../../../core/db/errors';
import { newId, newIdemKey } from '../../../core/ids';
import { ImageDecodeError, processImage } from '../../../core/image/processImage';
import { Select } from '../../../ui/form/Select';
import { TextField } from '../../../ui/form/TextField';
import { FieldError } from '../../../ui/form/FieldError';
import { Button } from '../../../ui/primitives/Button';
import { EmptyState } from '../../../ui/status/EmptyState';
import { Skeleton } from '../../../ui/status/Skeleton';
import { Sheet } from '../../../ui/sheet/Sheet';
import { toast } from '../../../ui/toast/toastStore';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { CUSTOM_PHOTO, EQUIPMENT, MUSCLES } from '../constants';
import { createCustomExercise, updateCustomExercise, useExercises, type PreparedPhoto } from '../data/exercises';
import { findDuplicateName, validateCustomExercise, type ExerciseField } from '../logic/exerciseForm';
import type { Exercise, Muscle } from '../types';
import { ExercisePhoto } from './ExercisePhoto';
import { ToggleChips } from './ToggleChips';

type PhotoState = { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; photo: PreparedPhoto };

function NewPhotoPreview({ photo }: { photo: PreparedPhoto }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const next = URL.createObjectURL(new Blob([photo.image.bytes], { type: photo.image.mime }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo]);
  return <ExercisePhoto photo={{ ...(url ? { src: url } : {}), blurhash: photo.image.blurhash, width: photo.image.width, height: photo.image.height }} alt="New photo preview" />;
}

function FormBody({ existing }: { existing?: Exercise }) {
  const navigate = useAppNavigate();
  const { exercises } = useExercises();
  // One Idempotency_Key per draft: a retry after a failed save reuses it (R15.6, R15.9).
  const idemKey = useRef(newIdemKey());
  const [name, setName] = useState(existing?.name ?? '');
  const [primary, setPrimary] = useState<Muscle[]>(existing?.primaryMuscles ?? []);
  const [secondary, setSecondary] = useState<Muscle[]>(existing?.secondaryMuscles ?? []);
  const [equipment, setEquipment] = useState<string>(existing?.equipment ?? '');
  const [photo, setPhoto] = useState<PhotoState>({ kind: 'keep' });
  const [errors, setErrors] = useState<Partial<Record<ExerciseField, string>>>({});
  const [photoError, setPhotoError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [duplicate, setDuplicate] = useState<string>();
  const [saving, setSaving] = useState(false);

  const choose = async (file: File | undefined) => {
    if (file === undefined) return;
    setPhotoError(undefined);
    try {
      const image = await processImage(file, CUSTOM_PHOTO);
      setPhoto({ kind: 'new', photo: { imageId: newId(), image } });
    } catch (error) {
      setPhotoError(error instanceof ImageDecodeError ? 'The photo could not be read as an image. Try another photo.' : 'The photo could not be resized or stored. Try another photo.');
    }
  };

  const persist = async (values: { name: string; primaryMuscles: Exercise['primaryMuscles']; secondaryMuscles: Exercise['secondaryMuscles']; equipment: Exercise['equipment'] }) => {
    setSaving(true);
    setSaveError(undefined);
    try {
      const prepared = photo.kind === 'new' ? photo.photo : undefined;
      if (existing !== undefined) {
        await updateCustomExercise(existing.id, values, photo.kind === 'remove' ? 'remove' : prepared);
      } else {
        await createCustomExercise(values, idemKey.current, prepared);
      }
      navigate('/gym/library', { replace: true });
    } catch (error) {
      const message = `The exercise was not saved: ${toDbWriteError(error).reason}.`;
      setSaveError(message);
      toast.show({ message, kind: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const save = async (confirmedDuplicate: boolean) => {
    const result = validateCustomExercise({ name, primaryMuscles: primary, secondaryMuscles: secondary, equipment: equipment === '' ? undefined : equipment });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    if (!confirmedDuplicate) {
      const other = findDuplicateName(result.value.name, exercises ?? [], existing?.id);
      if (other !== undefined) {
        setDuplicate(other.name);
        return;
      }
    }
    setDuplicate(undefined);
    await persist(result.value);
  };

  const shownPhoto = photo.kind === 'new' ? <NewPhotoPreview photo={photo.photo} /> : photo.kind === 'keep' && existing?.photos[0] ? <ExercisePhoto photo={existing.photos[0]} alt="Current photo" /> : null;

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save(false);
      }}
    >
      <h1 className="text-xl font-semibold">{existing ? 'Edit exercise' : 'New exercise'}</h1>
      <TextField label="Name" value={name} onChange={setName} error={errors.name} autoComplete="off" />
      <div>
        <ToggleChips label="Primary muscles" options={MUSCLES} selected={primary} onChange={setPrimary} />
        <FieldError message={errors.primaryMuscles} />
      </div>
      <div>
        <ToggleChips label="Secondary muscles" options={MUSCLES} selected={secondary} onChange={setSecondary} />
        <FieldError message={errors.secondaryMuscles} />
      </div>
      <Select label="Equipment" value={equipment} placeholder="Choose equipment" options={EQUIPMENT.map((e) => ({ value: e, label: e }))} onChange={setEquipment} error={errors.equipment} />
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted">Photo (optional)</span>
        {shownPhoto}
        <div className="flex flex-wrap gap-2">
          <label className="tap flex cursor-pointer items-center rounded-continuous bg-surface-2 px-4 font-medium">
            Take photo
            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <label className="tap flex cursor-pointer items-center rounded-continuous bg-surface-2 px-4 font-medium">
            Choose from library
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {shownPhoto ? (
            <Button variant="ghost" onClick={() => setPhoto({ kind: 'remove' })}>
              Remove photo
            </Button>
          ) : null}
        </div>
        <FieldError message={photoError} />
      </div>
      <FieldError message={saveError} />
      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          Save
        </Button>
        <AppLink to="/gym/library" className="tap flex items-center rounded-continuous bg-surface-2 px-4 font-medium">
          Cancel
        </AppLink>
      </div>
      <Sheet open={duplicate !== undefined} onRequestClose={() => setDuplicate(undefined)} title="Name already used">
        <p className="mb-4">An exercise named “{duplicate}” already exists. Save this one anyway?</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setDuplicate(undefined)}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={() => void save(true)}>
            Save anyway
          </Button>
        </div>
      </Sheet>
    </form>
  );
}

/** Create (`/gym/exercises/new`) or edit (`/gym/exercises/:exerciseId/edit`) a Custom_Exercise (R15). */
export default function CustomExerciseForm() {
  const { exerciseId } = useParams();
  const { exercises } = useExercises();
  if (exerciseId === undefined) return <FormBody />;
  if (exercises === undefined) return <Skeleton rows={5} />;
  const existing = exercises.find((x) => x.id === exerciseId && x.source === 'custom');
  if (existing === undefined) return <EmptyState title="Exercise not found" />;
  return <FormBody key={existing.id} existing={existing} />;
}
