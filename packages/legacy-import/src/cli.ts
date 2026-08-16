/**
 * Build snapshot documents from the legacy database.
 *
 *   pnpm --filter @varve/legacy-import snapshot
 *
 * Always writes the synthetic sample, which is committed and is what the web
 * app shows by default. Additionally writes a snapshot of the real database
 * when its extract is present locally — that file is gitignored and never
 * leaves the machine.
 */

import type { Snapshot } from '@varve/store';
import { writeSnapshotFile } from '@varve/store/file';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYNTHETIC_CSV } from './fixtures/synthetic.js';
import { importLegacy } from './import.js';
import { loadLegacyCsv } from './load.js';
import { toSnapshot } from './snapshot.js';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SAMPLE_OUT = join(ROOT, 'apps/web/src/data/sample-snapshot.json');
// Deliberately outside apps/web/src: anything under src can be bundled, and
// this file must never end up in a deployable build.
const LOCAL_OUT = join(ROOT, 'local-snapshot.json');
const LEGACY_CSV = join(ROOT, 'legacy/extracted/csv');

async function write(label: string, path: string, snapshot: Snapshot) {
  await mkdir(dirname(path), { recursive: true });
  await writeSnapshotFile(path, snapshot);
  console.log(
    `${label}\n` +
      `  accounts      ${snapshot.accounts.length}\n` +
      `  observations  ${snapshot.observations.length}\n` +
      `  flows         ${snapshot.flows.length}\n` +
      `  notes         ${snapshot.notes.length}\n` +
      `  -> ${path.replace(ROOT, '')}\n`,
  );
}

/**
 * Birth years for the two invented people in the sample.
 *
 * Applied here rather than in the importer, and only to the synthetic sample,
 * because the Access database has no such column — inventing one during a
 * migration would put a made-up figure into a real household's record. Ada and
 * Ben do not exist, so giving them ages is what a sample is for: without them
 * the Plan page can only say "no birth year on file", and the half of §28 about
 * when somebody stops saving cannot be seen at all.
 */
const SAMPLE_BIRTH_YEARS: Readonly<Record<string, number>> = { Ada: 1980, Ben: 1975 };

function withSampleAges(snapshot: Snapshot): Snapshot {
  return {
    ...snapshot,
    owners: snapshot.owners.map((owner) => {
      const birthYear = SAMPLE_BIRTH_YEARS[owner.name];
      return birthYear === undefined ? owner : { ...owner, birthYear };
    }),
  };
}

async function main() {
  await write(
    'synthetic sample (committed)',
    SAMPLE_OUT,
    withSampleAges(toSnapshot(importLegacy(SYNTHETIC_CSV, 'Sample Household'))),
  );

  if (!existsSync(join(LEGACY_CSV, 'tblPerformance.csv'))) {
    console.log('No local legacy extract found — skipping the real snapshot.');
    console.log('Run legacy/extracted/extract.sh to generate one.');
    return;
  }

  const imported = importLegacy(await loadLegacyCsv(LEGACY_CSV));
  await write('local database (gitignored)', LOCAL_OUT, toSnapshot(imported));
  console.log('Open it from the web app with "Open a snapshot…".\n');

  const warnings = imported.issues.filter((i) => i.severity === 'warning');
  if (warnings.length > 0) {
    console.log(`${warnings.length} issue(s) need a human:`);
    for (const w of warnings) console.log(`  - ${w.message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
