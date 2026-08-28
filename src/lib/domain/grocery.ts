import { FOOD_BY_ID } from './foods';
import { groceryAisle, RECIPE_BY_ID } from './recipes';
import type { PlannedMeal } from './types';

export type GroceryItem = {
	foodId: string;
	name: string;
	aisle: string;
	servings: number;
	servingLabel: string;
	inPantry: boolean;
};

export function buildGrocery(plan: PlannedMeal[], pantry: string[]): GroceryItem[] {
	const map = new Map<string, number>();
	for (const slot of plan) {
		const recipe = RECIPE_BY_ID[slot.recipeId];
		if (!recipe) continue;
		for (const ing of recipe.ingredients) {
			const per = ing.servings / recipe.servings;
			map.set(ing.foodId, (map.get(ing.foodId) ?? 0) + per);
		}
	}
	const items: GroceryItem[] = [];
	for (const [foodId, servings] of map) {
		const food = FOOD_BY_ID[foodId];
		if (!food) continue;
		items.push({
			foodId,
			name: food.name,
			aisle: groceryAisle(food.category),
			servings: Math.round(servings * 4) / 4,
			servingLabel: food.servingLabel,
			inPantry: pantry.includes(foodId)
		});
	}
	const aisleOrder = [
		'Produce',
		'Meat, fish & alternatives',
		'Dairy',
		'Grains & bakery',
		'Pantry',
		'Drinks',
		'Packaged',
		'Other'
	];
	items.sort((a, b) => {
		const d = aisleOrder.indexOf(a.aisle) - aisleOrder.indexOf(b.aisle);
		return d !== 0 ? d : a.name.localeCompare(b.name);
	});
	return items;
}
