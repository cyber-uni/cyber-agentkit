import type { AspectCheck } from './skill-check-types.js'
import { section } from './skill-files.js'

const item = /^- \*\*([A-Z][A-Z0-9]*-\d+)\*\* \[(script|read|run)(?:, (critical|warning))?\] (.*)$/

/**
 * The checks an aspect implementation lists under `## Criteria`, as
 * `- **<ID>** [<how>] <statement>` or `- **<ID>** [<how>, <severity>] <statement>`; with no severity, critical.
 */
export function parseAspectChecks(content: string): AspectCheck[] {
	const criteria = section(content, 'Criteria')
	if (criteria === undefined) return []
	const checks: AspectCheck[] = []
	for (const line of criteria.split('\n')) {
		const match = item.exec(line)
		if (match) {
			checks.push({
				id: match[1] as string,
				how: match[2] as AspectCheck['how'],
				severity: (match[3] ?? 'critical') as AspectCheck['severity'],
				statement: (match[4] as string).trim(),
			})
			continue
		}
		const last = checks.at(-1)
		if (last && /^\s+\S/.test(line)) last.statement = `${last.statement} ${line.trim()}`
	}
	return checks
}
