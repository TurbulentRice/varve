/**
 * Turning "here are this year's numbers" into ledger records.
 *
 * What someone reads off a year-end statement is three figures per account: what
 * it was worth, what they put in, what it cost. Those are not what the ledger
 * stores, and the translation carries two decisions worth stating plainly rather
 * than burying in a form handler.
 *
 * **Dating.** A closing balance is an observation on 31 December — that is the
 * date the statement describes. A year's contributions and fees have no date at
 * all; the statement gives a total. They are recorded mid-year, because the
 * honest assumption behind an annual total is that it accumulated through the
 * year, and mid-year is what that assumption weights to. Dating them in December
 * would credit the money with no time invested; dating them in January would
 * credit it with a full year.
 *
 * **Identity.** Records get deterministic ids derived from the account and the
 * period. Saving the same year twice therefore *replaces* what was there rather
 * than appending a second copy — so correcting a typo is just typing it again,
 * which is the only forgiving behaviour for a form someone visits once a year
 * and misremembers.
 */

import {
  Money,
  accountId as asAccountId,
  flowId,
  isoDate,
  observationId,
  type Account,
  type AccountId,
  type AccountKind,
  type BalanceObservation,
  type Flow,
  type FlowId,
  type HouseholdId,
  type ObservationId,
  type OwnerId,
} from '@varve/core';

export interface YearEntry {
  readonly accountId: AccountId;
  /** Closing balance. `null` clears whatever was recorded. */
  readonly balance: Money | null;
  /** Paid in over the year; negative means taken out. `null` clears. */
  readonly contributed: Money | null;
  /** Charged over the year, entered positive. `null` clears. */
  readonly fees: Money | null;
}

export interface EntryPlan {
  readonly observations: BalanceObservation[];
  readonly flows: Flow[];
  readonly removedObservations: ObservationId[];
  readonly removedFlows: FlowId[];
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 31 December — the date a year-end statement describes. */
export function closingDate(year: number) {
  return isoDate(`${year}-12-${pad(31)}`);
}

/** 1 July — where an undated annual total is assumed to have accumulated. */
export function midYearDate(year: number) {
  return isoDate(`${year}-07-01`);
}

export const balanceIdFor = (account: AccountId, year: number): ObservationId =>
  observationId(`obs:${account}:${year}`);

export const contributionIdFor = (account: AccountId, year: number): FlowId =>
  flowId(`flow:${account}:${year}:contribution`);

export const feeIdFor = (account: AccountId, year: number): FlowId =>
  flowId(`flow:${account}:${year}:fee`);

/**
 * Work out what to write for a year's worth of entries.
 *
 * Returns records to save and ids to remove; nothing is written here, so the
 * whole translation stays testable without a store.
 */
export function planYearEntry(year: number, entries: readonly YearEntry[]): EntryPlan {
  const plan: EntryPlan = {
    observations: [],
    flows: [],
    removedObservations: [],
    removedFlows: [],
  };

  const asOf = closingDate(year);
  const occurredOn = midYearDate(year);

  for (const entry of entries) {
    const account = entry.accountId;

    if (entry.balance) {
      plan.observations.push({
        id: balanceIdFor(account, year),
        accountId: account,
        asOf,
        amount: entry.balance,
        source: 'manual',
      });
    } else {
      plan.removedObservations.push(balanceIdFor(account, year));
    }

    // A negative contribution is money taken out, which is a different kind of
    // event and must not be filed as a contribution of negative size.
    if (entry.contributed && !entry.contributed.isZero()) {
      plan.flows.push({
        id: contributionIdFor(account, year),
        accountId: account,
        occurredOn,
        amount: entry.contributed,
        kind: entry.contributed.isPositive() ? 'contribution' : 'withdrawal',
      });
    } else {
      plan.removedFlows.push(contributionIdFor(account, year));
    }

    // Fees are entered as a cost and stored as an outflow.
    if (entry.fees && !entry.fees.isZero()) {
      plan.flows.push({
        id: feeIdFor(account, year),
        accountId: account,
        occurredOn,
        amount: entry.fees.isPositive() ? entry.fees.negate() : entry.fees,
        kind: 'fee',
      });
    } else {
      plan.removedFlows.push(feeIdFor(account, year));
    }
  }

  return plan;
}

/**
 * What is already on record for a year, ready to populate a form.
 *
 * Only records this module would itself have written are offered for editing.
 * A year imported from the legacy database holds quarterly detail that an annual
 * form cannot represent, and showing its December figure in an editable box
 * would invite someone to overwrite four quarters with one number.
 */
export function existingYearEntry(
  account: AccountId,
  year: number,
  observations: readonly BalanceObservation[],
  flows: readonly Flow[],
): YearEntry & { readonly editable: boolean } {
  const balanceId = balanceIdFor(account, year);
  const contributionId = contributionIdFor(account, year);
  const feeId = feeIdFor(account, year);

  const observation = observations.find((o) => o.id === balanceId);
  const contribution = flows.find((f) => f.id === contributionId);
  const fee = flows.find((f) => f.id === feeId);

  const closing = closingDate(year);
  const foreign = observations.some((o) => o.accountId === account && o.asOf === closing && o.id !== balanceId);

  return {
    accountId: account,
    balance: observation?.amount ?? null,
    contributed: contribution?.amount ?? null,
    fees: fee ? fee.amount.abs() : null,
    editable: !foreign,
  };
}

/**
 * A new account, ready to save.
 *
 * The id carries a slug of the name so a ledger stays legible read as raw JSON,
 * plus a timestamp so two accounts named the same thing never collide.
 * `benchmark` is not on offer: an index is not something a household opens.
 */
export function newAccount(
  householdId: HouseholdId,
  name: string,
  kind: Exclude<AccountKind, 'benchmark'>,
  ownerIds: readonly OwnerId[],
): Account {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return {
    id: asAccountId(`acct:${slug || 'account'}:${Date.now().toString(36)}`),
    householdId,
    name: name.trim(),
    ownerIds,
    kind,
    active: true,
  };
}

/** Parse what someone typed into a box. Blank means "no value", not zero. */
export function parseAmount(input: string): Money | null {
  const cleaned = input.replace(/[$,\s]/g, '').trim();
  if (cleaned === '' || cleaned === '-') return null;
  try {
    return Money.fromString(cleaned);
  } catch {
    return null;
  }
}
