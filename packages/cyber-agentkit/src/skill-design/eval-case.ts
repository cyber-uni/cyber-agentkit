import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { Document, isMap, isSeq, parseDocument, type YAMLMap, type YAMLSeq } from 'yaml'
import {
	caseIdPattern,
	type EvalsFile,
	evalsProblems,
	positionalTriggerId,
	triggerCaseId,
} from './verification-checks.js'

/**
 * `skill case`: adds and removes one outcome case of a skill, its files and its `evals/evals.yaml` entry, and adds a
 * trigger case, so no one deletes or rewrites case folders by shell (R159). Every case it adds carries an ID. It never
 * touches a path outside the skill's `evals/` folder.
 */

/** Why a case command changed nothing. */
export type CaseProblemCode =
	| 'bad-case-id'
	| 'bad-criterion'
	| 'case-exists'
	| 'unknown-case'
	| 'no-setup'
	| 'evals-invalid'
	| 'outside-evals'

export type CaseChange = {
	skill: string
	case: string
	/** The `evals/evals.yaml` the entry was added to or removed from. */
	evals: string
	/** The files and folders made (`add`) or deleted (`remove`), relative to the skill folder. */
	paths: string[]
}

function idProblem(id: string): { code: 'bad-case-id'; problem: string } | undefined {
	if (!caseIdPattern.test(id) || id.includes('..'))
		return {
			code: 'bad-case-id',
			problem: `${JSON.stringify(id)} is not a case ID: use letters, digits, '.', '_', and '-', starting with a letter or digit`,
		}
	if (positionalTriggerId.test(id))
		return {
			code: 'bad-case-id',
			problem: `${id} is the form a trigger case with no \`id\` takes from its place; give the case another ID`,
		}
	return undefined
}

/** Every case ID of an `evals/evals.yaml` value (R175): trigger cases by their own or positional ID, then outcome cases. */
const caseIds = (value: EvalsFile) => [
	...(value.trigger ?? []).map((item, index) => triggerCaseId(item, index)),
	...(value.outcome ?? []).map((item) => item.id),
]

/** Whether `path` is strictly inside `root`, following links of the parts that exist. */
function strictlyInside(root: string, path: string): boolean {
	const real = (p: string): string => {
		if (existsSync(p)) return realpathSync(p)
		const parent = dirname(p)
		return parent === p ? p : join(real(parent), relative(parent, p))
	}
	const from = relative(real(root), real(path))
	return from !== '' && !from.startsWith('..') && !isAbsolute(from)
}

/** Reads a skill's `evals/evals.yaml` as text and as a document, or why it cannot be edited. */
export function readEvals(
	skillFolder: string,
	problemsOf: (value: unknown) => string[] = evalsProblems,
):
	| { file: string; source: string; doc: ReturnType<typeof parseDocument> }
	| { problem: { code: 'evals-invalid'; problem: string } } {
	const file = join(skillFolder, 'evals', 'evals.yaml')
	const source = existsSync(file) ? readFileSync(file, 'utf8') : ''
	const doc = parseDocument(source)
	if (doc.errors.length)
		return {
			problem: {
				code: 'evals-invalid' as const,
				problem: `evals/evals.yaml is not valid YAML: ${doc.errors[0]?.message.split('\n')[0]}`,
			},
		}
	const value = doc.toJS() ?? {}
	const problems = problemsOf(value)
	if (problems.length)
		return { problem: { code: 'evals-invalid' as const, problem: `evals/evals.yaml: ${problems.join('; ')}` } }
	return { file, source, doc }
}

/** Where the line holding `offset` starts. */
export const lineStart = (source: string, offset: number) => source.lastIndexOf('\n', offset - 1) + 1
/** Where the line after the one `offset` ends on starts: `offset` itself when it already starts a line. */
export const nextLine = (source: string, offset: number) => {
	if (offset === 0 || source[offset - 1] === '\n') return offset
	const end = source.indexOf('\n', offset)
	return end < 0 ? source.length : end + 1
}

/**
 * The column of the `-` that opens a block sequence item, or undefined when the item does not open its line with one
 * (a flow sequence, or an item on the line of another).
 */
function dashColumn(source: string, item: { range?: [number, number, number] | null }): number | undefined {
	if (!item.range) return undefined
	const start = lineStart(source, item.range[0])
	const match = /^( *)- +$/.exec(source.slice(start, item.range[0]))
	return match ? (match[1] as string).length : undefined
}

