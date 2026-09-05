import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../db';
import {
	ACCOUNT_DAILY_LIMIT,
	GLOBAL_DAILY_LIMIT,
	msUntilNextUtcDay,
	prunePhotoQuota,
	reservePhotoCall,
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

/** Reserve `count` calls for one account at one moment, and report the last decision. */
function spend(accountId: string, count: number, now = NOON) {
	let last = { allowed: true } as ReturnType<typeof reservePhotoCall>;
	for (let index = 0; index < count; index += 1) last = reservePhotoCall(db, accountId, now);
	return last;
}

function callsFor(scope: string): number {
	const row = db.prepare('select calls from photo_quota where scope = ?').get(scope);
	return row === undefined ? 0 : Number(row['calls']);
}

describe('the per-account ceiling', () => {
	it('allows the last call of the day', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT - 1);
		expect(reservePhotoCall(db, 'a1', NOON)).toEqual({ allowed: true });
	});

	it('refuses the one after it', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT);
		expect(reservePhotoCall(db, 'a1', NOON).allowed).toBe(false);
	});

	it('refuses at the boundary and not before it', () => {
		// The thirty-ninth reservation makes it forty, which is the allowance;
		// the fortieth would make it forty-one, which is not.
		expect(spend('a1', ACCOUNT_DAILY_LIMIT).allowed).toBe(true);
		expect(callsFor('account')).toBe(ACCOUNT_DAILY_LIMIT);
		expect(reservePhotoCall(db, 'a1', NOON).allowed).toBe(false);
	});

	it('does not spend one account allowance on another account', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT);
		expect(reservePhotoCall(db, 'a2', NOON)).toEqual({ allowed: true });
	});

	it('holds forty plates a day, which is more than anybody logs', () => {
		expect(ACCOUNT_DAILY_LIMIT).toBe(40);
	});
});

describe('the deployment-wide ceiling', () => {
	it('refuses a fresh account once the deployment has spent its day', () => {
		for (let index = 0; index < GLOBAL_DAILY_LIMIT; index += 1) spend(`a${index}`, 1);
		expect(reservePhotoCall(db, 'nobody-has-spent-anything', NOON).allowed).toBe(false);
	});

	it('allows the last global call', () => {
		for (let index = 0; index < GLOBAL_DAILY_LIMIT - 1; index += 1) spend(`a${index}`, 1);
		expect(reservePhotoCall(db, 'a-new-one', NOON)).toEqual({ allowed: true });
	});

	it('holds ten accounts worth, which is what bounds the prepaid balance', () => {
		expect(GLOBAL_DAILY_LIMIT).toBe(400);
	});
});

describe('a reservation that is refused', () => {
	it('leaves the account counter where it was', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT);
		reservePhotoCall(db, 'a1', NOON);
		reservePhotoCall(db, 'a1', NOON);
		expect(callsFor('account')).toBe(ACCOUNT_DAILY_LIMIT);
	});

	it('leaves the deployment counter where it was, so one account cannot drain it', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT);
		for (let index = 0; index < 50; index += 1) reservePhotoCall(db, 'a1', NOON);
		expect(callsFor('global')).toBe(ACCOUNT_DAILY_LIMIT);
		// The deployment still has its allowance for everybody else.
		expect(reservePhotoCall(db, 'a2', NOON)).toEqual({ allowed: true });
	});

	it('leaves the counters where they were when the deployment is the one that is full', () => {
		for (let index = 0; index < GLOBAL_DAILY_LIMIT; index += 1) spend(`a${index}`, 1);
		reservePhotoCall(db, 'a-new-one', NOON);
		expect(callsFor('global')).toBe(GLOBAL_DAILY_LIMIT);
		const row = db
			.prepare('select calls from photo_quota where scope = ? and holder = ?')
			.get('account', 'a-new-one');
		expect(row).toBeUndefined();
	});
});

describe('the day it counts in', () => {
	it('files a call under the UTC calendar day', () => {
		expect(utcDay(NOON)).toBe('2026-09-04');
	});

	it('gives the allowance back at the next UTC midnight', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT);
		const tomorrow = new Date('2026-09-05T00:00:00.000Z');
		expect(reservePhotoCall(db, 'a1', tomorrow)).toEqual({ allowed: true });
	});

	it('keeps the ceiling for the rest of the day it was reached', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT);
		const later = new Date('2026-09-04T23:59:59.000Z');
		expect(reservePhotoCall(db, 'a1', later).allowed).toBe(false);
	});

	it('counts the last second of a day apart from the first of the next', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT, new Date('2026-09-04T23:59:59.999Z'));
		expect(reservePhotoCall(db, 'a1', new Date('2026-09-05T00:00:00.000Z'))).toEqual({
			allowed: true
		});
	});
});

describe('what a refused caller is told to wait', () => {
	it('names the time left until the day turns over', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT);
		expect(reservePhotoCall(db, 'a1', NOON)).toEqual({
			allowed: false,
			retryAfterMs: 12 * 60 * 60 * 1000
		});
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

	it('runs on the reservation, so the table never grows unattended', () => {
		spend('a1', 1, new Date('2026-09-01T09:00:00.000Z'));
		spend('a1', 1);
		expect(db.prepare('select distinct day from photo_quota').all()).toEqual([
			{ day: '2026-09-04' }
		]);
	});
});

describe('durability', () => {
	it('counts in rows, so a restart is not a free allowance', () => {
		spend('a1', ACCOUNT_DAILY_LIMIT);
		expect(db.prepare('select scope, holder, calls from photo_quota order by scope').all()).toEqual(
			[
				{ scope: 'account', holder: 'a1', calls: ACCOUNT_DAILY_LIMIT },
				{ scope: 'global', holder: '', calls: ACCOUNT_DAILY_LIMIT }
			]
		);
	});

	it('counts a reservation once against each ceiling', () => {
		reservePhotoCall(db, 'a1', NOON);
		expect(db.prepare('select calls from photo_quota').all()).toEqual([{ calls: 1 }, { calls: 1 }]);
	});

	it('takes the clock from the caller only when it is given one', () => {
		expect(reservePhotoCall(db, 'a1')).toEqual({ allowed: true });
	});

	it('leaves no transaction open when a reservation fails part-way', () => {
		// A statement that throws must not strand the write lock: the next
		// reservation has to be able to begin its own transaction.
		db.exec('drop table photo_quota');
		expect(() => reservePhotoCall(db, 'a1', NOON)).toThrow();
		expect(() => db.exec('begin immediate')).not.toThrow();
		db.exec('rollback');
	});
});
