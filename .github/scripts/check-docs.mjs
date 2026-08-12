/**
 * Two invariants about the documentation, enforced rather than remembered.
 *
 * ## 1. Relative links resolve
 *
 * Markdown links to files in this repository must point at something that
 * exists. This has already caught three: a `legacy/extracted/README.md` link
 * that went three levels up from a two-level-deep file and had never worked, a
 * README pointing at a fixture under `test/` that lives under `src/`, and a
 * `STATUS.md` entry still naming a test file deleted in the commit before.
 *
 * All three were found by running this by hand and then, in the last case,
 * ignoring the result because nothing made the commit stop. Hence CI.
 *
 * ## 2. Cited section numbers exist
 *
 * Code comments cite the working doc by section — `§8.1` for the money
 * conventions, `§14` for the budget correction, `Decision 1` for the ledger
 * shape. `CLAUDE.md` calls that numbering load-bearing and asks that it be
 * extended rather than renumbered.
 *
 * Nothing enforced it. A renumbering would leave every citation pointing
 * somewhere plausible and wrong, and *nothing would fail* — not the build, not
 * the tests, not a reader who trusts the reference. That is the worst shape a
 * defect can have, so it gets a check.
 *
 * Run locally exactly as CI does:
 *
 *     node .github/scripts/check-docs.mjs
 */

import { readdir, readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

/**
 * Every working document, resolved as one numbering space.
 *
 * The second era starts a new file rather than a new section, and its numbering
 * *continues* rather than restarting — because 61 citations in the codebase
 * depend on `§8.1` meaning exactly one thing. A second document beginning at §1
 * would make a dozen references ambiguous overnight, and the failure would be
 * silent, which is the shape this check exists to prevent. See §18.4.
 */
const WORKING_DOCS = [
  'docs/working/discovery-and-architecture.md',
  'docs/working/interface-and-experience.md',
];
const SKIP = new Set(['node_modules', 'dist', '.git']);

const failures = [];
const fail = (message) => failures.push(message);

async function walk(dir, test) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await walk(path, test)));
    else if (test(entry.name)) found.push(path);
  }
  return found;
}

// ------------------------------------------------------------- relative links

const markdown = await walk('.', (n) => n.endsWith('.md'));
let linksChecked = 0;

for (const file of markdown) {
  const text = await readFile(file, 'utf8');

  for (const match of text.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
    const target = match[2].split('#')[0].trim();
    if (!target || /^(https?:|mailto:)/.test(target)) continue;

    linksChecked += 1;
    const resolved = resolve(join(file, '..', target));
    try {
      await readdir(resolved).catch(async () => {
        await readFile(resolved);
      });
    } catch {
      fail(`${file}\n      [${match[1]}](${target}) → nothing at ${relative('.', resolved)}`);
    }
  }
}

// --------------------------------------------------------- section references

const parts = await Promise.all(
  WORKING_DOCS.map(async (path) => {
    const text = await readFile(path, 'utf8').catch(() => null);
    if (text === null) fail(`${path} is missing — § references in the codebase point at it.`);
    return text;
  }),
);

const doc = parts.every((p) => p !== null) ? parts.join('\n') : null;

if (doc !== null) {
  const sections = new Set();
  for (const m of doc.matchAll(/^#{2,4}\s+(\d+)(?:\.(\d+))?\.?\s/gm)) {
    sections.add(m[1]);
    if (m[2]) sections.add(`${m[1]}.${m[2]}`);
  }

  const decisions = new Set(
    [...doc.matchAll(/^#{2,4}\s+Decision\s+(\d+)/gm)].map((m) => m[1]),
  );

  if (sections.size === 0) fail('No numbered sections found in the working docs — has the heading style changed?');

  const sources = await walk('.', (n) => /\.(ts|tsx|js|mjs|py|md)$/.test(n));
  let citationsChecked = 0;

  for (const file of sources) {
    // Working docs are *not* skipped. They cite each other across the era
    // boundary — this file's §18.4 points at §11.2 and §15.3 in the first — and
    // a cross-document citation is exactly the kind that rots unnoticed.
    const text = await readFile(file, 'utf8');

    for (const m of text.matchAll(/§\s?(\d+)(?:\.(\d+))?/g)) {
      citationsChecked += 1;
      const cited = m[2] ? `${m[1]}.${m[2]}` : m[1];
      if (!sections.has(cited)) {
        fail(`${file}\n      cites §${cited}, which is not a section of any working doc`);
      }
    }

    for (const m of text.matchAll(/\bDecision\s+(\d+)\b/g)) {
      citationsChecked += 1;
      if (!decisions.has(m[1])) {
        fail(`${file}\n      cites Decision ${m[1]}, which is not in any working doc`);
      }
    }
  }

  if (failures.length === 0) {
    console.log(
      `✓ ${linksChecked} relative links resolve; ` +
        `${citationsChecked} citations land in ${sections.size} sections and ${decisions.size} decisions`,
    );
  }
}

if (failures.length > 0) {
  console.error('\n✗ Documentation references are broken:\n');
  for (const message of failures) console.error(`  · ${message}\n`);
  console.error(
    '  A citation that points nowhere fails silently for a reader, which is why\n' +
      '  this is a check rather than a convention.\n',
  );
  process.exit(1);
}
