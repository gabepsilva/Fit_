/**
 * Rows that name a part of an animal rather than the food it came from.
 *
 * Searching the live catalog for "chicken" answers with chicken, ground
 * chicken, then feet and two kinds of giblets; "pork" answers with feet, jowl,
 * tail, heart, liver and lungs; "goose" answers with liver before goose. The
 * reason is that the ranking rewards a short name that leads with the query,
 * and "Pork, feet, raw" is exactly that. Nothing about the row says it is offal.
 *
 * This says it. It is a demotion and never a filter: the rows stay in the
 * result, and a person who types "chicken feet" or "beef liver" still gets them
 * first, because a part the person named is not a part they did not ask for.
 */

/**
 * The parts, as whole comma-separated segments of a name.
 *
 * Matching a segment rather than a substring is what makes the short words
 * safe. `instr(name, 'skin')` also fires on "skinless", `'bone'` on "boneless",
 * `'tail'` on "fruit cocktail" and `'fat'` on "2% fat" — each of them demoting
 * the row a person most likely wants. A segment is the catalog's own unit:
 * "Potato, skin, raw" carries the part as a segment while "Potato, flesh and
 * skin, raw" and "Apples, fuji, with skin, raw" do not, and those two are
 * potato and apple rather than peel.
 *
 * A plant has parts too, and the same two words fix them: "broccoli" answers
 * with leaves and stalks before it answers with broccoli.
 *
 * Every word here was counted on the real catalog before it was added. All 35
 * together match 451 of 2,542,583 rows, of which 430 are the generic organ,
 * trimming and plant-part rows this exists for. Words that looked right and
 * were not are left out on the evidence: "bone" matches nothing as a segment
 * because the catalog writes "bone-in"; "hearts" is out because "artichoke
 * hearts" is a vegetable; "leaf" is out because "Tea, hot, leaf, black" is tea;
 * and "shank", "hocks" and "lard" are out because they are cuts and fats people
 * cook with on purpose.
 */
export const BYPRODUCT_PARTS = [
	'blood',
	'bone marrow',
	'bones',
	'brain',
	'brains',
	'chitterlings',
	'ears',
	'fat',
	'feet',
	'giblets',
	'gizzard',
	'heart',
	'jowl',
	'kidney',
	'kidneys',
	'leaves',
	'leaf fat',
	'liver',
	'livers',
	'lung',
	'lungs',
	'neck',
	'pancreas',
	'skin',
	'spleen',
	'stalks',
	'stomach',
	'suet',
	'sweetbread',
	'sweetbreads',
	'tail',
	'testes',
	'thymus',
	'tongue',
	'tripe'
] as const;

/**
 * A name as its comma-separated segments, each fenced by a comma.
 *
 * "Chicken, feet, boiled" becomes ",chicken,feet,boiled,", so a segment is
 * found by looking for it with a comma on both sides and a word that merely
 * contains it is not. The space after each comma is folded rather than trimmed
 * per segment, because SQLite has no split and this is one pass of `replace`.
 */
export function namePartsSql(column: string): string {
	const folded = `replace(replace(lower(trim(${column})), ' ,', ','), ', ', ',')`;
	return `',' || ${folded} || ','`;
}

/**
 * Foods the catalog qualifies with a word that also names an animal part.
 *
 * "Beans, kidney, red, mature seeds, raw" is a bean variety and not an organ,
 * and 39 rows carrying a part above are one. "Peanut butter, chunk type, fat,
 * sugar and salt added" lists fat as an ingredient rather than as a trimming,
 * and 2 rows are that. Naming the food is more honest than dropping "kidney"
 * and "fat" from the list above, which would give up 85 generic organ and
 * trimming rows to spare 41; a scan of all 2,542,583 names found no third
 * collision.
 */
const NOT_A_PART_IN = ['beans', 'peanut butter'];

/**
 * The forms of a part a person might type.
 *
 * The tokenizer does not stem, so "beef livers" reaches the catalog as
 * `livers` and would not exempt the `liver` the rows carry. Crude in the same
 * way `singular` in `query.ts` is crude, and for the same reason: it exists so
 * a plural query and a singular name are the same word, not to be a stemmer.
 *
 * Unlike `singular` it has no length floor, because its input is the curated
 * list above rather than what a person typed, and nothing in that list is
 * short enough for one to change an answer.
 */
function queryForms(part: string): string[] {
	const stem = part.endsWith('s') ? part.slice(0, -1) : part;
	return [...new Set([part, stem, `${stem}s`])];
}

/**
 * True when the row names a part and the query did not.
 *
 * The guard reads the `:text` the ranking already binds — the query's tokens,
 * lowercased and space-joined — fenced by spaces so "chicken feet" exempts
 * `feet` while "skinless" does not exempt `skin`. Without it the demotion
 * becomes a filter in the one case it must not: everything matching "gizzard"
 * is a gizzard, so demoting them all would hand the query to a branded pastry
 * whose name merely starts with the word.
 *
 * @param parts a column holding `namePartsSql` of the row's name
 */
export function byproductSql(parts: string): string {
	const asked = `' ' || :text || ' '`;
	const exempt = NOT_A_PART_IN.map((food) => `instr(${parts}, ',${food},') = 0`);
	const tests = BYPRODUCT_PARTS.map((part) => {
		const unasked = queryForms(part).map((form) => `instr(${asked}, ' ${form} ') = 0`);
		return `(${[...unasked, `instr(${parts}, ',${part},') > 0`].join(' and ')})`;
	});
	return `(${exempt.join(' and ')}) and (${tests.join(' or ')})`;
}
