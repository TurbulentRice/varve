/**
 * The small shared layer, bounded by what already repeats.
 *
 * §19.4 proposed five components before the surfaces multiply. This is three
 * ideas — a tile and its row, a page title, a way back — and the difference is
 * the bound stated in §22.1: **two call sites or it waits**. Each was already
 * written more than once by hand, `Tile` three separate times and identically,
 * so extracting them removes duplication that exists rather than predicting
 * duplication that might.
 *
 * `list-row` and `stat` from that list are deliberately absent. They would be
 * designed against pages nobody has built yet, which is how a component layer
 * ends up fitting nothing.
 */

import type { ReactNode } from 'react';

/**
 * A labelled figure with a line of context under it.
 *
 * `value` is a string rather than `Money`, because tiles show percentages,
 * dashes and dates as readily as amounts, and the caller is the only one that
 * knows which formatter applies.
 */
export function Tile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail: ReactNode;
  /**
   * Reinforcement only. Every figure that can be negative already shows a sign,
   * and that sign is the real channel — green against red separates by about
   * ΔE 4 under deuteranopia (§10), so colour never carries this alone.
   */
  tone?: 'negative' | undefined;
}) {
  return (
    <div className="tile">
      <div className="tile-label">{label}</div>
      {/* Proportional figures: tabular digits make a display number look gappy. */}
      <div className={tone === 'negative' ? 'tile-value negative' : 'tile-value'}>{value}</div>
      <div className="tile-detail">{detail}</div>
    </div>
  );
}

export function Tiles({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="tiles" aria-label={label}>
      {children}
    </section>
  );
}

/**
 * A page's name and what qualifies it.
 *
 * Every surface had its own arrangement of this before — an `h1` here, an `h2`
 * inside a wrapper there, a `p.subtitle` in both — which is exactly the drift a
 * shared layer exists to stop. One heading level, because each of these is now
 * the title of its own page rather than a section of a longer one.
 */
export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-title">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-title-actions">{actions}</div> : null}
    </header>
  );
}

/** The way back out of a detail page, in the one place it always sits. */
export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="ghost back" onClick={onClick}>
      ← {label}
    </button>
  );
}
