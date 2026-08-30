#!/usr/bin/env python
"""Flatten the Canadian Nutrient File into one row per food.

CNF is small — about six thousand foods — but it is lab-analysed rather than
crowd-sourced, so it carries far more weight per row than Open Food Facts does.
It is also the only openly licensed Canadian source: Health Canada publishes no
branded or barcode data at all, so Canadian *packaged* goods can only come from
Open Food Facts.

Two format details the 2026 release changed and that a 2015-era parser gets
wrong: every CSV is UTF-8 with a BOM, and the old CONVERSION FACTOR file is gone
— serving weights now live in Measure_Weight_Conversion, mixed in with refuse
and yield rows and separable only by Measure_Type_Code.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
CNF = ROOT / "interim" / "canada_cnf"
OUT = ROOT / "interim"

# CNF uses the USDA-style nutrient numbers, not FDC's internal ids.
WANTED = {
    208: "kcal", 268: "kj", 203: "protein", 204: "fat", 205: "carbs",
    269: "sugar", 291: "fiber", 307: "sodium", 306: "potassium", 303: "iron",
    301: "calcium", 304: "magnesium", 309: "zinc", 320: "vitamin_a",
    401: "vitamin_c", 328: "vitamin_d", 418: "vitamin_b12", 417: "folate",
    606: "saturated_fat", 605: "trans_fat", 601: "cholesterol",
}

MEASURE_TYPE_SERVING = 6  # 3 = refuse, 9 = yield; only 6 is an edible serving


def csv(name: str, **kw: object) -> str:
    opts = "".join(f", {k}={v}" for k, v in kw.items())
    return f"read_csv('{CNF / name}', header=true, all_varchar=true, encoding='utf-8'{opts})"


def log(message: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def main() -> int:
    con = duckdb.connect()
    con.execute("SET threads=8;")

    pivot = ",\n        ".join(
        f"max(CASE WHEN try_cast(Nutrient_Code AS INTEGER) = {code} "
        f"THEN try_cast(Nutrient_Amount AS DOUBLE) END) AS {col}"
        for code, col in WANTED.items()
    )
    con.execute(f"""
      CREATE TABLE nutrients AS
      SELECT try_cast(Food_Code AS INTEGER) AS food_code,
        {pivot}
      FROM {csv('Nutrient_Amount.csv')}
      WHERE try_cast(Nutrient_Code AS INTEGER) IN ({','.join(str(c) for c in WANTED)})
      GROUP BY 1
    """)
    log(f"nutrient rows pivoted: {con.execute('SELECT count(*) FROM nutrients').fetchone()[0]:,}")

    con.execute(f"""
      CREATE TABLE cnf_food AS
      SELECT
        'cnf:' || f.Food_Code                       AS source_ref,
        try_cast(f.Food_Code AS INTEGER)            AS food_code,
        trim(f.Food_Description_EN)                 AS name,
        nullif(trim(coalesce(f.Food_Description_FR,'')), '')      AS name_fr,
        nullif(trim(coalesce(f.Alternate_Description_EN,'')), '') AS alternate_name,
        nullif(trim(coalesce(f.USDA_NDB_Code,'')), '')            AS usda_ndb_code,
        g.CNF_Food_Group_Description_EN             AS category_raw,
        nullif(trim(coalesce(f.Food_Last_Updated_Date,'')), '')   AS source_date,
        -- CNF publishes kcal directly for nearly everything; kJ covers the rest.
        coalesce(n.kcal, n.kj / 4.184)              AS kcal,
        n.* EXCLUDE (food_code, kcal, kj)
      FROM {csv('Food_Name.csv')} f
      LEFT JOIN {csv('CNF_Food_Group.csv')} g
             ON g.CNF_Food_Group_Code = f.CNF_Food_Group_Code
      LEFT JOIN nutrients n ON n.food_code = try_cast(f.Food_Code AS INTEGER)
    """)
    total = con.execute("SELECT count(*) FROM cnf_food").fetchone()[0]
    log(f"cnf_food rows: {total:,}")

    con.execute(f"""
      CREATE TABLE cnf_portion AS
      SELECT 'cnf:' || w.Food_Code AS source_ref,
             trim(m.Measure_Description_and_Unit_EN) AS unit_label,
             try_cast(w.Measure_Weight_Conversion AS DOUBLE) AS grams
      FROM {csv('Measure_Weight_Conversion.csv')} w
      JOIN {csv('Measure_Name.csv')} m ON m.Measure_Code = w.Measure_Code
      WHERE try_cast(w.Measure_Type_Code AS INTEGER) = {MEASURE_TYPE_SERVING}
        AND try_cast(w.Measure_Weight_Conversion AS DOUBLE) > 0
    """)
    log(f"cnf_portion rows: {con.execute('SELECT count(*) FROM cnf_portion').fetchone()[0]:,}")

    for col in ("kcal", "protein", "fat", "carbs", "usda_ndb_code"):
        n = con.execute(f"SELECT count({col}) FROM cnf_food").fetchone()[0]
        log(f"  {col:<16} {n:>6,}  ({n / total:6.1%})")

    con.execute(f"COPY cnf_food TO '{OUT / 'cnf_food.parquet'}' (FORMAT parquet, COMPRESSION zstd)")
    con.execute(f"COPY cnf_portion TO '{OUT / 'cnf_portion.parquet'}' (FORMAT parquet, COMPRESSION zstd)")
    log("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
