// Prefixed on WebKit, absent on some Android browsers; `null` means fall back to typing.

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
	// Only the settled transcript matters; partials would re-parse every syllable.
	rec.interimResults = false;
	rec.onresult = (ev) => handlers.onresult(ev.results[0]?.[0]?.transcript ?? '');
	rec.onerror = handlers.onerror;
	rec.onend = handlers.onend;
	rec.start();
	return { stop: () => rec.stop() };
}
