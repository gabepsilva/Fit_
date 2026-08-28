import { buildAlexProfile, buildJordanProfile, emptyProfile } from '$lib/domain/demo-seed';
import { FOOD_BY_ID, scaleFood } from '$lib/domain/foods';
import { recipeFits, RECIPES } from '$lib/domain/recipes';
import type {
	Injection,
	LogItem,
	LogSource,
	Meal,
	PlannedMeal,
	Profile,
	Restriction,
	TendState,
	WeightEntry
} from '$lib/domain/types';
import { addDaysISO, startOfWeek, todayISO, uid } from '$lib/domain/utils';

export const STORAGE_KEY = 'tend.v1';

function emptyState(): TendState {
	return {
		onboarded: false,
		activeProfileId: '',
		profiles: [],
		weekPlan: [],
		pantry: []
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
			protein: Math.round(item.protein * ratio * 10) / 10,
			carbs: Math.round(item.carbs * ratio * 10) / 10,
			fat: Math.round(item.fat * ratio * 10) / 10,
			micros: Object.fromEntries(
				Object.entries(item.micros).map(([k, v]) => [k, Math.round(v * ratio * 10) / 10])
			) as LogItem['micros']
		};
	}
	const scaled = scaleFood(source, servings);
	return {
		...item,
		servings,
		name: scaled.name,
		kcal: scaled.kcal,
		protein: scaled.protein,
		carbs: scaled.carbs,
		fat: scaled.fat,
		micros: scaled.micros,
		provenance: scaled.provenance,
		servingLabel: scaled.servingLabel,
		brand: scaled.brand
	};
}

export type LogFromFood = {
	foodId: string;
	servings: number;
	meal: Meal;
	date: string;
	source: LogSource;
	note?: string | undefined;
};

export function logFromFood({ foodId, servings, meal, date, source, note }: LogFromFood): LogItem {
	const food = FOOD_BY_ID[foodId];
	if (!food) throw new Error(`Unknown food: ${foodId}`);
	const scaled = scaleFood(food, servings);
	return {
		id: uid('l-'),
		foodId,
		date,
		meal,
		servings,
		source,
		note,
		name: scaled.name,
		kcal: scaled.kcal,
		protein: scaled.protein,
		carbs: scaled.carbs,
		fat: scaled.fat,
		micros: scaled.micros,
		provenance: scaled.provenance,
		servingLabel: scaled.servingLabel,
		brand: scaled.brand
	};
}

const PLANNED_MEALS: PlannedMeal['meal'][] = ['breakfast', 'lunch', 'dinner'];

/**
 * Choose one recipe for a slot, favouring the least-used option so a week does
 * not become the same three dinners. Falls back to any recipe for that meal
 * when the filtered pool has none.
 */
function pickRecipe(
	usable: typeof RECIPES,
	meal: PlannedMeal['meal'],
	dayIndex: number,
	used: Record<string, number>
) {
	const candidates = usable
		.filter((r) => r.meal === meal)
		.sort((a, b) => (used[a.id] ?? 0) - (used[b.id] ?? 0));
	const offset = dayIndex * 3 + PLANNED_MEALS.indexOf(meal);
	if (candidates.length) return candidates[offset % candidates.length];
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
			const me = emptyProfile(profile);
			if (me.weights.length === 0) {
				const kg = profile.weights.at(-1)?.kg;
				if (kg) me.weights = [{ id: uid('w-'), date: todayISO(), kg }];
			}
			profiles = [me];
			if (household) {
				profiles.push(
					emptyProfile({
						name: 'Jordan',
						goal: 'maintain',
						sex: 'male',
						age: 36,
						heightCm: 178,
						activity: 'moderate',
						restrictions: ['vegetarian']
					})
				);
			}
		}
		this.state.onboarded = true;
		this.state.profiles = profiles;
		this.state.activeProfileId = profiles[0]?.id ?? '';
		this.state.weekPlan = [];
		this.generatePlan();
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

	removeProfile(id: string) {
		this.state.profiles = this.state.profiles.filter((p) => p.id !== id);
		if (this.state.activeProfileId === id) {
			this.state.activeProfileId = this.state.profiles[0]?.id ?? '';
		}
		this.persist();
	}

	// -- log -----------------------------------------------------------------

	addLogFromFood(args: {
		foodId: string;
		servings: number;
		meal: Meal;
		date?: string;
		source?: LogSource;
		note?: string;
	}) {
		this.addLogItems([
			logFromFood({
				...args,
				date: args.date ?? todayISO(),
				source: args.source ?? 'manual'
			})
		]);
	}

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

	removeInjection(id: string) {
		const active = this.profile;
		if (!active) return;
		active.injections = active.injections.filter((i) => i.id !== id);
		this.persist();
	}

	// -- plan ----------------------------------------------------------------

	setPlan(plan: PlannedMeal[]) {
		this.state.weekPlan = plan;
		this.persist();
	}

	generatePlan() {
		const restrictions = householdRestrictions(this.state.profiles);
		// GLP-1 appetite suppression makes protein the thing at risk, so the plan
		// treats it as a household-wide constraint.
		const anyGlp1 = this.state.profiles.some((p) => p.glp1 || p.goal === 'glp1');
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

	swapPlanned(date: string, meal: PlannedMeal['meal']) {
		const current = this.state.weekPlan.find((p) => p.date === date && p.meal === meal);
		const restrictions = householdRestrictions(this.state.profiles);
		const fits = RECIPES.filter(
			(r) => r.meal === meal && recipeFits(r, restrictions) && r.id !== current?.recipeId
		);
		const pick = fits[0] ?? RECIPES.find((r) => r.meal === meal && r.id !== current?.recipeId);
		if (!pick) return;
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

	// -- whole-state ---------------------------------------------------------

	resetAll() {
		this.state = emptyState();
		this.hydrated = true;
		this.persist();
	}

	replaceState(s: TendState) {
		this.state = { ...emptyState(), ...s };
		this.hydrated = true;
		this.persist();
	}
}

export const tend = new TendStore();
