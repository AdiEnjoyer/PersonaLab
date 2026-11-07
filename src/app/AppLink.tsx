import type { AnchorHTMLAttributes, MouseEvent } from 'react';
import { useHref } from 'react-router';
import { useAppNavigate } from '../ui/transitions/navigate';

/** A real link (`href`, middle-click, long-press) whose plain click navigates through a view transition. */
export function AppLink({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const href = useHref(to);
  const navigate = useAppNavigate();
  const handle = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(to);
  };
  return <a href={href} onClick={handle} {...rest} />;
}
