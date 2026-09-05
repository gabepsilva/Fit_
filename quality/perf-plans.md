# SQLite query plans

Catalog statements run against the live catalog file.

## Statements

### src/lib/server/catalog/foods.ts — foodsByBarcode

```sql
select f.food_id, f.name, f.brand, f.kind, f.category, f.gtin14, f.license,
	f.serving_label, f.serving_g, f.kcal, f.protein, f.fat, f.carbs, f.sugar, f.fiber,
	f.sodium, f.saturated_fat, f.quality, f.n_sources from food f where f.gtin14 = ? order by f.quality desc
```

Plan:

- SEARCH f USING INDEX idx_food_gtin (gtin14=?)
- USE TEMP B-TREE FOR ORDER BY

### src/lib/server/state/document.ts — readDocument

```sql
select format, body, version, updated_at from household_state where household_id = ?
```

Plan:

- SEARCH household_state USING INDEX sqlite_autoindex_household_state_1 (household_id=?)

### src/lib/server/state/document.ts — writeDocument

```sql
insert into household_state (household_id, format, body, version, updated_at, updated_by)
				 values (?, ?, ?, ?, ?, ?)
```

Plan:

### src/lib/server/state/document.ts — writeDocument (2)

```sql
update household_state
				 set format = ?, body = ?, version = ?, updated_at = ?, updated_by = ?
				 where household_id = ? and version = ?
```

Plan:

- SEARCH household_state USING INDEX sqlite_autoindex_household_state_1 (household_id=?)

### src/lib/server/users/accounts.ts — insertAccount

```sql
insert into account (id, username, display_name, password_hash, created_at, updated_at)
		 values (?, ?, ?, ?, ?, ?)
```

Plan:

### src/lib/server/users/accounts.ts — insertAccount (2)

```sql
insert into household (id, name, created_at) values (?, ?, ?)
```

Plan:

### src/lib/server/users/accounts.ts — insertAccount (3)

```sql
insert into membership (household_id, account_id, role, created_at) values (?, ?, ?, ?)
```

Plan:

### src/lib/server/users/accounts.ts — insertAccount (4)

```sql
insert into profile (id, household_id, account_id, name, created_at) values (?, ?, ?, ?, ?)
```

Plan:

### src/lib/server/users/accounts.ts — authenticate

```sql
select id, username, display_name, password_hash, created_at from account where username = ?
```

Plan:

- SEARCH account USING INDEX sqlite_autoindex_account_2 (username=?)

### src/lib/server/users/accounts.ts — authenticate (2)

```sql
update account set password_hash = ?, updated_at = ? where id = ? and password_hash = ?
```

Plan:

- SEARCH account USING INDEX sqlite_autoindex_account_1 (id=?)

### src/lib/server/users/accounts.ts — membershipsFor

```sql
select h.id as household_id, h.name, m.role
			 from membership m
			 join household h on h.id = m.household_id
			 where m.account_id = ?
			 order by h.created_at
```

Plan:

- SCAN m
- SEARCH h USING INDEX sqlite_autoindex_household_1 (id=?)
- USE TEMP B-TREE FOR ORDER BY

### src/lib/server/users/sessions.ts — createSession

```sql
insert into session (id, account_id, token_hash, device_label, created_at, last_seen_at, expires_at)
		 values (?, ?, ?, ?, ?, ?, ?)
```

Plan:

### src/lib/server/users/sessions.ts — resolveSession

```sql
select s.id as session_id, s.expires_at, s.last_seen_at,
			        a.id as account_id, a.username,
			        a.display_name, a.created_at
			 from session s
			 join account a on a.id = s.account_id
			 where s.token_hash = ?
```

Plan:

- SEARCH s USING INDEX sqlite_autoindex_session_2 (token_hash=?)
- SEARCH a USING INDEX sqlite_autoindex_account_1 (id=?)

### src/lib/server/users/sessions.ts — resolveSession (2)

```sql
delete from session where token_hash = ?
```

Plan:

- SEARCH session USING INDEX sqlite_autoindex_session_2 (token_hash=?)

### src/lib/server/users/sessions.ts — resolveSession (3)

```sql
update session set last_seen_at = ? where token_hash = ? and last_seen_at <= ?
```

Plan:

- SEARCH session USING INDEX sqlite_autoindex_session_2 (token_hash=?)

### src/lib/server/users/sessions.ts — endSession

```sql
delete from session where token_hash = ?
```

Plan:

- SEARCH session USING INDEX sqlite_autoindex_session_2 (token_hash=?)

### src/lib/server/users/sessions.ts — endAllSessions

```sql
delete from session where account_id = ?
```

Plan:

- SEARCH session USING COVERING INDEX session_by_account (account_id=?)

### src/lib/server/users/throttle.ts — readState

```sql
select failures, window_ends_at, locked_until
			 from sign_in_throttle
			 where scope = ? and key_hash = ?
```

Plan:

- SEARCH sign_in_throttle USING INDEX sqlite_autoindex_sign_in_throttle_1 (scope=? AND key_hash=?)

### src/lib/server/users/throttle.ts — writeState

```sql
insert into sign_in_throttle (scope, key_hash, failures, window_ends_at, locked_until)
		 values (?, ?, ?, ?, ?)
		 on conflict (scope, key_hash) do update set
		   failures = excluded.failures,
		   window_ends_at = excluded.window_ends_at,
		   locked_until = excluded.locked_until
```

Plan:

### src/lib/server/users/throttle.ts — clearSignInFailures

```sql
delete from sign_in_throttle where scope = ? and key_hash = ?
```

Plan:

- SEARCH sign_in_throttle USING INDEX sqlite_autoindex_sign_in_throttle_1 (scope=? AND key_hash=?)

### src/lib/server/users/throttle.ts — pruneSignInThrottle

```sql
delete from sign_in_throttle
			 where window_ends_at <= ? and (locked_until is null or locked_until <= ?)
```

Plan:

- SEARCH sign_in_throttle USING INDEX sign_in_throttle_expiry (window_ends_at<?)

## Not extracted

- src/lib/server/catalog/foods.ts — searchFoods: `searchSql(FOOD_COLUMNS)`
- src/lib/server/catalog/portions.ts — volumesByFood: `servingsSql(ids.length)`

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
