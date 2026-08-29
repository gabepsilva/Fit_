import { beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import { render } from 'vitest-browser-svelte';
import type { Workout } from '$lib/domain/types';
import { tend } from '$lib/state/tend.svelte';
import ProgressPage from './+page.svelte';

/**
 * The one rule this screen owns: whether there is anything to chart at all.
 * A session can be walked out of with nothing ticked and is still filed, so
 * "are there any workouts?" is not the same question — four blank charts is a
 * worse answer than saying there is nothing yet.
 *
 * Named `page.svelte.spec.ts` rather than `+page.svelte.spec.ts` for the reason
 * given in `src/routes/exercise/page.svelte.spec.ts`: SvelteKit reserves the
 * `+` prefix inside a route directory.
 */

function filed(done: boolean): Workout {
	return {
		id: 'w-old',
		routineId: 'r-1',
		routineName: 'Push A',
		date: '2026-01-05',
		startedAt: 0,
		finishedAt: 1,
		exerciseIndex: 0,
		exercises: [
			{ name: 'Bench Press', group: 'Chest', note: '', sets: [{ reps: 10, load: 60, done }] }
		]
	};
}

/** The card that stands in for the charts when there is nothing to draw. */
function nothingYet() {
	return page.getByText(/nothing here to chart/);
}

/**
 * One of the four charts, standing for all of them: its heading is drawn
 * whether or not it has anything in it, so its absence means the charts were
 * not reached rather than that this one had no data.
 */
function charts() {
	return page.getByRole('heading', { name: 'Volume by muscle group', level: 2 });
}

beforeEach(() => {
	localStorage.clear();
	tend.resetAll();
});

describe('the training progress screen', () => {
	it('says there is nothing to chart before anything has been trained', async () => {
		await render(ProgressPage);
		await expect.element(nothingYet()).toBeInTheDocument();
		expect(charts().elements()).toHaveLength(0);
	});

	// The discriminating case: the session was filed, so a rule that read
	// `workouts.length === 0` would clear the empty state and draw four charts
	// with nothing in them.
	it('says so still when the only session filed logged nothing', async () => {
		tend.state.workouts = [filed(false)];
		await render(ProgressPage);
		await expect.element(nothingYet()).toBeInTheDocument();
		// Read once rather than retried: the claim is that the charts never
		// arrive, and a retried assertion would only prove they were not there yet.
		expect(charts().elements()).toHaveLength(0);
	});

	it('charts the session once a set was actually ticked', async () => {
		tend.state.workouts = [filed(true)];
		await render(ProgressPage);
		await expect.element(charts()).toBeInTheDocument();
		expect(nothingYet().elements()).toHaveLength(0);
	});
});
