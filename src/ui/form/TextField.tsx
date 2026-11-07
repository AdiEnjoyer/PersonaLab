import { useId, type InputHTMLAttributes } from 'react';
import { FieldError } from './FieldError';

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string;
  value: string;
  onChange(text: string): void;
  error?: string | undefined;
}

export function TextField({ label, value, onChange, error, ...rest }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col">
      <label htmlFor={id} className="mb-1 text-sm text-muted">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="tap rounded-continuous border border-line bg-surface-2 px-3 text-base text-fg"
        {...rest}
      />
      <FieldError id={errorId} message={error} />
    </div>
  );
}
