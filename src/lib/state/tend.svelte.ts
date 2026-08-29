import { buildAlexProfile, buildJordanProfile, HOUSEHOLD_PARTNER } from '$lib/domain/demo-seed';
import { ROUTINE_TEMPLATES } from '$lib/domain/exercise-catalog';
import {
	bumpField,
	exercisesFromLibrary,
	routinesFromTemplate,
	emptyRoutine,
	type BumpField
} from '$lib/domain/exercises';
import { seedTrainingPlan } from '$lib/domain/training-plan';
import { FOOD_BY_ID, scaleFood } from '$lib/domain/foods';
import { emptyProfile, isGlp1 } from '$lib/domain/profile';
import { recipeFits, RECIPES } from '$lib/domain/recipes';
import type {
	Injection,
	LogItem,
	PlannedMeal,
	PlannedMealSlot,
	Profile,
	Restriction,
	Routine,
	TendState,
	WeightEntry,
	Workout
} from '$lib/domain/types';
import { PLANNED_MEALS } from '$lib/domain/types';
import { addDaysISO, round1, startOfWeek, todayISO, uid } from '$lib/domain/utils';
import { currentExercise, workoutFromRoutine, workoutSetsDone } from '$lib/domain/workout';

export const STORAGE_KEY = 'tend.v1';

function emptyState(): TendState {
	return {
		onboarded: false,
		activeProfileId: '',
		profiles: [],
		weekPlan: [],
		pantry: [],
		routines: [],
		trainingPlan: [],
		workouts: [],
		activeWorkout: null
	};
}

/**
 * Re-derive an entry's nutrition for a new serving count. Entries backed by a
 * known food are recomputed from the source food; free-text entries (no
 * `foodId`, or a food that has since disappeared) can only be scaled by ratio.
 */
function rescale(item: LogItem, servings: number): LogItem {
	const source = item.foodId ? FOOD_BY_ID[item.foodId] : undefined;
	if (!source) {
		const ratio = item.servings === 0 ? 1 : servings / item.servings;
		return {
			...item,
			servings,
			kcal: Math.round(item.kcal * ratio),
			protein: round1(item.protein * ratio),
			carbs: round1(item.carbs * ratio),
			fat: round1(item.fat * ratio),
			micros: Object.fromEntries(
				Object.entries(item.micros).map(([k, v]) => [k, round1(v * ratio)])
			) as LogItem['micros']
		};
	}
	return { ...item, servings, ...scaleFood(source, servings) };
}

/**
 * Choose one recipe for a slot, favouring the least-used option so a week does
 * not become the same three dinners. The day and meal decide which of the
 * equally-unused candidates it lands on, so a rebuild is repeatable. Falls
 * back to any recipe for that meal when the filtered pool has none.
 */
function pickRecipe(
	usable: typeof RECIPES,
	meal: PlannedMealSlot,
	dayIndex: number,
	used: Record<string, number>
) {
	const offset = dayIndex * PLANNED_MEALS.length + PLANNED_MEALS.indexOf(meal);
	const candidates = usable.filter((r) => r.meal === meal);
	if (candidates.length) {
		const fewest = Math.min(...candidates.map((r) => used[r.id] ?? 0));
		const leastUsed = candidates.filter((r) => (used[r.id] ?? 0) === fewest);
		return leastUsed[offset % leastUsed.length];
	}
	const byMeal = RECIPES.filter((r) => r.meal === meal);
	return byMeal[dayIndex % Math.max(1, byMeal.length)] ?? usable[dayIndex % usable.length];
}

/** Union of every household member's restrictions, so one plan suits everyone. */
function householdRestrictions(profiles: Profile[]): Restriction[] {
	const out: Restriction[] = [];
	for (const p of profiles) {
		for (const r of p.restrictions) {
			if (!out.includes(r)) out.push(r);
		}
	}
	return out;
}

/**
 * The whole application state, as a rune-backed singleton.
 *
 * Persistence is deliberately explicit rather than automatic: `hydrate()` runs
 * once on the client, so a server render never touches `localStorage` and never
 * ships a half-restored state to the browser. Until then `hydrated` is false and
 * the shell can hold back rendering that would flash the wrong screen.
 *
 * This is the interim home for the data. When the SQLite backend lands, these
 * methods become the call sites that talk to it.
 */
export class TendStore {
	state = $state<TendState>(emptyState());
	hydrated = $state(false);

	get profile(): Profile | null {
		return this.state.profiles.find((p) => p.id === this.state.activeProfileId) ?? null;
	}

