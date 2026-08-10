/**
 * Minimal RFC 4180 CSV reader.
 *
 * Hand-written rather than pulled from npm for one reason: the legacy money
 * values must never touch a float. Reading the `mdb-export` text directly keeps
 * every amount as the exact decimal string Access wrote, all the way into
 * `Money`. Going via SQLite would store a four-decimal `Currency` value as a
 * double and hand back whatever survived the round trip.
 *
 * Handles quoted fields, embedded commas, escaped quotes, and embedded newlines
 * — the last of which the `tblYear.Notes` memo column genuinely contains.
 */

export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const char = input[i]!;

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      quoted = true;
      i += 1;
    } else if (char === ',') {
      endField();
      i += 1;
    } else if (char === '\r') {
      i += 1; // normalize CRLF
    } else if (char === '\n') {
      endRow();
      i += 1;
    } else {
      field += char;
      i += 1;
    }
  }

  if (field !== '' || row.length > 0) endRow();
  return rows;
}

/** Parse into records keyed by the header row. */
export function parseCsvRecords(input: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(input);
  if (!header) return [];
  return rows
    .filter((row) => row.some((cell) => cell !== ''))
    .map((row) => Object.fromEntries(header.map((key, i) => [key, row[i] ?? ''])));
}
