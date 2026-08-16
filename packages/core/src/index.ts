/**
 * Pure calculation core.
 *
 * No I/O, no storage, no framework, no dependencies — the same shape that made
 * `financetools` reusable, applied to portfolio measurement. Every function
 * here takes plain data and returns plain data, so it runs identically in a
 * browser, on a server, in a test, or inside a mobile app.
 */

export { Money, m, SCALE, divRoundHalfEven } from './money.js';

export {
  isoDate,
  epochDay,
  fromEpochDay,
  daysBetween,
  compareDates,
  addDays,
  midpoint,
  yearOf,
  daysInMonth,
  quarterStart,
  quarterEnd,
  yearStart,
  yearEnd,
  rangeDays,
  rangeContains,
  calendarYearRange,
  type IsoDate,
  type Quarter,
  type DateRange,
} from './time.js';

export {
  isExternalFlow,
  validateFlow,
  householdId,
  ownerId,
  accountId,
  observationId,
  flowId,
  noteId,
  loanId,
  loanObservationId,
  loanPaymentId,
  incomeObservationId,
  type IncomeObservation,
  type IncomeObservationId,
  type Loan,
  type LoanId,
  type LoanKind,
  type LoanObservation,
  type LoanObservationId,
  type LoanPayment,
  type LoanPaymentId,
  type Note,
  type NoteId,
  type Household,
  type HouseholdId,
  type Owner,
  type OwnerId,
  type Account,
  type AccountId,
  type AccountKind,
  type BalanceObservation,
  type ObservationId,
  type ObservationSource,
  type Flow,
  type FlowId,
  type FlowKind,
  type FeeTreatment,
} from './types.js';

export {
  modifiedDietz,
  timeWeightedReturn,
  annualize,
  chainLink,
  totalGain,
  organicGain,
  simpleOrganicReturn,
  feeDrag,
  type DatedFlow,
  type DatedBalance,
  type SubPeriod,
  type SubPeriodResult,
  type TimeWeightedReturn,
  type ReturnOptions,
  type FeeDrag,
} from './returns.js';

export {
  balanceAsOf,
  summarizePeriod,
  summarizeYear,
  externalFlowsForGroup,
  aggregateBalances,
  arithmeticMean,
  geometricMean,
  rollingAverage,
  netWorthSeries,
  netWorthNow,
  incomeAsOf,
  ageInYear,
  type NetWorthPoint,
  type BalanceAt,
  type PeriodSummary,
} from './aggregate.js';

export {
  project,
  yearReaching,
  milestonesFor,
  AGE_MILESTONES,
  type ContributionTiming,
  type ProjectionAssumptions,
  type ProjectedYear,
  type Milestone,
} from './projection.js';
