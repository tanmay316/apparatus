import { useEffect } from 'react';

// Shared, counted body scroll lock. Overlapping sheets each saving/restoring
// body.style.overflow could restore "hidden" last and freeze scrolling app-wide.
let locks = 0;

export function lockBodyScroll(): () => void {
  if (locks++ === 0) document.body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.style.overflow = '';
  };
}

export function useBodyScrollLock(active = true) {
  useEffect(() => (active ? lockBodyScroll() : undefined), [active]);
}
