/**
 * Forward projection.
 *
 * Reproduces the legacy spreadsheet's rule — `next = prior × (1 + r) + annual
 * contribution` — as the default, because a single assumed rate is the right
 * baseline and it is what the existing history was planned against.
 *
 * It answers "what if every year is average?", which no year is. Sequence-of-
 * returns risk is the real threat to a retirement plan, and this dataset
 * contains its own counter-example: 2022 came in between −29% and −30%. A
 * historical-sequence or Monte Carlo mode belongs here later; the shape below
 * is meant to accommodate one without changing callers.
 */

import { Money } from './money.js';

/** When during the year contributions land. */
export type ContributionTiming =
  /** Contributed up front; earns a full year of growth. */
  | 'start'
  /** Contributed at year end; earns nothing that year. Matches the legacy sheet. */
  | 'end'
  /** Spread evenly; earns roughly half a year of growth. */
  | 'monthly';

export interface ProjectionAssumptions {
  /** Expected annual return. The legacy default is `0.07`. */
  readonly annualReturn: number;
  /** Contributed each year. The legacy default is `$10,000`. */
  readonly annualContribution: Money;
  readonly years: number;
  /** Defaults to `'end'`, matching the legacy spreadsheet. */
  readonly contributionTiming?: ContributionTiming;
  /** Applied to the contribution each year — e.g. `0.03` to track raises. */
  readonly contributionGrowth?: number;
}

export interface ProjectedYear {
  readonly year: number;
  readonly startValue: Money;
  readonly contribution: Money;
  /** Investment growth alone, excluding the contribution. */
  readonly growth: Money;
  readonly endValue: Money;
  /** Contributions accumulated since the projection began. */
  readonly cumulativeContributions: Money;
  /** Growth accumulated since the projection began. */
  readonly cumulativeGrowth: Money;
}

const TIMING_WEIGHT: Record<ContributionTiming, number> = {
  start: 1,
  end: 0,
  monthly: 0.5,
};

/**
 * Project a balance forward year by year.
 *
 * Contributions earn a fraction of the year's return according to
 * {@link ContributionTiming} — the same weighting idea the Modified Dietz
 * return calculation uses, applied forwards instead of backwards.
 */
export function project(
  startValue: Money,
  startYear: number,
  assumptions: ProjectionAssumptions,
): ProjectedYear[] {
  const {
    annualReturn,
    annualContribution,
    years,
    contributionTiming = 'end',
    contributionGrowth = 0,
  } = assumptions;

  if (years < 0) throw new RangeError('Cannot project a negative number of years');

  const weight = TIMING_WEIGHT[contributionTiming];
  const projected: ProjectedYear[] = [];

  let balance = startValue;
  let contribution = annualContribution;
  let cumulativeContributions = Money.zero();
  let cumulativeGrowth = Money.zero();

  for (let i = 0; i < years; i += 1) {
    const growth = balance.times(annualReturn).plus(contribution.times(annualReturn * weight));
    const endValue = balance.plus(contribution).plus(growth);

    cumulativeContributions = cumulativeContributions.plus(contribution);
    cumulativeGrowth = cumulativeGrowth.plus(growth);

    projected.push({
      year: startYear + i + 1,
      startValue: balance,
      contribution,
      growth,
      endValue,
      cumulativeContributions,
      cumulativeGrowth,
    });

    balance = endValue;
    contribution = contribution.times(1 + contributionGrowth);
  }

  return projected;
}

/**
 * The first projected year to reach `target`, or `null` within the horizon.
 *
 * "When do I get there?" is the question people actually have; the balance
 * table is how it gets answered, not the answer itself.
 */
export function yearReaching(
  projection: readonly ProjectedYear[],
  target: Money,
): ProjectedYear | null {
  return projection.find((year) => year.endValue.compare(target) >= 0) ?? null;
}

// ---------------------------------------------------------------- milestones

/** Age-based events the legacy spreadsheet flagged in its notes column. */
export const AGE_MILESTONES = [
  { age: 59.5, label: 'Penalty-free withdrawals' },
  { age: 62, label: 'Early Social Security' },
  { age: 65, label: 'Medicare' },
  { age: 67, label: 'Full retirement age' },
  { age: 73, label: 'Required minimum distributions' },
] as const;

export interface Milestone {
  readonly year: number;
  readonly age: number;
  readonly label: string;
}

/**
 * Calendar years in which an owner reaches each milestone age.
 *
 * Ages are measured at year end, matching the legacy sheet's "Ages at Year End"
 * column. Fractional ages (59½) resolve to the year the age is first attained.
 */
export function milestonesFor(
  birthYear: number,
  through: number,
  milestones: readonly { age: number; label: string }[] = AGE_MILESTONES,
): Milestone[] {
  return milestones
    .map(({ age, label }) => ({ year: birthYear + Math.ceil(age), age, label }))
    .filter((milestone) => milestone.year <= through)
    .sort((a, b) => a.year - b.year);
}
