import type { ReactNode } from 'react';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children ? <div className="text-muted">{children}</div> : null}
    </div>
  );
}
