import type { ReactNode } from 'react';

/**
 * Collapsible detail.
 *
 * Built on native `<details>`, which brings keyboard support, screen-reader
 * semantics, and find-in-page for free — all of which a div-and-onClick version
 * has to reimplement and usually doesn't.
 *
 * Every chart here has one of these holding its table twin. That serves two
 * things at once: readers who want the numbers rather than the picture, and the
 * requirement that no value be reachable only by hovering a chart.
 */
export function Disclosure({
  summary,
  hint,
  children,
  open = false,
}: {
  summary: string;
  hint?: string;
  children: ReactNode;
  open?: boolean;
}) {
  return (
    <details className="disclosure" open={open}>
      <summary>
        <span className="disclosure-marker" aria-hidden="true" />
        <span className="disclosure-title">{summary}</span>
        {hint ? <span className="disclosure-hint">{hint}</span> : null}
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}
