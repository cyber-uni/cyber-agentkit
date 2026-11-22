import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'yaml'
import { readAttestations, skillFingerprint } from './attestation.js'
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
	/**
	 * A trigger case; `id` names it (R175), `trigger-<n>` from its place when it has none. `model`, a tier (`small`,
	 * `mid`, `top`) or a model ID, wins over the test's model (R161). `fails` marks it known to fail, with the reason
	 * (#329).
	 */
	trigger?: { id?: string; prompt: string; expect: 'fire' | 'skip'; model?: string; fails?: string }[]
	outcome?: {
		id: string
		prompt: string
		/** A tier (`small`, `mid`, `top`) or a model ID the case's runs use, over the test's model (R161). */
		model?: string
		files?: string
		/** A script, relative to `evals/`, that each run runs in its folder after the files are committed. */
		setup?: string
		criteria?: string[]
		effects?: 'outside'
		/** Hosts the case's runs may reach, such as `registry.npmjs.org` or `*.github.com`; none by default. */
		network?: string[]
		/**
		 * Marks a regression guard (R160): it keeps a behavior that also passes without the skill, so a pass in both arms
		 * is expected, not a skill that adds nothing. A fail with the skill is still a fail.
		 */
		guard?: boolean
		checks?: Record<string, Record<string, unknown>[]>
		/** The criteria of the case known to fail, each with the reason (#329), as `it.fails` marks a test. */
		fails?: Record<string, string>
	}[]
	rubrics?: Record<string, Record<string, unknown>[]>
}

const file = 'evals/evals.yaml'

/** A case ID names its files folder and setup script, so it is one plain path segment. */
export const caseIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
/** The ID a trigger case with no `id` of its own takes from its place; no case may claim this form as its own. */
export const positionalTriggerId = /^trigger-\d+$/
/** A trigger case's ID (R175): its own `id`, or `trigger-<n>` from its place in the list. */
export const triggerCaseId = (item: { id?: unknown }, index: number): string =>
	typeof item.id === 'string' ? item.id : `trigger-${index + 1}`
const isFile = (path: string) => existsSync(path) && statSync(path).isFile()
/** A tier or a model ID: one word, no space, so it cannot carry a second flag. */
const isModel = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9][\w.:/@[\]-]*$/.test(value)
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

const isReason = (value: unknown) => typeof value === 'string' && value.trim() !== ''

/**
 * The problems with the known-failure marks (#329) of an `evals/evals.yaml` value: a mark with no reason, and a criterion
 * a case marks but does not list in its `criteria`. A case with no `criteria` tests every criterion, so its marks are
 * checked against `criteria`, the skill's criterion IDs, when given, and not checked otherwise.
 */
export function failsProblems(value: unknown, criteria?: string[]): string[] {
	if (!isRecord(value)) return []
	const problems: string[] = []
	const trigger = value['trigger']
	if (Array.isArray(trigger))
		trigger.forEach((item, index) => {
			if (isRecord(item) && 'fails' in item && !isReason(item['fails']))
				problems.push(
					`trigger case ${index + 1}: \`fails\` needs the reason it is known to fail, such as a sentence or a link, not ${JSON.stringify(item['fails'])}`,
				)
		})
	const outcome = value['outcome']
	if (Array.isArray(outcome))
		outcome.forEach((item, index) => {
			if (!isRecord(item) || !('fails' in item)) return
			const where = `outcome case ${typeof item['id'] === 'string' ? item['id'] : index + 1}`
			const fails = item['fails']
			if (!isRecord(fails) || !Object.keys(fails).length) {
				problems.push(
					`${where}: \`fails\` is not a mapping of the criteria known to fail, each to its reason, such as \`C3: "<reason>"\``,
				)
				return
			}
			const listed = Array.isArray(item['criteria']) ? (item['criteria'] as unknown[]) : criteria
			for (const [id, reason] of Object.entries(fails)) {
				if (!isReason(reason))
					problems.push(
						`${where}: \`fails\` ${id} needs the reason it is known to fail, such as a sentence or a link, not ${JSON.stringify(reason)}`,
					)
				if (listed && !listed.includes(id))
					problems.push(`${where}: \`fails\` marks ${id}, which is not one of the criteria the case tests`)
			}
		})
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
				else if (item['model'] !== undefined && !isModel(item['model']))
					problems.push(`trigger case ${index + 1}: \`model\` is not a tier or a model ID`)
				if (isRecord(item) && item['id'] !== undefined) {
					const id = item['id']
					if (typeof id !== 'string' || !caseIdPattern.test(id) || id.includes('..'))
						problems.push(
							`trigger case ${index + 1}: \`id\` ${JSON.stringify(id)} is not a case ID: use letters, digits, '.', '_', and '-', starting with a letter or digit`,
						)
					else if (positionalTriggerId.test(id))
						problems.push(
							`trigger case ${index + 1}: \`id\` ${id} takes the form a trigger case with no \`id\` is given from its place; pick another`,
						)
				}
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
				if (item['setup'] !== undefined && (typeof item['setup'] !== 'string' || item['setup'] === ''))
					problems.push(`${where}: \`setup\` is not a path`)
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
				if (item['model'] !== undefined && !isModel(item['model']))
					problems.push(`${where}: \`model\` is not a tier or a model ID`)
				if (item['guard'] !== undefined && typeof item['guard'] !== 'boolean')
					problems.push(`${where}: \`guard\` is not true or false`)
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
	// Every case's ID is unique in the skill (R175), a trigger case's own or positional one included.
	const ids = [
		...(Array.isArray(trigger) ? trigger.map((item, index) => triggerCaseId(isRecord(item) ? item : {}, index)) : []),
		...(Array.isArray(outcome)
			? outcome.flatMap((item) => (isRecord(item) && typeof item['id'] === 'string' ? [item['id']] : []))
			: []),
	]
	const twice = [...new Set(ids.filter((id, at) => ids.indexOf(id) !== at))]
	if (twice.length)
		problems.push(
			twice.length === 1
				? `case ID ${twice[0]} names more than one case; give each case its own`
				: `case IDs ${twice.join(', ')} each name more than one case; give each case its own`,
		)
	problems.push(...failsProblems(value))
	return problems
}

