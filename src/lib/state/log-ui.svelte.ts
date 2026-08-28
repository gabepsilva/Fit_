/**
 * Whether the log sheet is showing. It lives outside the component tree because
 * the bottom navigation, the empty meal slots, and the "Log something" button
 * all open the same sheet from different depths of the layout.
 */
class LogUi {
	open = $state(false);

	show() {
		this.open = true;
	}
}

export const logUi = new LogUi();
