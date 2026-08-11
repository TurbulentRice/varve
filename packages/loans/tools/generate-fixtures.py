#!/usr/bin/env python3
"""Generate parity fixtures by running the original `financetools`.

The Access migration is trusted because it reconciles against an independent
implementation (working doc §8.3). This port earns the same standing the same
way: the Python produces complete amortization schedules — every installment,
not just the totals — and the TypeScript must reproduce them line for line.

    python3 tools/generate-fixtures.py [--financetools ~/Dev/financetools]

The output is committed, so the parity test runs on a fresh clone with no Python
and no `financetools` checkout. Regenerate only when the oracle changes.

Rates carry at most two decimal places throughout. That is not decoration: the
Python passes the interest rate through the same helper it uses for money, so
`Loan(1000, 4.875)` silently becomes a 4.88% loan. The port keeps rates
unrounded, and would disagree — correctly — on any rate this file could not
express. See §11.3.

## Why the oracle is generated twice

`financetools` quantizes with `ROUND_HALF_UP`; this codebase rounds half-even.
Those agree on every realistic quoted rate, because the monthly rate is a
non-terminating division and never lands on the tie they disagree about. They do
*not* agree at round rates — 6% is exactly 0.005 a month, and one balance in two
hundred then puts the interest precisely on a half-cent.

Conflating the two questions would make the fixture useless for both. So the
whole suite is generated under each rounding mode. The port is held to the
half-even run **exactly**, which tests the algorithm with the rounding
convention held constant; the half-up run is kept alongside it to measure what
the convention itself costs. See §11.2.
"""
from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import sys
from decimal import Decimal, ROUND_HALF_EVEN, ROUND_HALF_UP
from pathlib import Path

REPO_DEFAULT = Path.home() / "Dev" / "financetools"

ROUNDING_MODES = {"half_up": ROUND_HALF_UP, "half_even": ROUND_HALF_EVEN}


def set_rounding(Loan, mode):
    """Swap the library's quantizer. It is a staticmethod used by every path."""

    def Dec(n):
        if not isinstance(n, Decimal):
            n = Decimal(str(n))
        return n.quantize(Decimal("0.01"), ROUNDING_MODES[mode])

    Loan.Dec = staticmethod(Dec)


def quiet(fn, *args, **kwargs):
    """`payoff()` and the solve methods print progress. Not here they don't."""
    with contextlib.redirect_stdout(io.StringIO()):
        return fn(*args, **kwargs)


def terms(loan) -> dict:
    return {
        "title": loan.title,
        "principal": str(loan.start_balance),
        # Percent, as the Python takes it. The port divides by 100.
        "annual_rate_percent": str(loan.int_rate),
        "term_months": loan.term,
    }


def installments(loan) -> list[str]:
    """One line per installment: `"interest principal balance"`.

    A record per field would triple the file for no gain. This stays greppable
    and diffs one line per payment, which is what you want when a schedule
    moves. The installment number is the position.
    """
    h = loan.Payment_History
    # Index 0 is the opening state, not a payment.
    return [
        f'{h["interest"][i]} {h["principal"][i]} {h["balance"][i]}'
        for i in range(1, len(h["pay_no"]))
    ]


def schedule_case(Loan, name, principal, rate, term, payment=None, months=None) -> dict:
    loan = Loan(principal, rate, payment, title=name, term=term)
    if payment is None:
        loan.payment_amt = loan.min_payment
    if months is None:
        quiet(loan.payoff)
    else:
        quiet(loan.pay_months, months)
    return {
        "name": name,
        "terms": terms(loan),
        "payment": str(loan.payment_amt),
        "months_requested": months,
        "installments": installments(loan),
        "final_balance": str(loan.current_bal),
        "interest_paid": str(loan.get_interest_paid()),
        "principal_paid": str(loan.get_principal_paid()),
        "minimum_payment": str(Loan.Dec(loan.min_payment)),
    }


def queue_case(Loan, LoanQueue, name, specs, budget, minimum) -> dict:
    def fresh():
        return [Loan(b, r, title=t, term=n) for (t, b, r, n) in specs]

    strategies = {}
    for strategy in ("avalanche", "blizzard", "snowball", "cascade", "ice_slide"):
        queue = LoanQueue(fresh(), budget, title=name)
        done = quiet(getattr(queue, strategy), minimum)
        strategies[strategy] = {
            "duration": done.get_duration(),
            "num_payments": done.get_num_payments(),
            "interest_paid": str(done.get_interest_paid()),
            "principal_paid": str(done.get_principal_paid()),
            "total_paid": str(done.get_total_paid()),
            "order": [loan.title for loan in done.Q],
            "loans": [
                {
                    "title": loan.title,
                    "start_balance": str(loan.start_balance),
                    "installments": installments(loan),
                }
                for loan in done.Q
            ],
        }

    return {
        "name": name,
        "budget": str(Loan.Dec(budget)),
        "minimum": minimum,
        "loans": [
            {"title": t, "principal": str(Loan.Dec(b)), "annual_rate_percent": str(Loan.Dec(r)), "term_months": n}
            for (t, b, r, n) in specs
        ],
        "strategies": strategies,
    }


