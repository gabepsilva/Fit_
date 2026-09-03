#!/usr/bin/env python
"""Check the built database against things that must be true.

Assertions on the shipped data itself (plausibility, joins), not a test of
the pipeline's code.
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "db"

PASS, FAIL = "  ok  ", " FAIL "


def check(db: sqlite3.Connection, name: str, sql: str, expect_zero: bool = True) -> bool:
    value = db.execute(sql).fetchone()[0]
    good = (value == 0) if expect_zero else (value > 0)
    print(f"[{PASS if good else FAIL}] {name:<52} {value:>12,}")
    return good


def main() -> int:
    ok = True
    for path in sorted(DB.glob("*.sqlite")):
        print(f"\n=== {path.name}  ({path.stat().st_size / 1e6:,.1f} MB) ===")
        db = sqlite3.connect(f"file:{path}?mode=ro", uri=True)

        counts = {
            t: db.execute(f"SELECT count(*) FROM {t}").fetchone()[0]
            for t in ("food", "food_alias", "food_serving", "food_fts")
        }
        for table, n in counts.items():
            print(f"        {table:<52} {n:>12,}")

        checks = [
            # Integrity: nothing may reference a food that is not there.
            ("orphan aliases",
             "SELECT count(*) FROM food_alias a LEFT JOIN food f USING(food_id) WHERE f.food_id IS NULL"),
            ("orphan servings",
             "SELECT count(*) FROM food_serving s LEFT JOIN food f USING(food_id) WHERE f.food_id IS NULL"),
            ("foods with no serving row",
             "SELECT count(*) FROM food f LEFT JOIN food_serving s USING(food_id) WHERE s.food_id IS NULL"),
            ("foods missing from the FTS index",
             "SELECT (SELECT count(*) FROM food) - (SELECT count(*) FROM food_fts)"),

            # Plausibility: these would each be a visible bug in the app.
            ("negative or absurd calories",
             "SELECT count(*) FROM food WHERE kcal < 0 OR kcal > 902"),
            ("macros summing over 100 g per 100 g",
             "SELECT count(*) FROM food WHERE protein + fat + carbs > 100.5"),
            ("negative macros",
             "SELECT count(*) FROM food WHERE protein < 0 OR fat < 0 OR carbs < 0"),
            ("sugar exceeding carbohydrate",
             "SELECT count(*) FROM food WHERE sugar > carbs + 0.5"),
            ("saturated fat exceeding total fat",
             "SELECT count(*) FROM food WHERE saturated_fat > fat + 0.5"),
            ("sodium over 100 g per 100 g",
             "SELECT count(*) FROM food WHERE sodium > 100000"),
            ("rows with no name",
             "SELECT count(*) FROM food WHERE name IS NULL OR trim(name) = ''"),
            ("rows with no calories",
             "SELECT count(*) FROM food WHERE kcal IS NULL"),

            # Identity: a barcode must resolve to exactly one food.
            ("duplicate barcodes",
             "SELECT count(*) FROM (SELECT gtin14 FROM food WHERE gtin14 IS NOT NULL "
             "GROUP BY 1 HAVING count(*) > 1)"),

            # Licensing: the license derives from value_ref and must always exist.
            ("rows with no license",
             "SELECT count(*) FROM food WHERE license IS NULL OR license = ''"),
            ("rows with no value_ref",
             "SELECT count(*) FROM food WHERE value_ref IS NULL"),
        ]
        for name, sql in checks:
            ok &= check(db, name, sql)

        ok &= check(db, "FTS returns hits for 'chicken'",
                    "SELECT count(*) FROM food_fts WHERE food_fts MATCH 'chicken'", expect_zero=False)

        print("\n  calorie distribution (sanity, not a check):")
        for label, lo, hi in [("0", 0, 0), ("1-50", 1, 50), ("51-150", 51, 150),
                              ("151-300", 151, 300), ("301-500", 301, 500),
                              ("501-902", 501, 902)]:
            n = db.execute(f"SELECT count(*) FROM food WHERE kcal BETWEEN {lo} AND {hi}").fetchone()[0]
            bar = "#" * int(60 * n / max(counts["food"], 1))
            print(f"    {label:>8} kcal/100g {n:>10,}  {bar}")

        db.close()

    print("\nPASS" if ok else "\nFAILURES ABOVE")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
