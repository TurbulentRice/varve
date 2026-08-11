/**
 * Reading and writing snapshot documents on disk.
 *
 * Kept in a separate entry point (`@varve/store/file`) because it imports
 * `node:fs` and the browser build must not pull it in. Everything else in this
 * package is environment-free.
 */

import { readFile, rename, writeFile } from 'node:fs/promises';
import { decodeSnapshot, encodeSnapshot, type Snapshot } from './snapshot.js';

export async function readSnapshotFile(path: string): Promise<Snapshot> {
  return decodeSnapshot(await readFile(path, 'utf8'));
}

/**
 * Write a snapshot, atomically.
 *
 * Writes to a temporary file and renames it into place, because `rename` is
 * atomic on POSIX filesystems. A process interrupted mid-write would otherwise
 * leave a truncated document where someone's financial history used to be — the
 * one failure mode that is genuinely unrecoverable without a backup.
 */
export async function writeSnapshotFile(
  path: string,
  snapshot: Snapshot,
  pretty = true,
): Promise<void> {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, encodeSnapshot(snapshot, pretty), 'utf8');
  await rename(temporary, path);
}
