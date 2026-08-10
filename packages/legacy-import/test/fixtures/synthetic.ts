/**
 * A synthetic legacy database, in the exact shape `mdb-export` produces.
 *
 * The real source data is one household's actual balance history and is not in
 * this repository (see `.gitignore`). This fixture stands in for it: invented
 * round numbers, but reproducing every structural quirk the real data taught
 * us, so the importer is exercised on all of them in CI and on a fresh clone.
 *
 * What it deliberately contains:
 *
 * | Quirk | Where |
 * |---|---|
 * | `Q0` repeating the prior `Q4` (the redundancy) | every continuing account |
 * | A rollover: one account closes, another's `Q0` jumps by that exact amount | 401(k) → IRA, 2021 |
 * | A many-to-one consolidation no pairwise match can see | two IRAs → one, 2022 |
 * | A dormant account that stops reporting and reconciles with nothing | Petty Cash, 2021 |
 * | An account-year with no external flows (the telescoping identity) | IRA, 2022 |
 * | A partial current year, testing the coalesce-to-latest rule | Joint Brokerage, 2023 |
 * | An index carried as an account, with levels and no flows | Index Benchmark |
 * | Accounts opening from zero and being funded | 2018, all |
 * | Fees present on some accounts and absent on others | throughout |
 *
 * Numbers are emitted at four decimal places because that is what Access's
 * `Currency` type produces, and the parser should meet what it will really see.
 */

import type { LegacyCsv } from '../../src/import.js';

type Amount = number | null;

interface PerformanceRow {
  readonly year: number;
  readonly portfolio: number;
  /** `[Q0, Q1, Q2, Q3, Q4]` — opening balance then each quarter end. */
  readonly balances: readonly [Amount, Amount, Amount, Amount, Amount];
  /** `[Q1, Q2, Q3, Q4]` contributions. Negative means a withdrawal. */
  readonly contributions?: readonly [Amount, Amount, Amount, Amount];
  /** `[Q1, Q2, Q3, Q4]` fees, recorded positive as the legacy schema does. */
  readonly fees?: readonly [Amount, Amount, Amount, Amount];
}

const OWNERS: readonly (readonly [number, string])[] = [
  [1, 'Ada'],
  [2, 'Ben'],
  [3, 'JOINT'],
  [4, 'zBench'],
];

const PORTFOLIO_TYPES: readonly (readonly [number, string])[] = [
  [1, 'Retirement'],
  [2, 'College Savings'],
  [5, 'Savings'],
  [6, 'Benchmark'],
];

/** `[id, ownerId, typeId, name, active]` */
const PORTFOLIOS: readonly (readonly [number, number, number, string, 0 | 1])[] = [
  [1, 1, 1, 'Ada 401(k)', 0],
  [2, 1, 1, 'Ada IRA', 1],
  [3, 2, 1, 'Ben IRA A', 0],
  [4, 2, 1, 'Ben IRA B', 0],
  [5, 2, 1, 'Ben IRA C', 1],
  [6, 3, 5, 'Joint Brokerage', 1],
  [7, 1, 5, 'Petty Cash', 0],
  [8, 4, 6, 'Index Benchmark', 1],
];

const YEAR_NOTES: readonly (readonly [number, string])[] = [
  [2018, 'Opened the first accounts.'],
  [2019, ''],
  [2020, 'Rough Q1, recovered by year end.'],
  [2021, 'Rolled the 401(k) into the IRA.'],
  [2022, 'Consolidated Ben’s two IRAs.'],
  [2023, ''],
];

