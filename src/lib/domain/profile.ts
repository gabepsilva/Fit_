import type { Profile } from './types';
import { uid } from './utils';

/** Everything a calculation needs to know about GLP-1, and nothing more. */
type Glp1Aware = Pick<Profile, 'glp1' | 'goal'> | null | undefined;

export function emptyProfile(partial: Partial<Profile> & { name: string }): Profile {
	return {
		id: uid('p-'),
		goal: 'lose',
		glp1: false,
		sex: 'female',
		age: 32,
		heightCm: 168,
		activity: 'light',
		restrictions: [],
		log: [],
		weights: [],
		injections: [],
		calorieOverride: null,
		proteinOverride: null,
		fiberOverride: null,
		...partial
	};
}

/**
 * GLP-1 is stated two ways — the switch and the goal — and every calculation
 * downstream means the same thing by them. Asking here keeps the two spellings
 * from drifting apart at each call site.
 */
export function isGlp1(profile: Glp1Aware): boolean {
	return profile?.glp1 === true || profile?.goal === 'glp1';
}

/** GLP-1 users routinely eat part-portions, so the stepper moves in quarters. */
export function servingStep(profile: Glp1Aware): number {
	return isGlp1(profile) ? 0.25 : 0.5;
}

/** What a freshly proposed item starts at, for the same reason. */
export function defaultServings(profile: Glp1Aware): number {
	return isGlp1(profile) ? 0.5 : 1;
}
