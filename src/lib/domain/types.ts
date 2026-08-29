export type Provenance = 'usda' | 'off' | 'lab' | 'brand' | 'community';

/** Every meal a log entry can belong to, in the order the interface offers them. */
export const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

export type Meal = (typeof MEALS)[number];

/** The meals the week plan fills. Snacks are logged, never planned. */
export const PLANNED_MEALS = ['breakfast', 'lunch', 'dinner'] as const satisfies readonly Meal[];

export type PlannedMealSlot = (typeof PLANNED_MEALS)[number];

export type Goal = 'lose' | 'maintain' | 'gain' | 'glp1';

export type Activity = 'sedentary' | 'light' | 'moderate' | 'active';

export type Restriction =
	| 'vegetarian'
	| 'vegan'
	| 'gluten-free'
	| 'dairy-free'
	| 'nut-free'
	| 'no-pork'
	| 'low-sodium'
	| 'high-protein';

export type Micros = {
	fiber: number;
	sugar: number;
	sodium: number;
	potassium: number;
	iron: number;
	calcium: number;
	magnesium: number;
	zinc: number;
	vitaminA: number;
	vitaminC: number;
	vitaminD: number;
	vitaminB12: number;
	folate: number;
};

/**
 * The zero of `Micros`. Every micronutrient is declared, so adding one to the
 * type fails here until the new key has a value everywhere it is seeded.
 */
export const ZERO_MICROS: Micros = {
	fiber: 0,
	sugar: 0,
	sodium: 0,
	potassium: 0,
	iron: 0,
	calcium: 0,
	magnesium: 0,
	zinc: 0,
	vitaminA: 0,
	vitaminC: 0,
	vitaminD: 0,
	vitaminB12: 0,
	folate: 0
};

export type Food = {
	id: string;
	name: string;
	brand?: string | undefined;
	aliases: string[];
	barcode?: string | undefined;
	category: string;
	provenance: Provenance;
	servingLabel: string;
	grams: number;
	kcal: number;
	protein: number;
	carbs: number;
	fat: number;
	micros: Micros;
};

export type LogSource = 'manual' | 'text' | 'photo' | 'voice' | 'barcode' | 'plan';

export type LogItem = {
	id: string;
	foodId: string | null;
	date: string;
	meal: Meal;
	servings: number;
	source: LogSource;
	note?: string | undefined;
	name: string;
	kcal: number;
	protein: number;
	carbs: number;
	fat: number;
	micros: Micros;
	provenance?: Provenance | undefined;
	servingLabel: string;
	brand?: string | undefined;
};

export type WeightEntry = {
	id: string;
	date: string;
	kg: number;
};

export type Injection = {
	id: string;
	date: string;
	medication: 'semaglutide' | 'tirzepatide' | 'liraglutide' | 'other';
	doseMg: number;
	site: 'abdomen' | 'thigh' | 'arm';
	appetite: 1 | 2 | 3 | 4 | 5;
	sideEffects: string[];
	notes: string;
};

export type Profile = {
	id: string;
	name: string;
	goal: Goal;
	glp1: boolean;
	sex: 'female' | 'male' | 'other';
	age: number;
	heightCm: number;
	activity: Activity;
	restrictions: Restriction[];
	log: LogItem[];
	weights: WeightEntry[];
	injections: Injection[];
	calorieOverride: number | null;
	proteinOverride: number | null;
	fiberOverride: number | null;
};

export type PlannedMeal = {
	date: string;
	meal: PlannedMealSlot;
	recipeId: string;
	forProfileIds: string[];
};

export type ProposedItem = {
	foodId: string | null;
	query: string;
	name: string;
	servings: number;
	meal: Meal;
	confidence: number;
	note?: string | undefined;
};

// -- training -----------------------------------------------------------------

/** The muscle groups the exercise library is filed under, in menu order. */
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs'] as const;

export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export type LibraryExercise = {
	name: string;
	group: MuscleGroup;
};

/** One movement as a routine prescribes it: how many sets, at what reps and load. */
export type RoutineExercise = LibraryExercise & {
	sets: number;
	reps: number;
	/** Kilograms. Zero means bodyweight, and reads as an em dash rather than a 0. */
	load: number;
};

export type Routine = {
	id: string;
	name: string;
	/** Sessions a week, which is what decides the days the week strip marks. */
	freq: number;
	exercises: RoutineExercise[];
};

/** One set as it was actually performed, which is why `done` lives here and not on the routine. */
export type WorkoutSet = {
	reps: number;
	load: number;
	done: boolean;
};

export type WorkoutExercise = {
	name: string;
	group: MuscleGroup;
	sets: WorkoutSet[];
	note: string;
};

/**
 * One trip to the gym. Copied from the routine at the moment it starts rather
 * than referenced: editing a routine afterwards must not rewrite what was
 * lifted last Tuesday.
 */
export type Workout = {
	id: string;
	routineId: string;
	routineName: string;
	date: string;
	/** Epoch milliseconds, so elapsed time survives a reload rather than being counted in memory. */
	startedAt: number;
	finishedAt: number | null;
	exerciseIndex: number;
	exercises: WorkoutExercise[];
};

/** The routine id a planned week carries when the week is deliberately empty. */
export const REST_WEEK = 'rest';

export type PlannedWeek = {
	year: number;
	/** 1-based week of the training year — see `calendarWeeks`. */
	week: number;
	/** A routine id, or `REST_WEEK`. */
	routineId: string;
};

export type TendState = {
	onboarded: boolean;
	activeProfileId: string;
	profiles: Profile[];
	weekPlan: PlannedMeal[];
	pantry: string[];
	/**
	 * Training lives beside the household rather than inside a profile: meals are
	 * cooked for everyone at the table, but the gym log belongs to whoever holds
	 * the phone. Split it per profile when a second person starts lifting.
	 */
	routines: Routine[];
	trainingPlan: PlannedWeek[];
	/** Finished workouts, oldest first. The unfinished one is `activeWorkout`. */
	workouts: Workout[];
	activeWorkout: Workout | null;
};