/** The text of a one-item block sequence holding `entry`, its `-` at `column`. */
function entryText(entry: Record<string, unknown>, column: number): string {
	const doc = new Document([entry])
	const item = (doc.contents as YAMLSeq).items[0] as YAMLMap
	for (const pair of item.items) if (isSeq(pair.value)) pair.value.flow = true
	const text = doc.toString({ flowCollectionPadding: false })
	return text
		.split('\n')
		.map((line) => (line ? ' '.repeat(column) + line : line))
		.join('\n')
}

/**
 * `evals.yaml` with its text edited where the change is, so every other entry keeps the formatting its author gave
 * it, or undefined when the edit cannot be placed in the text. `expected` is the value the edit must leave; text that
 * reads back as anything else is not used.
 */
export function inPlace(expected: unknown, edited: string | undefined): string | undefined {
	if (edited === undefined) return undefined
	const read = parseDocument(edited)
	return !read.errors.length && JSON.stringify(read.toJS()) === JSON.stringify(expected) ? edited : undefined
}

/** The text with `entry` added after the last case of the `list`, or a new list at the end. */
function addedText(
	source: string,
	doc: ReturnType<typeof parseDocument>,
	entry: Record<string, unknown>,
	list: 'trigger' | 'outcome' = 'outcome',
) {
	const cases = doc.get(list, true)
	if (cases === undefined) {
		if (!isMap(doc.contents) && doc.contents !== null) return undefined
		const head = source === '' || source.endsWith('\n') ? source : `${source}\n`
		return `${head}${list}:\n${entryText(entry, 2)}`
	}
	if (!isSeq(cases) || cases.flow || !cases.items.length) return undefined
	const last = cases.items[cases.items.length - 1] as YAMLMap
	const column = dashColumn(source, last)
	if (column === undefined || !last.range) return undefined
	const at = nextLine(source, last.range[2])
	const before = source.slice(0, at)
	return `${before}${before.endsWith('\n') ? '' : '\n'}${entryText(entry, column)}${source.slice(at)}`
}

/** The text with the outcome case at `index` cut out, from its `-` to the next case's. */
function removedText(source: string, doc: ReturnType<typeof parseDocument>, index: number) {
	const outcome = doc.get('outcome', true)
	if (!isSeq(outcome) || outcome.flow || outcome.items.length < 2) return undefined
	const item = outcome.items[index] as YAMLMap
	const next = outcome.items[index + 1] as YAMLMap | undefined
	if (dashColumn(source, item) === undefined || !item.range) return undefined
	if (next && dashColumn(source, next) === undefined) return undefined
	const start = lineStart(source, item.range[0])
	const end = next?.range ? lineStart(source, next.range[0]) : nextLine(source, item.range[2])
	return source.slice(0, start) + source.slice(end)
}

/** What a new setup script holds: a shell script with the rules it runs under. */
export function setupScaffold(id: string): string {
	return `#!/bin/sh
# The setup of case ${id}: it runs in each run's folder, a git repository with the case's files committed, before
# the model starts, with and without the skill. Make the state the case needs here, such as commits and uncommitted
# work; the prompt then holds only the request. It runs contained: it writes only to the run's folder and its empty
# HOME, and has no network. The run's .git/hooks and .git/config are read-only, so a write there fails with
# "Read-only file system" or "Device or resource busy". To install a git hook, commit it in a tracked folder and point
# git at it from the run's own HOME:
#   mkdir -p hooks && cp ... hooks/commit-msg && chmod +x hooks/commit-msg
#   git config --global core.hooksPath "$PWD/hooks"
# Set any other git config with --global too. A non-zero exit reports the run as not run, with this script's output.
# See the state it makes, with no model run: cyber-agentkit skill case try <skill folder> ${id}
set -e
`
}

/** A `script` check on a criterion, as `--check <ID>=<script>` gives it. */
export type CaseCheck = { criterion: string; script: string }

/** A criterion ID, as a case's `criteria` and `checks` name it. */
const criterionId = /^[A-Za-z][A-Za-z0-9._-]*$/

