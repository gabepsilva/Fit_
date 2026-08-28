import { beforeEach, describe, expect, it } from 'vitest';
import { logUi } from './log-ui.svelte';

beforeEach(() => {
	logUi.open = false;
});

describe('logUi', () => {
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
});
