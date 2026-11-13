import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { isNameOnly } from './name-only-skills.js'
import type { CheckOutcome } from './skill-check-types.js'
import { criteriaItems, type SkillFiles } from './skill-files.js'

/** The checks a rubric may list; each is a mapping with exactly one of these keys. */
export const rubricChecks = [
	'contains',
	'not-contains',
	'regex',
	'not-regex',
	'file-exists',
	'file-contains',
	'script',
	'judge',
] as const

export type EvalsFile = {
	runs?: number
	threshold?: number
	/** Seconds one run may take; optional. */
	timeout?: number
	/** Runs at once, never above the bound `skill test` sets from the hardware threads; optional. */
	concurrency?: number
	trigger?: { prompt: string; expect: 'fire' | 'skip' }[]
	outcome?: {
		id: string
		prompt: string
		files?: string
		criteria?: string[]
		effects?: 'outside'
		/** Hosts the case's runs may reach, such as `registry.npmjs.org` or `*.github.com`; none by default. */
		network?: string[]
		checks?: Record<string, Record<string, unknown>[]>
	}[]
	rubrics?: Record<string, Record<string, unknown>[]>
}

const file = 'evals/evals.yaml'
const isRecord = (value: unknown): value is Record<string, unknown> =>
	!!value && typeof value === 'object' && !Array.isArray(value)

/** The problems with one list of checks, a rubric or a case's `checks` entry; `what` names it. */
function checkListProblems(list: unknown, what: string): string[] {
	if (!Array.isArray(list) || !list.length) return [`${what} is not a list of checks`]
	const problems: string[] = []
	for (const check of list) {
		const keys = isRecord(check) ? Object.keys(check) : []
		if (keys.length !== 1 || !(rubricChecks as readonly string[]).includes(keys[0] as string))
			problems.push(`${what} has a check that is not one of ${rubricChecks.join(', ')}`)
	}
	return problems
}

/** The problems with an `evals/evals.yaml` value against the format the default Verification gives. */
export function evalsProblems(value: unknown): string[] {
	if (!isRecord(value)) return ['it is not a mapping']
	const problems: string[] = []
	for (const key of ['runs', 'threshold', 'concurrency'] as const) {
		const n = value[key]
		if (n !== undefined && (!Number.isInteger(n) || (n as number) < 1))
			problems.push(`\`${key}\` is not a positive whole number`)
	}
	const timeout = value['timeout']
	if (timeout !== undefined && (typeof timeout !== 'number' || !(timeout > 0)))
		problems.push('`timeout` is not a positive number of seconds')
	const trigger = value['trigger']
	if (trigger !== undefined) {
		if (!Array.isArray(trigger)) problems.push('`trigger` is not a list')
		else
			trigger.forEach((item, index) => {
				if (
					!isRecord(item) ||
					typeof item['prompt'] !== 'string' ||
					!['fire', 'skip'].includes(item['expect'] as string)
				)
					problems.push(`trigger case ${index + 1} needs a \`prompt\` and \`expect: fire\` or \`skip\``)
			})
	}
	const outcome = value['outcome']
	if (outcome !== undefined) {
		if (!Array.isArray(outcome)) problems.push('`outcome` is not a list')
		else
			outcome.forEach((item, index) => {
				const where = `outcome case ${index + 1}`
				if (!isRecord(item) || typeof item['id'] !== 'string' || typeof item['prompt'] !== 'string') {
					problems.push(`${where} needs an \`id\` and a \`prompt\``)
					return
				}
				if (item['files'] !== undefined && typeof item['files'] !== 'string')
					problems.push(`${where}: \`files\` is not a path`)
				const criteria = item['criteria']
				if (criteria !== undefined && !(Array.isArray(criteria) && criteria.every((id) => typeof id === 'string')))
					problems.push(`${where}: \`criteria\` is not a list of IDs`)
				if (item['effects'] !== undefined && item['effects'] !== 'outside')
					problems.push(`${where}: \`effects\` is not \`outside\``)
				if (
					item['network'] !== undefined &&
					!(
						Array.isArray(item['network']) &&
						item['network'].every((host) => typeof host === 'string' && /^(\*\.)?[A-Za-z0-9.-]+$/.test(host))
					)
				)
					problems.push(`${where}: \`network\` is not a list of host names`)
				const checks = item['checks']
				if (checks !== undefined) {
					if (!isRecord(checks)) problems.push(`${where}: \`checks\` is not a mapping of criterion IDs`)
					else
						for (const [id, list] of Object.entries(checks))
							problems.push(...checkListProblems(list, `${where}: checks ${id}`))
				}
			})
	}
	const rubrics = value['rubrics']
	if (rubrics !== undefined) {
		if (!isRecord(rubrics)) problems.push('`rubrics` is not a mapping of criterion IDs')
		else for (const [id, list] of Object.entries(rubrics)) problems.push(...checkListProblems(list, `rubric ${id}`))
	}
	return problems
}

