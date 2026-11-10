import type { CheckOutcome } from './skill-check-types.js'
import type { SkillFiles } from './skill-files.js'

/** The Agent Skills specification's rules for `SKILL.md` (https://agentskills.io/specification). */
export const specChecks = [
	{ id: 'SPEC-1', statement: '`SKILL.md` starts with front matter that is a YAML mapping.' },
	{
		id: 'SPEC-2',
		statement:
			'`name` is 1 to 64 lowercase letters, digits, and hyphens, with no hyphen at either end or twice in a row, and matches the folder name.',
	},
	{ id: 'SPEC-3', statement: '`description` is 1 to 1024 characters.' },
	{ id: 'SPEC-4', statement: '`compatibility`, when present, is 1 to 500 characters.' },
] as const

const namePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function checkSpec(skill: SkillFiles): CheckOutcome[] {
	const file = 'SKILL.md'
	const front = skill.frontmatter
	if (!front) {
		const message = skill.frontmatterProblem ?? 'no front matter'
		return [
			{ id: 'SPEC-1', status: 'fail', message, file },
			...specChecks.slice(1).map(({ id }): CheckOutcome => ({ id, status: 'fail', message, file })),
		]
	}
	const outcomes: CheckOutcome[] = [{ id: 'SPEC-1', status: 'pass' }]
	const name = front['name']
	if (typeof name !== 'string' || !name) outcomes.push({ id: 'SPEC-2', status: 'fail', message: 'no `name`', file })
	else if (name.length > 64 || !namePattern.test(name))
		outcomes.push({ id: 'SPEC-2', status: 'fail', message: `\`name\` "${name}" breaks the naming rule`, file })
	else if (name !== skill.folderName)
		outcomes.push({
			id: 'SPEC-2',
			status: 'fail',
			message: `\`name\` "${name}" does not match the folder "${skill.folderName}"`,
			file,
		})
	else outcomes.push({ id: 'SPEC-2', status: 'pass' })
	const description = front['description']
	if (typeof description !== 'string' || !description.trim())
		outcomes.push({ id: 'SPEC-3', status: 'fail', message: 'no `description`', file })
	else if (description.length > 1024)
		outcomes.push({
			id: 'SPEC-3',
			status: 'fail',
			message: `\`description\` is ${description.length} characters`,
			file,
		})
	else outcomes.push({ id: 'SPEC-3', status: 'pass' })
	const compatibility = front['compatibility']
	if (compatibility === undefined) outcomes.push({ id: 'SPEC-4', status: 'pass' })
	else if (typeof compatibility !== 'string' || !compatibility.trim() || compatibility.length > 500)
		outcomes.push({ id: 'SPEC-4', status: 'fail', message: '`compatibility` is not 1 to 500 characters', file })
	else outcomes.push({ id: 'SPEC-4', status: 'pass' })
	return outcomes
}
