/**
 * An account as the rest of the application is allowed to see it.
 *
 * There is no `passwordHash` here, and that is the point: the hash is read
 * inside `accounts.ts` and never leaves it, so no route can leak it by
 * serializing whatever it was handed.
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
 * What a request knows about who is making it.
 *
 * `households` is resolved here rather than looked up per query because
 * `household_id` is the predicate every later read filters on. A request that
 * has not established which households it may see has no business reading rows.
 */
export type Auth = {
	account: Account;
	session: Session;
	households: Membership[];
};
