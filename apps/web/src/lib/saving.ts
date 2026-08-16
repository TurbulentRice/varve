/**
 * Turning what the saving control says into what the simulation needs.
 *
 * Three ways to arrive at a contribution and one shape coming out — a schedule,
 * one figure per projected year (§28.4). Which is the point of doing it here
 * rather than in the component: the modes differ in how a number is *chosen* and
 * not at all in what the projection then does with it, so the branch belongs in
 * a function that can be tested rather than in a render.
 *
 * Same move as `net-worth.ts` and `debts.ts`, and the same reason (§22.4).
 */

import { Money, type IncomeObservation, type IsoDate, type Owner } from '@varve/core';
import { contributionPlan, type ContributionPlan, type SaverIntent } from '@varve/retirement';
import type { PersonOverride, SavingSettings } from '../components/SavingControl.js';

export interface SavingInput {
  readonly settings: SavingSettings;
  readonly overrides: readonly PersonOverride[];
  readonly owners: readonly Owner[];
  readonly incomes: readonly IncomeObservation[];
  readonly asOf: IsoDate;
  readonly years: number;
}

export interface SavingResult {
  /** One figure per projected year. Feeds `SimulationInput.contributionSchedule`. */
  readonly schedule: readonly Money[];
  /** What goes in during the first year — what the control reports. */
  readonly firstYearTotal: Money;
  /** Everyone in the household, resolved. Drives the chips and the overrides. */
  readonly plan: ContributionPlan;
  /** Selected people with a rate but no salary on record. */
  readonly missingIncome: readonly Owner[];
  /** Years until the last selected person stops, or `null` when unknowable. */
  readonly yearsToLastRetirement: number | null;
}

/** A flat schedule — the same figure every year, for the whole horizon. */
function flat(amount: Money, years: number): Money[] {
  return Array.from({ length: Math.max(years, 0) }, () => amount);
}

export function savingSchedule(input: SavingInput): SavingResult {
  const { settings, overrides, owners, incomes, asOf, years } = input;

  // Everyone, always — the chips need names and salaries for people who are not
  // currently selected, and the overrides need ages. Selection is applied below
  // rather than by narrowing what gets derived.
  const plan = contributionPlan({
    owners,
    incomes,
    intents: owners.map((owner): SaverIntent => {
      const override = overrides.find((o) => o.ownerId === owner.id);
      const selected = settings.savers.includes(owner.id);

      return {
        ownerId: owner.id,
        rate: selected ? (override?.rate ?? settings.rate) : 0,
        retirementAge: selected ? (override?.retirementAge ?? null) : null,
      };
    }),
    asOf,
    years,
  });

  if (settings.mode === 'amount') {
    const amount = Money.fromNumber(settings.amount);
    return {
      schedule: flat(amount, years),
      firstYearTotal: amount,
      plan,
      // A flat amount needs nobody's salary, so nothing can be missing.
      missingIncome: [],
      yearsToLastRetirement: null,
    };
  }

  // A salary belonging to nobody: no age, so no year it stops in, so it runs the
  // whole horizon. That is the honest reading of a figure with no person behind
  // it (§29.2).
  if (settings.custom !== null) {
    const amount = Money.fromNumber(settings.custom).times(settings.rate);
    return {
      schedule: flat(amount, years),
      firstYearTotal: amount,
      plan,
      missingIncome: [],
      yearsToLastRetirement: null,
    };
  }

  return {
    schedule: plan.schedule,
    firstYearTotal: plan.firstYearTotal,
    plan,
    missingIncome: plan.missingIncome,
    yearsToLastRetirement: plan.yearsToLastRetirement,
  };
}
