/**
 * What half-even costs, and which way it leans.
 *
 * `financetools` quantizes with `ROUND_HALF_UP`; this codebase rounds half-even
 * (working doc §8.1). The obvious worry is that the port would then be a cent
 * away from the original for no good reason, so it is worth knowing exactly
 * when the two disagree and which one is right.
 *
 * They disagree only on an exact tie, and the quantity being rounded is
 * `balance × rate ÷ 12`. At a quoted rate like 4.41% or 22.99% that division
 * does not terminate, so the product never lands on a half-cent and the two
 * modes are indistinguishable — measured over 200 random four-loan queues and
 * every minimum-payment mode, they never once differed.
 *
 * Round rates are the exception, and real rates are often round. 6% is exactly
 * 0.005 a month, so one balance in two hundred puts the interest precisely on a
 * half-cent. That is where the modes part, and the fixture carries loans chosen
 * to make it happen.
 *
 * The measurement below is Python against Python — the two oracle runs — so it
 * says nothing about the port and everything about the convention.
 */

import { describe, expect, it } from 'vitest';
import fixture from './fixtures/financetools.json' with { type: 'json' };
import { parseInstallment } from './oracle.js';

type Suite = typeof fixture.half_even;

/** Every installment in a suite, flattened, paired with where it came from. */
function allLines(suite: Suite): { where: string; line: string }[] {
  const lines: { where: string; line: string }[] = [];

  for (const s of suite.schedules) {
    s.installments.forEach((line, i) => lines.push({ where: `${s.name} #${i + 1}`, line }));
  }
  for (const q of suite.queues) {
    for (const [name, result] of Object.entries(q.strategies)) {
      for (const loan of result.loans) {
        loan.installments.forEach((line, i) =>
          lines.push({ where: `${q.name}/${name}/${loan.title} #${i + 1}`, line }),
        );
      }
    }
  }
  return lines;
}

const up = allLines(fixture.half_up);
const even = allLines(fixture.half_even);

describe('the two rounding modes, compared installment by installment', () => {
  it('lines up, so the comparison is like for like', () => {
    expect(even).toHaveLength(up.length);
    expect(even.map((l) => l.where)).toEqual(up.map((l) => l.where));
  });

  it('agrees on all but a few percent of payments', () => {
    const differing = even.filter((line, i) => line.line !== up[i]!.line);

    // 78 of 2,948 at the time of writing — 2.65%. A tie needs a terminating
    // monthly rate *and* a balance that lands on one, and most of this fixture
    // is quoted rates where it cannot happen at all. The lower bound matters as
    // much as the upper: if this ever hits zero, the fixture has stopped
    // exercising the case and the measurement means nothing.
    expect(differing.length).toBeGreaterThan(0);
    expect(differing.length / even.length).toBeLessThan(0.05);
  });

  it('never moves an interest charge by more than a cent', () => {
    // Interest is the product of exactly one rounding — the balance times the
    // monthly rate — so a tie moves it by a cent and can do nothing else.
    for (const [i, line] of even.entries()) {
      if (line.line === up[i]!.line) continue;
      const interest = parseInstallment(line.line)[0];
      const theirs = parseInstallment(up[i]!.line)[0];
      expect(Math.abs(interest - theirs), `${line.where} interest`).toBeLessThanOrEqual(0.011);
    }
  });

  it('lets principal and balance carry two cents, but no more', () => {
    // These are not single roundings. A balance carries earlier ties forward,
    // and under a spreading strategy the *payment* is itself a rounded share of
    // the remainder — so a cent in the share and a cent in the interest can
    // land in the same figure. Measured worst case across the fixture is
    // exactly two cents, in cascade, where both happen at once.
    for (const [i, line] of even.entries()) {
      if (line.line === up[i]!.line) continue;
      const [, principal, balance] = parseInstallment(line.line);
      const [, theirPrincipal, theirBalance] = parseInstallment(up[i]!.line);

      expect(Math.abs(principal - theirPrincipal), `${line.where} principal`).toBeLessThanOrEqual(0.021);
      expect(Math.abs(balance - theirBalance), `${line.where} balance`).toBeLessThanOrEqual(0.021);
    }
  });
});

describe('the bias is one-directional, which is the whole argument for half-even', () => {
  it('never charges more interest than half-up, and sometimes less', () => {
    let lower = 0;
    let higher = 0;

    for (const q of fixture.half_even.queues) {
      for (const [name, result] of Object.entries(q.strategies)) {
        const other = fixture.half_up.queues.find((x) => x.name === q.name)!.strategies[
          name as keyof typeof q.strategies
        ];
        const delta = Number(result.interest_paid) - Number(other.interest_paid);
        if (delta < 0) lower += 1;
        if (delta > 0) higher += 1;
      }
    }

    // Half-up breaks every tie away from zero, so on a balance that compounds
    // it drifts upward and keeps drifting. This is the drift the money type was
    // given half-even to prevent, showing up in a loan rather than a forty-year
    // projection.
    expect(higher).toBe(0);
    expect(lower).toBeGreaterThan(0);
  });

  it('leaves the repayment duration alone', () => {
    // The effect is real but tiny: it moves cents, not months. Someone's payoff
    // date does not depend on which way a tie broke.
    for (const q of fixture.half_even.queues) {
      for (const [name, result] of Object.entries(q.strategies)) {
        const other = fixture.half_up.queues.find((x) => x.name === q.name)!.strategies[
          name as keyof typeof q.strategies
        ];
        expect(result.duration, `${q.name}/${name}`).toBe(other.duration);
      }
    }
  });
});
