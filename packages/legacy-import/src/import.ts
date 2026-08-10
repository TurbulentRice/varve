/**
 * Access → domain model.
 *
 * The legacy schema stores one wide row per (portfolio, year): `Q0` opening
 * balance, `Q1`–`Q4` quarter-end balances, and per-quarter contributions and
 * fees. Turning that into observations and flows is mostly mechanical, with
 * three judgment calls that matter:
 *
 * 1. **`Q0` is dropped where it is redundant.** It repeats the prior year's
 *    `Q4` in 161 of 165 comparable boundaries. Only a *first* `Q0`, or one that
 *    disagrees with the prior close, becomes data.
 *
 * 2. **Discontinuities become transfers, not silent adjustments.** Where `Q0`
 *    disagrees with the prior `Q4`, money moved. The importer emits a transfer
 *    and, where it can identify the other side by amount, links the pair.
 *
 * 3. **Openings and closures are dated 1 January, not 31 December.** When ten
 *    accounts became six at the end of 2019, the old closing balances and the
 *    new opening balances both describe 31 December 2019 — summing them would
 *    double-count half a million dollars. Shifting the handover a day apart
 *    keeps every point-in-time total correct without inventing value.
 *
 * Amounts are read from `mdb-export` text and parsed straight into `Money`, so
 * no float ever touches them.
 */

import {
  Money,
  accountId,
  flowId,
  householdId,
  isoDate,
  midpoint,
  observationId,
  ownerId,
  quarterEnd,
  yearEnd,
  type Account,
  type AccountId,
  type AccountKind,
  type BalanceObservation,
  type Flow,
  type Household,
  type IsoDate,
  type Owner,
  type Quarter,
} from '@cairn/core';
import { parseCsvRecords } from './csv.js';

export interface LegacyCsv {
  readonly owners: string;
  readonly portfolioTypes: string;
  readonly portfolios: string;
  readonly years: string;
  readonly performance: string;
}

export type IssueKind =
  | 'matched-transfer'
  | 'unmatched-transfer'
  | 'closure'
  | 'opening'
  | 'mapping';

export interface ImportIssue {
  readonly kind: IssueKind;
  readonly severity: 'info' | 'warning';
  readonly message: string;
  readonly year?: number;
  readonly amount?: Money;
}

export interface JournalEntry {
  readonly year: number;
  readonly notes: string;
}

export interface ImportResult {
  readonly household: Household;
  readonly owners: Owner[];
  readonly accounts: Account[];
  readonly observations: BalanceObservation[];
  readonly flows: Flow[];
  readonly journal: JournalEntry[];
  readonly issues: ImportIssue[];
}

/** Legacy `tblPortfolioType` → {@link AccountKind}. */
const KIND_BY_TYPE: Record<string, AccountKind> = {
  Retirement: 'retirement',
  'College Savings': 'college',
  Savings: 'savings',
  Benchmark: 'benchmark',
};

/** The pseudo-owner the legacy data used to hold the S&P benchmark. */
const BENCHMARK_OWNER = 'zBench';
/** The pseudo-owner the legacy data used for jointly held accounts. */
const JOINT_OWNER = 'JOINT';

const QUARTERS: readonly Quarter[] = [1, 2, 3, 4];

interface PerformanceRow {
  readonly year: number;
  readonly portfolioId: number;
  readonly balances: Readonly<Record<number, Money | null>>; // 0..4
  readonly contributions: Readonly<Record<Quarter, Money | null>>;
  readonly fees: Readonly<Record<Quarter, Money | null>>;
}

function money(value: string): Money | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : Money.fromString(trimmed);
}

/** 1 January of `year` — the handover date for openings and closures. */
function januaryFirst(year: number): IsoDate {
  return isoDate(`${year}-01-01`);
}

/** Quarter-end date, or 31 December of the prior year for `Q0`. */
function balanceDate(year: number, quarter: number): IsoDate {
  return quarter === 0 ? yearEnd(year - 1) : quarterEnd(year, quarter as Quarter);
}

