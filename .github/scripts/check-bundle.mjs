/**
 * Ground rule 1, automated: no real financial data in a built bundle.
 *
 * ## Why this looks at shape rather than searching for names
 *
 * The documented version of this check greps the bundle for known account and
 * owner names. It works, and it has a defect worth naming: the denylist has to
 * contain the very strings it exists to keep out of a repository that is public.
 * The guard rail becomes the leak.
 *
 * So this checks structure instead, in two passes.
 *
 * **The source pass** is the deterministic one, because it targets the mechanism
 * of the bug that actually happened: an `import.meta.glob` swept up a local
 * snapshot alongside the sample and put a real household's balances into a build
 * that could have been deployed. Globbed imports and stray JSON in app source are
 * visible before anything is built, and they are visible without knowing a single
 * real name.
 *
 * **The bundle pass** is defence in depth, for data arriving by some route the
 * source pass does not model. Every record in a ledger carries a `householdId`.
 * If the bundle holds records belonging to a household that is not the sample,
 * something is in there that should not be — again, no denylist required.
 *
 * Run locally exactly as CI does:
 *
 *     pnpm --filter @varve/web build && node .github/scripts/check-bundle.mjs
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const SRC = 'apps/web/src';
const DIST = 'apps/web/dist';
const SAMPLE = 'apps/web/src/data/sample-snapshot.json';
const SAMPLE_IMPORT = 'sample-snapshot.json';

/**
 * A record belonging to a ledger, minified or not.
 *
 * Matches the data literal `householdId:"h1"` and its unminified form, but not a
 * bare property access — which is what keeps code references out of the count.
 */
const LEDGER_RECORD = /["']?householdId["']?\s*:\s*["']([^"']*)["']/g;

const failures = [];
const fail = (message) => failures.push(message);

async function walk(dir, test) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path, test)));
    else if (test(entry.name)) found.push(path);
  }
  return found;
}

// ------------------------------------------------------------- the source pass

const sourceFiles = await walk(SRC, (n) => /\.(ts|tsx|js|jsx)$/.test(n));

for (const file of sourceFiles) {
  const text = await readFile(file, 'utf8');

  if (text.includes('import.meta.glob')) {
    fail(
      `${file} uses import.meta.glob.\n` +
        '    This is precisely how a real snapshot reached a production bundle ' +
        'once already.\n' +
        '    Real ledgers are opened through the file picker at runtime; they ' +
        'are never imported.',
    );
  }

  for (const match of text.matchAll(/from\s+["']([^"']+\.json)["']/g)) {
    const specifier = match[1];
    if (!specifier.endsWith(SAMPLE_IMPORT)) {
      fail(
        `${file} imports ${specifier}.\n` +
          `    The only ledger that belongs in app source is ${SAMPLE_IMPORT}.`,
      );
    }
  }
}

// ------------------------------------------------------------- the bundle pass

const sample = JSON.parse(await readFile(SAMPLE, 'utf8'));
const sampleHousehold = sample.household?.id;
if (!sampleHousehold) fail(`${SAMPLE} has no household id — cannot identify the sample.`);

let bundleFiles = [];
try {
  bundleFiles = await walk(DIST, (n) => /\.(js|mjs|cjs|html|css|json)$/.test(n));
} catch {
  fail(`No bundle at ${DIST}. Run \`pnpm --filter @varve/web build\` first.`);
}

if (bundleFiles.length > 0) {
  const owners = new Map();

  for (const file of bundleFiles) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(LEDGER_RECORD)) {
      const household = match[1];
      if (!owners.has(household)) owners.set(household, new Set());
      owners.get(household).add(relative('.', file));
    }
  }

  const total = [...owners.keys()];

  if (total.length === 0) {
    // Not a leak, but the check has stopped checking — which is worse than a
    // failure, because it passes silently forever afterwards.
    fail(
      'No ledger records found in the bundle at all.\n' +
        '    The sample should be embedded, so either the build changed shape ' +
        'or this check no longer recognises a record.\n' +
        '    Fix the check rather than deleting it.',
    );
  }

  for (const [household, files] of owners) {
    if (household !== sampleHousehold) {
      fail(
        `The bundle carries records for household ${JSON.stringify(household)}, ` +
          `which is not the sample (${JSON.stringify(sampleHousehold)}).\n` +
          `    Found in: ${[...files].join(', ')}\n` +
          '    A second ledger in a built bundle is how real balances reach a ' +
          'deployable artifact.',
      );
    }
  }
}

// ---------------------------------------------------------------------- report

if (failures.length > 0) {
  console.error('\n✗ Real data may be reaching the bundle:\n');
  for (const message of failures) console.error(`  · ${message}\n`);
  process.exit(1);
}

console.log(
  `✓ ${sourceFiles.length} source files carry no globbed or stray ledger imports; ` +
    `${bundleFiles.length} bundle files carry records for the sample household only`,
);
