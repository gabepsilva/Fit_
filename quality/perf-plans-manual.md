# Hand-recorded SQLite query plans

These are hand-recorded plans for the two function-built statements (`searchSql`/`servingsSql`) that `sql-plans.ts` cannot extract; `perf-plans.md` is generator-owned.

## Hand-added: the two statements above, evaluated

`sql-statements.ts` deliberately does not follow a call built from a function
(`searchSql(columns)`, `servingsSql(ids.length)`) — see its own doc comment.
These are the two most perf-sensitive statements in the catalog (#130), so
their plans are added here by hand instead of left unrecorded. Run against the
live catalog with `FOOD_COLUMNS` from `foods.ts` and `servingsSql(20)`, the
default page size. Because `formatPlans` does not generate this section,
`check:perf-plans` will keep reporting a diff against this file until the
parser learns to resolve a function-built statement — a follow-up, not done
here.

### src/lib/server/catalog/foods.ts — searchFoods: `searchSql(FOOD_COLUMNS)`

Plan:

- MATERIALIZE segmented
- CO-ROUTINE shortlist
- CO-ROUTINE deduplicated
- CO-ROUTINE (subquery-11)
- CO-ROUTINE scored
- SCAN food_fts VIRTUAL TABLE INDEX 0:M3
- SEARCH f USING INDEX idx_food_id (food_id=?)
- CORRELATED SCALAR SUBQUERY 4
- MATERIALIZE parts
- SCAN CONSTANT ROW
- SCAN parts
- USE TEMP B-TREE FOR ORDER BY
- SCAN scored
- USE TEMP B-TREE FOR ORDER BY
- SCAN (subquery-11)
- SCAN deduplicated
- USE TEMP B-TREE FOR ORDER BY
- SCAN shortlist
- SCAN segmented
- SEARCH f USING INDEX idx_food_id (food_id=?)
- USE TEMP B-TREE FOR ORDER BY

### src/lib/server/catalog/portions.ts — volumesByFood: `servingsSql(20)`

Plan:

- SEARCH food_serving USING INDEX idx_serving_food (food_id=?)
- USE TEMP B-TREE FOR LAST 2 TERMS OF ORDER BY