export function importLegacy(csv: LegacyCsv, householdName = 'Household'): ImportResult {
  const issues: ImportIssue[] = [];

  // ------------------------------------------------------------- entities
  const home: Household = { id: householdId('h1'), name: householdName };

  const ownerRows = parseCsvRecords(csv.owners);
  const realOwners = ownerRows.filter(
    (r) => r.AccountOwner !== BENCHMARK_OWNER && r.AccountOwner !== JOINT_OWNER,
  );

  const owners: Owner[] = realOwners.map((r) => ({
    id: ownerId(`own:${r.AccountOwnerID}`),
    householdId: home.id,
    name: r.AccountOwner!,
  }));

  const ownerNameById = new Map(ownerRows.map((r) => [r.AccountOwnerID!, r.AccountOwner!]));
  const typeNameById = new Map(
    parseCsvRecords(csv.portfolioTypes).map((r) => [r.PortfolioTypeID!, r.PortfolioType!]),
  );

  const accounts: Account[] = parseCsvRecords(csv.portfolios).map((r) => {
    const ownerName = ownerNameById.get(r.AccountOwnerFK!) ?? '';
    const typeName = typeNameById.get(r.PortfolioTypeFK!) ?? '';
    const kind = KIND_BY_TYPE[typeName] ?? 'savings';

    // "JOINT" is not a person. An account held jointly belongs to every real
    // owner, which is what lets a per-person view exist later.
    const ownerIds =
      ownerName === JOINT_OWNER
        ? owners.map((o) => o.id)
        : ownerName === BENCHMARK_OWNER
          ? []
          : [ownerId(`own:${r.AccountOwnerFK}`)];

    return {
      id: accountId(`acct:${r.PortfolioID}`),
      householdId: home.id,
      name: r.PortfolioName!,
      ownerIds,
      kind,
      active: r.Active === '1',
      legacyPortfolioId: Number(r.PortfolioID),
    };
  });

  const accountById = new Map(accounts.map((a) => [a.id, a]));

  for (const account of accounts) {
    if (account.kind === 'savings' && /brokerage|etrade/i.test(account.name)) {
      issues.push({
        kind: 'mapping',
        severity: 'info',
        message: `"${account.name}" is typed "Savings" in the legacy data but named like a brokerage account — worth confirming the intended classification.`,
      });
    }
  }

  // --------------------------------------------------------------- journal
  const journal: JournalEntry[] = parseCsvRecords(csv.years)
    .filter((r) => r.Notes?.trim())
    .map((r) => ({ year: Number(r.YearID), notes: r.Notes!.trim() }))
    .sort((a, b) => a.year - b.year);

  // ----------------------------------------------------------- performance
  const rows: PerformanceRow[] = parseCsvRecords(csv.performance).map((r) => ({
    year: Number(r.YearFK),
    portfolioId: Number(r.PortfolioFK),
    balances: Object.fromEntries([0, 1, 2, 3, 4].map((q) => [q, money(r[`Q${q}`] ?? '')])),
    contributions: Object.fromEntries(
      QUARTERS.map((q) => [q, money(r[`Q${q}Cont`] ?? '')]),
    ) as Record<Quarter, Money | null>,
    fees: Object.fromEntries(QUARTERS.map((q) => [q, money(r[`Q${q}Fees`] ?? '')])) as Record<
      Quarter,
      Money | null
    >,
  }));

  const byPortfolio = new Map<number, PerformanceRow[]>();
  for (const row of rows) {
    const list = byPortfolio.get(row.portfolioId) ?? [];
    list.push(row);
    byPortfolio.set(row.portfolioId, list);
  }
  for (const list of byPortfolio.values()) list.sort((a, b) => a.year - b.year);

  const datasetLastYear = Math.max(...rows.map((r) => r.year));

  const observations: BalanceObservation[] = [];
  const flows: Flow[] = [];

  /** Transfers awaiting a counterparty, so pairs can be linked afterwards. */
  const pendingIn: { flowIndex: number; amount: Money; year: number }[] = [];
  const pendingOut: { flowIndex: number; amount: Money; year: number }[] = [];

  for (const account of accounts) {
    const history = byPortfolio.get(account.legacyPortfolioId!) ?? [];
    if (history.length === 0) continue;

    const isBenchmark = account.kind === 'benchmark';
    const id = account.id;

    for (const [index, row] of history.entries()) {
      const previous = history[index - 1];

      // -- opening balance ------------------------------------------------
      const opening = row.balances[0];
      const isFirstYear = index === 0;

      if (isFirstYear && opening) {
        observations.push({
          id: observationId(`obs:${account.legacyPortfolioId}:${row.year}:open`),
          accountId: id,
          asOf: januaryFirst(row.year),
          amount: opening,
          source: 'legacy-import',
        });

        // An index has no money in it, so nothing "arrived".
        if (!isBenchmark && opening.isPositive()) {
          pendingIn.push({ flowIndex: flows.length, amount: opening, year: row.year });
          flows.push({
            id: flowId(`flow:${account.legacyPortfolioId}:${row.year}:open`),
            accountId: id,
            occurredOn: januaryFirst(row.year),
            amount: opening,
            kind: 'transfer_in',
            note: 'Opening balance carried in from before tracking began',
          });
          issues.push({
            kind: 'opening',
            severity: 'info',
            year: row.year,
            amount: opening,
            message: `${account.name}: opened with ${opening.format()} from an untracked source.`,
          });
        }
      } else if (!isFirstYear && opening && previous) {
        // -- discontinuity: Q0 disagrees with the prior close ---------------
        const priorClose = lastKnownBalance(previous);
        if (priorClose && !priorClose.equals(opening)) {
          const delta = opening.minus(priorClose);

          observations.push({
            id: observationId(`obs:${account.legacyPortfolioId}:${row.year}:open`),
            accountId: id,
            asOf: januaryFirst(row.year),
            amount: opening,
            source: 'legacy-import',
          });

          if (!isBenchmark) {
            const inbound = delta.isPositive();
            const record = { flowIndex: flows.length, amount: delta.abs(), year: row.year };
            (inbound ? pendingIn : pendingOut).push(record);

            flows.push({
              id: flowId(`flow:${account.legacyPortfolioId}:${row.year}:carry`),
              accountId: id,
              occurredOn: januaryFirst(row.year),
              amount: delta,
              kind: inbound ? 'transfer_in' : 'transfer_out',
              note: 'Reconstructed from an opening balance that disagreed with the prior close',
            });
          }
        }
      }

      // -- quarter-end balances -------------------------------------------
      for (const quarter of QUARTERS) {
        const amount = row.balances[quarter];
        if (!amount) continue;
        observations.push({
          id: observationId(`obs:${account.legacyPortfolioId}:${row.year}:Q${quarter}`),
          accountId: id,
          asOf: balanceDate(row.year, quarter),
          amount,
          source: 'legacy-import',
        });
      }

      if (isBenchmark) continue;

      // -- contributions and fees ------------------------------------------
      for (const quarter of QUARTERS) {
        const periodStart = balanceDate(row.year, quarter - 1);
        const periodEnd = balanceDate(row.year, quarter);
        // The legacy data records a quarterly total with no date. Placing it at
        // the middle of the quarter reproduces the conventional mid-period
        // assumption exactly, with no special case in the return calculation.
        const occurredOn = midpoint(periodStart, periodEnd);

        const contribution = row.contributions[quarter];
        if (contribution && !contribution.isZero()) {
          flows.push({
            id: flowId(`flow:${account.legacyPortfolioId}:${row.year}:Q${quarter}:cont`),
            accountId: id,
            occurredOn,
            amount: contribution,
            kind: contribution.isPositive() ? 'contribution' : 'withdrawal',
          });
        }

        const fee = row.fees[quarter];
        if (fee && !fee.isZero()) {
          flows.push({
            id: flowId(`flow:${account.legacyPortfolioId}:${row.year}:Q${quarter}:fee`),
            accountId: id,
            occurredOn,
            amount: fee.negate(), // stored positive; flows are signed
            kind: 'fee',
          });
        }
      }
    }

    // -- closure ------------------------------------------------------------
    const finalRow = history[history.length - 1]!;
    const finalBalance = lastKnownBalance(finalRow);
    const stoppedEarly = finalRow.year < datasetLastYear;

    if (stoppedEarly && finalBalance?.isPositive() && !isBenchmark) {
      const closedOn = januaryFirst(finalRow.year + 1);

      pendingOut.push({ flowIndex: flows.length, amount: finalBalance, year: finalRow.year + 1 });
      flows.push({
        id: flowId(`flow:${account.legacyPortfolioId}:close`),
        accountId: id,
        occurredOn: closedOn,
        amount: finalBalance.negate(),
        kind: 'transfer_out',
        note: 'Account stopped reporting; balance moved elsewhere',
      });

      // Without this the last known balance answers forever, and every
      // household total after the closure double-counts a dead account.
      observations.push({
        id: observationId(`obs:${account.legacyPortfolioId}:close`),
        accountId: id,
        asOf: closedOn,
        amount: Money.zero(),
        source: 'legacy-import',
      });

      issues.push({
        kind: 'closure',
        severity: 'info',
        year: finalRow.year + 1,
        amount: finalBalance,
        message: `${account.name}: last reported in ${finalRow.year} holding ${finalBalance.format()}; recorded as transferred out.`,
      });
    }
  }

  // ---------------------------------------------------------- pair transfers
  // Two rollovers in this dataset reconcile to the cent. Matching them by
  // amount turns a pair of coincidences into a stated fact about where the
  // money went — and lets household-level returns ignore the move entirely.
  const takenIn = new Set<number>();
  const takenOut = new Set<number>();

  for (const inbound of pendingIn) {
    const match = pendingOut.find(
      (out) =>
        !takenOut.has(out.flowIndex) &&
        out.amount.equals(inbound.amount) &&
        Math.abs(out.year - inbound.year) <= 1,
    );
    if (!match) continue;

    takenIn.add(inbound.flowIndex);
    takenOut.add(match.flowIndex);

    const inFlow = flows[inbound.flowIndex]!;
    const outFlow = flows[match.flowIndex]!;
    flows[inbound.flowIndex] = { ...inFlow, counterpartyAccountId: outFlow.accountId };
    flows[match.flowIndex] = { ...outFlow, counterpartyAccountId: inFlow.accountId };

    issues.push({
      kind: 'matched-transfer',
      severity: 'info',
      year: inbound.year,
      amount: inbound.amount,
      message: `Matched ${inbound.amount.format()}: ${accountById.get(outFlow.accountId)?.name} → ${accountById.get(inFlow.accountId)?.name}.`,
    });
  }

  // ------------------------------------------------- grouped consolidations
  // A one-to-one match by amount cannot see a consolidation where several
  // accounts merge into one — as happened at the end of 2019, when ten accounts
  // became six. Summing the leftovers per owner per year finds those: if what
  // left one person's accounts equals what arrived in them, the move is
  // explained even though no individual pair lines up.
  const ownerKeyFor = (id: AccountId): string =>
    [...(accountById.get(id)?.ownerIds ?? [])].sort().join('+') || '(unowned)';

  interface Side {
    total: Money;
    accounts: string[];
  }
  interface Group {
    year: number;
    owner: string;
    in: Side;
    out: Side;
  }
  const groups = new Map<string, Group>();

  const record = (
    side: 'in' | 'out',
    entry: { flowIndex: number; amount: Money; year: number },
  ) => {
    const flow = flows[entry.flowIndex]!;
    const owner = ownerKeyFor(flow.accountId);
    const key = `${entry.year}:${owner}`;
    const group: Group = groups.get(key) ?? {
      year: entry.year,
      owner,
      in: { total: Money.zero(), accounts: [] },
      out: { total: Money.zero(), accounts: [] },
    };

    group[side].total = group[side].total.plus(entry.amount);
    group[side].accounts.push(accountById.get(flow.accountId)?.name ?? String(flow.accountId));
    groups.set(key, group);
  };

  for (const entry of pendingIn) if (!takenIn.has(entry.flowIndex)) record('in', entry);
  for (const entry of pendingOut) if (!takenOut.has(entry.flowIndex)) record('out', entry);

  /** Residuals under this are rounding; above it, something is unexplained. */
  const RECONCILED = Money.fromString('1.00');

  for (const group of groups.values()) {
    const ownerNames =
      group.owner
        .split('+')
        .map((id) => owners.find((o) => o.id === id)?.name ?? id)
        .join(' & ') || 'unowned';

    if (group.in.accounts.length === 0 || group.out.accounts.length === 0) {
      const side = group.out.accounts.length > 0 ? group.out : group.in;
      const direction = group.out.accounts.length > 0 ? 'leaving' : 'arriving in';
      issues.push({
        kind: 'unmatched-transfer',
        severity: 'warning',
        year: group.year,
        amount: side.total,
        message: `${ownerNames}, ${group.year}: ${side.total.format()} ${direction} ${side.accounts.join(', ')} with no counterpart in the data.`,
      });
      continue;
    }

    const residual = group.out.total.minus(group.in.total);
    const reconciled = residual.abs().compare(RECONCILED) < 0;

    issues.push({
      kind: reconciled ? 'matched-transfer' : 'unmatched-transfer',
      severity: reconciled ? 'info' : 'warning',
      year: group.year,
      amount: group.out.total,
      message: reconciled
        ? `${ownerNames}, ${group.year}: ${group.out.accounts.join(' + ')} consolidated into ${group.in.accounts.join(' + ')} — ${group.out.total.format()} reconciles to ${residual.format()}.`
        : `${ownerNames}, ${group.year}: ${group.out.total.format()} left ${group.out.accounts.join(' + ')} but ${group.in.total.format()} arrived in ${group.in.accounts.join(' + ')} — ${residual.format()} unexplained.`,
    });
  }

  observations.sort((a, b) => a.asOf.localeCompare(b.asOf));
  flows.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));

  return { household: home, owners, accounts, observations, flows, journal, issues };
}

/** Latest non-null balance in a row: the legacy `Q4 ?? Q3 ?? Q2 ?? Q1` rule. */
function lastKnownBalance(row: PerformanceRow): Money | null {
  for (const quarter of [4, 3, 2, 1, 0]) {
    const amount = row.balances[quarter];
    if (amount) return amount;
  }
  return null;
}
