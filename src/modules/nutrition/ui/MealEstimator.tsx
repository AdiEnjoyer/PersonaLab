import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AppLink } from '../../../app/AppLink';
import { toBase64 } from '../../../core/backup/base64';
import { toDbWriteError } from '../../../core/db/errors';
import { newId, newIdemKey } from '../../../core/ids';
import { processImage, type ProcessedImage } from '../../../core/image/processImage';
import { parseDecimal } from '../../../core/math/decimal';
import { round } from '../../../core/math/round';
import { isOnline } from '../../../core/net/online';
import { isLocalDate, toLocalDate, type LocalDate } from '../../../core/time/localDate';
import { NumberField } from '../../../ui/form/NumberField';
import { Select } from '../../../ui/form/Select';
import { TextField } from '../../../ui/form/TextField';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { Sheet } from '../../../ui/sheet/Sheet';
import { toast } from '../../../ui/toast/toastStore';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { AI_LIMITS, FREE_TIER_WARNING, MEAL_SLOTS, SLOT_LABELS } from '../constants';
import { readAiWarningAck, readGeminiKey, saveEstimate, setAiWarningAck, type EstimateThumbnail } from '../data/estimate';
import {
  consistencyWarning,
  ESTIMATE_MESSAGES,
  reviewItemsFrom,
  reviewSaveBlockers,
  reviewTotals,
  setGrams,
  type Estimate,
  type ReviewField,
  type ReviewItem,
} from '../logic/gemini';
import { requestEstimate } from '../net/gemini';
import type { MealSlot } from '../types';
import { whole } from './format';

const SLOT_OPTIONS = MEAL_SLOTS.map((s) => ({ value: s, label: SLOT_LABELS[s] }));
const isSlot = (s: string): s is MealSlot => (MEAL_SLOTS as readonly string[]).includes(s);
const PHOTO = { maxSide: 1024, quality: 0.8 } as const;
const THUMB = { maxSide: 256, quality: 0.8 } as const;

type NoticeKind = keyof typeof ESTIMATE_MESSAGES;
/** Errors without a Retry action. */
const NO_RETRY: readonly NoticeKind[] = ['no-key', 'key-rejected'];

type NumField = Exclude<ReviewField, 'name'>;
const NUM_FIELDS: { field: NumField; label: string; unit: string }[] = [
  { field: 'grams', label: 'Grams', unit: 'g' },
  { field: 'kcal', label: 'Energy', unit: 'kcal' },
  { field: 'protein', label: 'Protein', unit: 'g' },
  { field: 'carbs', label: 'Carbs', unit: 'g' },
  { field: 'fat', label: 'Fat', unit: 'g' },
];

const PROBE: ReviewItem = { idemKey: 'probe', name: 'x', grams: 1, kcal: 0, protein: 0, carbs: 0, fat: 0 };
/** The value of a typed number, or the problem with it, using the ranges of R37.18. */
function checkNumber(field: NumField, text: string): { value: number } | { error: string } {
  const value = parseDecimal(text, { maxDecimals: 6 });
  if (value === null) return { error: 'Enter a number.' };
  const problem = reviewSaveBlockers([{ ...PROBE, [field]: value }], 'breakfast').items['probe']?.[field];
  return problem === undefined ? { value } : { error: problem };
}
const shown = (field: NumField, v: number): string => (field === 'grams' || field === 'kcal' ? String(round(v)) : String(round(v, 1)));

type Drafts = Record<string, Partial<Record<NumField, string>>>;

