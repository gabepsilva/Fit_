#!/usr/bin/env python
"""Unify, score, deduplicate and emit the food database.

A cluster's values are taken wholesale from one winning record, never averaged
across sources: an average is a derivative of an ODbL row and would drag
share-alike obligations across the whole table.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
import time
from pathlib import Path

import duckdb

ROOT = Path(__file__).resolve().parents[1]
INTERIM = ROOT / "interim"
CLEAN = ROOT / "clean"
DB = ROOT / "db"

NUTRIENTS = [
    "kcal", "protein", "fat", "carbs", "sugar", "fiber", "sodium", "potassium",
    "iron", "calcium", "magnesium", "zinc", "vitamin_a", "vitamin_c",
    "vitamin_d", "vitamin_b12", "folate", "saturated_fat", "trans_fat",
    "cholesterol",
]

SOURCES = [
    ("fdc_branded", "FoodData Central, Branded Foods", "USDA Agricultural Research Service",
     "public-domain", 0, "https://fdc.nal.usda.gov/"),
    ("fdc_foundation", "FoodData Central, Foundation Foods", "USDA Agricultural Research Service",
     "public-domain", 0, "https://fdc.nal.usda.gov/"),
    ("fdc_sr_legacy", "FoodData Central, SR Legacy", "USDA Agricultural Research Service",
     "public-domain", 0, "https://fdc.nal.usda.gov/"),
    ("fdc_survey", "FoodData Central, FNDDS Survey Foods", "USDA Agricultural Research Service",
     "public-domain", 0, "https://fdc.nal.usda.gov/"),
    ("fdc_other", "FoodData Central, other data types", "USDA Agricultural Research Service",
     "public-domain", 0, "https://fdc.nal.usda.gov/"),
    ("cnf", "Canadian Nutrient File 2026", "Health Canada",
     "OGL-Canada-2.0", 0, "https://open.canada.ca/data/en/dataset/1b6139bd-ed7e-4043-bc28-ff00e10f3109"),
    ("off", "Open Food Facts product export", "Open Food Facts contributors",
     "ODbL-1.0", 1, "https://world.openfoodfacts.org/data"),
]

# Trust ranking: lab reference data > manufacturer label > crowd input.
SOURCE_RANK = {
    "fdc_foundation": 100, "cnf": 95, "fdc_sr_legacy": 90, "fdc_survey": 85,
    "fdc_branded": 70, "fdc_other": 60, "off": 40,
}


def log(message: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def normalise_sql(col: str) -> str:
    """Lowercase, strip punctuation, collapse whitespace. Used for fingerprints."""
    return (
        f"nullif(trim(regexp_replace(regexp_replace(lower(coalesce({col}, '')), "
        f"'[^a-z0-9 ]', ' ', 'g'), '\\s+', ' ', 'g')), '')"
    )


def unify(con: duckdb.DuckDBPyConnection) -> None:
    """Stack the three sources into one shape without resolving anything."""
    log("unifying sources into source_food")

    con.execute(f"""
      CREATE TABLE source_food AS

      -- USDA. data_type decides both the source id and whether it is branded.
      SELECT
        source_ref,
        CASE fdc_data_type
          WHEN 'branded_food' THEN 'fdc_branded'
          WHEN 'foundation_food' THEN 'fdc_foundation'
          WHEN 'sr_legacy_food' THEN 'fdc_sr_legacy'
          WHEN 'survey_fndds_food' THEN 'fdc_survey'
          ELSE 'fdc_other' END                              AS source_id,
        name, brand, brand_owner,
        CASE WHEN length(regexp_replace(coalesce(gtin_raw,''), '[^0-9]', '', 'g'))
                  BETWEEN 8 AND 14
             THEN nullif(lpad(regexp_replace(coalesce(gtin_raw,''), '[^0-9]', '', 'g'),
                              14, '0'), '00000000000000')
             END                                            AS gtin14,
        category_raw, ingredients, serving_label,
        -- FDC records the serving in whatever unit the label used; only mass
        -- units can be trusted as grams without a density we do not have.
        CASE WHEN serving_unit IN ('g','gram','grams') THEN serving_size
             END                                            AS serving_g,
        CASE WHEN market_country IS NULL OR trim(market_country) = '' THEN 'US'
             WHEN market_country IN ('United States','US') THEN 'US'
             ELSE 'other' END                               AS region,
        source_date,
        CASE WHEN discontinued_date IS NOT NULL THEN 1 ELSE 0 END AS discontinued,
        NULL::DOUBLE AS completeness, NULL::BIGINT AS scans, NULL::VARCHAR AS off_error_tags,
        {', '.join(NUTRIENTS)}
      FROM '{INTERIM}/usda_food.parquet'

      UNION ALL BY NAME

      SELECT
        source_ref, 'cnf' AS source_id, name,
        NULL AS brand, NULL AS brand_owner, NULL AS gtin14,
        category_raw, NULL AS ingredients, NULL AS serving_label,
        NULL::DOUBLE AS serving_g, 'CA' AS region, source_date,
        0 AS discontinued,
        NULL::DOUBLE AS completeness, NULL::BIGINT AS scans, NULL::VARCHAR AS off_error_tags,
        {', '.join(NUTRIENTS)}
      FROM '{INTERIM}/cnf_food.parquet'

      UNION ALL BY NAME

      SELECT
        source_ref, 'off' AS source_id,
        coalesce(name, generic_name)                        AS name,
        brand, brand_owner,
        CASE WHEN length(regexp_replace(coalesce(code,''), '[^0-9]', '', 'g'))
                  BETWEEN 8 AND 14
             THEN nullif(lpad(regexp_replace(coalesce(code,''), '[^0-9]', '', 'g'),
                              14, '0'), '00000000000000')
             END                                            AS gtin14,
        category_raw, ingredients, serving_label,
        serving_size AS serving_g, region, source_date,
        0 AS discontinued,
        completeness, scans, off_error_tags,
        {', '.join(NUTRIENTS)}
      FROM '{INTERIM}/off_food.parquet'
    """)
    log(f"  source_food rows: {con.execute('SELECT count(*) FROM source_food').fetchone()[0]:,}")


def score(con: duckdb.DuckDBPyConnection) -> None:
    """Attach a 0-100 usability score and a human-readable flag list."""
    log("scoring rows")
    con.execute(f"""
      CREATE TABLE scored AS
      WITH base AS (
        SELECT *,
          -- Atwater: protein and carbohydrate yield ~4 kcal/g, fat ~9. A label
          -- whose calories cannot be reconstructed from its own macros has a
          -- typo, a unit error, or per-serving values in a per-100g field.
          4 * coalesce(protein,0) + 4 * coalesce(carbs,0) + 9 * coalesce(fat,0) AS atwater,
          coalesce(protein,0) + coalesce(fat,0) + coalesce(carbs,0)             AS macro_sum,
          {normalise_sql('name')}                                              AS name_norm,
          {normalise_sql('brand')}                                             AS brand_norm
        FROM source_food
      ), checks AS (
        SELECT *,
          (name_norm IS NOT NULL AND length(name_norm) >= 2)                   AS ok_name,
          (kcal IS NOT NULL AND protein IS NOT NULL
           AND fat IS NOT NULL AND carbs IS NOT NULL)                          AS ok_core,
          -- 100 g of food cannot contain more than 100 g of macronutrients, and
          -- pure fat is 900 kcal/100 g. Anything past that is an error.
          (macro_sum <= 100.5 AND kcal IS NOT NULL AND kcal <= 902
           AND coalesce(protein,0) >= 0 AND coalesce(fat,0) >= 0
           AND coalesce(carbs,0) >= 0)                                         AS ok_range,
          -- The tolerance is wide on purpose: fibre, polyols and alcohol all
          -- legitimately break a strict 4/4/9 reconstruction.
          (kcal IS NOT NULL AND (atwater > 0 OR macro_sum = 0)
           AND abs(kcal - atwater) <= greatest(0.25 * atwater, 25))             AS ok_atwater,
          (serving_g IS NOT NULL AND serving_g BETWEEN 1 AND 2000)             AS ok_serving,
          (off_error_tags IS NULL OR off_error_tags = '')                      AS ok_no_source_error
        FROM base
      )
      SELECT * EXCLUDE (atwater, macro_sum, ingredients),
        atwater AS atwater_kcal,
        least(100,
            30 * ok_core::INT
          + 20 * ok_atwater::INT
          + 10 * ok_range::INT
          +  8 * ok_name::INT
          +  7 * ok_serving::INT
          +  5 * ok_no_source_error::INT
          + (CASE source_id
               {' '.join(f"WHEN '{s}' THEN {r // 5}" for s, r in SOURCE_RANK.items())}
               ELSE 0 END)
        )                                                                      AS quality,
        trim(concat_ws(',',
          CASE WHEN NOT ok_name    THEN 'no-name' END,
          CASE WHEN NOT ok_core    THEN 'incomplete-macros' END,
          CASE WHEN NOT ok_range   THEN 'implausible-range' END,
          CASE WHEN NOT ok_atwater THEN 'atwater-mismatch' END,
          CASE WHEN NOT ok_serving THEN 'no-serving-grams' END,
          CASE WHEN NOT ok_no_source_error THEN 'source-flagged' END,
          CASE WHEN discontinued = 1 THEN 'discontinued' END
        ))                                                                     AS flags
      FROM checks
    """)

    total = con.execute("SELECT count(*) FROM scored").fetchone()[0]
    log(f"  scored {total:,} rows; flag frequency:")
    for flag in ("no-name", "incomplete-macros", "implausible-range",
                 "atwater-mismatch", "no-serving-grams", "discontinued"):
        n = con.execute(f"SELECT count(*) FROM scored WHERE flags LIKE '%{flag}%'").fetchone()[0]
        log(f"    {flag:<20} {n:>10,}  ({n / total:6.1%})")


def cluster(con: duckdb.DuckDBPyConnection) -> None:
    """Group records that describe the same food, then elect one to carry the numbers."""
    log("clustering")
    con.execute("""
      CREATE VIEW keyed AS
      SELECT *,
        CASE
          -- A real GTIN is 8, 12, 13 or 14 significant digits. Anything shorter
          -- is a store's internal code and collides across retailers.
          WHEN gtin14 IS NOT NULL THEN 'gtin:' || gtin14
          WHEN name_norm IS NOT NULL
            THEN 'name:' || coalesce(brand_norm, '~') || '|' || name_norm
        END AS cluster_key
      FROM scored
    """)

    dropped = con.execute("SELECT count(*) FROM keyed WHERE cluster_key IS NULL").fetchone()[0]
    log(f"  unclusterable (no barcode and no name): {dropped:,}")

    # Rank over only the columns the ORDER BY reads: sorting 6.6M wide rows
    # spills gigabytes to disk and dominates the build.
    con.execute("""
      CREATE TABLE winner AS
      SELECT cluster_key, source_ref FROM (
        SELECT cluster_key, source_ref, row_number() OVER (
          PARTITION BY cluster_key
          ORDER BY quality DESC,
                   CASE source_id
                     WHEN 'fdc_foundation' THEN 7 WHEN 'cnf' THEN 6
                     WHEN 'fdc_sr_legacy' THEN 5 WHEN 'fdc_survey' THEN 4
                     WHEN 'fdc_branded' THEN 3 WHEN 'fdc_other' THEN 2 ELSE 1 END DESC,
                   discontinued ASC,
                   source_date DESC NULLS LAST,
                   coalesce(scans, 0) DESC,
                   source_ref
        ) AS rank
        FROM keyed WHERE cluster_key IS NOT NULL
      ) WHERE rank = 1
    """)
    con.execute("""
      CREATE TABLE elected AS
      SELECT k.* FROM keyed k JOIN winner w USING (cluster_key, source_ref)
    """)

    con.execute("""
      CREATE TABLE agreement AS
      SELECT cluster_key,
             count(*)                                    AS n_sources,
             count(DISTINCT source_id)                   AS n_distinct_sources,
             round(max(kcal) - min(kcal), 1)             AS kcal_spread,
             bool_or(source_id = 'off')                  AS has_odbl,
             bool_or(source_id <> 'off')                 AS has_open
      FROM keyed WHERE cluster_key IS NOT NULL
      GROUP BY cluster_key
    """)

    n_clusters = con.execute("SELECT count(*) FROM elected").fetchone()[0]
    log(f"  clusters: {n_clusters:,}")


def resolve(con: duckdb.DuckDBPyConnection, min_quality: int) -> None:
    """Emit the app-facing food table, plus aliases and servings."""
    log(f"resolving (keeping quality >= {min_quality} and complete macros)")
    con.execute(f"""
      CREATE TABLE food AS
      SELECT
        row_number() OVER (ORDER BY e.quality DESC, e.cluster_key) AS food_id,
        e.cluster_key,
        CASE WHEN e.cluster_key LIKE 'gtin:%' THEN e.gtin14 END    AS gtin14,
        e.name, e.brand, e.brand_owner, e.category_raw AS category,
        CASE WHEN e.cluster_key LIKE 'gtin:%' THEN 'branded' ELSE 'generic' END AS kind,
        e.region,
        e.source_ref                                               AS value_ref,
        e.source_id                                                AS value_source,
        CASE e.source_id WHEN 'off' THEN 'ODbL-1.0'
                         WHEN 'cnf' THEN 'OGL-Canada-2.0'
                         ELSE 'public-domain' END                  AS license,
        e.serving_label, e.serving_g,
        {', '.join(f'e.{n}' for n in NUTRIENTS)},
        e.atwater_kcal, e.quality, e.flags, sf.ingredients,
        a.n_sources, a.n_distinct_sources, a.kcal_spread
      FROM elected e
      JOIN agreement a USING (cluster_key)
      LEFT JOIN source_food sf ON sf.source_ref = e.source_ref
      WHERE e.quality >= {min_quality}
        AND e.ok_core AND e.ok_range AND e.ok_name
    """)
    kept = con.execute("SELECT count(*) FROM food").fetchone()[0]
    log(f"  food rows: {kept:,}")

    log("building aliases from cluster members")
    con.execute("""
      CREATE TABLE food_alias AS
      SELECT DISTINCT f.food_id, k.name AS alias
      FROM keyed k
      JOIN food f USING (cluster_key)
      WHERE k.name IS NOT NULL AND lower(k.name) <> lower(f.name)
    """)
    log(f"  aliases: {con.execute('SELECT count(*) FROM food_alias').fetchone()[0]:,}")

    log("building servings")
    con.execute(f"""
      CREATE TABLE food_serving AS
      -- The label serving, when the source gave one in grams.
      SELECT food_id, coalesce(serving_label, serving_g || ' g') AS label,
             serving_g AS grams, 1 AS is_default
      FROM food WHERE serving_g IS NOT NULL
      UNION ALL
      -- Household measures from the reference sources (cups, slices, pieces).
      SELECT f.food_id,
             trim(coalesce(p.amount || ' ', '') || p.unit_label) AS label,
             p.grams, 0 AS is_default
      FROM (SELECT * FROM '{INTERIM}/usda_portion.parquet'
            UNION ALL BY NAME
            SELECT source_ref, NULL::DOUBLE AS amount, unit_label, grams
            FROM '{INTERIM}/cnf_portion.parquet') p
      JOIN food f ON f.value_ref = p.source_ref
      WHERE p.unit_label IS NOT NULL
      UNION ALL
      -- Everything can be logged by weight, so guarantee a 100 g row exists.
      SELECT food_id, '100 g', 100, 0 FROM food
    """)
    log(f"  servings: {con.execute('SELECT count(*) FROM food_serving').fetchone()[0]:,}")


def report(con: duckdb.DuckDBPyConnection) -> None:
    log("=" * 64)
    for title, sql in [
        ("by kind", "SELECT kind, count(*) FROM food GROUP BY 1 ORDER BY 2 DESC"),
        ("by region", "SELECT region, count(*) FROM food GROUP BY 1 ORDER BY 2 DESC"),
        ("by license", "SELECT license, count(*) FROM food GROUP BY 1 ORDER BY 2 DESC"),
        ("by source", "SELECT value_source, count(*) FROM food GROUP BY 1 ORDER BY 2 DESC"),
        ("multi-source clusters",
         "SELECT n_distinct_sources, count(*) FROM food GROUP BY 1 ORDER BY 1"),
    ]:
        log(f"{title}:")
        for row in con.execute(sql).fetchall():
            log(f"    {str(row[0]):<28} {row[1]:>10,}")
    log("=" * 64)


def export_sqlite(con: duckdb.DuckDBPyConnection, path: Path, where: str, label: str) -> None:
    """Write one SQLite artifact, then add the indexes and full-text index."""
    log(f"exporting {label} -> {path.name}  (filter: {where})")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.unlink(missing_ok=True)

    con.execute(f"ATTACH '{path}' AS out (TYPE sqlite)")
    con.execute(f"CREATE TABLE out.food AS SELECT * FROM food WHERE {where}")
    con.execute("CREATE TABLE out.food_alias AS SELECT a.* FROM food_alias a "
                "JOIN out.food f USING (food_id)")
    con.execute("CREATE TABLE out.food_serving AS SELECT s.* FROM food_serving s "
                "JOIN out.food f USING (food_id)")
    con.execute("""CREATE TABLE out.source AS SELECT * FROM source_registry""")
    con.execute("DETACH out")

    db = sqlite3.connect(path)
    # Rebuilt from scratch on every run, so durability is worth nothing here;
    # these turn a fsync-bound FTS load into a memory-bound one.
    db.executescript("""
      PRAGMA synchronous=OFF;
      PRAGMA journal_mode=MEMORY;
      PRAGMA temp_store=MEMORY;
      PRAGMA cache_size=-1000000;
    """)
    db.executescript("""
      CREATE UNIQUE INDEX idx_food_id ON food(food_id);
      CREATE INDEX idx_food_gtin      ON food(gtin14);
      CREATE INDEX idx_food_quality   ON food(quality DESC);
      CREATE INDEX idx_food_kind      ON food(kind, region);
      CREATE INDEX idx_alias_food     ON food_alias(food_id);
      CREATE INDEX idx_serving_food   ON food_serving(food_id);

      CREATE VIRTUAL TABLE food_fts USING fts5(
        name, brand, aliases, content='', tokenize='unicode61 remove_diacritics 2');
    """)
    db.execute("""
      INSERT INTO food_fts(rowid, name, brand, aliases)
      SELECT f.food_id, f.name, coalesce(f.brand, ''),
             coalesce((SELECT group_concat(a.alias, ' ') FROM food_alias a
                       WHERE a.food_id = f.food_id), '')
      FROM food f
    """)
    db.commit()
    db.execute("PRAGMA journal_mode=DELETE")
    db.execute("VACUUM")
    db.commit()
    n = db.execute("SELECT count(*) FROM food").fetchone()[0]
    db.close()
    log(f"  {label}: {n:,} foods, {path.stat().st_size / 1e6:,.1f} MB")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--min-quality", type=int, default=55)
    args = parser.parse_args()

    con = duckdb.connect()
    con.execute("SET threads=16; SET preserve_insertion_order=false;")
    # Spill to disk rather than compete with whatever else is on the machine.
    con.execute("SET memory_limit='8GB'; SET max_temp_directory_size='80GB';")
    con.execute(f"SET temp_directory='{INTERIM / '.duckdb_tmp'}';")

    con.execute("""CREATE TABLE source_registry(
        source_id VARCHAR, title VARCHAR, publisher VARCHAR,
        license VARCHAR, share_alike INTEGER, url VARCHAR)""")
    con.executemany("INSERT INTO source_registry VALUES (?,?,?,?,?,?)", SOURCES)

    unify(con)
    score(con)
    cluster(con)
    resolve(con, args.min_quality)
    report(con)

    CLEAN.mkdir(parents=True, exist_ok=True)
    con.execute(f"COPY food TO '{CLEAN / 'food.parquet'}' (FORMAT parquet, COMPRESSION zstd)")
    con.execute(f"COPY food_alias TO '{CLEAN / 'food_alias.parquet'}' (FORMAT parquet, COMPRESSION zstd)")
    con.execute(f"COPY food_serving TO '{CLEAN / 'food_serving.parquet'}' (FORMAT parquet, COMPRESSION zstd)")
    con.execute(f"COPY keyed TO '{CLEAN / 'source_food.parquet'}' (FORMAT parquet, COMPRESSION zstd)")

    # Two artifacts: full is the server's; core is public-domain only so the
    # Android bundle carries no share-alike obligations.
    export_sqlite(con, DB / "fit-food-full.sqlite", "TRUE", "full")
    export_sqlite(
        con, DB / "fit-food-core.sqlite",
        "license = 'public-domain' AND region <> 'other' AND quality >= 75",
        "core (public domain, North America)",
    )
    log("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
