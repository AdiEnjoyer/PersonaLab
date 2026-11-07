export interface SwitchProps {
  label: string;
  checked: boolean;
  onChange(checked: boolean): void;
}

export function Switch({ label, checked, onChange }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="tap flex w-full items-center justify-between gap-3 text-left text-base"
    >
      <span>{label}</span>
      <span
        aria-hidden="true"
        className={`relative inline-block h-7 w-12 shrink-0 rounded-full transition-colors ${checked ? 'bg-accent' : 'bg-line'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white transition-transform ${checked ? 'translate-x-5' : ''}`}
        />
      </span>
    </button>
  );
}
