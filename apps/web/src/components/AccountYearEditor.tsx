/**
 * Correcting one account's figures, where that account lives.
 *
 * The other half of §18.2's "editing is a takeover". `#/years/:year` remains the
 * bulk surface — December, a stack of statements, every account at once — and
 * this is the other moment: *that 2019 number is wrong*. §22.1 kept them apart
 * because they are different tasks, not because one is a worse version of the
 * other.
 *
 * ## Why this is a different table rather than inputs in the read one
 *
 * The obvious build is to make the first three columns of `HistoryTable`
 * editable in place. It is wrong, and visibly so: that table's other six columns
 * are *derived* — earned, time-weighted return, the legacy figure, the delta in
 * basis points, the benchmark. They cannot update while someone is mid-keystroke
 * without re-deriving the whole history on every character, and if they do not
 * update they sit there stating a return computed from a balance the reader can
 * see they have just changed. Numbers that contradict the box beside them are
 * exactly the class of bug ground rule 5 is about.
 *
 * So editing shows only what can be edited: the year, and the three figures a
 * statement actually gives. The derived view returns when editing ends, with
 * everything recomputed.
 *
 * ## Locked years
 *
 * `existingYearEntry` reports `editable: false` where an observation sits on the
 * year's closing date that this module did not write — which in practice means
 * the legacy import, holding quarter-by-quarter detail an annual box cannot
 * express. Same guard the year editor has, same reason: one December figure
 * must not overwrite four quarters.
 */

import type { Account, BalanceObservation, Flow } from '@varve/core';
import { existingYearEntry, parseAmount, type YearEntry, type YearRow } from '@varve/retirement';
import { useEffect, useMemo, useState } from 'react';
import { money } from '../lib/format.js';
import { MoneyInput } from './MoneyInput.js';

interface Draft {
  balance: string;
  contributed: string;
  fees: string;
}

const FIELDS = ['balance', 'contributed', 'fees'] as const;

const LABEL: Record<(typeof FIELDS)[number], string> = {
  balance: 'Worth at year end',
  contributed: 'Paid in',
  fees: 'Fees',
};

/**
 * A stored amount, as someone would type it.
 *
 * `Money.toString()` is scale-4 — `10000.0000` — which is right for a document
 * and wrong in a text box. The same conversion the year editor makes.
 */
const show = (amount: { toNumber(): number } | null): string =>
  amount === null ? '' : String(amount.toNumber());

export interface YearChange {
  readonly year: number;
  readonly entry: YearEntry;
}

