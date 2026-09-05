import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db';
import {
	ACCOUNT_DAILY_LIMIT,
	GLOBAL_DAILY_LIMIT,
	checkPhotoQuota,
	msUntilNextUtcDay,
	prunePhotoQuota,
	recordPhotoCall,
	utcDay
} from './quota';

const NOON = new Date('2026-09-04T12:00:00.000Z');

let db: DatabaseSync;

beforeEach(() => {
	db = openDatabase(':memory:');
});

afterEach(() => {
	db.close();
});

/** Spend `count` calls for one account at one moment. */
function spend(accountId: string, count: number, now = NOON): void {
	for (let index = 0; index < count; index += 1) recordPhotoCall(db, accountId, now);
}

describe('the per-account ceiling', () => {
	it('lets an account through while it has an allowance left', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT - 1);
		expect(checkPhotoQuota(db, 'a1', NOON)).toEqual({ allowed: true });
	});

	it('refuses the call after the account has spent its day', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT);
		expect(checkPhotoQuota(db, 'a1', NOON).allowed).toBe(false);
	});

	it('does not spend one account allowance on another account', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT);
		expect(checkPhotoQuota(db, 'a2', NOON)).toEqual({ allowed: true });
	});

	it('holds forty plates a day, which is more than anybody logs', () => {
		expect(ACCOUNT_DAILY_LIMIT).toBe(40);
	});
});

describe('the deployment-wide ceiling', () => {
	it('refuses a fresh account once the deployment has spent its day', () => {
		for (let index = 0; index < GLOBAL_DAILY_LIMIT; index += 1) spend(`a${index}`, 1);
		expect(checkPhotoQuota(db, 'nobody-has-spent-anything', NOON).allowed).toBe(false);
	});

	it('lets the last global call through', () => {
		for (let index = 0; index < GLOBAL_DAILY_LIMIT - 1; index += 1) spend(`a${index}`, 1);
		expect(checkPhotoQuota(db, 'a-new-one', NOON)).toEqual({ allowed: true });
	});

	it('holds ten accounts worth, which is what bounds the prepaid balance', () => {
		expect(GLOBAL_DAILY_LIMIT).toBe(400);
	});
});

describe('the day it counts in', () => {
	it('files a call under the UTC calendar day', () => {
		expect(utcDay(NOON)).toBe('2026-09-04');
	});

	it('gives the allowance back at the next UTC midnight', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT);
		const tomorrow = new Date('2026-09-05T00:00:00.000Z');
		expect(checkPhotoQuota(db, 'a1', tomorrow)).toEqual({ allowed: true });
	});

	it('keeps the ceiling for the rest of the day it was reached', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT);
		const later = new Date('2026-09-04T23:59:59.000Z');
		expect(checkPhotoQuota(db, 'a1', later).allowed).toBe(false);
	});

	it('counts the last second of a day apart from the first of the next', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT, new Date('2026-09-04T23:59:59.999Z'));
		expect(checkPhotoQuota(db, 'a1', new Date('2026-09-05T00:00:00.000Z'))).toEqual({
			allowed: true
		});
	});
});

describe('what a refused caller is told to wait', () => {
	it('names the time left until the day turns over', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT);
		const decision = checkPhotoQuota(db, 'a1', NOON);
		expect(decision).toEqual({ allowed: false, retryAfterMs: 12 * 60 * 60 * 1000 });
	});

	it('never says zero, so a caller always has something to wait for', () => {
		expect(msUntilNextUtcDay(new Date('2026-09-04T23:59:59.999Z'))).toBe(1);
	});

	it('is a whole day at the moment the day begins', () => {
		expect(msUntilNextUtcDay(new Date('2026-09-04T00:00:00.000Z'))).toBe(24 * 60 * 60 * 1000);
	});
});

describe('the sweep', () => {
	it('drops the rows for days that have already turned over', () => {
		spend('a1', 3, new Date('2026-09-01T09:00:00.000Z'));
		expect(prunePhotoQuota(db, NOON)).toBe(2);
		expect(db.prepare('select count(*) as n from photo_quota').get()?.['n']).toBe(0);
	});

	it('leaves today alone', () => {
		spend('a1', 1);
		prunePhotoQuota(db, NOON);
		expect(db.prepare('select count(*) as n from photo_quota').get()?.['n']).toBe(2);
	});

	it('runs on the write, so the table never grows unattended', () => {
		spend('a1', 1, new Date('2026-09-01T09:00:00.000Z'));
		spend('a1', 1);
		const days = db.prepare('select distinct day from photo_quota').all();
		expect(days).toEqual([{ day: '2026-09-04' }]);
	});
});

describe('durability', () => {
	it('counts in rows, so a restart is not a free allowance', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT);
		const rows = db.prepare('select scope, holder, calls from photo_quota order by scope').all();
		expect(rows).toEqual([
			{ scope: 'account', holder: 'a1', calls: ACCOUNT_DAILY_LIMIT },
			{ scope: 'global', holder: '', calls: ACCOUNT_DAILY_LIMIT }
		]);
	});

	it('counts a call once against each ceiling', () => {
		recordPhotoCall(db, 'a1', NOON);
		const rows = db.prepare('select calls from photo_quota').all();
		expect(rows).toEqual([{ calls: 1 }, { calls: 1 }]);
	});

	it('takes the clock from the caller only when it is given one', () => {
		recordPhotoCall(db, 'a1');
		expect(checkPhotoQuota(db, 'a1')).toEqual({ allowed: true });
	});
});
