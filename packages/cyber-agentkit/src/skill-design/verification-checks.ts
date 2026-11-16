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
	/** A trigger case; `model`, a tier (`small`, `mid`, `top`) or a model ID, wins over the test's model (R161). */
	trigger?: { prompt: string; expect: 'fire' | 'skip'; model?: string }[]
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
	}[]
	rubrics?: Record<string, Record<string, unknown>[]>
}

const file = 'evals/evals.yaml'
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

/** VER-1 to VER-5, VER-9, VER-11, and VER-12, the default Verification aspect's script checks. */
export function checkVerification(skill: SkillFiles): CheckOutcome[] {
	const later = ['VER-2', 'VER-3', 'VER-4', 'VER-5', 'VER-9', 'VER-11', 'VER-12']
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
	return outcomes
}
