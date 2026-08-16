/**
 * Three ways to arrive at a contribution, one shape coming out.
 *
 * The point of the modes is that they differ in how a number is *chosen* and not
 * at all in what the projection does with it (§29.2). So most of what is
 * asserted here is that they agree where they should, and that the mode which
 * needs nothing keeps working on a ledger that holds nothing.
 */

import { describe, expect, it } from 'vitest';
import {
  householdId,
  incomeObservationId,
  isoDate,
  m,
  ownerId,
  type IncomeObservation,
  type Owner,
} from '@varve/core';
import { savingSchedule } from '../src/lib/saving.js';
import type { SavingSettings } from '../src/components/SavingControl.js';

const HOME = householdId('h');
const ADA = ownerId('ada');
const BEN = ownerId('ben');

const owner = (id: typeof ADA, name: string, birthYear?: number): Owner => ({
  id,
  householdId: HOME,
  name,
  ...(birthYear === undefined ? {} : { birthYear }),
});

let seq = 0;
const earns = (id: typeof ADA, amount: string): IncomeObservation => ({
  id: incomeObservationId(`inc${(seq += 1)}`),
  ownerId: id,
  asOf: isoDate('2026-01-01'),
  annualAmount: m(amount),
  source: 'manual',
});

const OWNERS = [owner(ADA, 'Ada', 1980), owner(BEN, 'Ben', 1975)];
const INCOMES = [earns(ADA, '100000'), earns(BEN, '50000')];
const ASOF = isoDate('2026-06-30');

const base: SavingSettings = {
  mode: 'amount',
  amount: 12_000,
  rate: 0.1,
  savers: [],
  custom: null,
};

function run(settings: Partial<SavingSettings>, years = 5) {
  return savingSchedule({
    settings: { ...base, ...settings },
    overrides: [],
    owners: OWNERS,
    incomes: INCOMES,
    asOf: ASOF,
    years,
  });
}

describe('a flat dollar amount', () => {
  it('is the same figure every year', () => {
    // The mode §28 removed and §29.2 put back. It is the default because it is
    // the one that needs nothing on file.
    const result = run({ mode: 'amount', amount: 12_000 });

    expect(result.schedule).toHaveLength(5);
    expect(result.schedule.every((y) => y.format() === '$12,000.00')).toBe(true);
    expect(result.firstYearTotal.format()).toBe('$12,000.00');
  });

  it('works on a ledger with nobody and nothing in it', () => {
    const result = savingSchedule({
      settings: { ...base, amount: 5_000 },
      overrides: [],
      owners: [],
      incomes: [],
      asOf: ASOF,
      years: 3,
    });

    expect(result.firstYearTotal.format()).toBe('$5,000.00');
    expect(result.missingIncome).toEqual([]);
  });

  it('reports nothing missing, because it needs no salary at all', () => {
    const result = savingSchedule({
      settings: base,
      overrides: [],
      owners: OWNERS,
      incomes: [],
      asOf: ASOF,
      years: 3,
    });

    expect(result.missingIncome).toEqual([]);
  });
});

