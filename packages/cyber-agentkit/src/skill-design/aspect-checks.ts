import type { AspectCheck } from './skill-check-types.js'
import { section } from './skill-files.js'

const item = /^- \*\*([A-Z][A-Z0-9]*-\d+)\*\* \[(script|read|run)\] (.*)$/

/** The checks an aspect implementation lists under `## Criteria`, as `- **<ID>** [script|read|run] <statement>`. */
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
				statement: (match[3] as string).trim(),
			})
			continue
		}
		const last = checks.at(-1)
		if (last && /^\s+\S/.test(line)) last.statement = `${last.statement} ${line.trim()}`
	}
	return checks
}
