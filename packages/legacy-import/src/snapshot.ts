/**
 * Migration output as a storable document.
 *
 * The importer's job ends at a domain model in memory; this is the bridge to
 * something that can be written down. Kept separate so `importLegacy` stays
 * free of storage concerns and can be tested without one.
 */

import { SNAPSHOT_SCHEMA_VERSION, type Snapshot } from '@varve/store';
import type { ImportResult } from './import.js';

/**
 * Package an import into a snapshot.
 *
 * `revision` starts at 1: the import itself is the first committed write, and
 * revision 0 is reserved for an empty ledger that has never been touched.
 */
export function toSnapshot(result: ImportResult): Snapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    revision: 1,
    exportedAt: new Date().toISOString(),
    household: result.household,
    owners: result.owners,
    accounts: result.accounts,
    observations: result.observations,
    flows: result.flows,
    notes: result.notes,
    // The Access database predates loans by twenty years and models only
    // savings. Empty here is a fact about the source, not a gap in the import.
    loans: [],
    loanObservations: [],
    loanPayments: [],
    incomeObservations: [],
  };
}
