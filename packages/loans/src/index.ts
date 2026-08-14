/**
 * Loan repayment: amortization schedules and strategy comparison.
 *
 * A peer to `@varve/retirement` over the same `@varve/core`, which is the point
 * — one money type, one set of conventions, two domains. Ported from
 * `financetools` (Python, zero dependencies), with the reasoning and the
 * deliberate departures recorded in §11 of the working doc.
 *
 * Pure throughout: no I/O, no clock, no framework. Same rule as every other
 * domain package here.
 */

export { loanId, type LoanId, type LoanTerms, type Payment, type Installment, type Schedule, type ScheduleAnalysis } from './types.js';

export {
  amortize,
  analyzeSchedule,
  analyzeInstallments,
  canAmortize,
  interestDue,
  minimumPayment,
  monthlyRate,
  payMonth,
  type AmortizationPlan,
} from './amortize.js';

export {
  repay,
  STRATEGIES,
  type Strategy,
  type MinimumMode,
  type RepaymentPlan,
  type Repayment,
} from './strategy.js';

export {
  compareStrategies,
  type Comparison,
  type ComparisonGoal,
  type ComparisonPlan,
} from './compare.js';

export {
  loanState,
  loanStates,
  findLoanState,
  projectLoan,
  compareLedger,
  minimumBudget,
  payable,
  type LoanLedger,
  type LoanState,
  type LoanProjection,
  type RepaymentPlanInput,
  loanCost,
  type LoanCost,
  type LoanPeriod,
} from './ledger.js';

export {
  schedulePosition,
  type Pace,
  type PaceUnknown,
  type Finish,
  type SchedulePosition,
} from './pace.js';

export { isWholeCents, toCents, scaleToCents, divideToCents, allocateCents } from './cents.js';
