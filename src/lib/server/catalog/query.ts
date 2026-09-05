/** Enough tokens for "organic unsweetened vanilla almond milk"; past that the query is noise. */
const MAX_TOKENS = 8;

/** No catalog word is longer; a longer one is a paste, not a search. */
const MAX_TOKEN_LENGTH = 32;

/**
 * A one- or two-letter prefix matches a large fraction of the catalog and ranks
 * nothing useful: "ch" matches 128,310 rows and takes 376 ms to score, against
 * 40,754 and 130 ms for "chi". Search begins at the third character, so
 * the first keystrokes answer "no results" rather than scoring the catalog.
 */
const MIN_TOKEN_LENGTH = 3;

/** GTIN-14, which is how the ETL stores every barcode: shorter codes are zero-padded to it. */
const GTIN_LENGTH = 14;

/** EAN-8 is the shortest barcode a package carries. */
const MIN_BARCODE_DIGITS = 8;

export type SearchTerms = {
	/** The FTS5 MATCH expression. */
	match: string;
	/** The tokens rejoined, which is what the ranking compares a name against. */
	text: string;
};

/**
 * The typed text as an FTS5 query and as comparable text, or `null` when it
 * holds nothing searchable.
 *
 * Tokens are cut out of the input by a letters-and-digits pattern rather than
 * escaped, so nothing a person types can reach FTS5 as syntax: a quote, a
 * `NEAR`, a `*` or a `-` is simply not part of any token. The same tokens
 * become the `text` the ranking binds, so the LIKE it runs cannot see a `%`
 * either.
 *
 * Every token gets a `*`. The tokenizer does not stem, so without it "banana"
 * misses "Bananas, raw" — and as-you-type search wants the prefix anyway.
 */
export function searchTerms(input: string): SearchTerms | null {
	const tokens = Array.from(input.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu), ([token]) => token)
		.map((token) => token.slice(0, MAX_TOKEN_LENGTH))
		.filter((token) => token.length >= MIN_TOKEN_LENGTH)
		.slice(0, MAX_TOKENS);
	if (tokens.length === 0) return null;
	// `AND` is explicit rather than left to FTS5's juxtaposition, because a
	// parenthesised group is not a valid operand of the implicit operator:
	// `"beef"* ("livers"* OR "liver"*)` is a syntax error where
	// `"beef"* AND (...)` is not. Juxtaposition means AND, so nothing else
	// about the expression changes.
	return { match: tokens.map(prefixTerms).join(' AND '), text: tokens.join(' ') };
}

/**
 * One typed token as the FTS terms that find it, singular and plural.
 *
 * A prefix carries the plural but not the singular: `"banana"*` finds "Bananas,
 * raw", and `"livers"*` finds nothing at all in a catalog that writes "Beef,
 * liver, raw". So "beef livers" and "chicken gizzards" matched no row and the
 * search answered them with nothing — while "beef liver" and "chicken gizzard"
 * worked, which is not a distinction a person typing can be expected to make.
 *
 * The original token is always one of the terms, never replaced by its stem.
 * The rule that produces the stem is the one `queryForms` in `byproducts.ts`
 * applies to the parts it exempts — one trailing "s" — but taken through
 * `singular` rather than borrowed from there, because `singular` carries the
 * length floor and `queryForms` deliberately does not: its input is a curated
 * list, this one is what a person typed, and without the floor "gas" would also
 * search `"ga"*`, which is the two-letter prefix `MIN_TOKEN_LENGTH` exists to
 * keep out of the catalog.
 */
function prefixTerms(token: string): string {
	const stem = singular(token);
	return stem === token ? `"${token}"*` : `("${token}"* OR "${stem}"*)`;
}

/**
 * Drop one trailing "s" from a word of more than three letters.
 *
 * Deliberately crude, and mirrored exactly by the SQL in `ranking.ts`: it exists
 * so a query of "banana" reads the catalog's "Bananas, raw" as the same
 * head word, not to be a stemmer. Three letters or fewer are left alone so
 * "gas" and "oats" are not mangled into something that matches nothing.
 */
export function singular(word: string): string {
	return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
}

/**
 * A scanned or typed barcode as the GTIN-14 the catalog stores, or `null` when
 * it is not a barcode. UPC-A and EAN-13 differ from GTIN-14 only by leading
 * zeroes, so padding is the whole conversion.
 */
export function barcodeOf(input: string): string | null {
	const digits = input.replace(/\D/gu, '');
	if (digits.length < MIN_BARCODE_DIGITS || digits.length > GTIN_LENGTH) return null;
	return digits.padStart(GTIN_LENGTH, '0');
}
