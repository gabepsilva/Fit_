/**
 * The part of a deploy that can take the site down: switching the `current`
 * symlink onto the new release and restarting the unit.
 *
 * Until this ran, every step was additive — a release directory nobody points
 * at is inert. From `ln` onward the previous release is unreferenced, so a new
 * release that does not start leaves Cloudflare serving errors to real people
 * for as long as it takes someone to notice and re-point the link by hand.
 *
 * So the switch is paired with its undo: the health wait decides, and a
 * release that never answers is reverted to the one that did and restarted,
 * and the revert is itself waited on rather than assumed. The deploy still
 * fails — it did — but it fails with the site up.
 *
 * It is a string rather than a sequence of `remote()` calls because the
 * rollback has to survive the connection: an SSH session that dies mid-deploy
 * must not leave the link switched and the decision unmade.
 */

export type Activation = {
	/** The release directory to make live. */
	target: string;
	/** The release to fall back to, or `null` on a machine that has none yet. */
	previous: string | null;
	currentLink: string;
	serviceName: string;
	/** Where the app answers on the loopback, which is where health is judged. */
	port: number;
	/** A path the app serves and nothing else would. */
	healthPath: string;
	/** One second apart, so this is also the number of seconds a start may take. */
	attempts: number;
};

/**
 * Reverting needs the same verdict the forward path used, so the wait is a
 * function rather than a copied loop: a rollback judged by a weaker check
 * would report a recovery that did not happen.
 *
 * `is-active` cuts the wait short when the unit has given up restarting, so a
 * release that crashes on boot fails in seconds instead of the full window.
 */
function healthFunction(activation: Activation): string {
	return `wait_for_health() {
	attempt=0
	while [ "$attempt" -lt ${activation.attempts} ]; do
		if curl -fsS -o /dev/null http://127.0.0.1:${activation.port}${activation.healthPath}; then return 0; fi
		if ! systemctl is-active --quiet ${activation.serviceName}; then return 1; fi
		attempt=$((attempt + 1))
		sleep 1
	done
	return 1
}`;
}

function switchTo(release: string, activation: Activation): string {
	return `ln -sfnT ${release} ${activation.currentLink}
systemctl restart ${activation.serviceName}`;
}

/**
 * What to do when the new release never answered.
 *
 * With no previous release there is nothing to go back to and saying so is the
 * whole of it; inventing a rollback target would point the link at a directory
 * that was never live.
 */
function rollback(activation: Activation): string {
	if (activation.previous === null) {
		return `echo "no previous release to roll back to" >&2
exit 1`;
	}
	return `echo "rolling back to ${activation.previous}" >&2
${switchTo(activation.previous, activation)}
if wait_for_health; then
	echo "rolled back: ${activation.currentLink} -> ${activation.previous}" >&2
else
	echo "rollback to ${activation.previous} did not answer either; ${activation.serviceName} is down" >&2
fi
exit 1`;
}

export function activationScript(activation: Activation): string {
	return `${healthFunction(activation)}

${switchTo(activation.target, activation)}
if wait_for_health; then exit 0; fi

echo "${activation.serviceName} did not answer on 127.0.0.1:${activation.port} as ${activation.target}" >&2
journalctl -u ${activation.serviceName} --no-pager --lines=40 >&2 || true
${rollback(activation)}
`;
}