/** VER-1 to VER-5, the default Verification aspect's script checks. */
export function checkVerification(skill: SkillFiles): CheckOutcome[] {
	const later = ['VER-2', 'VER-3', 'VER-4', 'VER-5']
	const blocked = (message: string): CheckOutcome[] => [
		{ id: 'VER-1', status: 'fail', message, file },
		...later.map((id): CheckOutcome => ({ id, status: 'not-checked', message: 'VER-1 failed' })),
	]
	const path = join(skill.folder, file)
	if (!existsSync(path) || !statSync(path).isFile()) return blocked(`there is no \`${file}\``)
	let value: unknown
	try {
		value = parse(readFileSync(path, 'utf8'))
	} catch (error) {
		return blocked(`it is not valid YAML: ${(error as Error).message.split('\n')[0]}`)
	}
	const problems = evalsProblems(value)
	if (problems.length) return blocked(problems.join('; '))
	const evals = value as EvalsFile
	const outcomes: CheckOutcome[] = [{ id: 'VER-1', status: 'pass' }]

	const fire = evals.trigger?.filter((item) => item.expect === 'fire').length ?? 0
	const skip = evals.trigger?.filter((item) => item.expect === 'skip').length ?? 0
	// A name-only skill is never matched to a request, so it needs no `fire` cases; its `skip` cases still count.
	const nameOnly = isNameOnly(skill)
	outcomes.push(
		(nameOnly || fire >= 3) && skip >= 3
			? { id: 'VER-2', status: 'pass' }
			: {
					id: 'VER-2',
					status: 'fail',
					message: nameOnly
						? `${skip} \`skip\` trigger cases for a name-only skill`
						: `${fire} \`fire\` and ${skip} \`skip\` trigger cases`,
					file,
				},
	)

	const items = criteriaItems(skill)
	if (!items) outcomes.push({ id: 'VER-3', status: 'not-checked', message: 'the skill has no `## Done when`' })
	else {
		const ids = items.ids.filter((id): id is string => id !== undefined)
		const rubrics = Object.keys(evals.rubrics ?? {})
		const cases = evals.outcome ?? []
		const covered = (id: string) => {
			if (rubrics.includes(id)) return true
			const testing = cases.filter((item) => (item.criteria ?? ids).includes(id))
			return testing.length > 0 && testing.every((item) => item.checks && id in item.checks)
		}
		const without = ids.filter((id) => !covered(id))
		const unknown = rubrics.filter((id) => !ids.includes(id))
		const unknownChecks = [
			...new Set(cases.flatMap((item) => Object.keys(item.checks ?? {})).filter((id) => !ids.includes(id))),
		]
		const message = [
			...(without.length ? [`no rubric for ${without.join(', ')}`] : []),
			...(unknown.length ? [`rubric ${unknown.join(', ')} names no criterion`] : []),
			...(unknownChecks.length ? [`checks ${unknownChecks.join(', ')} name no criterion`] : []),
		].join('; ')
		outcomes.push(message ? { id: 'VER-3', status: 'fail', message, file } : { id: 'VER-3', status: 'pass' })
	}

	const missing = (evals.outcome ?? []).filter(
		(item) => item.files !== undefined && !existsSync(join(skill.folder, 'evals', item.files)),
	)
	outcomes.push(
		missing.length
			? {
					id: 'VER-4',
					status: 'fail',
					message: missing.map((item) => `case ${item.id}: evals/${item.files} does not exist`).join('; '),
					file,
				}
			: { id: 'VER-4', status: 'pass' },
	)

	const runs = evals.runs ?? 3
	const threshold = evals.threshold ?? 2
	outcomes.push(
		threshold <= runs
			? { id: 'VER-5', status: 'pass' }
			: { id: 'VER-5', status: 'fail', message: `\`threshold\` ${threshold} is more than \`runs\` ${runs}`, file },
	)
	return outcomes
}
