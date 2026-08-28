/**
 * A thin wrapper over the Web Speech API, which is prefixed on WebKit and
 * absent entirely on some Android browsers. Callers get `null` when the browser
 * cannot dictate, so they can fall back to typing rather than failing.
 */

type SpeechRecognitionLike = {
	lang: string;
	interimResults: boolean;
	start: () => void;
	stop: () => void;
	onresult: ((ev: SpeechResultLike) => void) | null;
	onerror: (() => void) | null;
	onend: (() => void) | null;
};

type SpeechResultLike = {
	results: { [index: number]: { [index: number]: { transcript: string } } };
};

export type Dictation = { stop: () => void };

type Handlers = {
	onresult: (transcript: string) => void;
	onerror: () => void;
	onend: () => void;
};

export function startDictation(handlers: Handlers): Dictation | null {
	const w = globalThis as unknown as {
		SpeechRecognition?: new () => SpeechRecognitionLike;
		webkitSpeechRecognition?: new () => SpeechRecognitionLike;
	};
	const Recognition = w.SpeechRecognition ?? w.webkitSpeechRecognition;
	if (!Recognition) return null;

	const rec = new Recognition();
	rec.lang = 'en-US';
	// Only the settled transcript is useful; partial results would re-parse on
	// every syllable.
	rec.interimResults = false;
	rec.onresult = (ev) => handlers.onresult(ev.results[0]?.[0]?.transcript ?? '');
	rec.onerror = handlers.onerror;
	rec.onend = handlers.onend;
	rec.start();
	return { stop: () => rec.stop() };
}
