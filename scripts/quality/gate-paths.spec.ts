import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { gateLogDirectory, gateReportPath } from './gate-paths';

describe('parallel gate evidence paths', () => {
	it('attributes logs and reports to separate CI job labels', () => {
		const reports = '/workspace/reports/quality';
		const staticLogs = gateLogDirectory(reports, 'ci-static');
		const mutationLogs = gateLogDirectory(reports, 'ci-mutation-security');
		expect(staticLogs).not.toBe(mutationLogs);
		expect(path.dirname(staticLogs)).toBe(path.join(reports, 'logs'));
		expect(gateReportPath(reports, 'ci-static')).not.toBe(
			gateReportPath(reports, 'ci-mutation-security')
		);
	});
});
