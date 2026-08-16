/**
 * The serialized form of a household's entire ledger.
 *
 * One self-contained JSON document. Small enough to hold in memory and send
 * whole — twenty years of quarterly data is a few hundred records, and even
 * daily feeds for a decade land in the single-digit megabytes.
 *
 * ## Why a document
 *
 * It is the local file format, the backup, the interchange format, and the
 * shape a server would store in a `jsonb` column. Keeping those the same thing
 * means "export your data" is not a feature anyone has to build later, and it
 * leaves the door open to encrypting the document client-side so a server can
 * hold it without being able to read it — which normalized server tables
 * foreclose almost entirely.
 *
 * ## Two fields that are cheap now and impossible to retrofit
 *
 * `schemaVersion` makes migration possible at all. A format with no version is
 * a format that can never change.
 *
 * `revision` is a monotonic counter bumped on every committed write. Today it
 * powers nothing; it exists so that optimistic concurrency (`UPDATE … WHERE
 * revision = ?`) and delta sync ("everything added since revision N") remain
 * available without a format change. Because the ledger is append-dominant,
 * a delta is close to trivial to compute — which is the reason not to foreclose
 * it now.
 *
 * ## Money
 *
 * Amounts serialize as **strings**, never JSON numbers. This is a hard rule,
 * not an implementation detail: `43821.3468` as an IEEE double is not
 * `43821.3468`, and a format that round-trips money through floats corrupts it
 * silently and permanently.
 */

import {
  Money,
  isoDate,
  type Account,
  type AccountId,
  type BalanceObservation,
  type Flow,
  type FlowKind,
  type Household,
  type Loan,
  type LoanObservation,
  type LoanPayment,
  type IncomeObservation,
  type Note,
  type Owner,
} from '@varve/core';

/** Bump when the on-disk shape changes in a way older readers cannot handle. */
/**
 * Bump when the on-disk shape changes in a way older readers cannot handle.
 *
 * 2 adds `loans` and `loanObservations`; 3 adds `loanPayments`; 4 adds
 * `incomeObservations`. Older documents
 * still open, with each absent collection read as empty — the honest reading
 * rather than a lenient one, since a ledger written before a concept existed
 * genuinely has none of it.
 *
 * Three versions in three phases is not churn. Each added a collection that did
 * not exist and broke nothing that did, which is the cheap kind of migration;
 * the expensive kind changes what an already-populated field means, and none of
 * these has.
 */
export const SNAPSHOT_SCHEMA_VERSION = 4;

export interface Snapshot {
  readonly schemaVersion: number;
  /** Monotonic; incremented on every committed write. */
  readonly revision: number;
  /** When this document was written, ISO 8601. */
  readonly exportedAt: string;

  readonly household: Household;
  readonly owners: readonly Owner[];
  readonly accounts: readonly Account[];
  readonly observations: readonly BalanceObservation[];
  readonly flows: readonly Flow[];
  readonly notes: readonly Note[];
  readonly loans: readonly Loan[];
  readonly loanObservations: readonly LoanObservation[];
  readonly loanPayments: readonly LoanPayment[];
  readonly incomeObservations: readonly IncomeObservation[];
}

export function emptySnapshot(household: Household): Snapshot {
  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    revision: 0,
    exportedAt: new Date().toISOString(),
    household,
    owners: [],
    accounts: [],
    observations: [],
    flows: [],
    notes: [],
    loans: [],
    loanObservations: [],
    loanPayments: [],
    incomeObservations: [],
  };
}

// ------------------------------------------------------------------ encoding

/**
 * Serialize to JSON text.
 *
 * `Money.toJSON()` already emits its lossless decimal string, so amounts pass
 * through as strings without special handling here.
 */
export function encodeSnapshot(snapshot: Snapshot, pretty = true): string {
  return JSON.stringify(snapshot, null, pretty ? 2 : 0);
}

export class SnapshotFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotFormatError';
  }
}

/**
 * Parse JSON text back into a snapshot, reviving `Money` and validating shape.
 *
 * Deliberately strict. A snapshot is someone's entire financial history;
 * failing loudly on a malformed document is much kinder than loading it
 * half-formed and letting the damage surface three screens later.
 */
