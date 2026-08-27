export const containerImages = {
	actionlint:
		'rhysd/actionlint:1.7.12@sha256:b1934ee5f1c509618f2508e6eb47ee0d3520686341fec936f3b79331f9315667',
	gitleaks:
		'ghcr.io/gitleaks/gitleaks:v8.30.1@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f',
	semgrep:
		'semgrep/semgrep:1.170.0@sha256:c98f8829eea377274ee4b10656458b078b88232469b2ff913f091c2317347c9d',
	trivy:
		'aquasec/trivy:0.72.0@sha256:cffe3f5161a47a6823fbd23d985795b3ed72a4c806da4c4df16266c02accdd6f',
	zap: 'ghcr.io/zaproxy/zaproxy:2.17.0@sha256:8d387b1a63e3425beef4846e39719f5af2a787753af2d8b6558c6257d7a577a2'
} as const;

export const semgrepRules = {
	url: 'https://semgrep.dev/c/p/typescript',
	sha256: '6248ea7477e6da0db10305c0281f7cd908485691747f4fd641275145075f3b22'
} as const;