describe('a share of selected salaries', () => {
  it('counts only the people picked', () => {
    const both = run({ mode: 'percent', rate: 0.1, savers: [ADA, BEN] });
    const adaOnly = run({ mode: 'percent', rate: 0.1, savers: [ADA] });

    expect(both.firstYearTotal.format()).toBe('$15,000.00');
    expect(adaOnly.firstYearTotal.format()).toBe('$10,000.00');
  });

  it('comes to nothing when nobody is picked', () => {
    // Not an error state — it is what the control looks like the moment someone
    // switches mode and has not chosen yet.
    const result = run({ mode: 'percent', rate: 0.2, savers: [] });

    expect(result.firstYearTotal.isZero()).toBe(true);
  });

  it('still describes everybody, so the chips have names for the unpicked', () => {
    const result = run({ mode: 'percent', rate: 0.1, savers: [ADA] });

    expect(result.plan.savers.map((s) => s.owner.name)).toEqual(['Ada', 'Ben']);
  });

  it('names a picked person with no salary on file', () => {
    const result = savingSchedule({
      settings: { ...base, mode: 'percent', rate: 0.1, savers: [ADA, BEN] },
      overrides: [],
      owners: OWNERS,
      incomes: [earns(ADA, '100000')],
      asOf: ASOF,
      years: 3,
    });

    expect(result.missingIncome.map((o) => o.name)).toEqual(['Ben']);
    // And the ones who are known still count — an unknown is not contagious.
    expect(result.firstYearTotal.format()).toBe('$10,000.00');
  });

  it('lets a per-person override beat the shared rate', () => {
    const result = savingSchedule({
      settings: { ...base, mode: 'percent', rate: 0.1, savers: [ADA, BEN] },
      overrides: [{ ownerId: ADA, rate: 0.25, retirementAge: null }],
      owners: OWNERS,
      incomes: INCOMES,
      asOf: ASOF,
      years: 3,
    });

    // Ada at 25% of 100,000 plus Ben at the shared 10% of 50,000.
    expect(result.firstYearTotal.format()).toBe('$30,000.00');
  });

  it('steps down when an override says somebody stops', () => {
    const result = savingSchedule({
      settings: { ...base, mode: 'percent', rate: 0.1, savers: [ADA, BEN] },
      // Ada is 46 in 2026, so stopping at 48 is two more years.
      overrides: [{ ownerId: ADA, rate: 0.1, retirementAge: 48 }],
      owners: OWNERS,
      incomes: INCOMES,
      asOf: ASOF,
      years: 5,
    });

    expect(result.schedule[0]!.format()).toBe('$15,000.00');
    expect(result.schedule[1]!.format()).toBe('$15,000.00');
    expect(result.schedule[2]!.format()).toBe('$5,000.00');
  });
});

describe('a salary belonging to nobody', () => {
  it('models a figure that is not in the ledger', () => {
    // A model room must not demand a record before it will model anything
    // (§29.2), so this is the case that keeps the percentage mode usable on an
    // empty ledger.
    const result = run({ mode: 'percent', rate: 0.15, custom: 120_000 });

    expect(result.firstYearTotal.format()).toBe('$18,000.00');
  });

  it('runs the whole horizon, because a figure with no person has no age', () => {
    const result = run({ mode: 'percent', rate: 0.15, custom: 120_000 }, 4);

    expect(result.schedule).toHaveLength(4);
    expect(result.schedule.every((y) => y.format() === '$18,000.00')).toBe(true);
    expect(result.yearsToLastRetirement).toBeNull();
  });

  it('reports nothing missing, since it asked nobody for a salary', () => {
    const result = savingSchedule({
      settings: { ...base, mode: 'percent', rate: 0.1, savers: [], custom: 90_000 },
      overrides: [],
      owners: OWNERS,
      incomes: [],
      asOf: ASOF,
      years: 3,
    });

    expect(result.missingIncome).toEqual([]);
  });
});

describe('the modes agree where they should', () => {
  it('gives the same schedule for a percentage and the amount it comes to', () => {
    // 10% of Ada's $100,000 is $10,000, and nothing about the projection should
    // be able to tell which way the reader arrived at it.
    const asPercent = savingSchedule({
      settings: { ...base, mode: 'percent', rate: 0.1, savers: [ADA] },
      overrides: [{ ownerId: ADA, rate: 0.1, retirementAge: null }],
      owners: OWNERS,
      incomes: INCOMES,
      asOf: ASOF,
      years: 4,
    });
    const asAmount = run({ mode: 'amount', amount: 10_000 }, 4);

    expect(asPercent.schedule.map((y) => y.format())).toEqual(
      asAmount.schedule.map((y) => y.format()),
    );
  });
});