# Invented loans. Nothing here is anyone's real debt — see ground rule 1.
DOCUMENTED = [
    ("2014", 2406.65, 4.41, 120),
    ("2013", 2472.91, 3.61, 120),
    ("2012", 6282.30, 6.10, 120),
    ("2011", 5930.42, 6.10, 120),
]

TIED_RATES = [
    ("Alpha", 8000.00, 5.00, 60),
    ("Beta", 8000.00, 5.00, 60),
    ("Gamma", 3000.00, 5.00, 60),
]

LOPSIDED = [
    ("Mortgageish", 240000.00, 3.25, 360),
    ("Card", 4800.00, 22.99, 24),
    ("Auto", 18500.00, 6.75, 72),
]

# Whole-number rates, whose monthly value terminates in decimal — 6% is exactly
# 0.005 a month. These are the only loans where half-up and half-even can
# disagree at all, and quoted rates really are round, so they belong here.
ROUND_RATES = [
    ("Six", 12000.00, 6.00, 60),
    ("Twelve", 8000.00, 12.00, 48),
    ("Eighteen", 5000.00, 18.00, 36),
]

SINGLE = [
    ("Round numbers", 10000.00, 6.00, 60, None, None),
    ("Card at minimum", 4800.00, 22.99, 24, None, None),
    ("Overpaid", 10000.00, 6.00, 60, 1000.00, None),
    ("Final installment is short", 1234.56, 7.77, 36, 200.00, None),
    ("Long mortgage", 240000.00, 3.25, 360, None, None),
    # Negative amortization: the payment does not cover the interest, so the
    # balance grows. Bounded by months, since it never pays off.
    ("Underwater", 20000.00, 18.00, 120, 100.00, 24),
    ("Interest exactly covered", 10000.00, 12.00, 60, 100.00, 12),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--financetools", type=Path, default=REPO_DEFAULT)
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "test" / "fixtures" / "financetools.json",
    )
    args = parser.parse_args()

    if not (args.financetools / "financetools" / "loan.py").exists():
        print(f"financetools not found at {args.financetools}", file=sys.stderr)
        print("Pass --financetools <path> to point at a checkout.", file=sys.stderr)
        return 1

    sys.path.insert(0, str(args.financetools))
    from financetools import Loan, LoanQueue  # noqa: E402

    revision = os.popen(f"git -C {args.financetools} rev-parse --short HEAD 2>/dev/null").read().strip()

    def suite():
        return {
            "schedules": [schedule_case(Loan, *case) for case in SINGLE],
            "queues": [
                queue_case(Loan, LoanQueue, "documented fixture", DOCUMENTED, 1200, "int"),
                queue_case(Loan, LoanQueue, "documented fixture, scheduled minimums", DOCUMENTED, 1200, "min"),
                queue_case(Loan, LoanQueue, "tied rates and balances", TIED_RATES, 1500, "int"),
                queue_case(Loan, LoanQueue, "lopsided", LOPSIDED, 3000, "int"),
                queue_case(Loan, LoanQueue, "lopsided, even split", LOPSIDED, 3000, "avg"),
                queue_case(Loan, LoanQueue, "round rates, where ties happen", ROUND_RATES, 2000, "int"),
            ],
        }

    document = {
        "_comment": (
            "Generated from financetools by tools/generate-fixtures.py. Every "
            "amount is a decimal string at two places, which is the scale the "
            "Python quantizes to and the scale the port matches. The suite is "
            "run under both rounding modes: the port must match `half_even` "
            "exactly, and `half_up` records what the library ships with. "
            "Invented loans only."
        ),
        "oracle_revision": revision or "unknown",
    }

    for mode in ROUNDING_MODES:
        set_rounding(Loan, mode)
        document[mode] = suite()

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(document, indent=2) + "\n")

    def count(suite_doc):
        lines = sum(len(s["installments"]) for s in suite_doc["schedules"])
        return lines + sum(
            len(loan["installments"])
            for q in suite_doc["queues"]
            for s in q["strategies"].values()
            for loan in s["loans"]
        )

    lines = count(document["half_even"])
    print(f"wrote {args.out} — {lines} installments per rounding mode, "
          f"{len(ROUNDING_MODES)} modes, across "
          f"{len(document['half_even']['schedules'])} schedules and "
          f"{len(document['half_even']['queues'])} queues")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
