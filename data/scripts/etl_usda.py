#!/usr/bin/env python
"""Flatten USDA FoodData Central into one row per source record.

FDC ships normalised: `food` holds the identity, `branded_food` the label data,
and `food_nutrient` a 90-million-row long table of every measured value. This
pivots the nutrients we care about into a wide row and writes Parquet to
``data/interim/``. It resolves nothing and merges nothing — deduplication is a
later stage, on purpose, so the source layer stays a faithful copy.

Two subtleties the pivot has to get right:

* **Energy has three competing nutrient ids.** 1008 is the value off the label,
  2048 is computed with Atwater specific factors, 2047 with general factors. For
  a branded product the label is the truth the user is holding; for a lab-analysed
  foundation food there is no label, so the computed value is all there is. The
  coalesce order below prefers the label and falls back to computed, then to kJ.
* **Carbohydrate, sugar and fibre each have two ids**, one legacy and one used by
  the branded pipeline. Taking only one silently drops half the corpus.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
FDC = ROOT / "interim" / "usda_fdc" / "FoodData_Central_csv_2026-04-30"
OUT = ROOT / "interim"

# nutrient_id -> the column it lands in. Several ids can feed one column; the
# COALESCE order in NUTRIENT_COLUMNS decides which wins.
WANTED = {
    1008: "kcal_label", 2048: "kcal_atwater_specific", 2047: "kcal_atwater_general",
    1062: "kj",
    1003: "protein", 1004: "fat", 1005: "carbs_diff", 2039: "carbs_branded",
    2000: "sugar_a", 1063: "sugar_b",
    1079: "fiber_a", 2033: "fiber_b",
    1093: "sodium", 1092: "potassium", 1089: "iron", 1087: "calcium",
    1090: "magnesium", 1095: "zinc",
    1106: "vitamin_a", 1162: "vitamin_c", 1114: "vitamin_d", 1178: "vitamin_b12",
    1177: "folate",
    1258: "saturated_fat", 1257: "trans_fat", 1253: "cholesterol",
}

# Final column <- first non-null of these staging columns.
NUTRIENT_COLUMNS = [
    ("kcal", ["kcal_label", "kcal_atwater_specific", "kcal_atwater_general"]),
    ("protein", ["protein"]),
    ("fat", ["fat"]),
    ("carbs", ["carbs_branded", "carbs_diff"]),
    ("sugar", ["sugar_a", "sugar_b"]),
    ("fiber", ["fiber_a", "fiber_b"]),
    ("sodium", ["sodium"]), ("potassium", ["potassium"]), ("iron", ["iron"]),
    ("calcium", ["calcium"]), ("magnesium", ["magnesium"]), ("zinc", ["zinc"]),
    ("vitamin_a", ["vitamin_a"]), ("vitamin_c", ["vitamin_c"]),
    ("vitamin_d", ["vitamin_d"]), ("vitamin_b12", ["vitamin_b12"]),
    ("folate", ["folate"]),
    ("saturated_fat", ["saturated_fat"]), ("trans_fat", ["trans_fat"]),
    ("cholesterol", ["cholesterol"]),
]


def log(message: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def main() -> int:
    con = duckdb.connect()
    con.execute("SET threads=16; SET preserve_insertion_order=false;")
    con.execute(f"SET temp_directory='{OUT / '.duckdb_tmp'}';")

    log("pivoting food_nutrient (this is the 1.8 GB one)")
    pivot_exprs = ",\n      ".join(
        f"max(CASE WHEN nutrient_id = {nid} THEN amount END) AS {col}"
        for nid, col in WANTED.items()
    )
    con.execute(f"""
      CREATE TABLE nutrients AS
      SELECT fdc_id,
      {pivot_exprs}
      FROM read_csv('{FDC}/food_nutrient.csv', header=true,
                    columns={{'id':'BIGINT','fdc_id':'BIGINT','nutrient_id':'INTEGER',
                              'amount':'DOUBLE','data_points':'VARCHAR','derivation_id':'VARCHAR',
                              'min':'VARCHAR','max':'VARCHAR','median':'VARCHAR','loq':'VARCHAR',
                              'footnote':'VARCHAR','min_year_acquired':'VARCHAR',
                              'percent_daily_value':'VARCHAR'}}, ignore_errors=true)
      WHERE nutrient_id IN ({','.join(str(n) for n in WANTED)})
      GROUP BY fdc_id
    """)
    log(f"  pivoted rows: {con.execute('SELECT count(*) FROM nutrients').fetchone()[0]:,}")

    resolved = ",\n      ".join(
        (f"coalesce({', '.join('n.' + c for c in cols)})" if len(cols) > 1 else f"n.{cols[0]}")
        + f" AS {name}"
        for name, cols in NUTRIENT_COLUMNS
    )

    log("joining identity + label data")
    con.execute(f"""
      CREATE VIEW food AS SELECT * FROM read_csv('{FDC}/food.csv', header=true, all_varchar=true);
      CREATE VIEW branded AS SELECT * FROM read_csv('{FDC}/branded_food.csv', header=true, all_varchar=true);
      CREATE VIEW category AS SELECT * FROM read_csv('{FDC}/food_category.csv', header=true, all_varchar=true);
    """)

    con.execute(f"""
      CREATE TABLE usda_food AS
      SELECT
        'fdc:' || f.fdc_id                             AS source_ref,
        f.fdc_id::BIGINT                               AS fdc_id,
        f.data_type                                    AS fdc_data_type,
        trim(f.description)                            AS name,
        nullif(trim(coalesce(b.brand_name, '')), '')   AS brand,
        nullif(trim(coalesce(b.brand_owner, '')), '')  AS brand_owner,
        nullif(trim(coalesce(b.subbrand_name, '')), '') AS subbrand,
        nullif(trim(coalesce(b.gtin_upc, '')), '')     AS gtin_raw,
        coalesce(b.branded_food_category, c.description) AS category_raw,
        nullif(trim(coalesce(b.ingredients, '')), '')  AS ingredients,
        nullif(trim(coalesce(b.household_serving_fulltext, '')), '') AS serving_label,
        try_cast(b.serving_size AS DOUBLE)             AS serving_size,
        lower(nullif(trim(coalesce(b.serving_size_unit, '')), '')) AS serving_unit,
        nullif(trim(coalesce(b.market_country, '')), '') AS market_country,
        nullif(trim(coalesce(b.data_source, '')), '')  AS label_data_source,
        nullif(trim(coalesce(b.discontinued_date, '')), '') AS discontinued_date,
        coalesce(nullif(b.modified_date,''), nullif(b.available_date,''), f.publication_date) AS source_date,
        f.publication_date                             AS publication_date,
        {resolved}
      FROM food f
      LEFT JOIN branded b ON b.fdc_id = f.fdc_id
      LEFT JOIN category c ON c.id = f.food_category_id
      LEFT JOIN nutrients n ON n.fdc_id = f.fdc_id::BIGINT
    """)
    total = con.execute("SELECT count(*) FROM usda_food").fetchone()[0]
    log(f"  usda_food rows: {total:,}")

    log("extracting portions (gram weights per household measure)")
    con.execute(f"""
      CREATE TABLE usda_portion AS
      SELECT 'fdc:' || p.fdc_id AS source_ref,
             try_cast(p.amount AS DOUBLE) AS amount,
             coalesce(nullif(trim(m.name),''), nullif(trim(p.modifier),''),
                      nullif(trim(p.portion_description),'')) AS unit_label,
             try_cast(p.gram_weight AS DOUBLE) AS grams
      FROM read_csv('{FDC}/food_portion.csv', header=true, all_varchar=true) p
      LEFT JOIN read_csv('{FDC}/measure_unit.csv', header=true, all_varchar=true) m
             ON m.id = p.measure_unit_id AND m.name <> 'undetermined'
      WHERE try_cast(p.gram_weight AS DOUBLE) > 0
    """)
    log(f"  portions: {con.execute('SELECT count(*) FROM usda_portion').fetchone()[0]:,}")

    OUT.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY usda_food TO '{OUT / 'usda_food.parquet'}' (FORMAT parquet, COMPRESSION zstd)")
    con.execute(f"COPY usda_portion TO '{OUT / 'usda_portion.parquet'}' (FORMAT parquet, COMPRESSION zstd)")

    log("coverage of the columns that decide whether a row is usable:")
    for col in ("kcal", "protein", "fat", "carbs", "gtin_raw", "serving_label"):
        n = con.execute(f"SELECT count({col}) FROM usda_food").fetchone()[0]
        log(f"  {col:<16} {n:>10,}  ({n / total:6.1%})")

    log("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
