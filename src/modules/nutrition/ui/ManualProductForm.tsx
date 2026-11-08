import { useState } from 'react';
import { toDbWriteError } from '../../../core/db/errors';
import { NumberField } from '../../../ui/form/NumberField';
import { TextField } from '../../../ui/form/TextField';
import { Button } from '../../../ui/primitives/Button';
import { toast } from '../../../ui/toast/toastStore';
import { saveManualProduct } from '../data/foodLookup';
import { productFormFromFields, validateProductForm, type ProductFields, type ProductFormErrors } from '../logic/off';
import type { Product } from '../types';

/** The manual product form (R34.7, R34.8, R34.9, R34.15). Known fields are prefilled; the barcode is fixed. */
export function ManualProductForm({ barcode, fields, onSaved }: { barcode: string; fields: ProductFields; onSaved(product: Product): void }) {
  const [form, setForm] = useState(() => productFormFromFields(fields));
  const [errors, setErrors] = useState<ProductFormErrors>({});
  const [busy, setBusy] = useState(false);
  const set = (key: keyof typeof form) => (text: string) => setForm({ ...form, [key]: text });
  const save = async () => {
    const checked = validateProductForm(form);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      onSaved(await saveManualProduct(barcode, checked.fields));
    } catch (e) {
      toast.show({ message: `The product was not saved: ${toDbWriteError(e).reason}.`, kind: 'error' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      aria-label="Product details"
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="text-sm text-muted tabular-nums">Barcode {barcode}</p>
      <TextField label="Name" value={form.name} onChange={set('name')} error={errors.name} autoComplete="off" />
      <TextField label="Brand (optional)" value={form.brand} onChange={set('brand')} autoComplete="off" />
      <NumberField label="Energy per 100 g" unit="kcal" value={form.kcal} onChange={set('kcal')} error={errors.kcal} hint="0 to 1000" />
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Protein per 100 g" unit="g" value={form.protein} onChange={set('protein')} error={errors.protein} />
        <NumberField label="Carbs per 100 g" unit="g" value={form.carbs} onChange={set('carbs')} error={errors.carbs} />
        <NumberField label="Fat per 100 g" unit="g" value={form.fat} onChange={set('fat')} error={errors.fat} />
      </div>
      <NumberField label="Serving size (optional)" unit="g" value={form.serving} onChange={set('serving')} error={errors.serving} hint="Greater than 0" />
      <Button type="submit" disabled={busy}>
        Save product
      </Button>
    </form>
  );
}
