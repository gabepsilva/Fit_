import type { GateFixture } from './fixtures';

/**
 * How the fixtures are split across hosted runners.
 *
 * The self-test used to run all of them on one runner, and its pool was
 * `min(4, cores / 4)` — one on a four-core hosted runner, so every fixture ran
 * in series and the job was the sum of the whole set. Splitting it by cost
 * class puts the nested mutation runs, the nested Playwright run and the cheap
 * static gates on runners of their own, and lets each runner install only what
 * its own fixtures need.
 *
 * Rules are ordered and the last one matches everything, so the groups
 * partition the fixture list by construction: a fixture added later lands in a
 * group whether or not anybody remembers this file, and none can fall out of
 * CI. `check:ci-contract` proves the workflow still runs every group.
 */
const rules: [string, (fixture: GateFixture) => boolean][] = [
	// Nested Stryker runs. Serial by their own `exclusive` flag, so they get a
	// runner to themselves and the full machine each.
	['mutation', (fixture) => fixture.exclusive === true],
	// What is left that boots a browser: a nested Playwright run and a nested
	// browser-mode Vitest run.
	['browser', (fixture) => fixture.browser === true],
	// Everything else: static gates and the Docker-based scanners.
	['static', () => true]
];

export const selfTestGroupNames = rules.map(([name]) => name);

function isSelfTestGroupName(value: string): boolean {
	return selfTestGroupNames.includes(value);
}

/** The one group a fixture belongs to: the first rule that matches it. */
function selfTestGroupOf(fixture: GateFixture): string {
	const matched = rules.find(([, matches]) => matches(fixture));
	if (matched === undefined) throw new Error(`No self-test group matches ${fixture.name}.`);
	return matched[0];
}

export function fixturesInGroup(
	fixtures: readonly GateFixture[],
	group: string
): readonly GateFixture[] {
	if (!isSelfTestGroupName(group)) {
		throw new Error(
			`Unknown self-test group: ${group}. Known groups: ${selfTestGroupNames.join(', ')}.`
		);
	}
	return fixtures.filter((fixture) => selfTestGroupOf(fixture) === group);
}

/** What a runner has to install before it can prove this group, derived from the fixtures in it. */
export function groupRequirements(
	fixtures: readonly GateFixture[],
	group: string
): { docker: boolean; browser: boolean } {
	const members = fixturesInGroup(fixtures, group);
	return {
		docker: members.some((fixture) => fixture.docker === true),
		browser: members.some((fixture) => fixture.browser === true)
	};
}
