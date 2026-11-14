import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Decorative preview only; the day button and details panel provide accessible text. */
export function CalendarTooltip({ anchor, text }: { anchor: HTMLButtonElement; text: string }) {
  const [ready, setReady] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const tooltip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setReady(false);
    const timer = window.setTimeout(() => setReady(true), 100);
    return () => window.clearTimeout(timer);
  }, [anchor, text]);

  useLayoutEffect(() => {
    if (!ready) return;
    function place() {
      const rect = anchor.getBoundingClientRect();
      const bubble = tooltip.current?.getBoundingClientRect();
      if (!bubble) return;
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0;
      const topEdge = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? document.documentElement.clientWidth;
      const height = viewport?.height ?? window.innerHeight;
      const gap = 8;
      // Hide when a scrolled day leaves its grid's visible area.
      const scroller = anchor.closest('.calendar-scroll')?.getBoundingClientRect();
      if (rect.bottom <= topEdge || rect.top >= topEdge + height || (scroller && (rect.right <= scroller.left || rect.left >= scroller.right))) {
        setPosition(null);
        return;
      }
      const left = Math.max(leftEdge + gap, Math.min(rect.left + rect.width / 2 - bubble.width / 2, leftEdge + width - bubble.width - gap));
      const above = rect.top - bubble.height - gap;
      const top = Math.max(topEdge + gap, Math.min(above >= topEdge + gap ? above : rect.bottom + gap, topEdge + height - bubble.height - gap));
      setPosition({ left, top });
    }
    place();
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    window.visualViewport?.addEventListener('scroll', place);
    return () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('resize', place);
      window.visualViewport?.removeEventListener('scroll', place);
    };
  }, [anchor, text, ready]);

  if (!ready || typeof document === 'undefined') return null;
  return createPortal(<div ref={tooltip} className="calendar-tooltip" aria-hidden="true" style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? 'visible' : 'hidden' }}>{text}</div>, document.body);
}
