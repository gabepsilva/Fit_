import { describe, expect, it } from 'vitest';
import { parseFile } from './sql-statements';

describe('parseFile', () => {
	it('extracts a single-quoted literal passed to db.prepare', () => {
		const source = `
function readOne(db) {
	return db.prepare('select 1 from account where id = ?').get(id);
}
`;
		const { statements, unresolved } = parseFile(source);
		expect(unresolved).toEqual([]);
		expect(statements).toEqual([{ label: 'readOne', sql: 'select 1 from account where id = ?' }]);
	});

	it('extracts a template literal passed to prepared(db, ...)', () => {
		const source = `
function insertAccount(db) {
	prepared(db, \`insert into account (id) values (?)\`).run(id);
}
`;
		const { statements } = parseFile(source);
		expect(statements).toEqual([
			{ label: 'insertAccount', sql: 'insert into account (id) values (?)' }
		]);
	});

	it('substitutes a same-file module constant interpolated once in a template literal', () => {
		const source = `
const FOOD_COLUMNS = \`food_id, name\`;
function foodsByBarcode(db) {
	return prepared(db, \`select \${FOOD_COLUMNS} from food where gtin14 = ?\`);
}
`;
		const { statements } = parseFile(source);
		expect(statements).toEqual([
			{ label: 'foodsByBarcode', sql: 'select food_id, name from food where gtin14 = ?' }
		]);
	});

	it('reports a call-built statement as unresolved rather than guessing its text', () => {
		const source = `
function searchFoods(db) {
	return prepared(db, searchSql(FOOD_COLUMNS));
}
`;
		const { statements, unresolved } = parseFile(source);
		expect(statements).toEqual([]);
		expect(unresolved).toEqual([{ label: 'searchFoods', snippet: 'searchSql(FOOD_COLUMNS)' }]);
	});

	it('reports an interpolation that is not a known constant as unresolved', () => {
		const source = `
function servingsSql(foods) {
	return \`select food_id from food_serving where food_id in (\${foods})\`;
}
function volumesByFood(catalog) {
	return prepared(catalog, servingsSql(ids.length));
}
`;
		const { unresolved } = parseFile(source);
		expect(unresolved.some((entry) => entry.label === 'volumesByFood')).toBe(true);
	});

	it('numbers repeated call sites inside the same function', () => {
		const source = `
function createAccount(db) {
	db.prepare('insert into account (id) values (?)').run(id);
	db.prepare('insert into household (id) values (?)').run(id);
}
`;
		const { statements } = parseFile(source);
		expect(statements.map((entry) => entry.label)).toEqual(['createAccount', 'createAccount (2)']);
	});

	it('labels a call outside any function as module scope', () => {
		const source = `db.prepare('pragma user_version').get();`;
		const { statements } = parseFile(source);
		expect(statements).toEqual([{ label: '(module scope)', sql: 'pragma user_version' }]);
	});
});
