/**
 * Storage for a household ledger.
 *
 * A narrow async repository interface, an in-memory adapter, and a JSON
 * document format that doubles as the export, the backup, and the shape a
 * server would persist.
 *
 * Node-only file helpers live at `@varve/store/file` so this entry point stays
 * safe to bundle for a browser.
 */

export {
  SNAPSHOT_SCHEMA_VERSION,
  SnapshotFormatError,
  emptySnapshot,
  encodeSnapshot,
  decodeSnapshot,
  type Snapshot,
} from './snapshot.js';

export {
  matchesWindow,
  matchesObservation,
  matchesFlow,
  type Repository,
  type Revision,
  type DateWindow,
  type ObservationQuery,
  type FlowQuery,
} from './repository.js';

export { InMemoryRepository } from './memory.js';
