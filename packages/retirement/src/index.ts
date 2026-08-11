/**
 * Retirement tracking: deriving what a household's savings have actually done.
 *
 * Sits over `@varve/core` (the calculations) and `@varve/store` (the data), and
 * is the layer a UI talks to. `loadLedger` is the only function that touches a
 * repository; everything else is a pure function of plain data.
 */

export { loadLedger, type Ledger } from './ledger.js';
export { householdSeries, type HouseholdSeries } from './household.js';
export { deriveHistory, type History, type YearRow } from './history.js';

export { mulberry32, randomInt, standardNormal, type Rng } from './random.js';

export {
  simulate,
  chanceOfReaching,
  observedReturns,
  bootstrap,
  blockBootstrap,
  normal,
  fixed,
  type ReturnModel,
  type SimulationInput,
  type Simulation,
  type SimulationYear,
  type Band,
} from './simulate.js';

import { loadLedger } from './ledger.js';
import { deriveHistory, type History } from './history.js';
import type { Repository } from '@varve/store';

/** Load and derive in one step, for callers that just want the view. */
export async function buildHistory(repo: Repository): Promise<History> {
  return deriveHistory(await loadLedger(repo));
}
