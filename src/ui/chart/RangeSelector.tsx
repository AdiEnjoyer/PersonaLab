export interface RangeOption<T extends string | number> {
  value: T;
  label: string;
}

export interface RangeSelectorProps<T extends string | number> {
  options: readonly RangeOption<T>[];
  value: T;
  onChange(value: T): void;
  label?: string;
}

export function RangeSelector<T extends string | number>({ options, value, onChange, label = 'Range' }: RangeSelectorProps<T>) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`tap rounded-continuous px-3 text-sm ${o.value === value ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-fg'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
