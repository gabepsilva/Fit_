#!/usr/bin/env python
"""Finish a build_db.py run from the clean parquet outputs.

The expensive stages of build_db.py (unify, score, cluster, resolve) write
their results to clean/food.parquet, clean/food_alias.parquet and
clean/food_serving.parquet before ever touching a .sqlite file. Everything
after that -- writing the two SQLite artifacts, their indexes and the FTS5
index -- is cheap and derived purely from those parquet files. This script
re-runs only that export step, so a build does not need to be redone from
raw/interim sources just because the export half failed or needs redoing
(see build_db.py's export_sqlite() and its "database is locked" fix).

Reproducible and idempotent: each run reads the same parquet inputs and
overwrites its own output files from scratch (export_sqlite() unlinks each
target before writing it), so running it twice in a row is safe.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_db import SOURCES, export_sqlite, log  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CLEAN = ROOT / "clean"
DB = ROOT / "db"

REQUIRED = ("food.parquet", "food_alias.parquet", "food_serving.parquet")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--clean-dir", type=Path, default=CLEAN,
                         help="directory holding food/food_alias/food_serving parquet")
    parser.add_argument("--out-dir", type=Path, default=DB,
                         help="directory to write the .sqlite artifacts into")
    args = parser.parse_args()

    missing = [f for f in REQUIRED if not (args.clean_dir / f).exists()]
    if missing:
        log(f"missing parquet inputs in {args.clean_dir}: {', '.join(missing)}")
        log("run the full pipeline (fetch.py, etl_*.py, build_db.py) first")
        return 1

    con = duckdb.connect()
    con.execute("SET threads=16;")
    con.execute(f"CREATE TABLE food AS SELECT * FROM '{args.clean_dir / 'food.parquet'}'")
    con.execute(f"CREATE TABLE food_alias AS SELECT * FROM '{args.clean_dir / 'food_alias.parquet'}'")
    con.execute(f"CREATE TABLE food_serving AS SELECT * FROM '{args.clean_dir / 'food_serving.parquet'}'")
    con.execute("""CREATE TABLE source_registry(
        source_id VARCHAR, title VARCHAR, publisher VARCHAR,
        license VARCHAR, share_alike INTEGER, url VARCHAR)""")
    con.executemany("INSERT INTO source_registry VALUES (?,?,?,?,?,?)", SOURCES)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    export_sqlite(con, args.out_dir / "fit-food-full.sqlite", "TRUE", "full")
    export_sqlite(
        con, args.out_dir / "fit-food-core.sqlite",
        "license = 'public-domain' AND region <> 'other' AND quality >= 75",
        "core (public domain, North America)",
    )
    log("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