const PERFORMANCE: readonly PerformanceRow[] = [
  // -- Ada 401(k): funded 2018, closed after 2020, rolls $50,000 into Ada IRA --
  { year: 2018, portfolio: 1, balances: [0, 10_000, 20_000, 30_000, 35_000], contributions: [10_000, 10_000, 10_000, 4_000], fees: [25, 25, 25, 25] },
  { year: 2019, portfolio: 1, balances: [35_000, 37_000, 39_000, 41_000, 42_000], contributions: [500, 500, 500, 500], fees: [25, 25, 25, 25] },
  { year: 2020, portfolio: 1, balances: [42_000, 44_000, 46_000, 48_000, 50_000], contributions: [500, 500, 500, 500], fees: [25, 25, 25, 25] },

  // -- Ada IRA: continuous. 2021 opens $50,000 above the 2020 close (the rollover).
  //    2022 has no contributions at all, which is the telescoping-identity case.
  { year: 2018, portfolio: 2, balances: [0, 25_000, 50_000, 75_000, 100_000], contributions: [25_000, 25_000, 25_000, 20_000], fees: [25, 25, 25, 25] },
  { year: 2019, portfolio: 2, balances: [100_000, 105_000, 110_000, 115_000, 120_000], contributions: [1_000, 1_000, 1_000, 1_000], fees: [25, 25, 25, 25] },
  { year: 2020, portfolio: 2, balances: [120_000, 115_000, 125_000, 132_000, 140_000], contributions: [1_000, 1_000, 1_000, 1_000], fees: [25, 25, 25, 25] },
  { year: 2021, portfolio: 2, balances: [190_000, 195_000, 200_000, 205_000, 210_000], contributions: [1_000, 1_000, 1_000, 1_000], fees: [25, 25, 25, 25] },
  { year: 2022, portfolio: 2, balances: [210_000, 200_000, 190_000, 185_000, 195_000], fees: [25, 25, 25, 25] },
  { year: 2023, portfolio: 2, balances: [195_000, 205_000, 215_000, 220_000, 230_000], contributions: [2_000, 2_000, 2_000, 2_000], fees: [25, 25, 25, 25] },

  // -- Ben IRA A + B: both close after 2021, merging into Ben IRA C.
  //    $60,000 + $40,000 = $100,000, which no single pairwise match can find.
  { year: 2018, portfolio: 3, balances: [0, 10_000, 20_000, 30_000, 40_000], contributions: [10_000, 10_000, 10_000, 10_000] },
  { year: 2019, portfolio: 3, balances: [40_000, 43_000, 46_000, 49_000, 52_000], contributions: [500, 500, 500, 500] },
  { year: 2020, portfolio: 3, balances: [52_000, 50_000, 54_000, 56_000, 58_000], contributions: [500, 500, 500, 500] },
  { year: 2021, portfolio: 3, balances: [58_000, 59_000, 59_500, 59_800, 60_000] },

  { year: 2018, portfolio: 4, balances: [0, 5_000, 10_000, 15_000, 20_000], contributions: [5_000, 5_000, 5_000, 5_000] },
  { year: 2019, portfolio: 4, balances: [20_000, 22_000, 24_000, 26_000, 28_000], contributions: [1_000, 1_000, 1_000, 1_000] },
  { year: 2020, portfolio: 4, balances: [28_000, 27_000, 30_000, 32_000, 34_000], contributions: [1_000, 1_000, 1_000, 1_000] },
  { year: 2021, portfolio: 4, balances: [34_000, 36_000, 38_000, 39_000, 40_000] },

  { year: 2022, portfolio: 5, balances: [100_000, 95_000, 90_000, 92_000, 98_000], contributions: [1_000, 1_000, 1_000, 1_000] },
  { year: 2023, portfolio: 5, balances: [98_000, 105_000, 110_000, 112_000, 120_000], contributions: [1_000, 1_000, 1_000, 1_000] },

  // -- Joint Brokerage: 2023 reports only two quarters, so year-end must fall
  //    back to Q2 rather than reading as zero.
  { year: 2018, portfolio: 6, balances: [0, 5_000, 10_000, 15_000, 20_000], contributions: [5_000, 5_000, 5_000, 5_000], fees: [50, 50, 50, 50] },
  { year: 2019, portfolio: 6, balances: [20_000, 22_000, 24_000, 26_000, 28_000], fees: [50, 50, 50, 50] },
  { year: 2020, portfolio: 6, balances: [28_000, 25_000, 29_000, 31_000, 33_000], contributions: [null, 2_000, null, null], fees: [50, 50, 50, 50] },
  { year: 2021, portfolio: 6, balances: [33_000, 35_000, 37_000, 38_000, 40_000], fees: [50, 50, 50, 50] },
  { year: 2022, portfolio: 6, balances: [40_000, 36_000, 33_000, 32_000, 35_000], fees: [50, 50, 50, 50] },
  { year: 2023, portfolio: 6, balances: [35_000, 37_000, 39_000, null, null], fees: [50, 50, null, null] },

  // -- Petty Cash: dormant, stops reporting after 2020, never rolled anywhere.
  //    The one thing in the dataset that cannot be reconciled.
  { year: 2018, portfolio: 7, balances: [0, 200, 200, 200, 200], contributions: [200, null, null, null] },
  { year: 2019, portfolio: 7, balances: [200, 200, 200, 200, 200] },
  { year: 2020, portfolio: 7, balances: [200, 200, 200, 200, 200] },

  // -- Index Benchmark: levels, not money. No flows, no owner.
  { year: 2018, portfolio: 8, balances: [1_000, 1_020, 1_050, 1_030, 1_000] },
  { year: 2019, portfolio: 8, balances: [1_000, 1_100, 1_150, 1_180, 1_250] },
  { year: 2020, portfolio: 8, balances: [1_250, 1_000, 1_150, 1_250, 1_400] },
  { year: 2021, portfolio: 8, balances: [1_400, 1_450, 1_500, 1_520, 1_600] },
  { year: 2022, portfolio: 8, balances: [1_600, 1_500, 1_350, 1_300, 1_400] },
  { year: 2023, portfolio: 8, balances: [1_400, 1_480, 1_550, 1_580, 1_680] },
];

