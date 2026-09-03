/**
 * An account as the rest of the application is allowed to see it. There is no
 * `passwordHash`: the hash is read inside `accounts.ts` and never leaves it, so
 * no route can leak it by serializing whatever it was handed.
 */
export type Account = {
	id: string;
	username: string;
	displayName: string;
	createdAt: string;
};

/** The household an account belongs to, and what it may do there. */
export type Membership = {
	householdId: string;
	name: string;
	role: 'owner' | 'member';
};

export type Session = {
	id: string;
	accountId: string;
	expiresAt: string;
};

/**
 * What a request knows about who is making it. `households` is resolved here
 * rather than per query because `household_id` is the predicate every later
 * read filters on.
 */
export type Auth = {
	account: Account;
	session: Session;
	households: Membership[];
};
