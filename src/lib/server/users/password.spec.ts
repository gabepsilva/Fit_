import { scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	hashPassword,
	MAX_PASSWORD_VERIFICATION_DERIVATIONS,
	OWASP_SCRYPT,
	passwordHashNeedsUpgrade,
	passwordProblem,
	passwordVerificationWork,
	verifyPassword,
	verifyPasswordAtPolicy
} from './password';

/**
 * The lowest cost the parser will accept. The production cost is ~350 ms per
 * hash, which a suite that hashes on nearly every case cannot afford — and a
 * mutation run, which replays the suite hundreds of times, even less.
 */
const CHEAP = { n: 2 ** 12, r: 8, p: 1 };

const PASSWORD = 'correct horse battery staple';

function legacyHash(password: string, cost = CHEAP): string {
	const salt = Buffer.alloc(16, 7);
	const key = scryptSync(password, salt, 32, {
		N: cost.n,
		r: cost.r,
		p: cost.p,
		maxmem: 512 * 1024 * 1024
	});
	return `scrypt$${cost.n}$${cost.r}$${cost.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

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

	it('rejects passwords outside the creation policy', async () => {
		await expect(hashPassword('too short', CHEAP)).rejects.toThrow(RangeError);
		await expect(hashPassword('x'.repeat(129), CHEAP)).rejects.toThrow(RangeError);
	});

	it('rejects costs that would be unsafe to derive', async () => {
		await expect(hashPassword(PASSWORD, { n: 5000, r: 8, p: 1 })).rejects.toThrow(RangeError);
		await expect(hashPassword(PASSWORD, { n: 2 ** 12, r: 33, p: 1 })).rejects.toThrow(RangeError);
		await expect(hashPassword(PASSWORD, { n: 2 ** 17, r: 32, p: 1 })).rejects.toThrow(RangeError);
		await expect(hashPassword(PASSWORD, { n: 2 ** 17, r: 8, p: 16 })).rejects.toThrow(RangeError);
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

	it('rejects a non-power-of-two block size without deriving', async () => {
		const stored = await hashPassword(PASSWORD, CHEAP);
		expect(await verifyPassword(PASSWORD, stored.replace('$4096$', '$5000$'))).toBe(false);
	});

	it('rejects parameters whose aggregate memory or work exceeds the policy', async () => {
		const stored = await hashPassword(PASSWORD, CHEAP);
		expect(await verifyPassword(PASSWORD, stored.replace('$4096$8$1$', '$131072$32$1$'))).toBe(
			false
		);
		expect(await verifyPassword(PASSWORD, stored.replace('$4096$8$1$', '$4096$8$17$'))).toBe(false);
		expect(await verifyPassword(PASSWORD, stored.replace('$4096$8$1$', '$131072$8$16$'))).toBe(
			false
		);
	});

	it('rejects non-canonical base64 and wrong salt lengths without throwing', async () => {
		const stored = await hashPassword(PASSWORD, CHEAP);
		const [algorithm, n, r, p, salt, key] = stored.split('$');
		expect(
			await verifyPassword(PASSWORD, [algorithm, n, r, p, salt?.replace(/=$/, ''), key].join('$'))
		).toBe(false);
		expect(
			await verifyPassword(
				PASSWORD,
				[algorithm, n, r, p, Buffer.from('short').toString('base64'), key].join('$')
			)
		).toBe(false);
	});

	it('returns false for oversized stored hashes and passwords rather than deriving', async () => {
		const stored = await hashPassword(PASSWORD, CHEAP);
		expect(await verifyPassword(PASSWORD, `${stored}${'x'.repeat(256)}`)).toBe(false);
		expect(await verifyPassword('x'.repeat(129), stored)).toBe(false);
	});
});

describe('passwordHashNeedsUpgrade', () => {
	it('compares every stored cost parameter with the target policy', async () => {
		const stored = await hashPassword(PASSWORD, CHEAP);
		expect(passwordHashNeedsUpgrade(stored, CHEAP)).toBe(false);
		expect(passwordHashNeedsUpgrade(stored, { ...CHEAP, n: 2 ** 13 })).toBe(true);
		expect(passwordHashNeedsUpgrade(stored, { ...CHEAP, p: 2 })).toBe(true);
	});

	it('never upgrades a hash that is stronger or incomparable with the target', async () => {
		const stronger = await hashPassword(PASSWORD, { ...CHEAP, n: 2 ** 13 });
		const incomparable = await hashPassword(PASSWORD, { ...CHEAP, r: 16 });
		expect(passwordHashNeedsUpgrade(stronger, CHEAP)).toBe(false);
		expect(passwordHashNeedsUpgrade(incomparable, { ...CHEAP, n: 2 ** 13 })).toBe(false);
	});

	it('does not call an unreadable hash upgradeable and rejects an unsafe target', () => {
		expect(passwordHashNeedsUpgrade('unreadable', CHEAP)).toBe(false);
		expect(() => passwordHashNeedsUpgrade('unreadable', { n: 5000, r: 8, p: 1 })).toThrow(
			RangeError
		);
	});
});

describe('passwordVerificationWork', () => {
	it('bounds every policy case to at most two derivations', async () => {
		const oldHash = await hashPassword(PASSWORD, CHEAP);
		const target = { ...CHEAP, n: 2 ** 13 };
		const targetHash = await hashPassword(PASSWORD, target);
		const strongerHash = await hashPassword(PASSWORD, { ...target, n: 2 ** 14 });
		const incomparableHash = await hashPassword(PASSWORD, { ...CHEAP, r: 16 });
		const plans = [
			passwordVerificationWork(null, target),
			passwordVerificationWork('unreadable', target),
			passwordVerificationWork(oldHash, target),
			passwordVerificationWork(targetHash, target),
			passwordVerificationWork(strongerHash, target),
			passwordVerificationWork(incomparableHash, target)
		];
		expect(plans).toEqual([
			{ verifyStored: false, deriveTarget: true, upgradeStored: false, derivations: 1 },
			{ verifyStored: false, deriveTarget: true, upgradeStored: false, derivations: 1 },
			{ verifyStored: true, deriveTarget: true, upgradeStored: true, derivations: 2 },
			{ verifyStored: true, deriveTarget: false, upgradeStored: false, derivations: 1 },
			{ verifyStored: false, deriveTarget: true, upgradeStored: false, derivations: 1 },
			{ verifyStored: false, deriveTarget: true, upgradeStored: false, derivations: 1 }
		]);
		expect(plans.every((plan) => plan.derivations <= MAX_PASSWORD_VERIFICATION_DERIVATIONS)).toBe(
			true
		);
		expect(
			plans.every(
				(plan) => plan.derivations === Number(plan.verifyStored) + Number(plan.deriveTarget)
			)
		).toBe(true);
	});
});

describe('verifyPasswordAtPolicy', () => {
	it('returns the target-policy candidate produced while verifying an older hash', async () => {
		const oldHash = await hashPassword(PASSWORD, CHEAP);
		const target = { ...CHEAP, n: 2 ** 13 };
		const result = await verifyPasswordAtPolicy(PASSWORD, oldHash, target);
		expect(result.verified).toBe(true);
		expect(result.upgradeHash?.split('$').slice(1, 4)).toEqual(['8192', '8', '1']);
		expect(await verifyPassword(PASSWORD, result.upgradeHash ?? '')).toBe(true);
		expect(await verifyPasswordAtPolicy('incorrect horse battery', oldHash, target)).toEqual({
			verified: false,
			upgradeHash: null
		});
	});

	it('authenticates a short legacy password without replacing it with the padding hash', async () => {
		const shortPassword = 'short';
		const stored = legacyHash(shortPassword);
		const result = await verifyPasswordAtPolicy(shortPassword, stored, { ...CHEAP, n: 2 ** 13 });
		expect(result).toEqual({ verified: true, upgradeHash: null });
	});

	it('performs target-policy work and returns false for an unknown username', async () => {
		expect(await verifyPasswordAtPolicy(PASSWORD, null, CHEAP)).toEqual({
			verified: false,
			upgradeHash: null
		});
	});

	it('fails closed without deriving at a stronger or incomparable stored policy', async () => {
		const target = { ...CHEAP, n: 2 ** 13 };
		const strongerHash = await hashPassword(PASSWORD, { ...target, n: 2 ** 14 });
		const incomparableHash = await hashPassword(PASSWORD, { ...CHEAP, r: 16 });
		await expect(verifyPasswordAtPolicy(PASSWORD, strongerHash, target)).resolves.toEqual({
			verified: false,
			upgradeHash: null
		});
		await expect(verifyPasswordAtPolicy(PASSWORD, incomparableHash, target)).resolves.toEqual({
			verified: false,
			upgradeHash: null
		});
	});
});
