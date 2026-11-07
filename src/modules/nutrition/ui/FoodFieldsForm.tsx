import { NumberField } from '../../../ui/form/NumberField';
import { TextField } from '../../../ui/form/TextField';
import { EMPTY_FOOD_FORM, type FieldErrors, type FoodFormText } from '../logic/food';

export { EMPTY_FOOD_FORM };

/** Name, energy, macros and grams with the R31.2 ranges and inline errors. */
export function FoodFieldsForm({ value, onChange, errors = {} }: { value: FoodFormText; onChange(next: FoodFormText): void; errors?: FieldErrors }) {
  const set = (key: keyof FoodFormText) => (text: string) => onChange({ ...value, [key]: text });
  return (
    <div className="flex flex-col gap-3">
      <TextField label="Name" value={value.name} onChange={set('name')} error={errors.name} autoComplete="off" />
      <NumberField label="Energy" unit="kcal" value={value.kcal} onChange={set('kcal')} error={errors.kcal} hint="0 to 5000" />
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Protein" unit="g" value={value.protein} onChange={set('protein')} error={errors.protein} />
        <NumberField label="Carbs" unit="g" value={value.carbs} onChange={set('carbs')} error={errors.carbs} />
        <NumberField label="Fat" unit="g" value={value.fat} onChange={set('fat')} error={errors.fat} />
      </div>
      <NumberField label="Grams (optional)" unit="g" value={value.grams} onChange={set('grams')} error={errors.grams} hint="Macros: 0 to 500 g. Grams: 0.1 to 5000." />
    </div>
  );
}