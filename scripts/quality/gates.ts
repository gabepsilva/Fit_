export interface GateStep {
	/** npm script name, used as the log file name and the `--only` selector. */
	name: string;
	/** Human-readable purpose, printed in the summary table. */
	purpose: string;
	/** Machine-readable artifacts this step writes, relative to the project root. */
	artifacts?: string[];
	/** Requires a running Docker daemon. */
	docker?: boolean;
	/** Launches a real browser. */
	browser?: boolean;
}

/** Ring 2/3: no Docker, no browser. Safe for a pre-commit or per-edit loop. */
const staticSteps: GateStep[] = [
	{ name: 'format:check', purpose: 'Prettier formatting' },
	{ name: 'lint', purpose: 'Type-aware ESLint', artifacts: ['reports/quality/eslint.json'] },
	{ name: 'lint:docs', purpose: 'Markdown lint' },
	{ name: 'spellcheck', purpose: 'Spelling' },
	{ name: 'check', purpose: 'Svelte and TypeScript types' },
	{ name: 'check:scripts', purpose: 'Script types' },
	{
		name: 'check:suppressions',
		purpose: 'Suppression ratchet',
		artifacts: ['reports/quality/suppressions.json']
	},
	{ name: 'check:thresholds', purpose: 'Threshold guard' },
	{ name: 'knip', purpose: 'Unused files, exports, dependencies' },
	{
		name: 'duplicates',
		purpose: 'Copy-paste detection',
		artifacts: ['reports/quality/duplication/jscpd-report.json']
	}
];

/** Ring 3 tail: compiles the app and measures the emitted client bundle. */
const buildSteps: GateStep[] = [
	{ name: 'build', purpose: 'Production build' },
	{
		name: 'check:bundle',
		purpose: 'Bundle byte budgets',
		artifacts: ['reports/quality/bundle/bundle-budget.json']
	}
];

const workflowStep: GateStep = {
	name: 'check:workflows',
	purpose: 'GitHub Actions lint',
	artifacts: ['reports/quality/actionlint.json'],
	docker: true
};

const coverageStep: GateStep = {
	name: 'test:coverage',
	purpose: 'Unit and component coverage',
	artifacts: ['coverage/client/coverage-summary.json', 'coverage/server/coverage-summary.json'],
	browser: true
};

const mutationStep: GateStep = {
	name: 'test:mutation',
	purpose: 'Mutation score',
	artifacts: ['reports/mutation/mutation.json'],
	browser: true
};

const selfTestStep: GateStep = {
	name: 'test:gates',
	purpose: 'Gate fixture self-test',
	artifacts: ['reports/quality/self-test.json'],
	docker: true
};

const e2eStep: GateStep = {
	name: 'test:e2e',
	purpose: 'End-to-end flows',
	artifacts: ['reports/quality/playwright.json'],
	browser: true
};

/** Deterministic, code-derived scanners. These block a merge. */
const blockingSecuritySteps: GateStep[] = [
	{
		name: 'security:gitleaks',
		purpose: 'Secrets in tree and history',
		artifacts: ['reports/security/gitleaks/'],
		docker: true
	},
	{
		name: 'security:semgrep',
		purpose: 'Hash-locked source rules',
		artifacts: ['reports/security/semgrep/semgrep.json'],
		docker: true
	}
];

/**
 * Feed-derived scanners. Their findings change without a code change, so they
 * cannot gate a merge without contradicting the determinism this repo claims.
 * They run on a schedule instead; see .github/workflows/nightly.yml.
 */
const advisorySecuritySteps: GateStep[] = [
	{
		name: 'security:trivy',
		purpose: 'Dependency and config vulnerabilities',
		artifacts: ['reports/security/trivy/trivy.json'],
		docker: true
	},
	{
		name: 'test:e2e:security',
		purpose: 'ZAP-proxied browser flows',
		artifacts: ['reports/security/zap/'],
		docker: true,
		browser: true
	}
];

/**
 * The CI jobs. `tiers.ci` is derived from this map, so a step can never be added
 * to the merge gate and silently left out of the workflow: there is one list,
 * and the workflow selects from it with `--job` rather than repeating it.
 */
export const ciJobs = {
	static: [...staticSteps, workflowStep],
	unit: [coverageStep, mutationStep],
	build: buildSteps,
	e2e: [e2eStep],
	security: blockingSecuritySteps,
	'self-test': [selfTestStep]
} satisfies Record<string, GateStep[]>;

export type CiJobName = keyof typeof ciJobs;

export function isCiJobName(value: string): value is CiJobName {
	return Object.hasOwn(ciJobs, value);
}

const ciSteps = Object.values(ciJobs).flat();

export const tiers = {
	/** Ring 3. Everything that needs neither Docker nor a browser. */
	'verify:fast': [
		...staticSteps,
		{
			name: 'test:unit:server',
			purpose: 'Server unit tests',
			artifacts: ['reports/quality/vitest-server.json']
		}
	],
	/** Ring 3/4. The pre-push gate. */
	verify: [...staticSteps, workflowStep, coverageStep, ...buildSteps],
	/** Ring 4. Adds the slow behavior gates and the gate self-test. */
	'verify:deep': [
		...staticSteps,
		workflowStep,
		coverageStep,
		mutationStep,
		...buildSteps,
		e2eStep,
		selfTestStep
	],
	/** Ring 4. The complete merge gate, and the exact set CI runs. */
	ci: ciSteps,
	/** Ring 5. Scheduled, non-deterministic scanners. */
	nightly: advisorySecuritySteps
} satisfies Record<string, GateStep[]>;

export type TierName = keyof typeof tiers;

export function isTierName(value: string): value is TierName {
	return Object.hasOwn(tiers, value);
}
