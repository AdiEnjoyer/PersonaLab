export interface ToggleChipsProps<T extends string> {
  label: string;
  options: readonly T[];
  selected: readonly T[];
  onChange(next: T[]): void;
}

/** A labelled, horizontally scrolling row of multi-select chips. */
export function ToggleChips<T extends string>({ label, options, selected, onChange }: ToggleChipsProps<T>) {
  if (options.length === 0) return null;
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-1">
      <span className="text-sm text-muted">{label}</span>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {options.map((option) => {
          const on = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? selected.filter((s) => s !== option) : [...selected, option])}
              className={`tap shrink-0 rounded-full border px-3 text-sm ${on ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface-2 text-fg'}`}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