export function decodeSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (cause) {
    throw new SnapshotFormatError(`Not valid JSON: ${(cause as Error).message}`);
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new SnapshotFormatError('Expected a JSON object at the top level');
  }
  const doc = raw as Record<string, unknown>;

  const version = doc.schemaVersion;
  if (typeof version !== 'number') {
    throw new SnapshotFormatError('Missing schemaVersion — refusing to guess the format');
  }
  if (version > SNAPSHOT_SCHEMA_VERSION) {
    throw new SnapshotFormatError(
      `Snapshot is schema version ${version}, but this build understands at most ` +
        `${SNAPSHOT_SCHEMA_VERSION}. Upgrade before opening it.`,
    );
  }

  const household = doc.household as Household | undefined;
  if (!household?.id) throw new SnapshotFormatError('Missing household');

  return {
    // Read at whatever version it claims; written back at ours.
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    revision: typeof doc.revision === 'number' ? doc.revision : 0,
    exportedAt: typeof doc.exportedAt === 'string' ? doc.exportedAt : new Date(0).toISOString(),
    household,
    owners: array<Owner>(doc.owners, 'owners'),
    accounts: array<Account>(doc.accounts, 'accounts'),
    observations: array<Record<string, unknown>>(doc.observations, 'observations').map(
      decodeObservation,
    ),
    flows: array<Record<string, unknown>>(doc.flows, 'flows').map(decodeFlow),
    notes: array<Note>(doc.notes, 'notes'),
    // Absent in a version 1 document, and absent is genuinely none.
    loans: array<Loan>(doc.loans, 'loans'),
    loanObservations: array<Record<string, unknown>>(
      doc.loanObservations,
      'loanObservations',
    ).map(decodeLoanObservation),
    loanPayments: array<Record<string, unknown>>(doc.loanPayments, 'loanPayments').map(
      decodeLoanPayment,
    ),
    incomeObservations: array<Record<string, unknown>>(
      doc.incomeObservations,
      'incomeObservations',
    ).map(decodeIncomeObservation),
  };
}

function decodeIncomeObservation(raw: Record<string, unknown>, i: number): IncomeObservation {
  return {
    id: raw.id as IncomeObservation['id'],
    ownerId: raw.ownerId as IncomeObservation['ownerId'],
    asOf: isoDate(String(raw.asOf)),
    annualAmount: amount(raw.annualAmount, `incomeObservations[${i}]`),
    source: raw.source === 'imported' ? 'imported' : 'manual',
    ...(typeof raw.note === 'string' ? { note: raw.note } : {}),
  };
}

function decodeLoanPayment(raw: Record<string, unknown>, i: number): LoanPayment {
  return {
    id: raw.id as LoanPayment['id'],
    loanId: raw.loanId as LoanPayment['loanId'],
    paidOn: isoDate(String(raw.paidOn)),
    amount: amount(raw.amount, `loanPayments[${i}]`),
    ...(typeof raw.note === 'string' ? { note: raw.note } : {}),
  };
}

function decodeLoanObservation(raw: Record<string, unknown>, i: number): LoanObservation {
  return {
    id: raw.id as LoanObservation['id'],
    loanId: raw.loanId as LoanObservation['loanId'],
    asOf: isoDate(String(raw.asOf)),
    amount: amount(raw.amount, `loanObservations[${i}]`),
    source: (raw.source as LoanObservation['source']) ?? 'manual',
  };
}

function array<T>(value: unknown, field: string): T[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new SnapshotFormatError(`Expected ${field} to be an array`);
  return value as T[];
}

function amount(value: unknown, context: string): Money {
  if (typeof value === 'string') return Money.fromString(value);
  if (typeof value === 'number') {
    // Loud, because silently accepting it is how float corruption gets in.
    throw new SnapshotFormatError(
      `${context}: amounts must be strings, not JSON numbers (got ${value}). ` +
        'A number has already lost precision by the time it is parsed.',
    );
  }
  throw new SnapshotFormatError(`${context}: missing amount`);
}

function decodeObservation(raw: Record<string, unknown>, i: number): BalanceObservation {
  return {
    id: raw.id as BalanceObservation['id'],
    accountId: raw.accountId as BalanceObservation['accountId'],
    asOf: isoDate(String(raw.asOf)),
    amount: amount(raw.amount, `observations[${i}]`),
    source: (raw.source ?? 'manual') as BalanceObservation['source'],
  };
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function decodeFlow(raw: Record<string, unknown>, i: number): Flow {
  const flow: Mutable<Flow> = {
    id: raw.id as Flow['id'],
    accountId: raw.accountId as Flow['accountId'],
    occurredOn: isoDate(String(raw.occurredOn)),
    amount: amount(raw.amount, `flows[${i}]`),
    kind: raw.kind as FlowKind,
  };

  // Optional fields are left absent rather than set to undefined, so that
  // re-encoding a document reproduces what was read rather than sprouting nulls.
  if (typeof raw.counterpartyAccountId === 'string') {
    flow.counterpartyAccountId = raw.counterpartyAccountId as AccountId;
  }
  if (typeof raw.note === 'string') flow.note = raw.note;

  return flow;
}
