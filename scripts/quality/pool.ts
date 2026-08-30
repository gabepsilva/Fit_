/**
 * Run `work` over `items`, `limit` at a time, keeping the input order in the
 * returned results. Shared by the gate runner and the gate self-test: both
 * schedule independent child processes and both have to report in plan order
 * rather than completion order.
 */
export async function pooled<T, R>(
	items: readonly T[],
	limit: number,
	work: (item: T) => Promise<R>
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let next = 0;
	const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
		while (next < items.length) {
			const index = next++;
			const item = items[index];
			if (item === undefined) return;
			results[index] = await work(item);
		}
	});
	await Promise.all(workers);
	return results;
}
