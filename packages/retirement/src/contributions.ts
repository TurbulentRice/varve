/**
 * What a household actually puts away each year, worked out per person.
 *
 * The Plan page used to ask for one number: *saving each year*, in dollars.
 * Nobody decides that way (§28.1). What a person chooses is a share of what they
 * earn, and the dollars are the consequence — so this takes the share and the
 * earnings and produces the consequence, for each person and for each year.
 *
 * ## Why a schedule rather than a figure
 *
 * Two people do not stop saving in the same year. Ada retiring in twelve years
 * and Ben in eighteen means both shares for twelve years and Ben's alone for six
 * more, and no single annual figure can say that (§28.4). So the output is one
 * amount per projected year, and the projection's horizon is the **last**
 * retirement rather than the first — stopping at the first would silently
 * discard the years somebody is still saving.
 *
 * ## What this refuses to guess
 *
 * A person whose income nobody has recorded contributes `null`, not zero.
 * Ground rule 3, and it matters more here than usual: a zero would flow straight
 * into a projection and quietly model a household saving nothing, which looks
 * like an answer rather than a missing input.
 *
 * A person with no birth year has no retirement year, so their contribution runs
 * for the whole horizon. That is the honest reading — nothing is known that
 * would stop it — and the interface says whose age is missing rather than
 * inventing one.
 */

import { Money, ageInYear, type IncomeObservation, type IsoDate, type Owner } from '@varve/core';

/** What one person intends. Settings, not records — see §28.3. */
export interface SaverIntent {
  readonly ownerId: Owner['id'];
  /** Fraction of income, so `0.15` is 15%. A rate, hence a number (§11.3). */
  readonly rate: number;
  /** The age they mean to stop at. `null` leaves them saving for the horizon. */
  readonly retirementAge: number | null;
}

export interface SaverPlan {
  readonly owner: Owner;
  readonly rate: number;
  /** Annualised, as of the date asked for. `null` where nothing is recorded. */
  readonly income: Money | null;
  /**
   * The date that figure was actually true — which is not the date asked for.
   *
   * A salary is carried forward from when it was recorded, so a projection run
   * today may be using a figure from two years ago. Surfacing the date is the
   * same instinct as `LoanState.asOf`: a number from a stale reading is a
   * different claim from one taken this morning.
   */
  readonly incomeAsOf: IsoDate | null;
  /** `income × rate`, or `null` when income is unknown. */
  readonly annualContribution: Money | null;
  /** Their age at the end of the base year, or `null` without a birth year. */
  readonly age: number | null;
  /**
   * How many more years they save, counting from the base year.
   *
   * `null` where it cannot be known — no birth year, or no stated retirement
   * age. Zero where they have already reached it, which is a real answer and
   * not a missing one.
   */
  readonly yearsRemaining: number | null;
}

export interface ContributionPlan {
  readonly savers: readonly SaverPlan[];
  /** Everyone still saving in the first projected year, summed. */
  readonly firstYearTotal: Money;
  /**
   * One amount per projected year, oldest first, length `years`.
   *
   * Steps down as each person reaches their retirement age. Feeds
   * `SimulationInput.contributionSchedule`.
   */
  readonly schedule: readonly Money[];
  /** Years until the last person stops, or `null` when nobody has an age. */
  readonly yearsToLastRetirement: number | null;
  /** Savers with a rate above zero and no income on record. */
  readonly missingIncome: readonly Owner[];
}

export interface ContributionPlanInput {
  readonly owners: readonly Owner[];
  readonly incomes: readonly IncomeObservation[];
  readonly intents: readonly SaverIntent[];
  /** The date incomes are read as of, and the year ages are taken in. */
  readonly asOf: IsoDate;
  /** How many years the projection runs. */
  readonly years: number;
}

/**
 * The most recent income record for a person on or before a date.
 *
 * `core`'s `incomeAsOf` answers the amount; this keeps the record so the date
 * survives too. Same carry-forward rule either way (§28.2).
 */
function latestIncome(
  incomes: readonly IncomeObservation[],
  owner: Owner['id'],
  asOf: IsoDate,
): IncomeObservation | undefined {
  let best: IncomeObservation | undefined;
  for (const observation of incomes) {
    if (observation.ownerId !== owner) continue;
    if (observation.asOf > asOf) continue;
    if (!best || observation.asOf > best.asOf) best = observation;
  }
  return best;
}

export function contributionPlan(input: ContributionPlanInput): ContributionPlan {
  const { owners, incomes, intents, asOf, years } = input;
  const baseYear = Number(asOf.slice(0, 4));

  const byOwner = new Map(intents.map((i) => [i.ownerId, i]));

  const savers = owners.map((owner): SaverPlan => {
    const intent = byOwner.get(owner.id);
    const rate = intent?.rate ?? 0;
    const latest = latestIncome(incomes, owner.id, asOf);
    const income = latest?.annualAmount ?? null;
    const age = ageInYear(owner.birthYear, baseYear);

    const retirementAge = intent?.retirementAge ?? null;
    const yearsRemaining =
      age === null || retirementAge === null ? null : Math.max(retirementAge - age, 0);

    return {
      owner,
      rate,
      income,
      incomeAsOf: latest?.asOf ?? null,
      // A rate applied to an unknown income is unknown, not zero.
      annualContribution: income === null ? null : income.times(rate),
      age,
      yearsRemaining,
    };
  });

  // Year `i` counts a saver whose remaining years exceed `i`. A saver with no
  // known stopping point counts throughout, which is what "nothing says they
  // stop" means.
  const schedule = Array.from({ length: Math.max(years, 0) }, (_, i) =>
    Money.sum(
      savers
        .filter((s) => s.annualContribution !== null && (s.yearsRemaining === null || i < s.yearsRemaining))
        .map((s) => s.annualContribution!),
    ),
  );

  const known = savers.map((s) => s.yearsRemaining).filter((y): y is number => y !== null);

  return {
    savers,
    firstYearTotal: schedule[0] ?? Money.zero(),
    schedule,
    yearsToLastRetirement: known.length === 0 ? null : Math.max(...known),
    missingIncome: savers.filter((s) => s.rate > 0 && s.income === null).map((s) => s.owner),
  };
}