	// -- persistence ---------------------------------------------------------

	/** Restore from `localStorage`. Safe to call more than once; a no-op after the first. */
	hydrate() {
		if (this.hydrated) return;
		const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
		if (raw) {
			try {
				// Persisted state is merged over a fresh empty state so a payload
				// written by an older version cannot leave a key undefined.
				this.state = { ...emptyState(), ...(JSON.parse(raw) as Partial<TendState>) };
			} catch {
				// Corrupt payload: start clean rather than crash on every load.
				this.state = emptyState();
			}
		}
		this.hydrated = true;
	}

	/** Write the current state back to `localStorage`. */
	persist() {
		if (!this.hydrated) return;
		globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify($state.snapshot(this.state)));
	}

	// -- profiles ------------------------------------------------------------

	completeOnboarding(args: { profile: Profile; household: boolean; useSample: boolean }) {
		const { profile, household, useSample } = args;
		let profiles: Profile[];
		if (useSample) {
			const seeded = buildAlexProfile();
			profiles = [
				{
					...seeded,
					name: profile.name || 'Alex',
					goal: profile.goal,
					glp1: profile.glp1,
					sex: profile.sex,
					age: profile.age,
					heightCm: profile.heightCm,
					activity: profile.activity,
					restrictions: profile.restrictions
				}
			];
			if (household) profiles.push(buildJordanProfile());
		} else {
			profiles = [emptyProfile(profile)];
			if (household) {
				profiles.push(
					emptyProfile({ ...HOUSEHOLD_PARTNER, restrictions: [...HOUSEHOLD_PARTNER.restrictions] })
				);
			}
		}
		this.state.onboarded = true;
		this.state.profiles = profiles;
		this.state.activeProfileId = profiles[0]?.id ?? '';
		this.state.weekPlan = [];
		// `generatePlan` persists too; saying so here as well keeps onboarding
		// from silently depending on that to be written down at all.
		this.generatePlan();
		this.persist();
	}

	setActive(id: string) {
		this.state.activeProfileId = id;
		this.persist();
	}

	patchActive(fn: (p: Profile) => Profile) {
		this.state.profiles = this.state.profiles.map((p) =>
			p.id === this.state.activeProfileId ? fn($state.snapshot(p)) : p
		);
		this.persist();
	}

	addProfile(p: Profile) {
		this.state.profiles.push(p);
		this.persist();
	}

	// -- log -----------------------------------------------------------------

	addLogItems(items: LogItem[]) {
		const active = this.profile;
		if (!active) return;
		active.log.push(...items);
		this.persist();
	}

	updateLog(id: string, patch: Partial<LogItem>) {
		const active = this.profile;
		if (!active) return;
		active.log = active.log.map((item) => {
			if (item.id !== id) return item;
			const current: LogItem = $state.snapshot(item);
			// Rescale from the *current* entry: applying the patch first would make
			// the old and new serving counts identical, so the ratio would be 1 and
			// a custom entry's nutrition would never move.
			if (patch.servings != null && patch.servings !== current.servings) {
				return { ...rescale(current, patch.servings), ...patch };
			}
			return { ...current, ...patch };
		});
		this.persist();
	}

	removeLog(id: string) {
		const active = this.profile;
		if (!active) return;
		active.log = active.log.filter((i) => i.id !== id);
		this.persist();
	}

	// -- measurements --------------------------------------------------------

	addWeight(kg: number, date?: string) {
		const active = this.profile;
		if (!active) return;
		const d = date ?? todayISO();
		const entry: WeightEntry = { id: uid('w-'), date: d, kg };
		// One reading per day: a re-weigh replaces rather than appends, so the
		// adaptive-TDEE regression is not skewed by a single noisy morning.
		active.weights = [...active.weights.filter((w) => w.date !== d), entry].sort((a, b) =>
			a.date.localeCompare(b.date)
		);
		this.persist();
	}

	addInjection(inj: Omit<Injection, 'id'>) {
		const active = this.profile;
		if (!active) return;
		active.injections.push({ ...inj, id: uid('i-') });
		this.persist();
	}

	// -- plan ----------------------------------------------------------------

	generatePlan() {
		const restrictions = householdRestrictions(this.state.profiles);
		// GLP-1 appetite suppression makes protein the thing at risk, so the plan
		// treats it as a household-wide constraint.
		const anyGlp1 = this.state.profiles.some(isGlp1);
		if (anyGlp1 && !restrictions.includes('high-protein')) restrictions.push('high-protein');

		// An over-constrained household would otherwise get an empty week; a plan
		// that bends a restriction still beats no plan at all.
		const pool = RECIPES.filter((r) => recipeFits(r, restrictions));
		const usable = pool.length ? pool : RECIPES;

		const start = startOfWeek(todayISO());
		const used: Record<string, number> = {};
		const plan: PlannedMeal[] = [];
		const forProfileIds = this.state.profiles.map((p) => p.id);

		for (let d = 0; d < 7; d++) {
			const date = addDaysISO(start, d);
			for (const meal of PLANNED_MEALS) {
				const pick = pickRecipe(usable, meal, d, used);
				// A catalog with no recipe at all for this meal leaves the slot empty
				// rather than crashing the week.
				if (!pick) continue;
				used[pick.id] = (used[pick.id] ?? 0) + 1;
				plan.push({ date, meal, recipeId: pick.id, forProfileIds });
			}
		}
		this.state.weekPlan = plan;
		this.persist();
	}

	swapPlanned(date: string, meal: PlannedMealSlot) {
		const current = this.state.weekPlan.find((p) => p.date === date && p.meal === meal);
		const restrictions = householdRestrictions(this.state.profiles);
		const fits = RECIPES.filter((r) => r.meal === meal && recipeFits(r, restrictions));
		// Step to the next recipe in the pool rather than to its head: always
		// taking the first fit would make Swap alternate between two dinners.
		const pool = fits.length ? fits : RECIPES.filter((r) => r.meal === meal);
		const pick = pool[(pool.findIndex((r) => r.id === current?.recipeId) + 1) % pool.length];
		if (!pick || pick.id === current?.recipeId) return;
		this.state.weekPlan = this.state.weekPlan.map((p) =>
			p.date === date && p.meal === meal ? { ...p, recipeId: pick.id } : p
		);
		this.persist();
	}

	togglePantry(foodId: string) {
		this.state.pantry = this.state.pantry.includes(foodId)
			? this.state.pantry.filter((id) => id !== foodId)
			: [...this.state.pantry, foodId];
		this.persist();
	}

	// -- training ------------------------------------------------------------

	get activeWorkout(): Workout | null {
		return this.state.activeWorkout;
	}

	routine(id: string): Routine | undefined {
		return this.state.routines.find((r) => r.id === id);
	}

	/**
	 * Take a starter routine set, and a plan to put it on. A template without a
	 * plan would leave the calendar — and so the home screen — empty on the day
	 * someone decides to begin, which is the worst possible day for that.
	 */
	useTemplate(templateId: string) {
		const template = ROUTINE_TEMPLATES.find((t) => t.id === templateId);
		if (!template) return;
		const routines = routinesFromTemplate(template);
		this.state.routines = routines;
		this.state.trainingPlan = seedTrainingPlan(routines.map((r) => r.id));
		this.persist();
	}

	createRoutine(): Routine {
		const routine = emptyRoutine(uid('r-'));
		this.state.routines.push(routine);
		this.persist();
		return routine;
	}

	updateRoutine(id: string, patch: Partial<Pick<Routine, 'name' | 'freq'>>) {
		this.state.routines = this.state.routines.map((r) => (r.id === id ? { ...r, ...patch } : r));
		this.persist();
	}

	/** Removing a routine also clears the weeks that pointed at it, so the planner cannot name a routine that is gone. */
	removeRoutine(id: string) {
		this.state.routines = this.state.routines.filter((r) => r.id !== id);
		this.state.trainingPlan = this.state.trainingPlan.filter((p) => p.routineId !== id);
		this.persist();
	}

	private patchRoutine(id: string, fn: (r: Routine) => Routine) {
		this.state.routines = this.state.routines.map((r) =>
			r.id === id ? fn($state.snapshot(r)) : r
		);
		this.persist();
	}

	/** One tap on a stepper against a routine row. `direction` is +1 or -1. */
	bumpRoutineExercise(id: string, index: number, field: BumpField, direction: number) {
		this.patchRoutine(id, (r) => ({
			...r,
			exercises: r.exercises.map((e, i) =>
				i === index ? { ...e, [field]: bumpField(field, e[field], direction) } : e
			)
		}));
	}

	addExercises(id: string, names: string[]) {
		const added = exercisesFromLibrary(names);
		if (added.length === 0) return;
		this.patchRoutine(id, (r) => ({ ...r, exercises: [...r.exercises, ...added] }));
	}

	removeExercise(id: string, index: number) {
		this.patchRoutine(id, (r) => ({ ...r, exercises: r.exercises.filter((_, i) => i !== index) }));
	}

	/** Reordering is one step at a time; the first row has nowhere to go. */
	moveExerciseUp(id: string, index: number) {
		if (index <= 0) return;
		this.patchRoutine(id, (r) => {
			const exercises = [...r.exercises];
			const [moved] = exercises.splice(index, 1);
			if (moved) exercises.splice(index - 1, 0, moved);
			return { ...r, exercises };
		});
	}

	// -- training plan -------------------------------------------------------

	/** Assign one routine to a set of weeks. An empty list of weeks is a no-op, not a wipe. */
	planWeeks(year: number, weeks: number[], routineId: string) {
		if (weeks.length === 0) return;
		const untouched = this.state.trainingPlan.filter(
			(p) => p.year !== year || !weeks.includes(p.week)
		);
		this.state.trainingPlan = [
			...untouched,
			...weeks.map((week) => ({ year, week, routineId }))
		].sort((a, b) => a.year - b.year || a.week - b.week);
		this.persist();
	}

	// -- workouts ------------------------------------------------------------

	/**
	 * Begin a session. The routine is copied in rather than referenced, and an
	 * unfinished session is replaced rather than queued: two live sessions would
	 * both claim to be "the workout", and neither would be right.
	 */
	startWorkout(routineId: string): Workout | null {
		const routine = this.routine(routineId);
		if (!routine) return null;
		const workout = workoutFromRoutine(routine, {
			id: uid('w-'),
			date: todayISO(),
			startedAt: Date.now()
		});
		this.state.activeWorkout = workout;
		this.persist();
		return workout;
	}

	private patchWorkout(fn: (w: Workout) => Workout) {
		const current = this.state.activeWorkout;
		if (!current) return;
		this.state.activeWorkout = fn($state.snapshot(current));
		this.persist();
	}

	private patchCurrentExercise(
		fn: (e: Workout['exercises'][number]) => Workout['exercises'][number]
	) {
		this.patchWorkout((w) => ({
			...w,
			exercises: w.exercises.map((e, i) => (i === w.exerciseIndex ? fn(e) : e))
		}));
	}

	/** Tick or untick a set of the exercise on screen. */
	toggleSet(index: number) {
		this.patchCurrentExercise((e) => ({
			...e,
			sets: e.sets.map((s, i) => (i === index ? { ...s, done: !s.done } : s))
		}));
	}

	bumpSet(index: number, field: 'reps' | 'load', direction: number) {
		this.patchCurrentExercise((e) => ({
			...e,
			sets: e.sets.map((s, i) =>
				i === index ? { ...s, [field]: bumpField(field, s[field], direction) } : s
			)
		}));
	}

	/** One more set than the routine asked for, opened at the last set's numbers. */
	addSet() {
		this.patchCurrentExercise((e) => {
			const last = e.sets.at(-1) ?? { reps: 10, load: 0, done: false };
			return { ...e, sets: [...e.sets, { ...last, done: false }] };
		});
	}

	noteExercise(note: string) {
		this.patchCurrentExercise((e) => ({ ...e, note }));
	}

	/** Machine taken: the movement changes, the sets already logged do not. */
	swapExercise(name: string) {
		const replacement = exercisesFromLibrary([name])[0];
		if (!replacement) return;
		this.patchCurrentExercise((e) => ({ ...e, name: replacement.name, group: replacement.group }));
	}

	nextExercise() {
		this.patchWorkout((w) => ({
			...w,
			exerciseIndex: Math.min(w.exercises.length - 1, w.exerciseIndex + 1)
		}));
	}

	/**
	 * File the session. A session where nothing was ticked is dropped rather than
	 * filed: it would otherwise count as a completed week in the plan and as a
	 * zero in every average.
	 */
	finishWorkout(): Workout | null {
		const current = this.state.activeWorkout;
		if (!current) return null;
		if (workoutSetsDone(current) === 0) {
			this.discardWorkout();
			return null;
		}
		const finished: Workout = { ...$state.snapshot(current), finishedAt: Date.now() };
		this.state.workouts.push(finished);
		this.state.activeWorkout = null;
		this.persist();
		return finished;
	}

	discardWorkout() {
		this.state.activeWorkout = null;
		this.persist();
	}

	/** The exercise the session screen is on, or nothing when no session is running. */
	get currentExercise() {
		const workout = this.state.activeWorkout;
		return workout ? (currentExercise(workout) ?? null) : null;
	}

	// -- whole-state ---------------------------------------------------------

	resetAll() {
		this.state = emptyState();
		this.hydrated = true;
		this.persist();
	}
}

export const tend = new TendStore();
