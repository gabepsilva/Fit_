/**
 * Hand a generated file to the browser. Nothing is uploaded: the bytes are
 * already here, and the object URL points at this tab's own memory.
 *
 * The anchor is put in the document before it is clicked, because not every
 * engine honours a click on a detached one, and the URL is released on a later
 * tick — revoking it in the same one can cancel the download before it starts.
 */
export function download(filename: string, content: string, type: string) {
	const url = URL.createObjectURL(new Blob([content], { type }));
	const anchor = document.createElement('a');
	anchor.href = url;
	anchor.download = filename;
	document.body.append(anchor);
	anchor.click();
	anchor.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
