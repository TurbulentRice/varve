import { describe, expect, it } from 'vitest';
import {
  Money,
  accountId,
  flowId,
  householdId,
  isoDate,
  m,
  observationId,
  ownerId,
  type Account,
  type BalanceObservation,
  type Flow,
  type FlowKind,
} from '@varve/core';
import { deriveAccountHistories, deriveAccountHistory } from '../src/account.js';
import { deriveHistory } from '../src/history.js';
import type { Ledger } from '../src/ledger.js';

const HOME = { id: householdId('h'), name: 'Test' };
const OLD = accountId('old');
const NEW = accountId('new');
const BENCH = accountId('bench');

const account = (id: typeof OLD, name: string, kind: Account['kind'] = 'retirement'): Account => ({
  id,
  householdId: HOME.id,
  name,
  ownerIds: kind === 'benchmark' ? [] : [ownerId('o1')],
  kind,
  active: true,
});

let seq = 0;
const obs = (acct: typeof OLD, when: string, amount: string): BalanceObservation => ({
  id: observationId(`o${(seq += 1)}`),
  accountId: acct,
  asOf: isoDate(when),
  amount: Money.fromString(amount),
  source: 'manual',
});

const flow = (
  acct: typeof OLD,
  when: string,
  amount: string,
  kind: FlowKind,
  counterparty?: typeof OLD,
): Flow => ({
  id: flowId(`f${(seq += 1)}`),
  accountId: acct,
  occurredOn: isoDate(when),
  amount: Money.fromString(amount),
  kind,
  ...(counterparty ? { counterpartyAccountId: counterparty } : {}),
});

/**
 * A rollover: `old` closes at the end of 2021 and its $50,000 lands in `new`,
 * which was already worth $50,000 and ends 2022 at $110,000.
 *
 * So `new` gained $10,000 by investing and $50,000 by receiving — a distinction
 * the whole ledger exists to keep.
 */
function ledger(): Ledger {
  return {
    household: HOME,
    owners: [{ id: ownerId('o1'), householdId: HOME.id, name: 'Solo' }],
    accounts: [account(OLD, 'Old 401(k)'), account(NEW, 'New IRA'), account(BENCH, 'Index', 'benchmark')],
    observations: [
      obs(OLD, '2020-12-31', '45000'),
      obs(OLD, '2021-12-31', '50000'),
      obs(OLD, '2022-01-01', '0'),

      obs(NEW, '2020-12-31', '40000'),
      obs(NEW, '2021-12-31', '50000'),
      obs(NEW, '2022-01-01', '100000'),
      obs(NEW, '2022-12-31', '110000'),

      obs(BENCH, '2020-12-31', '100'),
      obs(BENCH, '2021-12-31', '110'),
      obs(BENCH, '2022-12-31', '99'),
    ],
    flows: [
      flow(OLD, '2022-01-01', '-50000', 'transfer_out', NEW),
      flow(NEW, '2022-01-01', '50000', 'transfer_in', OLD),
      flow(NEW, '2022-07-01', '-200', 'fee'),
    ],
    notes: [],
    revision: 1,
  };
}

const household = deriveHistory(ledger());

describe('the transfer inversion', () => {
  it('counts a rollover as arriving, where the household nets it away', () => {
    const receiving = deriveAccountHistory(ledger(), NEW);
    const year = receiving.years.find((y) => y.year === 2022)!;

    // $110,000 from $50,000 looks like a 120% year until you notice $50,000 of
    // it walked in the door.
    expect(year.totalGain.toString()).toBe('60000.0000');
    expect(year.organicGain.toString()).toBe('10000.0000');
    expect(year.twr).toBeLessThan(0.2);
  });

  it('leaves the household unaffected by the same move', () => {
    const year = household.years.find((y) => y.year === 2022)!;
    // Both halves are inside the household, so nothing entered or left.
    expect(year.contributions.isZero()).toBe(true);
    expect(year.organicGain.toString()).toBe('10000.0000');
  });

  it('shows the departing account losing the money rather than the value', () => {
    const leaving = deriveAccountHistory(ledger(), OLD);
    const year = leaving.years.find((y) => y.year === 2022)!;

    expect(year.endValue.isZero()).toBe(true);
    // It ended at zero because the money moved, not because it evaporated.
    expect(year.organicGain.isZero()).toBe(true);
  });
});

