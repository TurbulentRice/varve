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
import { percent } from '../lib/format.js';

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
 * Only for pages whose title is *not* already in the navigation — an account or
 * a loan, named by something the shell cannot show. §31.5 removed it from
 * Overview, Debts, Plan and the record room, where it repeated the lit nav item
 * for 61px a page.
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

/**
 * One quantity against its own whole — a share, as a figure with a bar behind it.
 *
 * A meter, not a chart. The figure carries the value and the bar carries the
 * proportion at a glance; reading the bar is never required, which is why it is
 * `aria-hidden` and the percentage is not.
 *
 * It arrived here the way the bound in the module header says things should:
 * written for accounts, written again identically for debts, extracted on the
 * second. The 1% floor on the fill is so that a real but tiny share still shows
 * a mark — a share of nothing is rendered as a dash by the caller, so this
 * component never has to decide which of the two it is looking at.
 */
export function ShareBar({ share }: { share: number }) {
  return (
    <span className="share">
      <span className="share-value">{percent(share, 0)}</span>
      <span className="share-track" aria-hidden="true">
        <span className="share-fill" style={{ width: `${Math.max(share * 100, 1)}%` }} />
      </span>
    </span>
  );
}
