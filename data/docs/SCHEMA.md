# The food database

A US/Canada food and calorie database assembled from three openly licensed
public sources. This document is the design: what the data actually turned out
to be, the schema that fits it, and the reasoning behind the parts that are not
obvious.

## What the sources actually contain

Everything here was measured from the real downloads, not taken from
documentation.

| Source                            | License        | Published records | Real foods | Notes |
| --------------------------------- | -------------- | ----------------: | ---------: | ----- |
| USDA FoodData Central, Branded     | Public domain  |         1,999,950 |    442,175 | ~4.3 records per barcode |
| USDA SR Legacy                     | Public domain  |             7,793 |      7,022 | Lab-analysed reference foods |
| USDA FNDDS (Survey)                | Public domain  |             5,432 |      5,279 | Prepared and mixed dishes |
| USDA Foundation                    | Public domain  |               469 |        318 | Highest-quality lab analysis |
| Health Canada, Canadian Nutrient File 2026 | OGL-Canada | 5,993 |      5,971 | 100% macro coverage |
| Open Food Facts                    | ODbL-1.0       |         4,535,553 |  2,103,130 | Crowd-sourced, 1.32M North American |

**6,642,825 published records collapse to 2,549,664 distinct foods.**

Three findings shaped the design more than anything else.

**USDA's two million branded foods are about 442,000 real products.** FDC keeps a
new record every time a label changes, so the median barcode carries four or five
rows. Anyone quoting "2 million foods" from FDC is counting label revisions.

**The barcode length is a real duplicate source.** UPC-12, EAN-13 and GTIN-14 are
the same number with different amounts of leading zero. Padding everything to 14
digits merged 23,000 barcodes inside USDA alone, before any cross-source work.

**Open Food Facts's problem is completeness, not coverage.** It has 1,320,584
North American products but only 325,196 of them — 24.6% — carry calories. Its
overlap with USDA is only 42,375 barcodes, so the two sources are far more
complementary than redundant.

## The schema

Three layers. The middle one is where the value is.

```
                 ┌─────────────────────────────────────────┐
  6.6M records   │  source_food   verbatim, never merged    │
                 │  one row per published record            │
                 └────────────────────┬────────────────────┘
                                      │  cluster on GTIN-14,
                                      │  else brand+name fingerprint
                 ┌────────────────────▼────────────────────┐
  4.6M clusters  │  clustering    which records are the     │
                 │  same real-world food                    │
                 └────────────────────┬────────────────────┘
                                      │  elect one value-bearer
                 ┌────────────────────▼────────────────────┐
  2.5M foods     │  food + food_alias + food_serving + FTS  │
                 │  what the application queries            │
                 └─────────────────────────────────────────┘
```

### `source_food` — the faithful copy

One row per published record, normalised in shape but not in content. Nothing is
corrected, merged or dropped here. This is what makes every downstream decision
re-derivable without re-downloading 1.8 GB, and it is what lets a scoring rule
change without a full refetch.

### `food` — one row per real-world food

The resolved table the app reads. Every nutrient is **per 100 g or 100 ml**,
because that is the only unit all three sources agree on and the only one that
survives a serving-size change. Servings live in their own table.

| Column | Meaning |
| ------ | ------- |
| `food_id` | Surrogate key |
| `gtin14` | Barcode, zero-padded to 14 digits. `NULL` for generic foods |
| `name`, `brand`, `brand_owner`, `category` | Identity |
| `kind` | `branded` or `generic` |
| `region` | `US`, `CA`, `US/CA?` (inferred from GS1 prefix), `other` |
| `value_ref` | **The single source record the numbers came from** |
| `value_source`, `license` | Which source, under which terms |
| `kcal` … `cholesterol` | 20 nutrients, per 100 g |
| `atwater_kcal` | Calories reconstructed from the macros |
| `quality` | 0–100 usability score |
| `flags` | Why a row scored badly, in words |
| `n_sources`, `n_distinct_sources` | How many records agreed this is one food |
| `kcal_spread` | How far those records disagreed on calories |

### `food_alias` — the duplicates, repurposed

Every distinct name across a cluster becomes a search alias. A product that USDA
calls `CLIF BAR, CHOCOLATE CHIP` and Open Food Facts calls `Clif Bar Chocolate
Chip Energy Bar` is one food that answers to both. **The duplication problem
becomes the search recall.**

