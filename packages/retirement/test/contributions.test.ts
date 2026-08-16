/**
 * Contributions worked out per person, and the schedule they produce.
 *
 * The arithmetic is a multiplication. What is worth testing is everything
 * around it: that an unknown income stays unknown rather than becoming zero,
 * that two people stopping in different years actually step the schedule down,
 * and that the horizon runs to the last retirement rather than the first.
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
import { contributionPlan, type SaverIntent } from '../src/contributions.js';

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
const earns = (id: typeof ADA, when: string, amount: string): IncomeObservation => ({
  id: incomeObservationId(`inc${(seq += 1)}`),
  ownerId: id,
  asOf: isoDate(when),
  annualAmount: m(amount),
  source: 'manual',
});

const intent = (id: typeof ADA, rate: number, retirementAge: number | null): SaverIntent => ({
  ownerId: id,
  rate,
  retirementAge,
});

const ASOF = isoDate('2026-06-30');

describe('what one person puts away', () => {
  it('is their share of what they earn', () => {
    const plan = contributionPlan({
      owners: [owner(ADA, 'Ada', 1980)],
      incomes: [earns(ADA, '2026-01-01', '95000')],
      intents: [intent(ADA, 0.12, 65)],
      asOf: ASOF,
      years: 10,
    });

    expect(plan.savers[0]!.annualContribution!.format()).toBe('$11,400.00');
  });

  it('reads the most recent salary on or before the date, not the newest on file', () => {
    // A raise dated next year has not happened yet. Same carry-forward rule a
    // balance obeys (§28.2).
    const plan = contributionPlan({
      owners: [owner(ADA, 'Ada', 1980)],
      incomes: [
        earns(ADA, '2024-01-01', '80000'),
        earns(ADA, '2026-01-01', '95000'),
        earns(ADA, '2027-01-01', '120000'),
      ],
      intents: [intent(ADA, 0.1, 65)],
      asOf: ASOF,
      years: 10,
    });

    expect(plan.savers[0]!.income!.format()).toBe('$95,000.00');
    // And the date it was true survives, because a figure carried forward from
    // two years ago is a different claim from one entered this morning.
    expect(plan.savers[0]!.incomeAsOf).toBe('2026-01-01');
  });

  it('works out an age from the birth year and the year asked about', () => {
    const plan = contributionPlan({
      owners: [owner(ADA, 'Ada', 1980)],
      incomes: [earns(ADA, '2026-01-01', '95000')],
      intents: [intent(ADA, 0.1, 65)],
      asOf: ASOF,
      years: 10,
    });

    expect(plan.savers[0]!.age).toBe(46);
    expect(plan.savers[0]!.yearsRemaining).toBe(19);
  });
});

describe('what it refuses to guess', () => {
  it('leaves an unrecorded income unknown rather than calling it zero', () => {
    // Ground rule 3, and it bites harder here than usual: a zero would flow
    // straight into a projection and model a household saving nothing, which
    // looks like an answer instead of a missing input.
    const plan = contributionPlan({
      owners: [owner(ADA, 'Ada', 1980)],
      incomes: [],
      intents: [intent(ADA, 0.12, 65)],
      asOf: ASOF,
      years: 10,
    });

    expect(plan.savers[0]!.income).toBeNull();
    expect(plan.savers[0]!.annualContribution).toBeNull();
    expect(plan.firstYearTotal.isZero()).toBe(true);
  });

  it('names whose income is missing, but only where a rate was actually set', () => {
    // Somebody saving nothing needs no salary on file, so reporting them as
    // missing would be noise on the one strip that must stay quiet when nothing
    // is wrong.
    const plan = contributionPlan({
      owners: [owner(ADA, 'Ada', 1980), owner(BEN, 'Ben', 1975)],
      incomes: [],
      intents: [intent(ADA, 0.12, 65), intent(BEN, 0, 62)],
      asOf: ASOF,
      years: 10,
    });

    expect(plan.missingIncome.map((o) => o.name)).toEqual(['Ada']);
  });

  it('keeps a person with no birth year saving for the whole horizon', () => {
    // Nothing is known that would stop them, so nothing stops them. The
    // interface says whose age is missing rather than inventing one.
    const plan = contributionPlan({
      owners: [owner(ADA, 'Ada')],
      incomes: [earns(ADA, '2026-01-01', '100000')],
      intents: [intent(ADA, 0.1, 65)],
      asOf: ASOF,
      years: 5,
    });

    expect(plan.savers[0]!.yearsRemaining).toBeNull();
    expect(plan.schedule.every((y) => y.format() === '$10,000.00')).toBe(true);
  });

  it('reports someone already past their retirement age as having zero years, not negative', () => {
    const plan = contributionPlan({
      owners: [owner(ADA, 'Ada', 1950)],
      incomes: [earns(ADA, '2026-01-01', '50000')],
      intents: [intent(ADA, 0.1, 65)],
      asOf: ASOF,
      years: 5,
    });

    expect(plan.savers[0]!.yearsRemaining).toBe(0);
    expect(plan.schedule[0]!.isZero()).toBe(true);
  });
});

describe('two people who stop in different years', () => {
  // Ada is 46 and means to stop at 55 — nine years. Ben is 51 and means to stop
  // at 65 — fourteen. So both save for nine years, then Ben alone for five.
  const plan = contributionPlan({
    owners: [owner(ADA, 'Ada', 1980), owner(BEN, 'Ben', 1975)],
    incomes: [earns(ADA, '2026-01-01', '100000'), earns(BEN, '2026-01-01', '50000')],
    intents: [intent(ADA, 0.1, 55), intent(BEN, 0.1, 65)],
    asOf: ASOF,
    years: 16,
  });

  it('sums both while both are saving', () => {
    expect(plan.schedule[0]!.format()).toBe('$15,000.00');
    expect(plan.schedule[8]!.format()).toBe('$15,000.00');
  });

  it('steps down in the year the first one stops', () => {
    // The whole reason a single annual figure cannot express a household (§28.4).
    expect(plan.schedule[9]!.format()).toBe('$5,000.00');
    expect(plan.schedule[13]!.format()).toBe('$5,000.00');
  });

  it('falls to nothing once everybody has stopped', () => {
    expect(plan.schedule[14]!.isZero()).toBe(true);
    expect(plan.schedule[15]!.isZero()).toBe(true);
  });

  it('runs the horizon to the last retirement, not the first', () => {
    // Stopping at the first would discard the five years Ben is still saving,
    // which is the flattering mistake in reverse and just as wrong.
    expect(plan.yearsToLastRetirement).toBe(14);
  });

  it('produces exactly one figure per projected year', () => {
    expect(plan.schedule).toHaveLength(16);
  });
});

describe('nobody saving', () => {
  it('gives a schedule of zeros rather than an empty one', () => {
    // A projection still runs; it just grows on what is already there.
    const plan = contributionPlan({
      owners: [owner(ADA, 'Ada', 1980)],
      incomes: [earns(ADA, '2026-01-01', '95000')],
      intents: [intent(ADA, 0, 65)],
      asOf: ASOF,
      years: 3,
    });

    expect(plan.schedule).toHaveLength(3);
    expect(plan.schedule.every((y) => y.isZero())).toBe(true);
    expect(plan.missingIncome).toEqual([]);
  });

  it('handles a household with no owners at all', () => {
    const plan = contributionPlan({ owners: [], incomes: [], intents: [], asOf: ASOF, years: 3 });

    expect(plan.savers).toEqual([]);
    expect(plan.yearsToLastRetirement).toBeNull();
    expect(plan.firstYearTotal.isZero()).toBe(true);
  });
});
