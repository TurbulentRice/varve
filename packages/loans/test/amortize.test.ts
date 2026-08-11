import { describe, expect, it } from 'vitest';
import { Money, m } from '@varve/core';
import {
  amortize,
  analyzeSchedule,
  canAmortize,
  interestDue,
  minimumPayment,
  payMonth,
} from '../src/amortize.js';
import { isWholeCents } from '../src/cents.js';
import { loanId, type LoanTerms } from '../src/types.js';

const loan = (over: Partial<LoanTerms> = {}): LoanTerms => ({
  id: loanId('l'),
  title: 'Test loan',
  principal: m('12000'),
  annualRate: 0.06,
  termMonths: 60,
  ...over,
});

describe('a schedule paid at its scheduled minimum', () => {
  const schedule = amortize(loan());

  it('retires the loan within a month of its stated term', () => {
    // The payment is rounded to cents, so it under- or overshoots the term
    // slightly. A final stub payment is normal amortization, not a bug.
    expect(schedule.installments.length).toBeGreaterThanOrEqual(60);
    expect(schedule.installments.length).toBeLessThanOrEqual(61);
    expect(schedule.paidOff).toBe(true);
    expect(schedule.finalBalance.isZero()).toBe(true);
  });

  it('repays exactly the principal it started with — no more, no less', () => {
    expect(analyzeSchedule(schedule).principalPaid.toString()).toBe(
      schedule.openingBalance.toString(),
    );
  });

  it('charges interest that falls every month as the balance does', () => {
    const charges = schedule.installments.map((i) => i.interest.units);
    for (let i = 1; i < charges.length; i += 1) {
      expect(charges[i]! <= charges[i - 1]!).toBe(true);
    }
  });

  it('splits every payment except the last into exactly the payment', () => {
    const payment = minimumPayment(loan());
    for (const i of schedule.installments.slice(0, -1)) {
      expect(i.interest.plus(i.principal).toString()).toBe(payment.toString());
    }
  });

  it('keeps every figure on the cent grid', () => {
    // The whole point of §11.2: a loan schedule is a list of transactions, and
    // a transaction is a whole number of cents.
    for (const i of schedule.installments) {
      expect(isWholeCents(i.interest) && isWholeCents(i.principal) && isWholeCents(i.balance)).toBe(
        true,
      );
    }
  });
});

describe('the scheduled payment', () => {
  it('is the annuity payment for the term', () => {
    // $12,000 at 6% over 60 months is the textbook $231.99.
    expect(minimumPayment(loan()).format()).toBe('$231.99');
  });

  it('spreads the principal evenly when there is no interest to pay', () => {
    // The Python raises `DivisionUndefined` here: the discount factor divides
    // by the rate. An interest-free loan is a real product, and the limit as
    // r → 0 is simply the principal over the term.
    const free = loan({ annualRate: 0, principal: m('12000'), termMonths: 12 });
    expect(minimumPayment(free).format()).toBe('$1,000.00');

    const schedule = amortize(free);
    expect(schedule.installments).toHaveLength(12);
    expect(analyzeSchedule(schedule).interestPaid.isZero()).toBe(true);
  });

  it('refuses a term that is not a term', () => {
    expect(() => minimumPayment(loan({ termMonths: 0 }))).toThrow(RangeError);
  });
});

describe('a payment larger than what is left', () => {
  it('takes only the balance, not the whole payment', () => {
    const paid = payMonth(m('100'), 0.12, m('500'));

    expect(paid.interest.format()).toBe('$1.00'); // 100 × 1%
    expect(paid.principal.format()).toBe('$100.00'); // not $499
    expect(paid.balance.isZero()).toBe(true);
  });

  it('ends the schedule on a stub rather than overshooting into credit', () => {
    const schedule = amortize(loan({ principal: m('1000') }), { payment: m('300') });
    const last = schedule.installments.at(-1)!;

    expect(last.interest.plus(last.principal).compare(m('300'))).toBe(-1);
    expect(schedule.finalBalance.isZero()).toBe(true);
  });
});

