/**
 * The importer, exercised end to end on a committed synthetic dataset.
 *
 * This is the suite that always runs. It covers the same ground as the
 * real-data reconciliation, on invented numbers, so a fresh clone and CI both
 * verify the migration logic without anyone's balance history being in the
 * repository.
 */

import { describe, expect, it } from 'vitest';
import {
  Money,
  balanceAsOf,
  externalFlowsForGroup,
  summarizeYear,
  yearEnd,
  type BalanceObservation,
  type Flow,
} from '@cairn/core';
import { importLegacy } from '../src/import.js';
import { SYNTHETIC_CSV, SYNTHETIC_FACTS } from './fixtures/synthetic.js';
import { indexBy, legacyYearEndTotals } from './helpers.js';

const imported = importLegacy(SYNTHETIC_CSV, 'Sample Household');
const legacyTotals = legacyYearEndTotals(SYNTHETIC_CSV, imported);
const years = [...legacyTotals.keys()].sort((a, b) => a - b);

const observations = indexBy<BalanceObservation>(imported.observations);
const flows = indexBy<Flow>(imported.flows);

const accountNamed = (name: string) => imported.accounts.find((a) => a.name === name)!;

describe('structure', () => {
  it('carries every portfolio across', () => {
    expect(imported.accounts).toHaveLength(SYNTHETIC_FACTS.accountCount);
    expect(imported.owners.map((o) => o.name).sort()).toEqual(['Ada', 'Ben']);
  });

  it('treats JOINT as shared ownership rather than a third person', () => {
    expect(accountNamed('Joint Brokerage').ownerIds).toHaveLength(2);
  });

  it('gives the benchmark no owners and no flows', () => {
    const benchmark = accountNamed('Index Benchmark');
    expect(benchmark.kind).toBe('benchmark');
    expect(benchmark.ownerIds).toEqual([]);
    expect(imported.flows.filter((f) => f.accountId === benchmark.id)).toEqual([]);
  });

  it('never records two observations for one account on one date', () => {
    // Q0 repeats the prior Q4 on every continuing account; keeping both would
    // collide here.
    const seen = new Map<string, Set<string>>();
    for (const o of imported.observations) {
      const dates = seen.get(o.accountId) ?? new Set();
      expect(dates.has(o.asOf), `duplicate observation ${o.accountId} @ ${o.asOf}`).toBe(false);
      dates.add(o.asOf);
      seen.set(o.accountId, dates);
    }
  });

  it('keeps year notes as journal entries, skipping empty ones', () => {
    expect(imported.journal.map((j) => j.year)).toEqual([2018, 2020, 2021, 2022]);
  });

  it('flags a Savings-typed account named like a brokerage', () => {
    const mapping = imported.issues.filter((i) => i.kind === 'mapping');
    expect(mapping).toHaveLength(1);
    expect(mapping[0]!.message).toContain('Joint Brokerage');
  });
});

