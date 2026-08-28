import { beforeEach, describe, expect, it } from 'vitest';
import { logUi } from './log-ui.svelte';

beforeEach(() => {
	logUi.open = false;
	logUi.tab = 'type';
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

	it('starts on the typing tab', () => {
		expect(logUi.tab).toBe('type');
	});

	it('opens on the way in it was asked for', () => {
		logUi.show('photo');
		expect(logUi.tab).toBe('photo');
	});

	it('still opens when asked for a tab', () => {
		logUi.show('photo');
		expect(logUi.open).toBe(true);
	});

	it('falls back to typing when no way in is named', () => {
		logUi.show('scan');
		logUi.open = false;
		logUi.show();
		expect(logUi.tab).toBe('type');
	});
});
