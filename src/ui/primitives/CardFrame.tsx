import type { HTMLAttributes } from 'react';

/** The surface every dashboard card, settings section and skeleton is built from. */
export function CardFrame({ className = '', ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={`rounded-continuous border border-line bg-surface p-4 ${className}`} {...rest} />;
}
