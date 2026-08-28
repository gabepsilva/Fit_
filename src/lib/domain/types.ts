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

export type TendState = {
	onboarded: boolean;
	activeProfileId: string;
	profiles: Profile[];
	weekPlan: PlannedMeal[];
	pantry: string[];
};
