import { encodeSnapshot, type Snapshot } from '@varve/store';

/**
 * Hand the ledger back as a file.
 *
 * Lives in the app rather than the store because it is a browser gesture, not a
 * storage concern — the store stays free of any environment so it can be reused
 * on a server or in a worker.
 *
 * Worth keeping prominent: `localStorage` is convenient and not durable, since
 * clearing site data erases it. This is the real backup, and it is the same
 * document format the app reads back, so nothing is locked in.
 */
export function downloadSnapshot(snapshot: Snapshot, filename = 'varve-ledger.json'): void {
  const url = URL.createObjectURL(
    new Blob([encodeSnapshot(snapshot)], { type: 'application/json' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