/**
 * A prompt that tells the model to run a setup script (VER-9): "run `sh setup.sh` first", "execute ./prepare.sh",
 * "source setup.bash". The setup belongs in the case's `setup`, so the prompt holds only the request.
 */
const setupStep =
	/\b(?:run|execute|source|invoke)\b[^\n]{0,40}?[\w./-]*(?:setup|scaffold|prepare|bootstrap|init)[\w.-]*\.(?:sh|bash|zsh|mjs|js|py)\b/i

/** The checks that read a run's reply as text. */
const textChecks = ['contains', 'not-contains', 'regex', 'not-regex'] as const

/**
 * Whether a text check's value is punctuation alone (VER-11), such as `regex: "\\?"`: once a regex's escapes such as
 * `\b`, `\s`, and `\n` are dropped, no letter or digit is left, so the check tests a mark, not what the outcome left.
 */
export function isPunctuationOnly(kind: string, value: unknown): boolean {
	if (!(textChecks as readonly string[]).includes(kind) || typeof value !== 'string') return false
	const text = kind.endsWith('regex') ? value.replace(/\\[A-Za-z]/g, '') : value
	return !/[\p{L}\p{N}]/u.test(text)
}

/** A command or call that writes, copies, links, or makes the path that follows it on the line. */
const writeVerb =
	/(?:^|[\s;&|(`])(?:cp|mv|ln|install|tee|touch|mkdir|chmod|rm|rsync|dd|sed\s+-i\S*|(?:write|append|copy)File(?:Sync)?|symlink(?:Sync)?|mkdirSync)\b/
/** A path under the run's `.git/hooks`, or its `.git/config`. */
const gitPath = /\.git\/(?:hooks|config)\b/
/** A shell redirection into one of those paths. */
const redirect = /[^<]>>?\s*["']?[^\s"']*\.git\/(?:hooks|config)\b/
/** `git config` and what follows it up to the end of the command, and `git -C <dir> config`. */
const gitConfig = /\bgit(?:\s+-C\s+\S+)*\s+config\b([^;&|#]*)/g
/** `git config` options and subcommands that read, or write a file other than the repository's. */
const readsOrElsewhere = new Set([
	'--global',
	'--system',
	'--file',
	'-f',
	'--blob',
	'--get',
	'--get-all',
	'--get-regexp',
	'--get-urlmatch',
	'--get-color',
	'--get-colorbool',
	'--list',
	'-l',
	'get',
	'list',
])
/** `git config` options and subcommands that write whatever their arguments. */
const writes = new Set([
	'--unset',
	'--unset-all',
	'--add',
	'--replace-all',
	'--rename-section',
	'--remove-section',
	'--edit',
	'-e',
	'set',
	'unset',
	'rename-section',
	'remove-section',
	'edit',
])

/** Whether a `git config` command's arguments write the repository's own config. */
function writesRepoConfig(args: string): boolean {
	const words = args.trim().split(/\s+/).filter(Boolean)
	if (words.some((word) => readsOrElsewhere.has(word.split('=')[0] as string))) return false
	if (words.some((word) => writes.has(word))) return true
	return words.filter((word) => !word.startsWith('-')).length >= 2
}

/**
 * The lines of a setup script that write under `.git/hooks` or to the repository's git config (VER-12), as
 * `line <n>: <text>`: a write verb or a redirection into `.git/hooks` or `.git/config`, or `git config` without
 * `--global` that sets a value. A comment line is skipped. It matches shell text, so it can be wrong both ways.
 */
export function gitWriteLines(script: string): string[] {
	return script.split(/\r?\n/).flatMap((raw, index) => {
		const line = raw.trim()
		if (!line || line.startsWith('#') || line.startsWith('//')) return []
		const code = line.replace(/\s#.*$/, '')
		const path = gitPath.test(code) && (writeVerb.test(code) || redirect.test(` ${code}`))
		const config = [...code.matchAll(gitConfig)].some((match) => writesRepoConfig(match[1] ?? ''))
		return path || config ? [`line ${index + 1}: \`${line}\``] : []
	})
}