describe('transfers', () => {
  it('matches a rollover to the closure that funded it', () => {
    const matched = imported.issues.filter((i) => i.kind === 'matched-transfer');
    const rollover = matched.find(
      (i) => i.amount?.toString() === SYNTHETIC_FACTS.rolloverAmount && i.year === 2021,
    );
    expect(rollover?.message).toContain('Ada 401(k)');
    expect(rollover?.message).toContain('Ada IRA');
  });

  it('pairs both halves, pointing at each other', () => {
    const transfers = imported.flows.filter(
      (f) => f.kind === 'transfer_in' || f.kind === 'transfer_out',
    );
    const paired = transfers.filter((f) => f.counterpartyAccountId);
    expect(paired.length).toBeGreaterThanOrEqual(2);

    for (const flow of paired) {
      const other = transfers.find(
        (f) =>
          f.accountId === flow.counterpartyAccountId && f.counterpartyAccountId === flow.accountId,
      );
      expect(other, `unpaired counterparty on ${flow.id}`).toBeDefined();
      expect(other!.amount.abs().toString()).toBe(flow.amount.abs().toString());
    }
  });

  it('resolves a many-to-one consolidation no pairwise match could see', () => {
    const { from, into } = SYNTHETIC_FACTS.consolidation;
    const consolidation = imported.issues.find(
      (i) => i.kind === 'matched-transfer' && i.message.includes('consolidated'),
    );
    expect(consolidation?.year).toBe(2022);
    for (const source of from) expect(consolidation!.message).toContain(source);
    expect(consolidation!.message).toContain(into);
    expect(consolidation!.message).toMatch(/reconciles to \$0\.00/);
  });

  it('leaves exactly one thing for a human, and names it', () => {
    const warnings = imported.issues.filter((i) => i.severity === 'warning');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain(SYNTHETIC_FACTS.unreconciled.account);
    expect(warnings[0]!.year).toBe(SYNTHETIC_FACTS.unreconciled.year);
  });

  it('nets internal transfers away, leaving only the unreconciled remainder', () => {
    const group = new Set(imported.accounts.map((a) => a.id));
    const external = externalFlowsForGroup(imported.flows, group);
    expect(external.length).toBeLessThan(imported.flows.length);

    // Money moving between two tracked accounts is not a household event, so
    // every transfer cancels — except the dormant account, whose balance left
    // the records without arriving anywhere.
    const residual = Money.sum(
      external
        .filter((f) => f.kind === 'transfer_in' || f.kind === 'transfer_out')
        .map((f) => f.amount),
    );
    expect(residual.toString()).toBe(`-${SYNTHETIC_FACTS.unreconciled.amount}`);
  });

  it('closes a departed account to zero so it stops answering', () => {
    const petty = accountNamed('Petty Cash');
    const after = balanceAsOf(observations.get(petty.id) ?? [], yearEnd(2023));
    expect(after.amount.isZero()).toBe(true);
  });
});

describe('reconciliation', () => {
  it('reproduces every year-end total exactly', () => {
    for (const year of years) {
      const ours = Money.sum(
        imported.accounts
          .filter((a) => a.kind !== 'benchmark')
          .map((a) => balanceAsOf(observations.get(a.id) ?? [], yearEnd(year)).amount),
      );
      expect(ours.minus(legacyTotals.get(year)!).toString(), `year ${year} drifted`).toBe('0.0000');
    }
  });

  it('falls back to the latest reported quarter in a partial year', () => {
    // Joint Brokerage reports only Q1 and Q2 in 2023.
    const joint = accountNamed('Joint Brokerage');
    const at = balanceAsOf(observations.get(joint.id) ?? [], yearEnd(2023));
    expect(at.amount.toString()).toBe('39000.0000');
    expect(at.asOf).toBe('2023-06-30');
  });
});

describe('what the migration changes', () => {
  it('corrects returns in years with contributions', () => {
    const ada = accountNamed('Ada IRA');
    const summary = summarizeYear(observations.get(ada.id) ?? [], flows.get(ada.id) ?? [], 2019);

    expect(summary.netExternalFlow.toString()).toBe('4000.0000');
    expect(summary.twr).not.toBeCloseTo(summary.simpleReturn, 6);
    expect(summary.twr).toBeLessThan(summary.simpleReturn);
  });

  it('leaves returns untouched where no money moved', () => {
    // The telescoping identity: with no external flows, chain-linking the
    // quarters collapses to the naive annual formula exactly. Fees do not break
    // it, because a fee is a cost of investing rather than money leaving.
    let checked = 0;
    for (const account of imported.accounts) {
      if (account.kind === 'benchmark') continue;
      for (const year of years) {
        const summary = summarizeYear(
          observations.get(account.id) ?? [],
          flows.get(account.id) ?? [],
          year,
        );
        if (!summary.netExternalFlow.isZero() || summary.startValue.isZero()) continue;
        expect(summary.twr, `${account.name} ${year}`).toBeCloseTo(summary.simpleReturn, 9);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(3);
  });

  it('separates the pile growing from the money earning', () => {
    const ada = accountNamed('Ada IRA');
    const summary = summarizeYear(observations.get(ada.id) ?? [], flows.get(ada.id) ?? [], 2019);
    expect(summary.totalGain.toString()).toBe('20000.0000'); // 120k - 100k
    expect(summary.organicGain.toString()).toBe('16000.0000'); // less 4k contributed
  });
});
