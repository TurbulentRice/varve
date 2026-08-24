/**
 * The persistent frame: who this is, where you can go, and what you can do to
 * the document itself.
 *
 * ## Why the actions split
 *
 * §18.2 counted **three kinds of action in one masthead row** — navigate to
 * debts, manage the file, edit the numbers — set as three identical ghost
 * buttons. That is the row telling you they are the same kind of thing when
 * they are not: one changes where you are, one changes what is on disk, one
 * opens a form.
 *
 * So navigation is a nav, and it is the only thing in the header that moves you
 * between places. Export and Open act on the document and sit together, apart
 * from the nav and set quieter. "Update numbers" stays prominent because it is
 * the one thing a person comes here to *do* rather than to look at.
 *
 * ## The editor keeps the frame
 *
 * §18.2's complaint about editing was that `#/years/2025` "replaces the entire
 * application with a form". Rendering the editor inside this shell is most of
 * the fix, and it costs nothing: leaving a form should not require finding the
 * single button that does it. The nav marks nothing current while the editor is
 * open, because a task is not a place (see `sectionOf`).
 */

import type { ReactNode } from 'react';
import { formatRoute, sectionOf, type Route } from '../routing/route.js';

/** The destinations, in the order they are read. Each takes no parameters. */
const DESTINATIONS: readonly { route: Route; label: string }[] = [
  { route: { view: 'overview' }, label: 'Overview' },
  { route: { view: 'debts' }, label: 'Debts' },
  { route: { view: 'plan' }, label: 'Plan' },
];

export function Shell({
  householdName,
  owners,
  route,
  onUpdateNumbers,
  onExport,
  onOpenFile,
  children,
}: {
  householdName: string;
  owners: string;
  route: Route;
  onUpdateNumbers: () => void;
  onExport: () => void;
  onOpenFile: (file: File) => void;
  children: ReactNode;
}) {
  const current = sectionOf(route);

  return (
    <div className="page">
      <header className="shell">
        <div className="shell-identity">
          <span className="shell-household">{householdName}</span>
          <span className="shell-owners">{owners}</span>
        </div>

        <nav className="shell-nav" aria-label="Sections">
          {DESTINATIONS.map(({ route: destination, label }) => (
            <a
              key={destination.view}
              className={current === destination.view ? 'shell-link current' : 'shell-link'}
              // A real anchor, not a button: middle-click, open-in-new-tab and
              // copy-link-address are things people do to navigation, and a
              // button silently does none of them. The href is a hash, so the
              // browser's own handling is the navigation — nothing to intercept.
              href={formatRoute(destination)}
              aria-current={current === destination.view ? 'page' : undefined}
            >
              {label}
            </a>
          ))}
        </nav>

        <div className="shell-actions">
          <button type="button" className="primary" onClick={onUpdateNumbers}>
            Update numbers
          </button>
          <div className="shell-data">
            <button
              type="button"
              className="ghost"
              onClick={onExport}
              title="Download everything as a file you keep"
            >
              Export
            </button>
            <label className="ghost open">
              Open…
              <input
                type="file"
                accept=".json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onOpenFile(file);
                }}
              />
            </label>
          </div>
        </div>
      </header>

      <main className="shell-body">{children}</main>
    </div>
  );
}