function ReviewScreen({
  estimate,
  date,
  photo,
  onClose,
}: {
  estimate: Estimate;
  date: LocalDate;
  photo: ProcessedImage;
  onClose(): void;
}) {
  const navigate = useAppNavigate();
  const [items, setItems] = useState<ReviewItem[]>(() => reviewItemsFrom(estimate, newIdemKey));
  const [slot, setSlot] = useState<MealSlot | undefined>();
  const [drafts, setDrafts] = useState<Drafts>({});
  const [busy, setBusy] = useState(false);
  // The thumbnail and its id are made once, so a retried Save writes the same records (R37.8).
  const thumbnail = useRef<EstimateThumbnail | undefined>(undefined);
  const blockers = useMemo(() => reviewSaveBlockers(items, slot), [items, slot]);
  const totals = reviewTotals(items);
  const draftInvalid = Object.values(drafts).some((d) => Object.entries(d).some(([f, t]) => 'error' in checkNumber(f as NumField, t)));
  const blocked = blockers.blocked || draftInvalid;

  const update = (key: string, fn: (i: ReviewItem) => ReviewItem) => setItems((all) => all.map((i) => (i.idemKey === key ? fn(i) : i)));
  const edit = (item: ReviewItem, field: NumField, text: string) => {
    setDrafts((d) => ({ ...d, [item.idemKey]: { ...d[item.idemKey], [field]: text } }));
    const checked = checkNumber(field, text);
    if ('error' in checked) return;
    update(item.idemKey, (i) => (field === 'grams' ? setGrams(i, checked.value) : { ...i, [field]: checked.value }));
    // Grams rescale the other numbers, so their typed text is stale.
    if (field === 'grams') setDrafts((d) => ({ ...d, [item.idemKey]: { grams: text } }));
  };
  const endDraft = (key: string, field: NumField) =>
    setDrafts((d) => {
      const { [field]: _gone, ...rest } = d[key] ?? {};
      return { ...d, [key]: rest };
    });

  const save = async () => {
    if (blocked || slot === undefined || busy) return;
    setBusy(true);
    try {
      thumbnail.current ??= { imageId: newId(), image: await processImage(new Blob([photo.bytes], { type: photo.mime }), THUMB) };
      await saveEstimate(items, { date, slot, confidence: estimate.confidence, thumbnail: thumbnail.current });
      navigate(date === toLocalDate(Date.now()) ? '/nutrition' : `/nutrition/day/${date}`);
    } catch (e) {
      // The review screen stays with every edit and key (R37.19).
      toast.show({ message: `The meal was not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Review estimate">
      <h1 className="text-xl font-semibold">Review estimate</h1>
      <p className="text-sm text-muted">
        {date} · Confidence: {estimate.confidence}
      </p>
      {estimate.confidence === 'low' ? (
        <p role="status" className="rounded-continuous bg-surface-2 px-3 py-2 text-sm">
          The AI is not sure about this estimate. Please check the values.
        </p>
      ) : null}
      {items.map((item, n) => {
        const errors = blockers.items[item.idemKey] ?? {};
        return (
          <fieldset key={item.idemKey} className="flex flex-col gap-2 rounded-continuous border border-line p-3">
            <legend className="px-1 text-sm">Item {n + 1}</legend>
            <TextField label="Name" value={item.name} onChange={(name) => update(item.idemKey, (i) => ({ ...i, name }))} error={errors.name} autoComplete="off" />
            <div className="grid grid-cols-2 gap-2">
              {NUM_FIELDS.map(({ field, label, unit }) => {
                const draft = drafts[item.idemKey]?.[field];
                const draftCheck = draft === undefined ? undefined : checkNumber(field, draft);
                return (
                  <NumberField
                    key={field}
                    label={label}
                    unit={unit}
                    value={draft ?? shown(field, item[field])}
                    onChange={(text) => edit(item, field, text)}
                    onBlur={() => endDraft(item.idemKey, field)}
                    error={draftCheck !== undefined && 'error' in draftCheck ? draftCheck.error : errors[field]}
                  />
                );
              })}
            </div>
            {consistencyWarning(item) ? (
              <p role="note" className="text-sm text-danger">
                The energy does not match the protein, carbs and fat of this item.
              </p>
            ) : null}
            <Button variant="ghost" aria-label={`Remove item ${n + 1}`} onClick={() => setItems((all) => all.filter((i) => i.idemKey !== item.idemKey))}>
              Remove
            </Button>
          </fieldset>
        );
      })}
      <Button
        variant="secondary"
        disabled={items.length >= AI_LIMITS.ITEMS}
        onClick={() => setItems((all) => [...all, { idemKey: newIdemKey(), name: '', grams: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 }])}
      >
        Add item
      </Button>
      <CardFrame aria-label="Meal totals">
        <p className="text-lg font-semibold tabular-nums">{whole(totals.kcal)} kcal</p>
        <p className="text-sm tabular-nums text-muted">
          Protein {round(totals.protein, 1)} g · Carbs {round(totals.carbs, 1)} g · Fat {round(totals.fat, 1)} g
        </p>
      </CardFrame>
      <Select
        label="Meal"
        value={slot ?? ''}
        placeholder="Choose a meal"
        options={SLOT_OPTIONS}
        onChange={(v) => setSlot(isSlot(v) ? v : undefined)}
        error={blockers.noSlot ? 'Choose a meal.' : undefined}
      />
      {blockers.noItems ? <p className="text-sm text-danger">Add at least one item.</p> : null}
      <div className="flex gap-2">
        <Button disabled={blocked || busy} onClick={() => void save()}>
          Save
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </div>
    </section>
  );
}

/** `/nutrition/estimate`: photo, request, errors and the editable review (R36, R37). */
export default function MealEstimator() {
  const [params] = useSearchParams();
  const navigate = useAppNavigate();
  const dateParam = params.get('date');
  const date: LocalDate = dateParam !== null && isLocalDate(dateParam) ? dateParam : toLocalDate(Date.now());

  const [photo, setPhoto] = useState<{ image: ProcessedImage; url: string | undefined }>();
  const [reading, setReading] = useState(false);
  const [notice, setNotice] = useState<NoticeKind>();
  const [pending, setPending] = useState(false);
  const [warning, setWarning] = useState(false);
  const [estimate, setEstimate] = useState<Estimate>();
  const abort = useRef<AbortController | undefined>(undefined);
  const starting = useRef(false);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);

  // Leaving the screen aborts a pending request and discards its answer (R36.10).
  useEffect(
    () => () => {
      abort.current?.abort();
      abort.current = undefined;
    },
    [],
  );
  useEffect(() => {
    const url = photo?.url;
    return () => {
      if (url !== undefined) URL.revokeObjectURL(url);
    };
  }, [photo]);

  const choose = async (file: File | undefined) => {
    if (file === undefined || pending || reading) return;
    setReading(true);
    try {
      const image = await processImage(file, PHOTO);
      const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(new Blob([image.bytes], { type: image.mime })) : undefined;
      setPhoto({ image, url });
      setNotice(undefined);
    } catch {
      // The previous valid photo stays (R36.11).
      setNotice('photo-unreadable');
    } finally {
      setReading(false);
    }
  };

  const send = async (key: string, image: ProcessedImage) => {
    const controller = new AbortController();
    abort.current = controller;
    setPending(true);
    setNotice(undefined);
    const outcome = await requestEstimate({ key, imageBase64: toBase64(image.bytes), signal: controller.signal });
    // A cancelled or abandoned request is discarded without a message (R36.10).
    if (abort.current !== controller) return;
    abort.current = undefined;
    setPending(false);
    if (outcome.kind === 'aborted') return;
    if (outcome.kind === 'ok') setEstimate(outcome.estimate);
    else setNotice(outcome.kind);
  };

  /** Checks in the order of R37.11, R37.10, R36.7, then sends. */
  const start = async () => {
    if (photo === undefined || pending || starting.current) return;
    starting.current = true;
    try {
      await runChecks(photo.image);
    } finally {
      starting.current = false;
    }
  };

  const runChecks = async (image: ProcessedImage) => {
    setNotice(undefined);
    let key: string | undefined;
    try {
      key = await readGeminiKey();
    } catch {
      key = undefined;
    }
    if (key === undefined || key === '') {
      setNotice('no-key');
      return;
    }
    if ((typeof navigator !== 'undefined' && !navigator.onLine) || !isOnline()) {
      setNotice('offline');
      return;
    }
    let acknowledged = false;
    try {
      acknowledged = await readAiWarningAck();
    } catch {
      acknowledged = false;
    }
    if (!acknowledged) {
      setWarning(true);
      return;
    }
    await send(key, image);
  };

  const understood = async () => {
    setWarning(false);
    if (photo === undefined) return;
    try {
      await setAiWarningAck();
      const key = await readGeminiKey();
      if (key === undefined || key === '') {
        setNotice('no-key');
        return;
      }
      await send(key, photo.image);
    } catch (e) {
      toast.show({ message: `Not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
    }
  };

  const cancel = () => {
    abort.current?.abort();
    abort.current = undefined;
    setPending(false);
  };

  if (estimate !== undefined && photo !== undefined) {
    return <ReviewScreen estimate={estimate} date={date} photo={photo.image} onClose={() => setEstimate(undefined)} />;
  }

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Photo of meal</h1>
      <p className="text-sm text-muted">{date}</p>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden aria-label="Camera photo" onChange={(e) => void choose(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      <input ref={library} type="file" accept="image/*" hidden aria-label="Library photo" onChange={(e) => void choose(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" disabled={pending || reading} onClick={() => camera.current?.click()}>
          Take photo
        </Button>
        <Button variant="secondary" disabled={pending || reading} onClick={() => library.current?.click()}>
          Choose from library
        </Button>
      </div>
      {photo?.url ? <img src={photo.url} alt="Selected meal" width={photo.image.width} height={photo.image.height} className="max-h-72 w-full rounded-continuous object-contain" /> : null}
      {photo !== undefined && photo.url === undefined ? <p className="text-sm text-muted">Photo selected.</p> : null}

      {notice !== undefined ? (
        <div role="alert" className="flex flex-col gap-2 rounded-continuous bg-surface-2 p-3 text-sm">
          <p>{ESTIMATE_MESSAGES[notice]}</p>
          {notice === 'no-key' || notice === 'key-rejected' ? (
            <AppLink to="/settings" className="tap flex items-center text-accent underline">
              Open Settings
            </AppLink>
          ) : null}
          <div className="flex gap-2">
            {photo !== undefined && !NO_RETRY.includes(notice) && notice !== 'photo-unreadable' ? (
              <Button variant="secondary" disabled={pending} onClick={() => void start()}>
                Retry
              </Button>
            ) : null}
            {notice === 'unusable' ? (
              <Button variant="secondary" onClick={() => navigate(`/nutrition/add?date=${date}`)}>
                Enter manually
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {pending ? (
        <div role="status" className="flex items-center gap-3">
          <span>Estimating…</span>
          <Button variant="secondary" onClick={cancel}>
            Cancel
          </Button>
        </div>
      ) : null}
      <Button disabled={photo === undefined || reading || pending} onClick={() => void start()}>
        Estimate
      </Button>

      <Sheet open={warning} onRequestClose={() => setWarning(false)} title="Before you send a photo">
        <div className="flex flex-col gap-3 pb-4">
          <p>{FREE_TIER_WARNING}</p>
          <div className="flex gap-2">
            <Button onClick={() => void understood()}>I understand</Button>
            <Button variant="secondary" onClick={() => setWarning(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Sheet>
    </section>
  );
}
