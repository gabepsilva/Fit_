/** The ways into the log sheet, in the order the sheet offers them. */
export type LogTab = 'type' | 'photo' | 'upload' | 'voice' | 'scan' | 'search';

/**
 * Whether the log sheet is showing, and which way in it should open on. It lives
 * outside the component tree because the top bar, the empty meal slots, and the
 * "Log something" button all open the same sheet from different depths of the
 * layout — and the camera button has to pick a tab before the sheet exists.
 */
class LogUi {
	open = $state(false);
	tab = $state<LogTab>('type');

	show(tab: LogTab = 'type') {
		this.tab = tab;
		this.open = true;
	}
}

export const logUi = new LogUi();
