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
import { emptyProfile } from '$lib/domain/profile';
import type {
	Injection,
	LoadUnit,
	LogItem,
	PlannedMealSlot,
	Profile,
	Routine,
	TendState,
	WeightEntry,
	Workout
} from '$lib/domain/types';
import {
	DEFAULT_LOAD_UNIT,
	DEFAULT_REST_SECONDS,
	MAX_REST_SECONDS,
	MIN_REST_SECONDS
} from '$lib/domain/types';
import { round1, todayISO, uid } from '$lib/domain/utils';
import { currentExercise, workoutFromRoutine } from '$lib/domain/workout';
import { buildWeekPlan, mealPool } from '$lib/domain/week-plan';

export const STORAGE_KEY = 'tend.v1';

/**
 * How long a burst of writes is allowed to share one save, in milliseconds.
 * Long enough that a held-down stepper writes once, short enough that the tab
 * can be closed a moment after the last tap without losing it.
 */
const PERSIST_WINDOW_MS = 200;

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
		activeWorkout: null,
		loadUnit: DEFAULT_LOAD_UNIT,
		restSeconds: DEFAULT_REST_SECONDS
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

	/** The timer of a save that has been asked for but not made yet. */
	private pendingWrite: ReturnType<typeof setTimeout> | null = null;
	private lifecycleFlushBound = false;

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

	/** Write the current state back to `localStorage`, now. */
	persist() {
		this.cancelPendingWrite();
		this.write();
	}

	/**
	 * Ask for a save, and let a burst of them share one. Ticking a set and holding
	 * a stepper fire faster than anyone can read, and every save serializes the
	 * whole state; doing that on each tap puts the cost in the tap handler. The
	 * window is a ceiling rather than a reset, so a stepper held down still
	 * reaches storage while it is held, instead of only when it is let go.
	 */
	private persistSoon() {
		if (!this.hydrated) return;
		this.bindLifecycleFlush();
		if (this.pendingWrite !== null) return;
		this.pendingWrite = setTimeout(() => {
			this.pendingWrite = null;
			this.write();
		}, PERSIST_WINDOW_MS);
	}

	/** Make a save the debounce is still holding. A no-op when nothing is waiting. */
	flushPersist() {
		if (this.pendingWrite === null) return;
		this.persist();
	}

	private write() {
		if (!this.hydrated) return;
		globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify($state.snapshot(this.state)));
	}

	private cancelPendingWrite() {
		if (this.pendingWrite === null) return;
		clearTimeout(this.pendingWrite);
		this.pendingWrite = null;
	}

	/**
	 * A phone can close, or background and then kill, a tab inside the save
	 * window. `pagehide` and a hidden document are the last moments a mobile
	 * browser reliably gives us; `beforeunload` is not one of them.
	 */
	private bindLifecycleFlush() {
		if (this.lifecycleFlushBound) return;
		if (typeof globalThis.addEventListener !== 'function') return;
		this.lifecycleFlushBound = true;
		globalThis.addEventListener('pagehide', () => this.flushPersist());
		globalThis.addEventListener('visibilitychange', () => {
			if (globalThis.document.visibilityState === 'hidden') this.flushPersist();
		});
	}

	// -- profiles ------------------------------------------------------------

	completeOnboarding(args: { profile: Profile; household: boolean; useSample: boolean }) {
		const { profile, household, useSample } = args;
		// A non-empty tuple: onboarding always produces the person doing it, so the
		// active profile below is a member rather than a maybe.
		let profiles: [Profile, ...Profile[]];
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
		this.state.activeProfileId = profiles[0].id;
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
		this.state.weekPlan = buildWeekPlan({ profiles: this.state.profiles, today: todayISO() });
		this.persist();
	}

	swapPlanned(date: string, meal: PlannedMealSlot) {
		const current = this.state.weekPlan.find((p) => p.date === date && p.meal === meal);
		const pool = mealPool(this.state.profiles, meal);
		// Step to the next recipe in the pool rather than to its head: always
		// taking the first fit would make Swap alternate between two dinners.
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

	/**
	 * One tap on a stepper against a routine row. `direction` is +1 or -1.
	 *
	 * The one field is written where it lives, rather than through a rebuilt
	 * routine: every other section and row of the sheet is looking at the same
	 * objects, and rebuilding would tell all of them that they had changed.
	 */
	bumpRoutineExercise(id: string, index: number, field: BumpField, direction: number) {
		const exercise = this.routine(id)?.exercises[index];
		if (!exercise) return;
		exercise[field] = bumpField(field, exercise[field], direction);
		this.persistSoon();
	}

	addExercises(id: string, names: string[]) {
		const routine = this.routine(id);
		const added = exercisesFromLibrary(names);
		if (!routine || added.length === 0) return;
		routine.exercises.push(...added);
		this.persist();
	}

	removeExercise(id: string, index: number) {
		const routine = this.routine(id);
		if (!routine || !routine.exercises[index]) return;
		routine.exercises.splice(index, 1);
		this.persist();
	}

	/** Reordering is one step at a time; the first row has nowhere to go. */
	moveExerciseUp(id: string, index: number) {
		if (index <= 0) return;
		const exercises = this.routine(id)?.exercises;
		if (!exercises?.[index]) return;
		const [moved] = exercises.splice(index, 1);
		if (moved) exercises.splice(index - 1, 0, moved);
		this.persist();
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

	// -- training settings ---------------------------------------------------

	/**
	 * Which unit every load is read in. Nothing already logged is touched: a load
	 * is the number that was on the bar, and 60 under a `lb` label is the same
	 * row of the log as 60 under `kg`. Converting instead would rewrite history
	 * every time somebody looked at the other unit.
	 */
	setLoadUnit(unit: LoadUnit) {
		this.state.loadUnit = unit;
		this.persist();
	}

	/**
	 * How long the rest between sets runs. Held to the range the control offers,
	 * so a stored value from elsewhere cannot open a session on a rest of zero.
	 * Saved through the debounce, because this is moved on a stepper.
	 */
	setRestSeconds(seconds: number) {
		this.state.restSeconds = Math.min(
			MAX_REST_SECONDS,
			Math.max(MIN_REST_SECONDS, Math.round(seconds))
		);
		this.persistSoon();
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
		// A routine with no movements opens a session with nothing to tick, no way
		// to reach a finish, and a clock counting nothing. There is no session to
		// start here; the caller is told so rather than shown an empty one.
		if (routine.exercises.length === 0) return null;
		const workout = workoutFromRoutine(routine, {
			id: uid('w-'),
			date: todayISO(),
			startedAt: Date.now()
		});
		this.state.activeWorkout = workout;
		this.persist();
		return workout;
	}

	/**
	 * The exercise the session is on, as the live object rather than a copy, so a
	 * change to one set is a change to that set and to nothing else. Rebuilding
	 * the workout instead would hand every exercise and every set a new identity
	 * on each tick, and the whole session screen would rerender for one checkbox.
	 */
	private get liveExercise(): Workout['exercises'][number] | null {
		const workout = this.state.activeWorkout;
		if (!workout) return null;
		return workout.exercises[workout.exerciseIndex] ?? null;
	}

	/** Tick or untick a set of the exercise on screen. */
	toggleSet(index: number) {
		const set = this.liveExercise?.sets[index];
		if (!set) return;
		set.done = !set.done;
		this.persistSoon();
	}

	bumpSet(index: number, field: 'reps' | 'load', direction: number) {
		const set = this.liveExercise?.sets[index];
		if (!set) return;
		set[field] = bumpField(field, set[field], direction);
		this.persistSoon();
	}

	/** One more set than the routine asked for, opened at the last set's numbers. */
	addSet() {
		const exercise = this.liveExercise;
		if (!exercise) return;
		const last = exercise.sets.at(-1) ?? { reps: 10, load: 0, done: false };
		exercise.sets.push({ reps: last.reps, load: last.load, done: false });
		this.persist();
	}

	noteExercise(note: string) {
		const exercise = this.liveExercise;
		if (!exercise) return;
		exercise.note = note;
		this.persistSoon();
	}

	/** Machine taken: the movement changes, the sets already logged do not. */
	swapExercise(name: string) {
		const replacement = exercisesFromLibrary([name])[0];
		const exercise = this.liveExercise;
		if (!replacement || !exercise) return;
		exercise.name = replacement.name;
		exercise.group = replacement.group;
		this.persist();
	}

	nextExercise() {
		const workout = this.state.activeWorkout;
		if (!workout) return;
		workout.exerciseIndex = Math.min(workout.exercises.length - 1, workout.exerciseIndex + 1);
		this.persist();
	}

	/**
	 * File the session, whether or not anything was ticked. Turning up and
	 * logging nothing is still a thing that happened, and the summary has words
	 * for it; dropping it silently would send someone back to the home screen as
	 * though they had never opened the door.
	 *
	 * Every aggregate reads through the sets that were ticked rather than
	 * through the count of filed sessions, so an empty one sets no record, draws
	 * no point on the trend, adds no volume, and does not count as a session the
	 * plan asked for.
	 */
	finishWorkout(): Workout | null {
		const current = this.state.activeWorkout;
		if (!current) return null;
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