describe('a payment too small to cover the interest', () => {
  // $20,000 at 18% accrues $300 a month; paying $100 goes backwards.
  const underwater = loan({ principal: m('20000'), annualRate: 0.18, termMonths: 120 });

  it('puts everything paid toward interest and repays nothing', () => {
    const paid = payMonth(m('20000'), 0.18, m('100'));

    expect(paid.interest.format()).toBe('$100.00');
    expect(paid.principal.isZero()).toBe(true);
  });

  it('names the shortfall instead of letting it vanish into the balance', () => {
    const paid = payMonth(m('20000'), 0.18, m('100'));

    // $300 accrued, $100 was paid, $200 joined the debt. The Python models the
    // balance correctly but records only the $100, so the $200 is inferable and
    // never stated. Here it is stated.
    expect(paid.capitalized.format()).toBe('$200.00');
    expect(paid.balance.format()).toBe('$20,200.00');
  });

  it('refuses to run forever rather than hanging', () => {
    expect(() => amortize(underwater, { payment: m('100') })).toThrow(RangeError);
    expect(() => amortize(underwater, { payment: m('100') })).toThrow(/never retires/);
  });

  it('will still model it when asked for a fixed number of months', () => {
    const schedule = amortize(underwater, { payment: m('100'), maxMonths: 24 });

    expect(schedule.installments).toHaveLength(24);
    expect(schedule.paidOff).toBe(false);
    // Two years of paying $100 a month and the debt is nearly $6,000 larger.
    expect(schedule.finalBalance.compare(underwater.principal)).toBe(1);
    expect(analyzeSchedule(schedule).capitalized.isPositive()).toBe(true);
  });

  it('knows the difference before it starts', () => {
    expect(canAmortize(m('20000'), 0.18, m('100'))).toBe(false);
    expect(canAmortize(m('20000'), 0.18, m('301'))).toBe(true);
    // Exactly covering the interest is not covering it: the balance never moves.
    expect(canAmortize(m('20000'), 0.18, m('300'))).toBe(false);
  });
});

describe('what a schedule adds up to', () => {
  const analysis = analyzeSchedule(amortize(loan()));

  it('has interest and principal that sum to what was paid', () => {
    expect(analysis.interestPaid.plus(analysis.principalPaid).toString()).toBe(
      analysis.totalPaid.toString(),
    );
  });

  it('reports the share going to principal as a fraction, not a percent', () => {
    // A ratio is a `number` here, as everywhere — the seam in §11.3. Five years
    // at 6% costs about $1,920 on $12,000, so roughly 86% of what is paid is
    // the debt itself.
    expect(analysis.percentPrincipal).toBeCloseTo(0.862, 3);
  });

  it('says nothing rather than zero when nothing has been paid', () => {
    const untouched = analyzeSchedule(amortize(loan(), { payment: m('231.99'), maxMonths: 0 }));

    // The Python returns 0 for both, which claims a payment achieved nothing
    // when in fact no payment was made.
    expect(untouched.percentPrincipal).toBeNull();
    expect(untouched.principalToInterest).toBeNull();
  });

  it('says nothing rather than dividing by zero on an interest-free loan', () => {
    const free = analyzeSchedule(amortize(loan({ annualRate: 0, termMonths: 12 })));

    expect(free.principalToInterest).toBeNull(); // the Python raises here
    expect(free.percentPrincipal).toBe(1);
  });
});

describe('interest accrual', () => {
  it('charges a twelfth of the annual rate each month', () => {
    expect(interestDue(m('10000'), 0.06).format()).toBe('$50.00');
  });

  it('rounds the charge to cents and no finer', () => {
    // 6282.30 × 6.10% ÷ 12 = 31.935025, which is $31.94 owed.
    const charge = interestDue(m('6282.30'), 0.061);
    expect(charge.format()).toBe('$31.94');
    expect(isWholeCents(charge)).toBe(true);
  });

  it('charges nothing on nothing', () => {
    expect(interestDue(Money.zero(), 0.2).isZero()).toBe(true);
    expect(interestDue(m('5000'), 0).isZero()).toBe(true);
  });
});