/**
 * Adds an outcome case: its entry in `evals/evals.yaml` (made when missing), its files folder `evals/files/<id>/`,
 * and, with `setup`, its setup script `evals/setup/<id>.sh`. With `setup`, the files folder is made only when `files`
 * is also set. `criteria` and the criteria of `checks` become the case's `criteria`, and each check a `script` check
 * of its criterion. The entry goes after the last case in the file's own text, so no other entry is rewritten.
 * With `from`, the new case starts from that case's setup: its setup script is a copy of the other case's, and,
 * unless `files` is set, it names the other case's files folder instead of making one. Changes nothing when the ID is
 * taken or not a plain name, or when `from` names no case with a setup script.
 */
export function addCase(
	skillFolder: string,
	id: string,
	{
		prompt,
		from,
		setup = from !== undefined,
		files = !setup,
		criteria = [],
		checks = [],
	}: {
		prompt: string
		from?: string | undefined
		setup?: boolean | undefined
		files?: boolean | undefined
		criteria?: string[] | undefined
		checks?: CaseCheck[] | undefined
	},
): CaseChange | { code: CaseProblemCode; problem: string } {
	const bad = idProblem(id)
	if (bad) return bad
	for (const criterion of [...criteria, ...checks.map((check) => check.criterion)])
		if (!criterionId.test(criterion))
			return {
				code: 'bad-criterion',
				problem: `${JSON.stringify(criterion)} is not a criterion ID, such as C1: use letters, digits, '.', '_', and '-', starting with a letter`,
			}
	const read = readEvals(skillFolder)
	if ('problem' in read) return read.problem
	const { file, source, doc } = read
	const before = (doc.toJS() ?? {}) as EvalsFile
	if (caseIds(before).includes(id)) return { code: 'case-exists', problem: `evals/evals.yaml already has a case ${id}` }
	const evals = join(skillFolder, 'evals')
	const origin = from === undefined ? undefined : (before.outcome ?? []).find((item) => item.id === from)
	if (from !== undefined && !origin)
		return {
			code: 'unknown-case',
			problem: `evals/evals.yaml has no outcome case ${from} to start from; its cases are ${(before.outcome ?? []).map((item) => item.id).join(', ') || 'none'}`,
		}
	let startScript: string | undefined
	if (origin) {
		if (origin.setup === undefined)
			return { code: 'no-setup', problem: `case ${from} has no setup script to start from` }
		const path = resolve(evals, origin.setup)
		if (!strictlyInside(evals, path))
			return {
				code: 'outside-evals',
				problem: `case ${from} names ${origin.setup}, which is outside the skill's evals folder`,
			}
		if (!existsSync(path))
			return { code: 'no-setup', problem: `case ${from}'s setup script evals/${origin.setup} does not exist` }
		startScript = readFileSync(path, 'utf8')
	}
	const sharedFiles = origin && !files ? origin.files : undefined
	const filesPath = join('files', id)
	const setupPath = join('setup', `${id}.sh`)
	for (const path of [...(files ? [filesPath] : []), ...(setup ? [setupPath] : [])]) {
		if (!strictlyInside(evals, join(evals, path)))
			return { code: 'outside-evals', problem: `evals/${path} is outside the skill's evals folder` }
		if (existsSync(join(evals, path)))
			return { code: 'case-exists', problem: `evals/${path} already exists; remove it or pick another ID` }
	}
	const named = [...new Set([...criteria, ...checks.map((check) => check.criterion)])]
	const scripts: Record<string, { script: string }[]> = {}
	for (const check of checks) (scripts[check.criterion] ??= []).push({ script: check.script })
	const entry: Record<string, unknown> = {
		id,
		prompt,
		...(files ? { files: filesPath.split('\\').join('/') } : sharedFiles !== undefined ? { files: sharedFiles } : {}),
		...(setup ? { setup: setupPath.split('\\').join('/') } : {}),
		...(named.length ? { criteria: named } : {}),
		...(checks.length ? { checks: scripts } : {}),
	}
	const expected = { ...before, outcome: [...(before.outcome ?? []), entry] }
	const problems = evalsProblems(expected)
	if (problems.length) return { code: 'evals-invalid', problem: `the new case: ${problems.join('; ')}` }
	// Text the edit cannot be placed in, such as a flow `outcome: [...]`, is written back whole.
	const text =
		inPlace(expected, addedText(source, doc, entry)) ??
		(() => {
			if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as never
			doc.set('outcome', doc.createNode(expected.outcome))
			return doc.toString()
		})()
	const paths: string[] = []
	if (files) {
		mkdirSync(join(evals, filesPath), { recursive: true })
		paths.push(join('evals', filesPath))
	}
	if (setup) {
		mkdirSync(join(evals, 'setup'), { recursive: true })
		writeFileSync(join(evals, setupPath), startScript ?? setupScaffold(id))
		chmodSync(join(evals, setupPath), 0o755)
		paths.push(join('evals', setupPath))
	}
	mkdirSync(evals, { recursive: true })
	writeFileSync(file, text)
	return { skill: skillFolder, case: id, evals: file, paths }
}

