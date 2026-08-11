import { useEffect, useRef, useState } from 'react';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * Track an element's rendered size.
 *
 * Charts need real pixel dimensions to build scales, and a chart sized from a
 * CSS percentage cannot compute where anything goes. A `ResizeObserver` keeps
 * the scales correct through window resizes, sidebar toggles, and the container
 * query-ish reflows that a fixed `viewBox` would silently distort.
 */
export function useMeasure<T extends Element>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((previous) =>
        previous.width === width && previous.height === height
          ? previous
          : { width, height },
      );
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}
