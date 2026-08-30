import path from 'node:path';

function safeLabel(label: string): string {
	return label.replace(/[^a-zA-Z0-9._-]/g, '-');
}

export function gateLogDirectory(reportDirectory: string, label: string): string {
	return path.join(reportDirectory, 'logs', safeLabel(label));
}

export function gateReportPath(reportDirectory: string, label: string): string {
	return path.join(reportDirectory, `gate-${safeLabel(label)}.json`);
}
