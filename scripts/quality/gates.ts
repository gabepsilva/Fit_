export interface GateStep {
	/** npm script name, used as the log file name and the `--only` selector. */
	name: string;
	/** Human-readable purpose, printed in the summary table. */
	purpose: string;
	/** Machine-readable artifacts this step writes, relative to the project root. */
	artifacts?: string[];
	/**
	 * Safe to run beside the other concurrent steps: holds no exclusive resource,
	 * reads no artifact another step in the same tier writes, and binds no port.
	 * Opt-in, so a new step is sequential until someone has checked that it is not.
	 */
	concurrent?: boolean;
	/** Requires a running Docker daemon. */
	docker?: boolean;
	/** Launches a real browser. */
	browser?: boolean;
}

/** Ring 2/3: no Docker, no browser. Safe for a pre-commit or per-edit loop. */
const staticSteps: GateStep[] = [
	{ name: 'format:check', purpose: 'Prettier formatting', concurrent: true },
	{
		name: 'lint',
		purpose: 'Type-aware ESLint',
		artifacts: ['reports/quality/eslint.json'],
		concurrent: true
	},
	{ name: 'lint:docs', purpose: 'Markdown lint', concurrent: true },
	{ name: 'spellcheck', purpose: 'Spelling', concurrent: true },
	{ name: 'check', purpose: 'Svelte and TypeScript types', concurrent: true },
	{ name: 'check:scripts', purpose: 'Script types', concurrent: true },
	{
		name: 'check:suppressions',
		purpose: 'Suppression ratchet',
		artifacts: ['reports/quality/suppressions.json'],
		concurrent: true
	},
	{ name: 'check:thresholds', purpose: 'Threshold guard', concurrent: true },
	{ name: 'check:mutation-reviews', purpose: 'Exact mutation-review ledger', concurrent: true },
	{ name: 'check:ci-contract', purpose: 'Local and hosted CI job parity', concurrent: true },
	{ name: 'knip', purpose: 'Unused files, exports, dependencies', concurrent: true },
	{
		name: 'duplicates',
		purpose: 'Copy-paste detection',
		artifacts: ['reports/quality/duplication/jscpd-report.json'],
		concurrent: true
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

const securityMutationStep: GateStep = {
	name: 'test:mutation:security',
	purpose: 'Security mutation strength',
	artifacts: [
		'reports/mutation/security/scope.json',
		'reports/mutation/security/mutation.json',
		'reports/mutation/security/verdict.json'
	]
};

const changedNodeMutationStep: GateStep = {
	name: 'test:mutation:changed:node',
	purpose: 'Changed Node mutation strength',
	artifacts: [
		'reports/mutation/changed-node/scope.json',
		'reports/mutation/changed-node/mutation.json',
		'reports/mutation/changed-node/verdict.json'
	]
};

const changedClientMutationStep: GateStep = {
	name: 'test:mutation:changed:client',
	purpose: 'Changed client mutation strength',
	artifacts: [
		'reports/mutation/changed-client/scope.json',
		'reports/mutation/changed-client/mutation.json',
		'reports/mutation/changed-client/verdict.json'
	],
	browser: true
};

const requiredMutationSteps = [
	securityMutationStep,
	changedNodeMutationStep,
	changedClientMutationStep
];

const fullMutationStep: GateStep = {
	name: 'test:mutation:full',
	purpose: 'Full mutation audit',
	artifacts: [
		'reports/mutation/full/scope.json',
		'reports/mutation/full/mutation.json',
		'reports/mutation/full/verdict.json'
	],
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
	unit: [coverageStep],
	'mutation-security': [securityMutationStep],
	'mutation-node': [changedNodeMutationStep],
	'mutation-client': [changedClientMutationStep],
	'mutation-full': [fullMutationStep],
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
			artifacts: ['reports/quality/vitest-server.json'],
			concurrent: true
		}
	],
	/** Ring 3/4. The pre-push gate. */
	verify: [...staticSteps, workflowStep, coverageStep, ...buildSteps],
	/** Ring 4. Adds the slow behavior gates and the gate self-test. */
	'verify:deep': [
		...staticSteps,
		workflowStep,
		coverageStep,
		...requiredMutationSteps,
		fullMutationStep,
		...buildSteps,
		e2eStep,
		selfTestStep
	],
	/** Ring 4. The complete merge gate, and the exact set CI runs. */
	ci: ciSteps,
	/** Deterministic full-tree audit, run on main and cold on schedule. */
	audit: [fullMutationStep],
	/** Ring 5. Scheduled, non-deterministic scanners. */
	nightly: advisorySecuritySteps
} satisfies Record<string, GateStep[]>;

export type TierName = keyof typeof tiers;

export function isTierName(value: string): value is TierName {
	return Object.hasOwn(tiers, value);
}
