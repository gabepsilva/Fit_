export type StoredTextField = 'displayName' | 'householdName' | 'deviceLabel';
export type StoredTextProblem = {
	field: StoredTextField;
	code: 'too-long' | 'unsafe-characters';
};

// C0/C1 controls can alter logs and protocols; directional controls can make
// an identity label render as different text without changing its stored form.
const UNSAFE_STORED_TEXT = /[\p{Cc}\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/u;

export function storedTextProblem(
	value: string,
	field: StoredTextField,
	maximumLength: number
): StoredTextProblem | null {
	if (value.length > maximumLength) return { field, code: 'too-long' };
	if (UNSAFE_STORED_TEXT.test(value)) return { field, code: 'unsafe-characters' };
	return null;
}

export class InputValidationError extends RangeError {
	readonly problem: StoredTextProblem;

	constructor(problem: StoredTextProblem) {
		super(`${problem.field} is ${problem.code.replace('-', ' ')}`);
		this.name = 'InputValidationError';
		this.problem = problem;
	}
}
