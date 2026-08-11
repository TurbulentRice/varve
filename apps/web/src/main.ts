/**
 * Throwaway view.
 *
 * Deliberately framework-free: the point is to see whether the domain model is
 * pleasant to consume from UI code, and a framework choice is a real decision
 * that should not get made by accident inside a spike.
 *
 * Shows the sample household by default. Drop in a snapshot file to view your
 * own — it is read in the browser and never uploaded anywhere.
 */

import { InMemoryRepository, decodeSnapshot, type Snapshot } from '@varve/store';
import sampleSnapshot from './data/sample-snapshot.json';
import { buildHistory, type History, type YearRow } from './history.js';
import './styles.css';

const app = document.querySelector<HTMLDivElement>('#app')!;

const percent = (value: number, digits = 1) =>
  `${value >= 0 ? '' : '−'}${Math.abs(value * 100).toFixed(digits)}%`;

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
};

/** Intl renders a hyphen-minus; the rest of the page uses a true minus sign. */
function money(amount: { format(o?: Intl.NumberFormatOptions): string }): string {
  return amount.format({ maximumFractionDigits: 0 }).replace('-', '\u2212');
}

function signClass(value: number | { isNegative(): boolean }): string {
  const negative = typeof value === 'number' ? value < 0 : value.isNegative();
  return negative ? 'negative' : 'positive';
}

// ---------------------------------------------------------------- components

function tile(label: string, value: string, detail?: string): HTMLElement {
  return el(
    'div',
    { class: 'tile' },
    el('div', { class: 'tile-label' }, label),
    el('div', { class: 'tile-value' }, value),
    detail ? el('div', { class: 'tile-detail' }, detail) : '',
  );
}

function summary(history: History): HTMLElement {
  const vsBenchmark =
    history.averageBenchmark === null
      ? undefined
      : `benchmark ${percent(history.averageBenchmark)} · ` +
        `${history.averageReturn >= history.averageBenchmark ? 'ahead' : 'behind'} by ` +
        `${Math.abs((history.averageReturn - history.averageBenchmark) * 100).toFixed(1)} pts`;

  return el(
    'section',
    { class: 'tiles' },
    tile('Value', money(history.currentValue), `as of ${history.currentValueAsOf}`),
    tile(
      'Contributed',
      money(history.totalContributed),
      'across all tracked years',
    ),
    tile(
      'Earned',
      money(history.lifetimeGain),
      'growth, excluding contributions',
    ),
    tile('Average return', percent(history.averageReturn), vsBenchmark ?? 'annualized, time-weighted'),
    tile('Fees paid', money(history.totalFees), 'the cost of ownership'),
  );
}

function yearTable(years: readonly YearRow[]): HTMLElement {
  const head = el(
    'tr',
    {},
    ...[
      'Year',
      'Value',
      'Contributed',
      'Fees',
      'Earned',
      'Return',
      'Legacy',
      'Δ',
      'Benchmark',
    ].map((h) => el('th', {}, h)),
  );

  const rows = [...years].reverse().map((y) => {
    // No legacy figure means no disagreement to report — showing a delta
    // against an undefined number invents a discrepancy that does not exist.
    const delta = y.legacyReturn === null ? null : (y.twr - y.legacyReturn) * 10_000;
    const material = delta !== null && Math.abs(delta) >= 100;
    const shown = delta !== null && Math.abs(delta) >= 1;

    return el(
      'tr',
      y.note ? { class: 'has-note', title: y.note } : {},
      el(
        'td',
        { class: 'year' },
        String(y.year),
        y.partial ? el('span', { class: 'partial', title: `as of ${y.endValueAsOf}` }, '•') : '',
        y.note ? el('span', { class: 'note-dot', title: y.note }, '✎') : '',
      ),
      el('td', { class: 'num' }, money(y.endValue)),
      el('td', { class: 'num muted' }, money(y.contributions)),
      el('td', { class: 'num muted' }, y.fees.isZero() ? '—' : money(y.fees)),
      el('td', { class: `num ${signClass(y.organicGain)}` }, money(y.organicGain)),
      el('td', { class: `num strong ${signClass(y.twr)}` }, percent(y.twr)),
      el('td', { class: 'num muted' }, y.legacyReturn === null ? '—' : percent(y.legacyReturn)),
      el(
        'td',
        { class: `num delta ${material ? 'material' : 'trivial'}` },
        shown ? `${delta! > 0 ? '+' : '−'}${Math.abs(delta!).toFixed(0)} bp` : '—',
      ),
      el('td', { class: 'num muted' }, y.benchmark === null ? '—' : percent(y.benchmark)),
    );
  });

  return el(
    'table',
    {},
    el('thead', {}, head),
    el('tbody', {}, ...rows),
  );
}

function header(history: History, onLoad: (file: File) => void): HTMLElement {
  const input = el('input', { type: 'file', accept: '.json', id: 'load' });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) onLoad(file);
  });

  return el(
    'header',
    {},
    el(
      'div',
      {},
      el('h1', {}, history.householdName),
      el(
        'p',
        { class: 'subtitle' },
        `${history.owners.map((o) => o.name).join(' & ')} · ` +
          `${history.accounts.length} accounts · revision ${history.revision}`,
      ),
    ),
    el('label', { class: 'load', for: 'load' }, 'Open a snapshot…', input),
  );
}

function legend(): HTMLElement {
  return el(
    'p',
    { class: 'legend' },
    'Return is chain-linked time-weighted. ',
    el('em', {}, 'Legacy'),
    ' is what the original spreadsheet reported — dividing by starting balance ' +
      'alone, which credits late contributions with a full year of growth. ' +
      'They agree exactly in years with no contributions; Δ shows where they do not. ' +
      '• marks a year still in progress, ✎ a year with a note (hover to read).',
  );
}

// ---------------------------------------------------------------------- shell

function render(history: History, onLoad: (file: File) => void) {
  app.replaceChildren(
    header(history, onLoad),
    summary(history),
    yearTable(history.years),
    legend(),
  );
}

function showError(message: string) {
  app.replaceChildren(el('div', { class: 'error' }, el('strong', {}, 'Could not load'), message));
}

async function show(snapshot: Snapshot) {
  const repo = new InMemoryRepository(snapshot);
  render(await buildHistory(repo), load);
}

async function load(file: File) {
  try {
    await show(decodeSnapshot(await file.text()));
  } catch (error) {
    showError((error as Error).message);
  }
}

// Only the synthetic sample is bundled. A real snapshot is opened explicitly,
// through the file picker, and read in the browser.
//
// It would be more convenient to auto-load a local file, and an earlier version
// did exactly that with `import.meta.glob`. It put every real account name and
// balance into the production bundle — a build that could be deployed. An app
// that quietly reaches for private data on disk is how that data ends up
// published, so the convenience is not worth it: one click cannot leak.
async function boot() {
  try {
    // Round-tripped through text so the decode path — validation and Money
    // revival — runs on the bundled sample exactly as it would on an opened file.
    await show(decodeSnapshot(JSON.stringify(sampleSnapshot)));
  } catch (error) {
    showError((error as Error).message);
  }
}

void boot();
