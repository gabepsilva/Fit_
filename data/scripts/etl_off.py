#!/usr/bin/env python
"""Flatten the Open Food Facts export into one row per product.

OFF is crowd-sourced, so unlike USDA it is wide, sparse and frequently wrong.
This stage does not try to fix it — it normalises the shape, records the signals
that later let us judge a row (scan count, completeness, OFF's own data-quality
error tags), and keeps everything. Judgement happens in the scoring stage where
it can be tuned without re-reading 1.3 GB.

Scope: every row is kept, but `region` marks whether the product is sold in the
US or Canada. Two independent signals feed it — the `countries_tags` the
contributors set, and the GS1 prefix of the barcode itself, since GS1 assigns
000–139 to the US and Canada. Barcodes do not lie about their prefix; country
tags are often just missing.
"""

from __future__ import annotations

import sys
import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "raw" / "openfoodfacts" / "en.openfoodfacts.org.products.csv.gz"
OUT = ROOT / "interim"

READER = f"""read_csv('{SRC}', delim='\t', header=true, quote='', escape='',
                      all_varchar=true, ignore_errors=true, sample_size=-1, parallel=true)"""


def log(message: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def main() -> int:
    con = duckdb.connect()
    con.execute("SET threads=16; SET preserve_insertion_order=false;")
    con.execute(f"SET temp_directory='{OUT / '.duckdb_tmp'}';")

    log("reading and flattening Open Food Facts")
    con.execute(f"""
      CREATE TABLE off_food AS
      WITH src AS (SELECT * FROM {READER}),
      shaped AS (
        SELECT
          'off:' || code                                   AS source_ref,
          nullif(trim(code), '')                           AS code,
          nullif(trim(product_name), '')                   AS name,
          nullif(trim(generic_name), '')                   AS generic_name,
          nullif(trim(brands), '')                         AS brand,
          nullif(trim(brand_owner), '')                    AS brand_owner,
          nullif(trim(categories_en), '')                  AS category_raw,
          nullif(trim(main_category_en), '')               AS main_category,
          nullif(trim(countries_tags), '')                 AS countries_tags,
          nullif(trim(ingredients_text), '')               AS ingredients,
          nullif(trim(serving_size), '')                   AS serving_label,
          try_cast(serving_quantity AS DOUBLE)             AS serving_size,
          nullif(trim(quantity), '')                       AS package_quantity,
          try_cast(product_quantity AS DOUBLE)             AS package_grams,
          try_cast(completeness AS DOUBLE)                 AS completeness,
          try_cast(unique_scans_n AS BIGINT)               AS scans,
          nullif(trim(data_quality_errors_tags), '')       AS off_error_tags,
          nullif(trim(nutriscore_grade), '')               AS nutriscore,
          try_cast(nova_group AS INTEGER)                  AS nova_group,
          nullif(trim(last_modified_datetime), '')         AS source_date,
          try_cast("energy-kcal_100g" AS DOUBLE)           AS kcal_direct,
          try_cast("energy-kj_100g" AS DOUBLE)             AS kj,
          try_cast(proteins_100g AS DOUBLE)                AS protein,
          try_cast(fat_100g AS DOUBLE)                     AS fat,
          try_cast(carbohydrates_100g AS DOUBLE)           AS carbs,
          try_cast(sugars_100g AS DOUBLE)                  AS sugar,
          try_cast(fiber_100g AS DOUBLE)                   AS fiber,
          try_cast(sodium_100g AS DOUBLE)                  AS sodium_g,
          try_cast(salt_100g AS DOUBLE)                    AS salt_g,
          try_cast(potassium_100g AS DOUBLE)               AS potassium_g,
          try_cast(iron_100g AS DOUBLE)                    AS iron_g,
          try_cast(calcium_100g AS DOUBLE)                 AS calcium_g,
          try_cast(magnesium_100g AS DOUBLE)               AS magnesium_g,
          try_cast(zinc_100g AS DOUBLE)                    AS zinc_g,
          try_cast("vitamin-a_100g" AS DOUBLE)             AS vitamin_a_g,
          try_cast("vitamin-c_100g" AS DOUBLE)             AS vitamin_c_g,
          try_cast("vitamin-d_100g" AS DOUBLE)             AS vitamin_d_g,
          try_cast("vitamin-b12_100g" AS DOUBLE)           AS vitamin_b12_g,
          try_cast(folates_100g AS DOUBLE)                 AS folate_g,
          try_cast("saturated-fat_100g" AS DOUBLE)         AS saturated_fat,
          try_cast("trans-fat_100g" AS DOUBLE)             AS trans_fat,
          try_cast(cholesterol_100g AS DOUBLE)             AS cholesterol_g
        FROM src
        WHERE nullif(trim(code), '') IS NOT NULL
      )
      SELECT
        s.* EXCLUDE (kcal_direct, kj, sodium_g, salt_g, potassium_g, iron_g,
                     calcium_g, magnesium_g, zinc_g, vitamin_a_g, vitamin_c_g,
                     vitamin_d_g, vitamin_b12_g, folate_g, cholesterol_g),
        -- OFF stores kcal directly when the contributor entered it, otherwise
        -- only kJ made it in; 4.184 kJ per kcal recovers the rest.
        coalesce(kcal_direct, kj / 4.184)                  AS kcal,
        -- Minerals and vitamins are grams in OFF and milligrams (or micrograms)
        -- everywhere a human reads them. Convert once, here.
        coalesce(sodium_g, salt_g / 2.5) * 1000            AS sodium,
        potassium_g * 1000                                 AS potassium,
        iron_g * 1000                                      AS iron,
        calcium_g * 1000                                   AS calcium,
        magnesium_g * 1000                                 AS magnesium,
        zinc_g * 1000                                      AS zinc,
        vitamin_a_g * 1000000                              AS vitamin_a,
        vitamin_c_g * 1000                                 AS vitamin_c,
        vitamin_d_g * 1000000                              AS vitamin_d,
        vitamin_b12_g * 1000000                            AS vitamin_b12,
        folate_g * 1000000                                 AS folate,
        cholesterol_g * 1000                               AS cholesterol,
        CASE
          WHEN countries_tags LIKE '%united-states%' THEN 'US'
          WHEN countries_tags LIKE '%canada%' THEN 'CA'
          -- GS1 assigns prefixes 000-139 to the US and Canada, so a 12- or
          -- 13-digit code starting there is North American even when nobody
          -- tagged a country.
          WHEN regexp_matches(code, '^[0-9]{{12,13}}$')
               AND try_cast(substr(lpad(code, 13, '0'), 1, 3) AS INTEGER) <= 139
               THEN 'US/CA?'
          ELSE 'other'
        END                                                AS region
      FROM shaped s
    """)

    total = con.execute("SELECT count(*) FROM off_food").fetchone()[0]
    log(f"  off_food rows: {total:,}")

    log("region breakdown:")
    for region, n in con.execute(
        "SELECT region, count(*) FROM off_food GROUP BY 1 ORDER BY 2 DESC"
    ).fetchall():
        log(f"  {region:<10} {n:>10,}  ({n / total:6.1%})")

    log("usability of the North American slice:")
    for label, where in [
        ("in scope (US/CA/maybe)", "region <> 'other'"),
        ("  ...with a name", "region <> 'other' AND name IS NOT NULL"),
        ("  ...with kcal", "region <> 'other' AND kcal IS NOT NULL"),
        ("  ...with kcal+macros", "region <> 'other' AND kcal IS NOT NULL AND protein IS NOT NULL AND fat IS NOT NULL AND carbs IS NOT NULL"),
        ("  ...name+kcal+macros", "region <> 'other' AND name IS NOT NULL AND kcal IS NOT NULL AND protein IS NOT NULL AND fat IS NOT NULL AND carbs IS NOT NULL"),
    ]:
        n = con.execute(f"SELECT count(*) FROM off_food WHERE {where}").fetchone()[0]
        log(f"  {label:<26} {n:>10,}")

    con.execute(f"COPY off_food TO '{OUT / 'off_food.parquet'}' (FORMAT parquet, COMPRESSION zstd)")
    log("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
