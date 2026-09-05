/**
 * How the text people type is broken into words.
 *
 * Shared by `parse-text.ts`, which drops the filler words in front of a food,
 * and `food-match.ts`, which scores a query against the bundled foods. Both
 * have to agree on what a word is, or a phrase the parser stripped down to
 * "toast" would be scored as something else entirely.
 */
export function tokenize(s: string): string[] {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9%./\s-]/g, ' ')
		.split(/\s+/)
		.filter(Boolean);
}
