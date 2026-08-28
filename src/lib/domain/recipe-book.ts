import type { Meal, Restriction } from './types';

type RecipeIngredient = {
	foodId: string;
	servings: number;
};

export type Recipe = {
	id: string;
	name: string;
	meal: Exclude<Meal, 'snack'>;
	minutes: number;
	servings: number;
	ingredients: RecipeIngredient[];
	/** Restrictions this recipe *satisfies* (safe to serve). */
	suits: Restriction[];
	notes: string;
};

export const RECIPES: Recipe[] = [
	{
		id: 'yogurt-bowl',
		name: 'Greek yogurt, berries, chia',
		meal: 'breakfast',
		minutes: 5,
		servings: 1,
		ingredients: [
			{ foodId: 'greek-yogurt', servings: 1 },
			{ foodId: 'blueberries', servings: 0.5 },
			{ foodId: 'chia', servings: 1 }
		],
		suits: ['vegetarian', 'gluten-free', 'nut-free', 'no-pork', 'high-protein'],
		notes: 'Cold, five minutes, high protein.'
	},
	{
		id: 'eggs-toast',
		name: 'Eggs on sourdough',
		meal: 'breakfast',
		minutes: 10,
		servings: 1,
		ingredients: [
			{ foodId: 'egg-large', servings: 2 },
			{ foodId: 'sourdough', servings: 1 },
			{ foodId: 'avocado', servings: 0.5 }
		],
		suits: ['vegetarian', 'nut-free', 'no-pork'],
		notes: 'The weekday default.'
	},
	{
		id: 'veggie-omelette',
		name: 'Veggie omelette',
		meal: 'breakfast',
		minutes: 12,
		servings: 1,
		ingredients: [
			{ foodId: 'egg-large', servings: 3 },
			{ foodId: 'spinach', servings: 1 },
			{ foodId: 'feta', servings: 0.5 },
			{ foodId: 'tomato', servings: 0.5 }
		],
		suits: ['vegetarian', 'gluten-free', 'nut-free', 'no-pork', 'high-protein'],
		notes: 'Soft vegetables, no browning required.'
	},
	{
		id: 'overnight-oats',
		name: 'Overnight oats',
		meal: 'breakfast',
		minutes: 5,
		servings: 1,
		ingredients: [
			{ foodId: 'oats', servings: 1 },
			{ foodId: 'milk-2', servings: 0.75 },
			{ foodId: 'chia', servings: 1 },
			{ foodId: 'banana', servings: 0.5 }
		],
		suits: ['vegetarian', 'nut-free', 'no-pork'],
		notes: 'Assemble the night before.'
	},
	{
		id: 'cottage-berries',
		name: 'Cottage cheese and strawberries',
		meal: 'breakfast',
		minutes: 3,
		servings: 1,
		ingredients: [
			{ foodId: 'cottage-cheese', servings: 0.75 },
			{ foodId: 'strawberries', servings: 1 }
		],
		suits: ['vegetarian', 'gluten-free', 'nut-free', 'no-pork', 'high-protein'],
		notes: 'Small-portion friendly.'
	},
	{
		id: 'protein-smoothie',
		name: 'Berry protein smoothie',
		meal: 'breakfast',
		minutes: 5,
		servings: 1,
		ingredients: [
			{ foodId: 'whey', servings: 1 },
			{ foodId: 'milk-2', servings: 1 },
			{ foodId: 'blueberries', servings: 0.5 },
			{ foodId: 'spinach', servings: 0.5 }
		],
		suits: ['gluten-free', 'nut-free', 'no-pork', 'high-protein'],
		notes: 'Drinkable when appetite is low.'
	},
	{
		id: 'chicken-rice-broccoli',
		name: 'Chicken, rice, broccoli',
		meal: 'lunch',
		minutes: 25,
		servings: 1,
		ingredients: [
			{ foodId: 'chicken-breast', servings: 1.5 },
			{ foodId: 'brown-rice', servings: 1 },
			{ foodId: 'broccoli', servings: 1 },
			{ foodId: 'olive-oil', servings: 0.5 }
		],
		suits: ['gluten-free', 'dairy-free', 'nut-free', 'no-pork', 'high-protein'],
		notes: 'The honest default bowl.'
	},
	{
		id: 'salmon-sweet-potato',
		name: 'Salmon and sweet potato',
		meal: 'dinner',
		minutes: 30,
		servings: 1,
		ingredients: [
			{ foodId: 'salmon', servings: 1.4 },
			{ foodId: 'sweet-potato', servings: 1 },
			{ foodId: 'asparagus', servings: 1 },
			{ foodId: 'olive-oil', servings: 0.5 }
		],
		suits: ['gluten-free', 'dairy-free', 'nut-free', 'no-pork', 'high-protein'],
		notes: 'Sheet-pan. Quiet dinner.'
	},
	{
		id: 'tofu-stir-fry',
		name: 'Tofu stir-fry',
		meal: 'dinner',
		minutes: 20,
		servings: 1,
		ingredients: [
			{ foodId: 'tofu-firm', servings: 1.5 },
			{ foodId: 'brown-rice', servings: 0.75 },
			{ foodId: 'broccoli', servings: 1 },
			{ foodId: 'bell-pepper', servings: 1 },
			{ foodId: 'olive-oil', servings: 1 }
		],
		suits: ['vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 'no-pork'],
		notes: 'Crisp tofu, whatever vegetables you have.'
	},
	{
		id: 'lentil-soup',
		name: 'Lentil soup',
		meal: 'lunch',
		minutes: 35,
		servings: 2,
		ingredients: [
			{ foodId: 'lentils', servings: 1.5 },
			{ foodId: 'carrot', servings: 1 },
			{ foodId: 'spinach', servings: 1 },
			{ foodId: 'olive-oil', servings: 1 }
		],
		suits: [
			'vegetarian',
			'vegan',
			'gluten-free',
			'dairy-free',
			'nut-free',
			'no-pork',
			'high-protein'
		],
		notes: 'Batch once, eat twice.'
	},
	{
		id: 'turkey-taco',
		name: 'Turkey taco bowl',
		meal: 'dinner',
		minutes: 20,
		servings: 1,
		ingredients: [
			{ foodId: 'ground-turkey', servings: 1.2 },
			{ foodId: 'brown-rice', servings: 0.75 },
			{ foodId: 'black-beans', servings: 0.5 },
			{ foodId: 'salsa', servings: 2 },
			{ foodId: 'avocado', servings: 0.5 }
		],
		suits: ['gluten-free', 'dairy-free', 'nut-free', 'no-pork', 'high-protein'],
		notes: 'Build in a bowl, skip the shell if you want.'
	},
	{
		id: 'chickpea-pasta',
		name: 'Chickpeas, greens, and pasta',
		meal: 'dinner',
		minutes: 20,
		servings: 1,
		ingredients: [
			{ foodId: 'pasta', servings: 0.75 },
			{ foodId: 'chickpeas', servings: 0.75 },
			{ foodId: 'spinach', servings: 1 },
			{ foodId: 'parmesan', servings: 2 },
			{ foodId: 'olive-oil', servings: 1 }
		],
		suits: ['vegetarian', 'nut-free', 'no-pork'],
		notes: 'Pantry dinner.'
	},
	{
		id: 'quinoa-salad',
		name: 'Quinoa salad with feta',
		meal: 'lunch',
		minutes: 15,
		servings: 1,
		ingredients: [
			{ foodId: 'quinoa', servings: 1 },
			{ foodId: 'cucumber', servings: 0.5 },
			{ foodId: 'tomato', servings: 1 },
			{ foodId: 'feta', servings: 1 },
			{ foodId: 'olive-oil', servings: 0.5 }
		],
		suits: ['vegetarian', 'gluten-free', 'nut-free', 'no-pork'],
		notes: 'Holds well in the fridge.'
	},
	{
		id: 'shrimp-veg',
		name: 'Garlic shrimp and zucchini',
		meal: 'dinner',
		minutes: 15,
		servings: 1,
		ingredients: [
			{ foodId: 'shrimp', servings: 1.5 },
			{ foodId: 'zucchini', servings: 1 },
			{ foodId: 'olive-oil', servings: 1 }
		],
		suits: ['gluten-free', 'dairy-free', 'nut-free', 'no-pork', 'low-sodium', 'high-protein'],
		notes: 'Light when appetite is quiet.'
	},
	{
		id: 'tempeh-bowl',
		name: 'Tempeh grain bowl',
		meal: 'lunch',
		minutes: 20,
		servings: 1,
		ingredients: [
			{ foodId: 'tempeh', servings: 1 },
			{ foodId: 'quinoa', servings: 0.75 },
			{ foodId: 'mixed-greens', servings: 1 },
			{ foodId: 'avocado', servings: 0.5 }
		],
		suits: [
			'vegetarian',
			'vegan',
			'gluten-free',
			'dairy-free',
			'nut-free',
			'no-pork',
			'high-protein'
		],
		notes: 'Works for mixed-diet households.'
	},
	{
		id: 'tuna-salad',
		name: 'Tuna salad plate',
		meal: 'lunch',
		minutes: 8,
		servings: 1,
		ingredients: [
			{ foodId: 'tuna-canned', servings: 0.5 },
			{ foodId: 'mixed-greens', servings: 1 },
			{ foodId: 'wheat-bread', servings: 1 },
			{ foodId: 'mayo', servings: 0.5 }
		],
		suits: ['dairy-free', 'nut-free', 'no-pork', 'high-protein'],
		notes: 'Desk lunch.'
	}
];
