#!/usr/bin/env bash
# Reproducible extraction of the legacy Access DB into open formats.
#
#   brew install mdbtools
#   ./extracted/extract.sh
#
# Produces, next to this script:
#   access-schema.sql   -- DDL, sqlite dialect
#   access-queries.sql  -- reconstructed SQL for every saved Access query
#   access-objects.csv  -- MSysObjects catalog (forms/reports/queries/modules)
#   csv/*.csv           -- raw table dumps
#   retirement.sqlite   -- the whole DB, queryable

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="${1:-$HERE/../Retirement Saving Sample.accdb}"
TABLES=(tblAccountOwner tblPortfolioType tblPortfolio tblYear tblPerformance)

command -v mdb-tables >/dev/null || { echo "mdbtools not found: brew install mdbtools" >&2; exit 1; }
[ -f "$SRC" ] || { echo "source not found: $SRC" >&2; exit 1; }

echo "source: $SRC  (format: $(mdb-ver "$SRC"))"
mkdir -p "$HERE/csv"

# --- schema -----------------------------------------------------------------
mdb-schema "$SRC" sqlite > "$HERE/access-schema.sql"

# --- saved queries ----------------------------------------------------------
# NOTE: mdb-queries reconstructs the SELECT/FROM/WHERE/ORDER BY but *drops JOIN
# predicates and GROUP BY*. Treat the output as intent, not runnable SQL.
{
  echo "-- Reconstructed by mdbtools. JOIN predicates and GROUP BY are NOT recovered."
  echo "-- Joins follow the FK chain: Performance->Portfolio->{AccountOwner,PortfolioType}, Performance->Year"
  echo
  mdb-queries -L -1 "$SRC" | grep -v '^~' | while read -r q; do
    echo "-- ===== $q ====="
    mdb-queries "$SRC" "$q" 2>/dev/null || echo "-- (extraction failed)"
    echo
  done
} > "$HERE/access-queries.sql"

# --- object catalog ---------------------------------------------------------
mdb-export "$SRC" MSysObjects 2>/dev/null > "$HERE/access-objects.csv" || true

# --- data -------------------------------------------------------------------
for t in "${TABLES[@]}"; do
  mdb-export "$SRC" "$t" > "$HERE/csv/$t.csv"
done

# --- sqlite -----------------------------------------------------------------
rm -f "$HERE/retirement.sqlite"
sqlite3 "$HERE/retirement.sqlite" < "$HERE/access-schema.sql"
for t in "${TABLES[@]}"; do
  mdb-export -I sqlite -q "'" "$SRC" "$t" | sqlite3 "$HERE/retirement.sqlite"
done

echo "wrote -> $HERE"
sqlite3 "$HERE/retirement.sqlite" \
  "select 'tblPerformance rows: '||count(*) from tblPerformance;"
