import type { Meal } from '$lib/domain/types';

export type LogTab = 'type' | 'photo' | 'upload' | 'voice' | 'scan' | 'search';

// Lives outside the component tree: the floating log button, meal-heading buttons, and
// empty meal slots all open it from different depths.
class LogUi {
	open = $state(false);
	tab = $state<LogTab>('search');
	meal = $state<Meal | null>(null);

	show(tab: LogTab = 'search', meal: Meal | null = null) {
		this.tab = tab;
		this.meal = meal;
		this.open = true;
	}
}

export const logUi = new LogUi();
