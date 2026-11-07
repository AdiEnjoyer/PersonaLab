import { useId } from 'react';
import { FieldError } from './FieldError';

export interface NumberFieldProps {
  label: string;
  /** The entered text. */
  value: string;
  /** Receives the text with "," replaced by "." (R4.2). */
  onChange(text: string): void;
  unit?: string;
  error?: string | undefined;
  /** Accepted range and step, shown under the field. */
  hint?: string;
  onBlur?(): void;
}

export function normaliseDecimalSeparator(text: string): string {
  return text.replace(/,/g, '.');
}

export function NumberField({ label, value, onChange, unit, error, hint, onBlur }: NumberFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="mb-1 text-sm text-muted">
        {label}
        {unit ? ` (${unit})` : ''}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(normaliseDecimalSeparator(e.target.value))}
        onBlur={onBlur}
        className="tap rounded-continuous border border-line bg-surface-2 px-3 text-base text-fg tabular-nums"
      />
      {hint && !error ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
      <FieldError id={errorId} message={error} />
    </div>
  );
}
