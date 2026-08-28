import { afterEach, describe, expect, it, vi } from 'vitest';
import { startDictation } from './dictation';

type Recognition = {
	lang: string;
	interimResults: boolean;
	start: () => void;
	stop: () => void;
	onresult:
		((ev: { results: Record<number, Record<number, { transcript: string }>> }) => void) | null;
	onerror: (() => void) | null;
	onend: (() => void) | null;
};

const globals = globalThis as unknown as {
	SpeechRecognition?: unknown;
	webkitSpeechRecognition?: unknown;
};

/** Chromium ships the prefixed API, so both spellings must go to simulate absence. */
function removeRecognition() {
	delete globals.SpeechRecognition;
	delete globals.webkitSpeechRecognition;
}

function installRecognition() {
	const instance: Recognition = {
		lang: '',
		interimResults: true,
		start: vi.fn(),
		stop: vi.fn(),
		onresult: null,
		onerror: null,
		onend: null
	};
	globals.SpeechRecognition = function SpeechRecognition() {
		return instance;
	};
	return instance;
}

const noopHandlers = { onresult: vi.fn(), onerror: vi.fn(), onend: vi.fn() };

const nativeWebkit = globals.webkitSpeechRecognition;

afterEach(() => {
	delete globals.SpeechRecognition;
	globals.webkitSpeechRecognition = nativeWebkit;
	vi.restoreAllMocks();
});

describe('startDictation', () => {
	it('returns null when the browser cannot dictate', () => {
		removeRecognition();
		expect(startDictation(noopHandlers)).toBeNull();
	});

	it('starts recognition when the browser can', () => {
		const rec = installRecognition();
		startDictation(noopHandlers);
		expect(rec.start).toHaveBeenCalled();
	});

	it('asks only for settled results, not partial ones', () => {
		const rec = installRecognition();
		startDictation(noopHandlers);
		expect(rec.interimResults).toBe(false);
	});

	it('hands the transcript back to the caller', () => {
		const rec = installRecognition();
		const onresult = vi.fn();
		startDictation({ ...noopHandlers, onresult });
		rec.onresult?.({ results: { 0: { 0: { transcript: 'two eggs' } } } });
		expect(onresult).toHaveBeenCalledWith('two eggs');
	});

	it('reports an empty transcript rather than throwing on an empty result', () => {
		const rec = installRecognition();
		const onresult = vi.fn();
		startDictation({ ...noopHandlers, onresult });
		rec.onresult?.({ results: {} });
		expect(onresult).toHaveBeenCalledWith('');
	});

	it('stops recognition when asked', () => {
		const rec = installRecognition();
		startDictation(noopHandlers)?.stop();
		expect(rec.stop).toHaveBeenCalled();
	});

	it('forwards errors', () => {
		const rec = installRecognition();
		const onerror = vi.fn();
		startDictation({ ...noopHandlers, onerror });
		rec.onerror?.();
		expect(onerror).toHaveBeenCalled();
	});
});
