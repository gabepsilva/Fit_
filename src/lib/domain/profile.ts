import type { Profile } from './types';
import { uid } from './utils';

/** The only fields a GLP-1 calculation reads. */
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

/** GLP-1 is set two ways (`glp1` flag or `glp1` goal); this is the single check. */
export function isGlp1(profile: Glp1Aware): boolean {
	return profile?.glp1 === true || profile?.goal === 'glp1';
}

/** GLP-1 users eat part-portions, so the step is a quarter. */
export function servingStep(profile: Glp1Aware): number {
	return isGlp1(profile) ? 0.25 : 0.5;
}

/** Starting servings for a new item: 0.5 under GLP-1, else 1. */
export function defaultServings(profile: Glp1Aware): number {
	return isGlp1(profile) ? 0.5 : 1;
}