### `food_serving` — how people actually measure food

Label servings, USDA and CNF household measures (cups, slices, pieces), and a
guaranteed `100 g` row so anything can be logged by weight.

### `food_fts` — SQLite FTS5 over name, brand and aliases

The application is a Capacitor WebView on Android with no backend. A SQLite file
with an FTS5 index is exactly the right shape: search runs on-device, offline,
with no server round trip.

## The decisions that matter

### Never average nutrients across sources

A cluster can hold a USDA record and an Open Food Facts record for the same
barcode. It is tempting to merge them — take protein from whichever has it, fill
sodium from the other. **The pipeline refuses to do this**, for two reasons.

The legal one: Open Food Facts is ODbL, which is share-alike. A row built partly
from ODbL data is a derivative of an ODbL database, and that obligation spreads
to whatever table it sits in. Keeping the value-bearing record whole means
`food.license` is exact, and `WHERE license = 'public-domain'` returns a slice
that carries no share-alike obligation at all.

The correctness one: an averaged row describes a product that never existed. Its
macros no longer reconcile against its own calories, which destroys the one
independent check available.

So each cluster elects a single record by quality, then source trust, then
recency — and `value_ref` names it. The other members still contribute their
names as aliases and their calorie values to `kcal_spread`.

This is not a new constraint. `src/lib/domain/food-catalog.ts` already says each
row "carries a single provenance so USDA (public domain) and Open Food Facts
(ODbL) never mix inside one entry". The pipeline enforces at 2.5M rows what the
seed catalog does by hand at 200.

### Atwater reconciliation as the quality check

Protein and carbohydrate yield about 4 kcal per gram, fat about 9. Recomputing
calories from a row's own macros and comparing catches typos, unit errors, and
per-serving values entered into a per-100g field — the dominant failure mode in
crowd-sourced data. The tolerance is deliberately loose (25% or 25 kcal,
whichever is larger) because fibre, polyols and alcohol all legitimately break a
strict 4/4/9 reconstruction.

Together with a range check — 100 g of food cannot contain more than 100 g of
macronutrients, and pure fat is 900 kcal per 100 g — this is what separates
2.5 million usable rows from 6.6 million published ones.

### Region from two independent signals

Contributor-set country tags are often missing. GS1 prefixes are not: 000–139 is
assigned to the US and Canada, and a barcode does not lie about its own prefix.
Rows matched only by prefix are marked `US/CA?` rather than silently promoted, so
the inference stays visible and reversible.

### Two artifacts, because they answer different questions

`fit-food-full.sqlite` is the server's copy: everything, all licenses, for search
and barcode lookup. `fit-food-core.sqlite` is public-domain-only, North America,
high quality — small enough to ship inside the Android bundle and free of any
attribution or share-alike obligation.

## Attribution

Required whenever this data is redistributed:

- **USDA FoodData Central** — public domain (CC0 1.0). Citation requested, not
  required: *U.S. Department of Agriculture, Agricultural Research Service.
  FoodData Central. fdc.nal.usda.gov.*
- **Canadian Nutrient File** — Open Government Licence – Canada. Attribution
  required; no endorsement implied.
- **Open Food Facts** — ODbL 1.0. Attribution **and share-alike required**. Any
  derived database that includes these rows must be offered under ODbL. This is
  why the core artifact excludes them.

## Rebuilding

```bash
data/.venv/bin/python data/scripts/fetch.py data/scripts/sources.json
data/.venv/bin/python data/scripts/etl_usda.py
data/.venv/bin/python data/scripts/etl_off.py
data/.venv/bin/python data/scripts/etl_cnf.py
data/.venv/bin/python data/scripts/build_db.py
```

Every download is recorded in `data/raw/MANIFEST.json` with its size, SHA-256 and
fetch time, so any build can be traced to the exact bytes it came from.

If only the SQLite export needs redoing — `clean/food*.parquet` are already
current but `db/*.sqlite` is missing, partial or stale — re-run just that
step instead of the whole pipeline:

```bash
data/.venv/bin/python data/scripts/export_sqlite.py
```

This reads `clean/food.parquet`, `clean/food_alias.parquet` and
`clean/food_serving.parquet` and rewrites both `.sqlite` artifacts from
scratch; it shares its export logic with `build_db.py` and is safe to run
repeatedly.
