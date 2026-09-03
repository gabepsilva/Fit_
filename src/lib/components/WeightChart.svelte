<script lang="ts">
	import type { WeightEntry } from '$lib/domain/types';
	import { monthDay } from '$lib/domain/utils';

	let { weights }: { weights: WeightEntry[] } = $props();

	const WIDTH = 320;
	const HEIGHT = 140;
	const PAD = { top: 10, right: 8, bottom: 20, left: 34 };

	const points = $derived([...weights].sort((a, b) => a.date.localeCompare(b.date)));

	const geometry = $derived.by(() => {
		const first = points[0];
		const last = points.at(-1);
		if (!first || !last || points.length < 2) return null;
		const values = points.map((p) => p.kg);
		// Pad the domain so a flat trend does not hug the top or bottom edge.
		const min = Math.min(...values) - 0.6;
		const max = Math.max(...values) + 0.6;
		const span = max - min || 1;
		const plotW = WIDTH - PAD.left - PAD.right;
		const plotH = HEIGHT - PAD.top - PAD.bottom;

		const xy = points.map((p, i) => ({
			x: PAD.left + (i / (points.length - 1)) * plotW,
			y: PAD.top + (1 - (p.kg - min) / span) * plotH,
			entry: p
		}));

		return {
			path: xy.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '),
			gridlines: [0, 0.5, 1].map((t) => ({
				y: PAD.top + t * plotH,
				label: (max - t * span).toFixed(1)
			})),
			firstDate: monthDay(first.date),
			lastDate: monthDay(last.date),
			caption:
				`Weight trend from ${monthDay(first.date)} to ${monthDay(last.date)}, ` +
				`${first.kg} to ${last.kg} kilograms`
		};
	});
</script>

{#if geometry}
	<svg
		viewBox="0 0 {WIDTH} {HEIGHT}"
		class="h-full w-full"
		role="img"
		aria-label={geometry.caption}
	>
		{#each geometry.gridlines as line (line.y)}
			<line
				x1={PAD.left}
				x2={WIDTH - PAD.right}
				y1={line.y}
				y2={line.y}
				stroke="var(--color-border)"
			/>
			<text
				x={PAD.left - 6}
				y={line.y + 4}
				text-anchor="end"
				font-size="11"
				fill="var(--color-muted-foreground)"
			>
				{line.label}
			</text>
		{/each}
		<path d={geometry.path} fill="none" stroke="var(--color-primary)" stroke-width="2" />
		<text x={PAD.left} y={HEIGHT - 4} font-size="11" fill="var(--color-muted-foreground)">
			{geometry.firstDate}
		</text>
		<text
			x={WIDTH - PAD.right}
			y={HEIGHT - 4}
			text-anchor="end"
			font-size="11"
			fill="var(--color-muted-foreground)"
		>
			{geometry.lastDate}
		</text>
	</svg>
{:else}
	<p class="text-muted-foreground flex h-full items-center justify-center text-sm">
		Log a few weigh-ins to see the trend.
	</p>
{/if}