export function AccountYearEditor({
  account,
  rows,
  observations,
  flows,
  onSave,
  onDone,
}: {
  account: Account;
  /**
   * The account's derived years, oldest first.
   *
   * The derived rows rather than bare year numbers, because a locked year needs
   * figures to display and `existingYearEntry` deliberately will not supply
   * them — it reports only records this module wrote, which for an imported year
   * is none. See {@link lockedText}.
   */
  rows: readonly YearRow[];
  observations: readonly BalanceObservation[];
  flows: readonly Flow[];
  onSave: (changes: YearChange[]) => Promise<void>;
  onDone: () => void;
}) {
  const years = useMemo(() => rows.map((r) => r.year), [rows]);
  const byYear = useMemo(() => new Map(rows.map((r) => [r.year, r])), [rows]);

  const existing = useMemo(
    () =>
      new Map(
        years.map((year) => [year, existingYearEntry(account.id, year, observations, flows)]),
      ),
    [years, account.id, observations, flows],
  );

  // Drafts start from what is on record, so the boxes show the figures being
  // corrected rather than making someone retype a year to change one column.
  const initial = useMemo(() => {
    const start = new Map<number, Draft>();
    for (const year of years) {
      const entry = existing.get(year)!;
      start.set(year, {
        balance: show(entry.balance),
        contributed: show(entry.contributed),
        fees: show(entry.fees),
      });
    }
    return start;
  }, [years, existing]);

  const [drafts, setDrafts] = useState<Map<number, Draft>>(initial);
  const [saving, setSaving] = useState(false);

  // `useState(initial)` reads its argument once, on mount. Without this, drafts
  // built from one account's records would still be in the boxes after the page
  // switched to another account — the component sits in the same position in the
  // tree, so React keeps it and its state. Same shape as the mode that outlived
  // its route in §24.4, and the same lesson: a persistent frame makes
  // transitions possible that the state underneath never anticipated.
  useEffect(() => setDrafts(initial), [initial]);

  function update(year: number, field: keyof Draft, value: string) {
    setDrafts((previous) => {
      const next = new Map(previous);
      next.set(year, { ...(next.get(year) ?? { balance: '', contributed: '', fees: '' }), [field]: value });
      return next;
    });
  }

  // A year counts as changed when any of its three boxes differs from what it
  // started as, compared as text: someone who types "12,000" over "12000" has
  // changed nothing, and `parseAmount` says so on the way out.
  const changed = years.filter((year) => {
    if (existing.get(year)?.editable === false) return false;
    const before = initial.get(year)!;
    const now = drafts.get(year)!;
    return FIELDS.some((f) => parseAmount(now[f])?.toString() !== parseAmount(before[f])?.toString());
  });

  async function save() {
    setSaving(true);
    try {
      await onSave(
        changed.map((year) => {
          const draft = drafts.get(year)!;
          return {
            year,
            entry: {
              accountId: account.id,
              balance: parseAmount(draft.balance),
              contributed: parseAmount(draft.contributed),
              fees: parseAmount(draft.fees),
            },
          };
        }),
      );
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="editor" aria-label={`Correct ${account.name}'s figures`}>
      <p className="editor-lead">
        Only what a statement tells you is editable here — everything else on this page is worked
        out from these three. Leave anything you don&rsquo;t have blank; blank means unknown, not
        zero.
      </p>

      <div className="table-scroll">
        <table className="entry-table">
          <thead>
            <tr>
              <th scope="col">Year</th>
              {FIELDS.map((field) => (
                <th key={field} scope="col">
                  {LABEL[field]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...years].reverse().map((year) => {
              const entry = existing.get(year)!;
              const locked = entry.editable === false;
              const draft = drafts.get(year)!;

              return (
                <tr key={year} className={locked ? 'locked' : undefined}>
                  <th scope="row" className="year">
                    {year}
                    {locked ? (
                      <span
                        className="lock"
                        title="Imported from the original database with quarter-by-quarter detail. Editing it here would replace four quarters with one number."
                      >
                        imported
                      </span>
                    ) : null}
                  </th>
                  {FIELDS.map((field) => (
                    <td key={field}>
                      {locked ? (
                        <input
                          type="text"
                          className="amount"
                          value={lockedText(byYear.get(year), field)}
                          disabled
                          readOnly
                          placeholder="—"
                          aria-label={`${LABEL[field]} for ${year}`}
                        />
                      ) : (
                        <MoneyInput
                          value={draft[field]}
                          onChange={(raw) => update(year, field, raw)}
                          placeholder="—"
                          label={`${LABEL[field]} for ${year}`}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="editor-foot">
        <p className="editor-note">
          Money paid in and fees are recorded mid-year, since an annual total has no date of its
          own and the honest assumption is that it accumulated as the year went.
        </p>
        <div className="editor-actions">
          <button type="button" className="ghost" onClick={onDone} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            onClick={save}
            disabled={saving || changed.length === 0}
          >
            {saving
              ? 'Saving…'
              : changed.length === 0
                ? 'Nothing to save'
                : `Save ${changed.length} year${changed.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </footer>
    </section>
  );
}

/**
 * What a locked year shows instead of an input.
 *
 * Read from the *derived* row rather than from `existingYearEntry`, which
 * answers `null` for an imported year by design — it only reports records this
 * module wrote. Driving the page exposed what that meant in practice: an account
 * whose every year came from the import rendered six rows of blank disabled
 * boxes, which reads as "nothing recorded" when the truth is the opposite,
 * quarter-by-quarter (§26.3).
 *
 * Showing the figure does not reopen what the lock protects. The lock is about
 * *editing* — one December box must not overwrite four quarters — and this is
 * read-only text on a disabled row.
 */
function lockedText(row: YearRow | undefined, field: keyof Draft): string {
  if (!row) return '';
  const amount =
    field === 'balance' ? row.endValue : field === 'fees' ? row.fees : row.contributions;
  return amount.isZero() && field !== 'balance' ? '' : money(amount);
}