/**
 * Adds a trigger case: its entry in `evals/evals.yaml` (made when missing), with its ID (R159, R175), after the last
 * trigger case in the file's own text, so no other entry is rewritten. Changes nothing when the ID is taken or not a
 * plain name.
 */
export function addTriggerCase(
	skillFolder: string,
	id: string,
	{ prompt, expect }: { prompt: string; expect: 'fire' | 'skip' },
): CaseChange | { code: CaseProblemCode; problem: string } {
	const bad = idProblem(id)
	if (bad) return bad
	const read = readEvals(skillFolder)
	if ('problem' in read) return read.problem
	const { file, source, doc } = read
	const before = (doc.toJS() ?? {}) as EvalsFile
	if (caseIds(before).includes(id)) return { code: 'case-exists', problem: `evals/evals.yaml already has a case ${id}` }
	const entry = { id, prompt, expect }
	const expected = { ...before, trigger: [...(before.trigger ?? []), entry] }
	const problems = evalsProblems(expected)
	if (problems.length) return { code: 'evals-invalid', problem: `the new case: ${problems.join('; ')}` }
	const text =
		inPlace(expected, addedText(source, doc, entry, 'trigger')) ??
		(() => {
			if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as never
			doc.set('trigger', doc.createNode(expected.trigger))
			return doc.toString()
		})()
	mkdirSync(join(skillFolder, 'evals'), { recursive: true })
	writeFileSync(file, text)
	return { skill: skillFolder, case: id, evals: file, paths: [] }
}

/**
 * Removes an outcome case: its entry, and the files folder and setup script it names when no other case names them.
 * Refuses, changing nothing, when a path the entry names reaches outside the skill's `evals/` folder.
 */
export function removeCase(skillFolder: string, id: string): CaseChange | { code: CaseProblemCode; problem: string } {
	const bad = idProblem(id)
	if (bad) return bad
	const read = readEvals(skillFolder)
	if ('problem' in read) return read.problem
	const { file, source, doc } = read
	const outcome = doc.get('outcome')
	const items = (doc.toJS()?.outcome ?? []) as { id: string; files?: string; setup?: string }[]
	const index = items.findIndex((item) => item.id === id)
	if (index < 0 || !isSeq(outcome))
		return {
			code: 'unknown-case',
			problem: `evals/evals.yaml has no outcome case ${id}; its cases are ${items.map((item) => item.id).join(', ') || 'none'}`,
		}
	const evals = join(skillFolder, 'evals')
	const entry = items[index] as (typeof items)[number]
	const named = [entry.files, entry.setup].filter((path): path is string => path !== undefined)
	for (const path of named)
		if (!strictlyInside(evals, resolve(evals, path)))
			return {
				code: 'outside-evals',
				problem: `case ${id} names ${path}, which is outside the skill's evals folder; remove it from evals/evals.yaml by hand`,
			}
	const others = items.filter((_, other) => other !== index)
	const shared = (path: string) =>
		others.some((item) =>
			[item.files, item.setup].some(
				(theirs) => theirs !== undefined && resolve(evals, theirs) === resolve(evals, path),
			),
		)
	const paths: string[] = []
	for (const path of named) {
		const target = resolve(evals, path)
		if (shared(path) || !existsSync(target)) continue
		rmSync(target, { recursive: true, force: true })
		paths.push(relative(skillFolder, target))
	}
	const value = doc.toJS()
	const text =
		inPlace({ ...value, outcome: others }, removedText(source, doc, index)) ??
		(() => {
			outcome.delete(index)
			return doc.toString()
		})()
	writeFileSync(file, text)
	return { skill: skillFolder, case: id, evals: file, paths }
}
