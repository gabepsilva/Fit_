export type LogTab = 'type' | 'photo' | 'upload' | 'voice' | 'scan' | 'search';

// Lives outside the component tree: the top bar, meal slots, and camera button all open it from different depths.
class LogUi {
	open = $state(false);
	tab = $state<LogTab>('type');

	show(tab: LogTab = 'type') {
		this.tab = tab;
		this.open = true;
	}
}

export const logUi = new LogUi();