/** Amounts render at four decimals; absent values render as an empty field. */
function amount(value: Amount | undefined): string {
  return value === null || value === undefined ? '' : value.toFixed(4);
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [header.join(','), ...rows.map((r) => r.join(','))].join('\n') + '\n';
}

const NO_QUARTERS = [null, null, null, null] as const;

/** The fixture, serialized exactly as `mdb-export` would write it. */
export const SYNTHETIC_CSV: LegacyCsv = {
  owners: toCsv(
    ['AccountOwnerID', 'AccountOwner'],
    OWNERS.map(([id, name]) => [String(id), quote(name)]),
  ),

  portfolioTypes: toCsv(
    ['PortfolioTypeID', 'PortfolioType'],
    PORTFOLIO_TYPES.map(([id, name]) => [String(id), quote(name)]),
  ),

  portfolios: toCsv(
    ['PortfolioID', 'AccountOwnerFK', 'PortfolioTypeFK', 'PortfolioName', 'Active'],
    PORTFOLIOS.map(([id, owner, type, name, active]) => [
      String(id),
      String(owner),
      String(type),
      quote(name),
      String(active),
    ]),
  ),

  years: toCsv(
    ['YearID', 'Notes'],
    YEAR_NOTES.map(([year, notes]) => [String(year), notes ? quote(notes) : '']),
  ),

  performance: toCsv(
    [
      'PerformanceID',
      'YearFK',
      'PortfolioFK',
      'Q0',
      'Q1',
      'Q2',
      'Q3',
      'Q4',
      'Q1Cont',
      'Q2Cont',
      'Q3Cont',
      'Q4Cont',
      'Q1Fees',
      'Q2Fees',
      'Q3Fees',
      'Q4Fees',
    ],
    PERFORMANCE.map((row, i) => [
      String(i + 1),
      String(row.year),
      String(row.portfolio),
      ...row.balances.map(amount),
      ...(row.contributions ?? NO_QUARTERS).map(amount),
      ...(row.fees ?? NO_QUARTERS).map(amount),
    ]),
  ),
};

/** Known facts about the fixture, asserted by the tests that use it. */
export const SYNTHETIC_FACTS = {
  firstYear: 2018,
  lastYear: 2023,
  accountCount: PORTFOLIOS.length,
  /** Ada 401(k) closes here and the IRA opens exactly this much higher. */
  rolloverAmount: '50000.0000',
  /** Ben IRA A + Ben IRA B, merging into Ben IRA C. */
  consolidation: { from: ['Ben IRA A', 'Ben IRA B'], into: 'Ben IRA C', total: '100000.0000' },
  /** The single amount that reconciles with nothing. */
  unreconciled: { account: 'Petty Cash', amount: '200.0000', year: 2021 },
} as const;
