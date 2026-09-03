#!/usr/bin/env python
"""Exercise the built database the way the app does: barcode scan, name search,
and serving scaling, against the shipped artifact."""

from __future__ import annotations

import sqlite3
import sys
import time
from pathlib import Path

DB = Path(__file__).resolve().parents[1] / "db" / "fit-food-full.sqlite"

MACROS = "kcal, protein, fat, carbs, sugar, fiber, sodium"


def timed(db: sqlite3.Connection, label: str, sql: str, params: tuple = ()) -> list:
    start = time.perf_counter()
    rows = db.execute(sql, params).fetchall()
    print(f"\n--- {label}   [{(time.perf_counter() - start) * 1000:.1f} ms, "
          f"{len(rows)} row(s)]")
    return rows


def main() -> int:
    if not DB.exists():
        print(f"missing {DB}")
        return 1
    db = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row

    # 1. Barcode scan: a GTIN resolves to exactly one food.
    for gtin in ("00016000275867", "00028400090971", "0000110003908"):
        padded = gtin.zfill(14)
        rows = timed(db, f"barcode {padded}", f"""
            SELECT name, brand, region, license, quality, n_distinct_sources,
                   kcal_spread, {MACROS}
            FROM food WHERE gtin14 = ?""", (padded,))
        for r in rows:
            print(f"    {r['name'][:52]:<52} {r['brand'] or '-':<20}")
            print(f"      {r['kcal']:.0f} kcal | P {r['protein']:.1f} "
                  f"F {r['fat']:.1f} C {r['carbs']:.1f} per 100 g")
            print(f"      {r['license']} · quality {r['quality']} · "
                  f"{r['n_distinct_sources']} source(s) · kcal spread {r['kcal_spread']}")

    # 2. Text search: FTS5 over name, brand and aliases, ranked by quality.
    for query in ("greek yogurt", "cheerios", "chicken breast raw", "clif bar"):
        rows = timed(db, f"search {query!r}", f"""
            SELECT f.name, f.brand, f.kind, f.region, f.quality, f.license, f.{MACROS.replace(', ', ', f.')}
            FROM food_fts
            JOIN food f ON f.food_id = food_fts.rowid
            WHERE food_fts MATCH ?
            ORDER BY f.quality DESC, bm25(food_fts)
            LIMIT 5""", (query,))
        for r in rows:
            print(f"    [{r['quality']:>3}] {r['name'][:46]:<46} "
                  f"{(r['brand'] or '-')[:16]:<16} {r['kcal']:>6.0f} kcal  "
                  f"{r['kind']}/{r['region']}")

    # 3. Serving scaling: everything is stored per 100 g, so the app multiplies.
    rows = timed(db, "servings for a high-quality generic food", f"""
        SELECT f.name, s.label, s.grams, f.kcal,
               round(f.kcal * s.grams / 100.0, 0) AS kcal_serving,
               round(f.protein * s.grams / 100.0, 1) AS protein_serving
        FROM food f JOIN food_serving s USING (food_id)
        WHERE f.kind = 'generic' AND f.value_source IN ('fdc_foundation','fdc_sr_legacy')
          AND f.name LIKE '%Rice, white%'
        ORDER BY f.quality DESC, s.grams
        LIMIT 8""")
    for r in rows:
        print(f"    {r['name'][:40]:<40} {r['label'][:22]:<22} "
              f"{r['grams']:>7.1f} g -> {r['kcal_serving']:>5.0f} kcal, "
              f"{r['protein_serving']:>5.1f} g protein")

    # 4. Cross-source disagreement: kcal_spread is the trust signal.
    rows = timed(db, "widest cross-source calorie disagreements", f"""
        SELECT name, brand, kcal, kcal_spread, n_distinct_sources, value_source
        FROM food
        WHERE n_distinct_sources > 1 AND kcal_spread > 0
        ORDER BY kcal_spread DESC LIMIT 5""")
    for r in rows:
        print(f"    {r['name'][:44]:<44} winner {r['kcal']:>5.0f} kcal, "
              f"sources disagree by {r['kcal_spread']:>6.1f}")

    rows = timed(db, "how often independent sources agree closely", """
        SELECT
          count(*) FILTER (WHERE kcal_spread <= 5)   AS within_5,
          count(*) FILTER (WHERE kcal_spread <= 25)  AS within_25,
          count(*) FILTER (WHERE kcal_spread > 100)  AS over_100,
          count(*)                                    AS total
        FROM food WHERE n_distinct_sources > 1""")
    r = rows[0]
    print(f"    of {r['total']:,} foods confirmed by 2+ independent sources:")
    print(f"      within 5 kcal   {r['within_5']:>9,}  ({r['within_5'] / r['total']:.1%})")
    print(f"      within 25 kcal  {r['within_25']:>9,}  ({r['within_25'] / r['total']:.1%})")
    print(f"      over 100 apart  {r['over_100']:>9,}  ({r['over_100'] / r['total']:.1%})")

    db.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
