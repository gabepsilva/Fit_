import { afterEach, describe, expect, it, vi } from 'vitest';
import { download } from './download';

type Clicked = { filename: string; href: string; connected: boolean };

// A real click would save a file, so the stub snapshots the anchor at click time.
function captureClick() {
	const seen: Clicked[] = [];
	vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
		this: HTMLAnchorElement
	) {
		seen.push({ filename: this.download, href: this.href, connected: this.isConnected });
	});
	return seen;
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('download', () => {
	it('clicks a link carrying the given filename', () => {
		const seen = captureClick();
		download('fit-2026-06-01.json', '{}', 'application/json');
		expect(seen[0]?.filename).toBe('fit-2026-06-01.json');
	});

	it('points the link at an object URL for the content', () => {
		const seen = captureClick();
		download('fit.csv', 'date,name\n', 'text/csv');
		expect(seen[0]?.href.startsWith('blob:')).toBe(true);
	});

	it('has the link in the document when it is clicked', () => {
		const seen = captureClick();
		download('fit.csv', 'x', 'text/csv');
		expect(seen[0]?.connected).toBe(true);
	});

	it('leaves no link behind in the document', () => {
		captureClick();
		download('fit.csv', 'x', 'text/csv');
		expect(document.querySelectorAll('a[download]')).toHaveLength(0);
	});

	it('releases the object URL once the download has started, not before', async () => {
		const seen = captureClick();
		const revoke = vi.spyOn(URL, 'revokeObjectURL');
		download('fit.csv', 'x', 'text/csv');
		const url = seen[0]?.href ?? '';
		// Revoking in the same tick as the click can cancel the download.
		expect(revoke).not.toHaveBeenCalledWith(url);
		await vi.waitFor(() => expect(revoke).toHaveBeenCalledWith(url));
	});
});
