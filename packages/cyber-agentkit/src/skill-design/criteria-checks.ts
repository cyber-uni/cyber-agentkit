import type { CheckOutcome } from './skill-check-types.js'
import { criteriaItems, type SkillFiles } from './skill-files.js'

/** The line a CRI-1 failure asks for, so the author sees what to add. */
const itemLine = '`- **C1.** <a statement true or false of the result>`'
const addItem = `add at least one item as ${itemLine}`
const doneWhenSection = `\`## Done when\`, then at least one item as ${itemLine}`

/**
 * CRI-1 and CRI-2, the default Criteria aspect's script checks. The items are those of `SKILL.md`'s `## Done when` and of
 * the `## Done when` of each reference file its body links, so a router skill keeps each command's criteria in its
 * command file (#337).
 */
export function checkCriteria(skill: SkillFiles): CheckOutcome[] {
	const file = 'SKILL.md'
	const items = criteriaItems(skill)
	if (!items?.ids.length) {
		const message = items
			? `\`## Done when\` lists no item, and no reference file the body links has a \`## Done when\` that does; ${addItem}`
			: `there is no \`## Done when\` section, and every skill needs one; add it as the last section of SKILL.md: ${doneWhenSection}`
		return [
			{ id: 'CRI-1', status: 'fail', message, file },
			{ id: 'CRI-2', status: 'not-checked', message: 'there are no items to check' },
		]
	}
	const files = [...new Set(items.items.map((item) => item.file))]
	const where = (name: string) => (files.length > 1 ? ` in ${name}` : '')
	const missing = files.flatMap((name) => {
		const numbers = items.items
			.filter((item) => item.file === name)
			.flatMap((item, index) => (item.id === undefined ? [index + 1] : []))
		return numbers.length ? [`item ${numbers.join(', ')}${where(name)} has no \`C<n>\` ID`] : []
	})
	const filesOf = new Map<string, string[]>()
	for (const item of items.items) {
		if (item.id === undefined) continue
		filesOf.set(item.id, [...(filesOf.get(item.id) ?? []), item.file])
	}
	const repeated = [...filesOf].flatMap(([id, inFiles]) => {
		if (inFiles.length < 2) return []
		const distinct = [...new Set(inFiles)]
		return [`${id} appears more than once${files.length > 1 ? ` (in ${distinct.join(', ')})` : ''}`]
	})
	const problems = [...missing, ...repeated]
	const firstFile = items.items.find((item) => item.id === undefined || (filesOf.get(item.id)?.length ?? 0) > 1)?.file
	return [
		{ id: 'CRI-1', status: 'pass' },
		problems.length
			? { id: 'CRI-2', status: 'fail', message: problems.join('; '), file: firstFile ?? file }
			: { id: 'CRI-2', status: 'pass' },
	]
}