describe('an account on its own terms', () => {
  const receiving = deriveAccountHistory(ledger(), NEW);

  it('carries the account and its owners', () => {
    expect(receiving.account.name).toBe('New IRA');
    expect(receiving.owners.map((o) => o.name)).toEqual(['Solo']);
  });

  it('reports its own fees, not the whole household one', () => {
    expect(receiving.totalFees.toString()).toBe('200.0000');
    expect(deriveAccountHistory(ledger(), OLD).totalFees.isZero()).toBe(true);
  });

  it('knows when it started and stopped', () => {
    const leaving = deriveAccountHistory(ledger(), OLD);
    expect(leaving.firstYear).toBe(2020);
    expect(leaving.lastYear).toBe(2022);
  });

  it('reads closure from the balance rather than a flag', () => {
    // `active` is still true on both; only the money says otherwise.
    expect(deriveAccountHistory(ledger(), OLD).closed).toBe(true);
    expect(receiving.closed).toBe(false);
  });

  it('compares against the same benchmark the household uses', () => {
    expect(receiving.years.find((y) => y.year === 2021)?.benchmark).toBeCloseTo(0.1, 9);
  });
});

describe('listing accounts', () => {
  const histories = deriveAccountHistories(ledger(), household.currentValue);

  it('leaves the benchmark out — nobody owns an index', () => {
    expect(histories.map((h) => h.account.id)).not.toContain(BENCH);
    expect(histories).toHaveLength(2);
  });

  it('puts open accounts above closed ones', () => {
    expect(histories[0]!.account.id).toBe(NEW);
    expect(histories[1]!.closed).toBe(true);
  });

  it('works out how much of the whole each account is', () => {
    expect(histories[0]!.shareOfHousehold).toBeCloseTo(1, 9);
    expect(histories[1]!.shareOfHousehold).toBe(0);
  });

  it('has shares that sum to one', () => {
    const total = histories.reduce((sum, h) => sum + h.shareOfHousehold, 0);
    expect(total).toBeCloseTo(1, 9);
  });

  it('adds up to the household value', () => {
    const total = Money.sum(histories.map((h) => h.currentValue));
    expect(total.toString()).toBe(household.currentValue.toString());
  });
});

describe('the pathological case', () => {
  it('diverges hardest where a small account is funded fast', () => {
    // The shape that broke the legacy formula worst in the real data: a low
    // starting balance and contributions that dwarf it. Dividing $200 of growth
    // by $1,000 of starting capital calls that a 20% year, when most of the
    // money was only present for half of it.
    const small: Ledger = {
      ...ledger(),
      accounts: [account(NEW, 'Small')],
      observations: [obs(NEW, '2020-12-31', '1000'), obs(NEW, '2021-12-31', '5200')],
      flows: [flow(NEW, '2021-07-01', '4000', 'contribution')],
    };

    const year = deriveAccountHistory(small, NEW).years.find((y) => y.year === 2021)!;
    const gap = (year.legacyReturn! - year.twr) * 10_000;

    expect(year.legacyReturn).toBeCloseTo(0.2, 9); // (5200 − 1000 − 4000) / 1000
    expect(year.twr).toBeCloseTo(0.0666, 3); // against a base that actually grew
    expect(gap).toBeGreaterThan(1_000); // more than ten percentage points out
  });
});

describe('failure', () => {
  it('refuses an account that is not there', () => {
    expect(() => deriveAccountHistory(ledger(), accountId('nope'))).toThrow(RangeError);
  });

  it('gives a share of zero when the household holds nothing', () => {
    expect(deriveAccountHistory(ledger(), NEW, m('0')).shareOfHousehold).toBe(0);
  });
});

describe('fees on an account, year by year', () => {
  const accounts = deriveAccountHistories(ledger());
  const newIra = accounts.find((a) => a.account.id === NEW)!;
  const year2022 = newIra.years.find((y) => y.year === 2022)!;

  it('reports the fee in the year it was charged', () => {
    // This was blank for every year of every account until §27. The lifetime
    // total was right and the household's own year rows were right, so the only
    // place it showed was the one nothing had ever displayed.
    expect(year2022.fees.format()).toBe('$200.00');
  });

  it('agrees with the lifetime total when there is only one year of fees', () => {
    // Two derivations of the same quantity, from different code paths. They
    // disagreed before, and nothing said so.
    expect(newIra.totalFees.format()).toBe(year2022.fees.format());
  });

  it('agrees with what the household reports for the same year', () => {
    // The account and the household read the same fee out of the same record.
    // A discrepancy here is what §26.3 wrongly believed it had found; it is
    // worth an assertion so that a future change cannot make it true.
    const householdYear = household.years.find((y) => y.year === 2022)!;
    expect(householdYear.fees.format()).toBe(year2022.fees.format());
  });

  it('still leaves the fee inside the return rather than adding it back', () => {
    // Showing the fee must not have quietly made it external. The account began
    // 2022 at $50,000, received $50,000, ended at $110,000 and paid $200 — so it
    // earned $10,000 net, not $10,200.
    expect(year2022.organicGain.format()).toBe('$10,000.00');
  });
});
