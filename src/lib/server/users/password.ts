import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/** Why a password was rejected. Codes rather than sentences, so the interface owns the wording. */
export type PasswordProblem = 'too-short' | 'too-long';

export type ScryptCost = { n: number; r: number; p: number };

/**
 * OWASP's scrypt baseline. Passed explicitly rather than read from a global so
 * that tests, which hash on nearly every case, can run a cheap cost while the
 * server runs this one — roughly 350 ms per hash on a workstation.
 */
export const OWASP_SCRYPT: ScryptCost = { n: 2 ** 17, r: 8, p: 1 };

const KEY_BYTES = 32;
const SALT_BYTES = 16;

/** scrypt needs `128 * n * r` bytes; Node's default cap of 32 MB is below what OWASP asks for. */
const MAX_MEMORY = 512 * 1024 * 1024;

/**
 * The password is the only factor — no second factor, and with no email on file
 * no reset link either — so the floor sits above the NIST minimum of 8. There
 * are no composition rules, which NIST also advises against: a demand for one
 * capital, one digit and one symbol pushes people towards a short password
 * decorated to satisfy it, and away from a long one.
 */
const MIN_LENGTH = 10;

/** NIST's guidance again: accept long passphrases, but do not hand scrypt unbounded input. */
const MAX_LENGTH = 128;

/** Guards a cost read back out of the database against a value that would hang the server. */
const MIN_COST = 2 ** 12;
const MAX_COST = 2 ** 20;

function derive(password: string, salt: Buffer, cost: ScryptCost): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const options = { N: cost.n, r: cost.r, p: cost.p, maxmem: MAX_MEMORY };
		scrypt(password, salt, KEY_BYTES, options, (error, key) => {
			if (error) reject(error);
			else resolve(key);
		});
	});
}

/** `null` when the password is usable, otherwise the reason it is not. */
export function passwordProblem(password: string): PasswordProblem | null {
	if (password.length < MIN_LENGTH) return 'too-short';
	if (password.length > MAX_LENGTH) return 'too-long';
	return null;
}

/**
 * A self-describing hash: `scrypt$n$r$p$salt$key`, both binary fields base64.
 *
 * The parameters travel with the hash so raising the cost — or moving to
 * argon2id, which would add a native dependency this build does not have — is a
 * new prefix and a rehash on next sign-in, never a migration over stored rows.
 */
export async function hashPassword(password: string, cost = OWASP_SCRYPT): Promise<string> {
	const salt = randomBytes(SALT_BYTES);
	const key = await derive(password, salt, cost);
	const encoded = `${salt.toString('base64')}$${key.toString('base64')}`;
	return `scrypt$${cost.n}$${cost.r}$${cost.p}$${encoded}`;
}

/** Whether a cost read back out of the database is one worth deriving with. */
function saneCost(cost: ScryptCost): boolean {
	if (!Number.isInteger(cost.r) || !Number.isInteger(cost.p)) return false;
	if (cost.r <= 0 || cost.p <= 0) return false;
	return cost.n >= MIN_COST && cost.n <= MAX_COST;
}

function parseHash(stored: string): { cost: ScryptCost; salt: Buffer; key: Buffer } | null {
	const parts = stored.split('$');
	if (parts.length !== 6 || parts[0] !== 'scrypt') return null;
	const cost = { n: Number(parts[1]), r: Number(parts[2]), p: Number(parts[3]) };
	if (!saneCost(cost)) return null;
	return {
		cost,
		salt: Buffer.from(parts[4] ?? '', 'base64'),
		key: Buffer.from(parts[5] ?? '', 'base64')
	};
}

/** Whether `password` produced `stored`. False for any hash this function cannot read. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parsed = parseHash(stored);
	if (!parsed) return false;
	const actual = await derive(password, parsed.salt, parsed.cost);
	// `timingSafeEqual` throws on a length mismatch, and the lengths are public.
	if (actual.length !== parsed.key.length) return false;
	return timingSafeEqual(actual, parsed.key);
}
