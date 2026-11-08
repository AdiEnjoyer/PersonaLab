import { useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { toDbWriteError } from '../../../core/db/errors';
import { newIdemKey } from '../../../core/ids';
import { isLocalDate } from '../../../core/time/localDate';
import { NumberField } from '../../../ui/form/NumberField';
import { Select } from '../../../ui/form/Select';
import { Button } from '../../../ui/primitives/Button';
import { CardFrame } from '../../../ui/primitives/CardFrame';
import { EmptyState } from '../../../ui/status/EmptyState';
import { Skeleton } from '../../../ui/status/Skeleton';
import { toast } from '../../../ui/toast/toastStore';
import { useAppNavigate } from '../../../ui/transitions/navigate';
import { MEAL_SLOTS, SLOT_LABELS } from '../constants';
import { addBarcodeEntry } from '../data/food';
import { useFoodLookup, type LookupNotice } from '../data/foodLookup';
import { scalePortion, validateGrams, validateServings } from '../logic/portion';
import type { MealSlot, Product } from '../types';
import { round } from '../../../core/math/round';
import { ManualProductForm } from './ManualProductForm';
import { useToday } from './useToday';

const SLOT_OPTIONS = MEAL_SLOTS.map((s) => ({ value: s, label: SLOT_LABELS[s] }));
const isSlot = (s: string | null): s is MealSlot => s !== null && (MEAL_SLOTS as readonly string[]).includes(s);

const NOTICE_TEXT: Record<LookupNotice, string> = {
  offline: 'You are offline and this product is not saved on this phone yet.',
  failed: 'The product lookup failed.',
  timeout: 'The product lookup timed out after 10 seconds.',
  unreadable: 'The product lookup returned something that could not be read.',
};

const dash = '–';

function PortionPanel({ product }: { product: Product }) {
  const navigate = useAppNavigate();
  const [params] = useSearchParams();
  const today = useToday();
  const dateParam = params.get('date');
  const date = dateParam !== null && isLocalDate(dateParam) ? dateParam : today;
  const slotParam = params.get('slot');
  const [slot, setSlot] = useState<MealSlot>(isSlot(slotParam) ? slotParam : 'breakfast');
  const q = product.servingQuantity;
  const [mode, setMode] = useState<'grams' | 'servings'>('grams');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  // One Idempotency_Key per opened product screen: repeated taps create one entry (R11.2).
  const idemKey = useRef(newIdemKey());
  const check = mode === 'servings' && q !== undefined ? validateServings(text, q) : validateGrams(text);
  const per100 = { kcal: product.kcalPer100, protein: product.proteinPer100, carbs: product.carbsPer100, fat: product.fatPer100 };
  const scaled = check.ok ? scalePortion(per100, check.grams) : undefined;
  const macro = (v: number | undefined) => (v === undefined ? dash : `${round(v, 1).toFixed(1)} g`);

  const save = async () => {
    if (!check.ok || !scaled || scaled.kcal === undefined || product.name === undefined) return;
    setBusy(true);
    try {
      await addBarcodeEntry(
        { name: product.name, kcal: scaled.kcal, protein: scaled.protein, carbs: scaled.carbs, fat: scaled.fat, grams: check.grams, barcode: product.barcode },
        { date, slot, idemKey: idemKey.current },
      );
      navigate(date === today ? '/nutrition' : `/nutrition/day/${date}`);
    } catch (e) {
      toast.show({ message: `The entry was not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <CardFrame aria-label="Product">
        <h2 className="text-lg font-semibold">{product.name}</h2>
        {product.brand ? <p className="text-sm text-muted">{product.brand}</p> : null}
        <p className="mt-1 text-sm tabular-nums text-muted">
          Per 100 g: {round(product.kcalPer100 ?? 0)} kcal · P {product.proteinPer100 === undefined ? dash : round(product.proteinPer100, 1)} · C{' '}
          {product.carbsPer100 === undefined ? dash : round(product.carbsPer100, 1)} · F {product.fatPer100 === undefined ? dash : round(product.fatPer100, 1)}
        </p>
        <p className="text-xs text-muted">{product.source === 'manual' ? 'Entered by you' : 'Open Food Facts'}</p>
      </CardFrame>
      {q !== undefined ? (
        <div role="group" aria-label="Portion unit" className="flex gap-2">
          <Button
            variant={mode === 'grams' ? 'primary' : 'secondary'}
            aria-pressed={mode === 'grams'}
            onClick={() => {
              setMode('grams');
              setText('');
            }}
          >
            Grams
          </Button>
          <Button
            variant={mode === 'servings' ? 'primary' : 'secondary'}
            aria-pressed={mode === 'servings'}
            onClick={() => {
              setMode('servings');
              setText('');
            }}
          >
            Servings
          </Button>
        </div>
      ) : null}
      <NumberField
        label={mode === 'servings' ? 'Servings' : 'Grams'}
        unit={mode === 'servings' ? `${q} g each` : 'g'}
        value={text}
        onChange={setText}
        error={text !== '' && !check.ok ? check.message : undefined}
        hint={mode === 'servings' ? '0.25 to 20 in steps of 0.25' : '1 to 5000, up to 1 decimal'}
      />
      {check.ok && mode === 'servings' ? <p className="text-sm text-muted tabular-nums">= {round(check.grams, 1)} g</p> : null}
      <CardFrame aria-label="Portion values">
        <p className="text-lg font-semibold tabular-nums">{scaled?.kcal === undefined ? dash : `${round(scaled.kcal)} kcal`}</p>
        <p className="text-sm tabular-nums text-muted">
          Protein {macro(scaled?.protein)} · Carbs {macro(scaled?.carbs)} · Fat {macro(scaled?.fat)}
        </p>
      </CardFrame>
      <Select label="Meal" value={slot} options={SLOT_OPTIONS} onChange={(v) => isSlot(v) && setSlot(v)} />
      <p className="text-sm text-muted">{date}</p>
      <Button type="submit" disabled={!check.ok || busy}>
        Save
      </Button>
    </form>
  );
}

/** `/nutrition/product/:barcode`: Food_Lookup, manual product form and portion entry (R34, R35). */
export default function ProductScreen() {
  const { barcode } = useParams();
  const { state, retry } = useFoodLookup(barcode);
  if (state.status === 'loading') return <Skeleton rows={4} />;
  if (state.kind === 'invalid' || barcode === undefined) {
    return <EmptyState title="Not a supported product barcode">Product barcodes have 8 to 14 digits.</EmptyState>;
  }
  if (state.kind === 'manual') {
    return (
      <section className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">{state.notice ? 'Product lookup' : 'Product not found'}</h1>
        {state.notice ? (
          <div role="alert" className="flex flex-col gap-2 rounded-continuous bg-surface-2 p-3 text-sm">
            <p>{NOTICE_TEXT[state.notice]}</p>
            <Button variant="secondary" onClick={retry}>
              Retry
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">Enter the details from the package to save it for next time.</p>
        )}
        <ManualProductForm key={`${barcode}-${JSON.stringify(state.fields)}`} barcode={barcode} fields={state.fields} onSaved={retry} />
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Log product</h1>
      <PortionPanel key={state.product.barcode} product={state.product} />
    </section>
  );
}
