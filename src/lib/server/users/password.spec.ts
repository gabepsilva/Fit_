import { describe, expect, it } from 'vitest';
import { hashPassword, OWASP_SCRYPT, passwordProblem, verifyPassword } from './password';

/**
 * The lowest cost the parser will accept. The production cost is ~350 ms per
 * hash, which a suite that hashes on nearly every case cannot afford — and a
 * mutation run, which replays the suite hundreds of times, even less.
 */
const CHEAP = { n: 2 ** 12, r: 8, p: 1 };

const PASSWORD = 'correct horse battery staple';

describe('passwordProblem', () => {
	it('accepts a passphrase', () => {
		expect(passwordProblem(PASSWORD)).toBeNull();
	});

	it('accepts a password of exactly the minimum length', () => {
		expect(passwordProblem('0123456789')).toBeNull();
	});

	it('rejects a password below the minimum length', () => {
		expect(passwordProblem('012345678')).toBe('too-short');
	});

	it('rejects a password past the length scrypt should be handed', () => {
		expect(passwordProblem('x'.repeat(129))).toBe('too-long');
	});

	it('imposes no composition rules', () => {
		expect(passwordProblem('aaaaaaaaaaaa')).toBeNull();
	});
});

describe('hashPassword', () => {
	it('records the algorithm and cost alongside the hash', async () => {
		const stored = await hashPassword(PASSWORD, CHEAP);
		expect(stored.split('$').slice(0, 4)).toEqual(['scrypt', '4096', '8', '1']);
	});

	it('salts, so the same password twice gives two different hashes', async () => {
		const [first, second] = await Promise.all([
			hashPassword(PASSWORD, CHEAP),
			hashPassword(PASSWORD, CHEAP)
		]);
		expect(first).not.toBe(second);
	});

	it('defaults to the OWASP cost when none is given', async () => {
		const stored = await hashPassword(PASSWORD);
		expect(stored.split('$')[1]).toBe(String(OWASP_SCRYPT.n));
	});
});

describe('verifyPassword', () => {
	it('accepts the password it was made from', async () => {
		const stored = await hashPassword(PASSWORD, CHEAP);
		expect(await verifyPassword(PASSWORD, stored)).toBe(true);
	});

	it('rejects a different password', async () => {
		const stored = await hashPassword(PASSWORD, CHEAP);
		expect(await verifyPassword('incorrect horse battery staple', stored)).toBe(false);
	});

	it('verifies a hash made at a cost the current default no longer uses', async () => {
		// The parameters travel with the hash, so raising the default cost must not
		// lock out everyone who registered before the change.
		const stored = await hashPassword(PASSWORD, { n: 2 ** 13, r: 8, p: 1 });
		expect(await verifyPassword(PASSWORD, stored)).toBe(true);
	});

	it('rejects a hash with the wrong number of fields', async () => {
		expect(await verifyPassword(PASSWORD, 'scrypt$4096$8$1$salt')).toBe(false);
	});

	it('rejects a hash from an algorithm it does not implement', async () => {
		const stored = await hashPassword(PASSWORD, CHEAP);
		expect(await verifyPassword(PASSWORD, stored.replace('scrypt', 'argon2id'))).toBe(false);
	});

	it('rejects a cost low enough to be worth brute-forcing', async () => {
		const stored = await hashPassword(PASSWORD, CHEAP);
		expect(await verifyPassword(PASSWORD, stored.replace('$4096$', '$2$'))).toBe(false);
	});

	it('rejects a cost high enough to hang the server', async () => {
		const stored = await hashPassword(PASSWORD, CHEAP);
		expect(await verifyPassword(PASSWORD, stored.replace('$4096$', `$${2 ** 24}$`))).toBe(false);
	});

	it('rejects a non-numeric block size rather than deriving with NaN', async () => {
		const stored = await hashPassword(PASSWORD, CHEAP);
		expect(await verifyPassword(PASSWORD, stored.replace('$4096$8$', '$4096$eight$'))).toBe(false);
	});

	it('rejects a stored key of the wrong length without throwing', async () => {
		// `timingSafeEqual` throws rather than returning false when the two buffers
		// differ in length, so the length has to be checked before it is called.
		const stored = await hashPassword(PASSWORD, CHEAP);
		const shortKey = Buffer.from('too short').toString('base64');
		expect(
			await verifyPassword(PASSWORD, `${stored.slice(0, stored.lastIndexOf('$'))}$${shortKey}`)
		).toBe(false);
	});
});
