import { FOODS } from './food-catalog';
import type { Food, Micros } from './types';
import { round1 } from './utils';

// Seed rows live in `./food-catalog`; re-exported here so mutation testing targets behavior, not data.
export { CATEGORY_LABEL, FOODS, PROVENANCE_LABEL } from './food-catalog';

export const FOOD_BY_ID: Record<string, Food> = Object.fromEntries(
	FOODS.map((food) => [food.id, food])
);

export const FOOD_BY_BARCODE: Record<string, Food> = Object.fromEntries(
	FOODS.flatMap((food) => (food.barcode ? [[food.barcode, food] as const] : []))
);

export function scaleFood(food: Food, servings: number) {
	const s = servings;
	const micros = Object.fromEntries(
		Object.entries(food.micros).map(([k, v]) => [k, round1(v * s)])
	) as Micros;
	return {
		name: food.name,
		brand: food.brand,
		kcal: Math.round(food.kcal * s),
		protein: round1(food.protein * s),
		carbs: round1(food.carbs * s),
		fat: round1(food.fat * s),
		micros,
		provenance: food.provenance,
		servingLabel: food.servingLabel,
		foodId: food.id
	};
}
