#!/usr/bin/env python3
"""Generate the single-loan parity fixture by running `financetools`.

The Access migration is trusted because it reconciles against an independent
implementation (working doc §8.3), and this port earned the same standing the
same way. Most of that apparatus has since been retired — §15 explains why —
because three deliberate departures left parity speaking to less and less, and
the last of them (§14) required writing the correction a second time in Python,
which independently verifies nothing.

What remains is the part where `financetools` is still an independent
implementation and this port still agrees with it exactly: **one loan, played
forward.** Interest on a balance, half-even to the cent, the overpayment clamp on
a final installment, and negative amortization when a payment cannot cover the
interest. No divergence has ever happened here.

    python3 tools/generate-fixtures.py [--financetools ~/Dev/financetools]

The output is committed, so the test runs on a fresh clone with no Python and no
`financetools` checkout. Regenerate only when the oracle changes.

Rates carry at most two decimal places. That is not decoration: the Python passes
the interest rate through the same helper it uses for money, so `Loan(1000,
4.875)` silently becomes a 4.88% loan. The port keeps rates unrounded, and would
disagree — correctly — on any rate this file could not express. See §11.3.

Rounding is half-even throughout, matching the house convention, so the fixture
tests the algorithm with the convention held constant. What the convention itself
costs was measured once and written up in §11.2; it is not re-derived on every
CI run.
"""
from __future__ import annotations

import argparse
import contextlib
import io
import json
import os
import sys
from decimal import Decimal, ROUND_HALF_EVEN
from pathlib import Path

REPO_DEFAULT = Path.home() / "Dev" / "financetools"


def use_half_even(Loan):
    """Swap the library's quantizer to the house convention.

    `financetools` rounds half-up; this codebase rounds half-even (§8.1). Holding
    the convention constant is what makes the fixture test the algorithm rather
    than the rounding mode.
    """

    def Dec(n):
        if not isinstance(n, Decimal):
            n = Decimal(str(n))
        return n.quantize(Decimal("0.01"), ROUND_HALF_EVEN)

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
    from financetools import Loan  # noqa: E402

    revision = os.popen(f"git -C {args.financetools} rev-parse --short HEAD 2>/dev/null").read().strip()

    use_half_even(Loan)

    document = {
        "_comment": (
            "Generated from financetools by tools/generate-fixtures.py. Every "
            "amount is a decimal string at two places, which is the scale the "
            "Python quantizes to and the scale the port matches. Single loans "
            "only: see section 15 of the working doc for why the queue suites "
            "were retired. Rounding is half-even throughout, matching the house "
            "convention. Invented loans only."
        ),
        "oracle_revision": revision or "unknown",
        "schedules": [schedule_case(Loan, *case) for case in SINGLE],
    }

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(document, indent=2) + "\n")

    lines = sum(len(s["installments"]) for s in document["schedules"])
    print(f"wrote {args.out} — {lines} installments across "
          f"{len(document['schedules'])} single-loan schedules")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
