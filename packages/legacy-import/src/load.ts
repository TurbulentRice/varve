import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LegacyCsv } from './import.js';

/** `mdb-export` output filenames, as produced by `extracted/extract.sh`. */
export const LEGACY_CSV_FILES = {
  owners: 'tblAccountOwner.csv',
  portfolioTypes: 'tblPortfolioType.csv',
  portfolios: 'tblPortfolio.csv',
  years: 'tblYear.csv',
  performance: 'tblPerformance.csv',
} as const;

/** Read the extracted CSVs from a directory. */
export async function loadLegacyCsv(directory: string): Promise<LegacyCsv> {
  const entries = await Promise.all(
    Object.entries(LEGACY_CSV_FILES).map(
      async ([key, file]) => [key, await readFile(join(directory, file), 'utf8')] as const,
    ),
  );
  return Object.fromEntries(entries) as unknown as LegacyCsv;
}
