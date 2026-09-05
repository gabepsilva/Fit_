/**
 * How the text people type is broken into words.
 *
 * Shared by `parse-text.ts`, which drops the filler words in front of a food,
 * and `food-match.ts`, which scores a query against the bundled foods. Both
 * have to agree on what a word is, or a phrase the parser stripped down to
 * "toast" would be scored as something else entirely.
 *
 * A word is a run of the characters a food name uses: letters, digits, and the
 * four marks that carry meaning inside one — `%` in "2% milk", `.` in "1.5",
 * `/` in "1/2", and the hyphen in "low-fat". Everything else separates, so
 * punctuation is a break rather than a word, and text made of nothing else has
 * no words at all.
 */
export function tokenize(s: string): string[] {
	return s.toLowerCase().match(/[a-z0-9%./-]+/g) ?? [];
}
