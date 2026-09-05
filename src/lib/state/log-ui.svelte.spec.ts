import { beforeEach, describe, expect, it, vi } from 'vitest';
import { logUi } from './log-ui.svelte';

beforeEach(() => {
	logUi.open = false;
	logUi.tab = 'search';
	logUi.meal = null;
});

describe('logUi', () => {
	it('is closed, on the search tab, with no meal, before anything asks it to open', async () => {
		vi.resetModules();
		const fresh = await import('./log-ui.svelte');
		expect(fresh.logUi.open).toBe(false);
		expect(fresh.logUi.tab).toBe('search');
		expect(fresh.logUi.meal).toBeNull();
	});

	it('starts closed', () => {
		expect(logUi.open).toBe(false);
	});

	it('opens on request', () => {
		logUi.show();
		expect(logUi.open).toBe(true);
	});

	it('stays open when asked twice', () => {
		logUi.show();
		logUi.show();
		expect(logUi.open).toBe(true);
	});

	it('starts on the search tab', () => {
		expect(logUi.tab).toBe('search');
	});

	it('opens on the way in it was asked for', () => {
		logUi.show('photo');
		expect(logUi.tab).toBe('photo');
	});

	it('still opens when asked for a tab', () => {
		logUi.show('photo');
		expect(logUi.open).toBe(true);
	});

	it('falls back to search when no way in is named', () => {
		logUi.show('scan');
		logUi.open = false;
		logUi.show();
		expect(logUi.tab).toBe('search');
	});

	it('defaults the meal to null when none is named', () => {
		logUi.show();
		expect(logUi.meal).toBeNull();
	});

	it('defaults the meal to null even when a tab is named', () => {
		logUi.show('photo');
		expect(logUi.meal).toBeNull();
	});

	it('sets the meal alongside the tab when both are named', () => {
		logUi.show('search', 'lunch');
		expect(logUi.tab).toBe('search');
		expect(logUi.meal).toBe('lunch');
	});

	it('clears a previous meal when show is called again without one', () => {
		logUi.show('search', 'lunch');
		logUi.show();
		expect(logUi.meal).toBeNull();
	});
});