/** Every known-failure mark (#329) of an `evals/evals.yaml` value: a trigger case's by its ID (R175), with no criterion. */
export function knownFailureMarks(evals: EvalsFile): { case: string; criterion?: string; reason: string }[] {
	return [
		...(evals.trigger ?? []).flatMap((item, index) =>
			typeof item.fails === 'string' ? [{ case: triggerCaseId(item, index), reason: item.fails }] : [],
		),
		...(evals.outcome ?? []).flatMap((item) =>
			Object.entries(item.fails ?? {}).map(([criterion, reason]) => ({ case: item.id, criterion, reason })),
		),
	]
}

/** VER-1 to VER-5, VER-9, VER-11 to VER-13, and VER-15 to VER-17, the default Verification aspect's script checks. */
export function checkVerification(skill: SkillFiles): CheckOutcome[] {
	const later = [
		'VER-2',
		'VER-3',
		'VER-4',
		'VER-5',
		'VER-9',
		'VER-11',
		'VER-12',
		'VER-13',
		'VER-15',
		'VER-16',
		'VER-17',
	]
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
	const items = criteriaItems(skill)
	// A mark on a case with no `criteria` names one of the skill's criteria (#329).
	const problems = [
		...new Set([
			...evalsProblems(value),
			...(items
				? failsProblems(
						value,
						items.ids.filter((id): id is string => id !== undefined),
					)
				: []),
		]),
	]
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

	// A criterion the author attested as passing in real use (#323) counts as covered; VER-15 warns that it has no rubric.
	const attested = readAttestations(skill.folder)
	const attestedIds = new Set(attested.flatMap((entry) => (entry.case === undefined ? [entry.id as string] : [])))
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
		const without = ids.filter((id) => !covered(id) && !attestedIds.has(id))
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

	const missing = (evals.outcome ?? []).flatMap((item) => [
		...(item.files !== undefined && !existsSync(join(skill.folder, 'evals', item.files))
			? [`case ${item.id}: evals/${item.files} does not exist`]
			: []),
		...(item.setup !== undefined && !isFile(join(skill.folder, 'evals', item.setup))
			? [`case ${item.id}: setup script evals/${item.setup} does not exist`]
			: []),
	])
	outcomes.push(
		missing.length
			? { id: 'VER-4', status: 'fail', message: missing.join('; '), file }
			: { id: 'VER-4', status: 'pass' },
	)

	const runs = evals.runs ?? 3
	const threshold = evals.threshold ?? 2
	outcomes.push(
		threshold <= runs
			? { id: 'VER-5', status: 'pass' }
			: { id: 'VER-5', status: 'fail', message: `\`threshold\` ${threshold} is more than \`runs\` ${runs}`, file },
	)

	const preamble = (evals.outcome ?? []).filter((item) => setupStep.test(item.prompt))
	outcomes.push(
		preamble.length
			? {
					id: 'VER-9',
					status: 'fail',
					message: `${preamble.map((item) => `case ${item.id}`).join(', ')}: the prompt tells the model to run a setup script; move it to the case's \`setup\``,
					file,
				}
			: { id: 'VER-9', status: 'pass' },
	)

	const lists: [string, Record<string, unknown>[]][] = [
		...Object.entries(evals.rubrics ?? {}).map(([id, list]): [string, Record<string, unknown>[]] => [
			`rubric ${id}`,
			list,
		]),
		...(evals.outcome ?? []).flatMap((item) =>
			Object.entries(item.checks ?? {}).map(([id, list]): [string, Record<string, unknown>[]] => [
				`case ${item.id}: checks ${id}`,
				list,
			]),
		),
	]
	const marks = lists.flatMap(([where, list]) =>
		list.flatMap((check) => {
			const [kind, value] = Object.entries(check)[0] ?? []
			return kind && isPunctuationOnly(kind, value) ? [`${where}: \`${kind}: ${String(value)}\``] : []
		}),
	)
	outcomes.push(
		marks.length
			? {
					id: 'VER-11',
					status: 'fail',
					message: `${marks.join('; ')} tests a punctuation mark alone; test what the outcome left behind`,
					file,
				}
			: { id: 'VER-11', status: 'pass' },
	)

	const gitWrites = (evals.outcome ?? []).flatMap((item) => {
		if (item.setup === undefined) return []
		const path = join(skill.folder, 'evals', item.setup)
		if (!isFile(path)) return []
		return gitWriteLines(readFileSync(path, 'utf8')).map((line) => `case ${item.id}: evals/${item.setup} ${line}`)
	})
	outcomes.push(
		gitWrites.length
			? {
					id: 'VER-12',
					status: 'fail',
					message: `${gitWrites.join('; ')} writes \`.git/hooks\` or \`.git/config\`, which are read-only in a run; install hooks from a tracked \`hooks/\` folder with \`git config --global core.hooksPath "$PWD/hooks"\`, and set other git config with \`--global\``,
					file,
				}
			: { id: 'VER-12', status: 'pass' },
	)

	// A case with no `criteria` lists every criterion, as `skill test` runs it.
	if (!items) outcomes.push({ id: 'VER-13', status: 'not-checked', message: 'the skill has no `## Done when`' })
	else {
		const ids = items.ids.filter((id): id is string => id !== undefined)
		const cases = evals.outcome ?? []
		const unlisted = ids.filter(
			(id) => !attestedIds.has(id) && !cases.some((item) => (item.criteria ?? ids).includes(id)),
		)
		outcomes.push(
			unlisted.length
				? {
						id: 'VER-13',
						status: 'fail',
						message: `no outcome case lists ${unlisted.join(', ')} in its \`criteria\`; \`test\` reports ${unlisted.length === 1 ? 'it' : 'them'} as not tested`,
						file,
					}
				: { id: 'VER-13', status: 'pass' },
		)
	}

	if (!attested.length) outcomes.push({ id: 'VER-15', status: 'pass' })
	else {
		const ids = items ? items.ids.filter((id): id is string => id !== undefined) : []
		const rubrics = Object.keys(evals.rubrics ?? {})
		const cases = evals.outcome ?? []
		const hasRubric = (id: string) =>
			rubrics.includes(id) ||
			cases.some((item) => (item.criteria ?? ids).includes(id) && item.checks && id in item.checks)
		const fingerprint = skillFingerprint(skill.folder)
		const attestedOnly = [...attestedIds].filter((id) => ids.includes(id) && !hasRubric(id))
		const unknown = [...attestedIds].filter((id) => !ids.includes(id))
		const stale = attested.filter((entry) => entry.skillFingerprint !== fingerprint)
		const name = (entry: (typeof attested)[number]) => (entry.case !== undefined ? `case ${entry.case}` : entry.id)
		const message = [
			...(attestedOnly.length ? [`${attestedOnly.join(', ')} attested, no rubric`] : []),
			...(unknown.length ? [`attested pass for ${unknown.join(', ')} names no criterion`] : []),
			...(stale.length ? [`attested pass for ${stale.map(name).join(', ')} is stale: skill changed since`] : []),
		].join('; ')
		outcomes.push(
			message
				? { id: 'VER-15', status: 'fail', message, file: 'evals/expected.json' }
				: { id: 'VER-15', status: 'pass' },
		)
	}

	// Each known failure stays named until it is fixed and its mark cleared (#329).
	const known = knownFailureMarks(evals)
	outcomes.push(
		known.length
			? {
					id: 'VER-16',
					status: 'fail',
					message: `${known.length === 1 ? '1 mark' : `${known.length} marks`} of a known failure: ${known
						.map((mark) => `${mark.case}${mark.criterion ? ` ${mark.criterion}` : ''} (${mark.reason})`)
						.join('; ')}`,
					file,
				}
			: { id: 'VER-16', status: 'pass' },
	)

	// A trigger case with no `id` is named by its place, so adding or moving one renames the ones after it (R186).
	const unnamed = (evals.trigger ?? []).flatMap((item, index) =>
		item.id === undefined ? [`trigger-${index + 1}`] : [],
	)
	outcomes.push(
		unnamed.length
			? {
					id: 'VER-17',
					status: 'fail',
					message: `${unnamed.length === 1 ? '1 trigger case has' : `${unnamed.length} trigger cases have`} no \`id\` and ${unnamed.length === 1 ? 'is' : 'are'} named by place: ${unnamed.join(', ')}`,
					file,
				}
			: { id: 'VER-17', status: 'pass' },
	)
	return outcomes
}
