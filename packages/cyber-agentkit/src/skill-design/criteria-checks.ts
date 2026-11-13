import type { CheckOutcome } from './skill-check-types.js'
import { criteriaItems, type SkillFiles } from './skill-files.js'

/** The line a CRI-1 failure asks for, so the author sees what to add. */
const itemLine = '`- **C1.** <a statement true or false of the result>`'
const addItem = `add at least one item as ${itemLine}`
const doneWhenSection = `\`## Done when\`, then at least one item as ${itemLine}`

/** CRI-1 and CRI-2, the default Criteria aspect's script checks. */
export function checkCriteria(skill: SkillFiles): CheckOutcome[] {
	const file = 'SKILL.md'
	const items = criteriaItems(skill)
	if (!items?.ids.length) {
		const message = items
			? `\`## Done when\` lists no item; ${addItem}`
			: `there is no \`## Done when\` section, and every skill needs one; add it as the last section of SKILL.md: ${doneWhenSection}`
		return [
			{ id: 'CRI-1', status: 'fail', message, file },
			{ id: 'CRI-2', status: 'not-checked', message: 'there are no items to check' },
		]
	}
	const missing = items.ids.flatMap((id, index) => (id === undefined ? [index + 1] : []))
	const seen = new Set<string>()
	const repeated = new Set<string>()
	for (const id of items.ids) {
		if (id === undefined) continue
		if (seen.has(id)) repeated.add(id)
		seen.add(id)
	}
	const problems = [
		...(missing.length ? [`item ${missing.join(', ')} has no \`C<n>\` ID`] : []),
		...(repeated.size ? [`${[...repeated].join(', ')} appears more than once`] : []),
	]
	return [
		{ id: 'CRI-1', status: 'pass' },
		problems.length
			? { id: 'CRI-2', status: 'fail', message: problems.join('; '), file }
			: { id: 'CRI-2', status: 'pass' },
	]
}
