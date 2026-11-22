import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { Document, isMap, isSeq, parseDocument, type YAMLMap, type YAMLSeq } from 'yaml'
import { evalFolderNames, rootScope, triggerScope } from './eval-suite.js'
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
	| 'unknown-scope'
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

type Doc = ReturnType<typeof parseDocument>

/** One eval file of a skill, as text and as a document. */
export type EvalFile = {
	/** The scope: `root` for `evals/evals.yaml`, else the eval folder's name. */
	scope: string
	/** The file's path. */
	file: string
	/** The file as messages name it, relative to the skill: `evals/evals.yaml`, `evals/<name>/evals.yaml`. */
	label: string
	/** The folder the file's `files` and `setup` paths are relative to. */
	folder: string
	source: string
	doc: Doc
}

type ReadProblem = { problem: { code: 'evals-invalid'; problem: string } }

function readEvalFile(
	skillFolder: string,
	scope: string,
	problemsOf: (value: unknown) => string[],
): EvalFile | ReadProblem {
	const root = scope === rootScope
	const label = root ? 'evals/evals.yaml' : `evals/${scope}/evals.yaml`
	const folder = root ? join(skillFolder, 'evals') : join(skillFolder, 'evals', scope)
	const file = join(folder, 'evals.yaml')
	const source = existsSync(file) ? readFileSync(file, 'utf8') : ''
	const doc = parseDocument(source)
	if (doc.errors.length)
		return {
			problem: {
				code: 'evals-invalid' as const,
				problem: `${label} is not valid YAML: ${doc.errors[0]?.message.split('\n')[0]}`,
			},
		}
	const problems = problemsOf(doc.toJS() ?? {})
	if (problems.length)
		return { problem: { code: 'evals-invalid' as const, problem: `${label}: ${problems.join('; ')}` } }
	return { scope, file, label, folder, source, doc }
}

/** Reads a skill's `evals/evals.yaml` as text and as a document, or why it cannot be edited. */
export function readEvals(
	skillFolder: string,
	problemsOf: (value: unknown) => string[] = evalsProblems,
): { file: string; source: string; doc: Doc } | ReadProblem {
	const read = readEvalFile(skillFolder, rootScope, problemsOf)
	return 'problem' in read ? read : { file: read.file, source: read.source, doc: read.doc }
}

/** Every eval file of a skill: the root file, then each eval folder's, or why one cannot be edited. */
export function readEvalFiles(
	skillFolder: string,
	problemsOf: (value: unknown) => string[] = evalsProblems,
): { files: EvalFile[] } | ReadProblem {
	const files: EvalFile[] = []
	for (const scope of [rootScope, ...evalFolderNames(skillFolder)]) {
		const read = readEvalFile(skillFolder, scope, problemsOf)
		if ('problem' in read) return read
		files.push(read)
	}
	return { files }
}

/** The outcome cases of every eval file, each with the file that lists it. */
type Listed = { id: string; files?: string; setup?: string }
const outcomeOf = (value: unknown) => ((value as EvalsFile).outcome ?? []) as unknown as Listed[]
const listedIn = (file: EvalFile) => outcomeOf(file.doc.toJS() ?? {})

/** The eval file that holds the case `id`, with its entry, or undefined. */
function findCase(files: EvalFile[], id: string): { file: EvalFile; entry: Listed } | undefined {
	for (const file of files) {
		const entry = listedIn(file).find((item) => item.id === id)
		if (entry) return { file, entry }
	}
	return undefined
}

/** The file that lists the ID among all the skill's cases, as `label`, or undefined. */
const holderOf = (files: EvalFile[], id: string): EvalFile | undefined =>
	files.find((file) => caseIds((file.doc.toJS() ?? {}) as EvalsFile).includes(id))

/** The path of `path` (relative to `from`) as relative to `to`, with `/` separators. */
const rebased = (path: string, from: string, to: string) => relative(to, resolve(from, path)).split('\\').join('/')

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

/** A scope's name, as the name of an instructions file and its eval folder. */
const scopeName = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

/**
 * Adds an outcome case: its entry in an eval file (made when missing), its files folder `files/<id>/`, and, with
 * `setup`, its setup script `setup/<id>.sh`, both beside that file. With `setup`, the files folder is made only when
 * `files` is also set. `criteria` and the criteria of `checks` become the case's `criteria`, and each check a `script`
 * check of its criterion. The entry goes after the last case in the file's own text, so no other entry is rewritten.
 * Without `scope`, or with `root`, the file is `evals/evals.yaml`; with the name of an instructions file
 * (`references/<name>.md`), it is `evals/<name>/evals.yaml`, and its paths are written relative to that folder.
 * With `from`, the new case starts from that case's setup, in any scope: its setup script is a copy of the other
 * case's, and, unless `files` is set, it names the other case's files folder instead of making one. Changes nothing
 * when the ID is taken in any scope or not a plain name, when the scope has no instructions file, or when `from`
 * names no case with a setup script.
 */
export function addCase(
	skillFolder: string,
	id: string,
	{
		prompt,
		from,
		scope = rootScope,
		setup = from !== undefined,
		files = !setup,
		criteria = [],
		checks = [],
	}: {
		prompt: string
		from?: string | undefined
		scope?: string | undefined
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
	if (scope === triggerScope)
		return {
			code: 'unknown-scope',
			problem:
				'the scope `trigger` holds trigger cases, which are always in evals/evals.yaml; an outcome case goes in `root` or the scope of an instructions file',
		}
	if (scope !== rootScope) {
		if (!scopeName.test(scope) || scope.includes('..') || !existsSync(join(skillFolder, 'references', `${scope}.md`)))
			return {
				code: 'unknown-scope',
				problem: `${JSON.stringify(scope)} is no scope: there is no references/${scope}.md; use \`root\` or the name of an instructions file`,
			}
	}
	const all = readEvalFiles(skillFolder)
	if ('problem' in all) return all.problem
	const holder = holderOf(all.files, id)
	if (holder) return { code: 'case-exists', problem: `${holder.label} already has a case ${id}` }
	const evals = join(skillFolder, 'evals')
	const target =
		all.files.find((item) => item.scope === scope) ??
		({
			scope,
			label: `evals/${scope}/evals.yaml`,
			folder: join(evals, scope),
			file: join(evals, scope, 'evals.yaml'),
			source: '',
			doc: parseDocument(''),
		} satisfies EvalFile)
	const { file, source, doc, folder: base } = target
	const before = (doc.toJS() ?? {}) as EvalsFile
	const found = from === undefined ? undefined : findCase(all.files, from)
	const origin = found?.entry
	if (from !== undefined && !origin) {
		const ids = all.files.flatMap((item) => listedIn(item).map((entry) => entry.id))
		return {
			code: 'unknown-case',
			problem: `${all.files.length === 1 ? 'evals/evals.yaml' : 'the skill'} has no outcome case ${from} to start from; its cases are ${ids.join(', ') || 'none'}`,
		}
	}
	let startScript: string | undefined
	if (origin && found) {
		if (origin.setup === undefined)
			return { code: 'no-setup', problem: `case ${from} has no setup script to start from` }
		const path = resolve(found.file.folder, origin.setup)
		if (!strictlyInside(evals, path))
			return {
				code: 'outside-evals',
				problem: `case ${from} names ${origin.setup}, which is outside the skill's evals folder`,
			}
		if (!existsSync(path))
			return {
				code: 'no-setup',
				problem: `case ${from}'s setup script ${relative(skillFolder, path)} does not exist`,
			}
		startScript = readFileSync(path, 'utf8')
	}
	const sharedFiles =
		origin && found && !files && origin.files !== undefined
			? found.file === target
				? origin.files
				: rebased(origin.files, found.file.folder, base)
			: undefined
	const filesPath = join('files', id)
	const setupPath = join('setup', `${id}.sh`)
	for (const path of [...(files ? [filesPath] : []), ...(setup ? [setupPath] : [])]) {
		if (!strictlyInside(evals, join(base, path)))
			return {
				code: 'outside-evals',
				problem: `${relative(skillFolder, join(base, path))} is outside the skill's evals folder`,
			}
		if (existsSync(join(base, path)))
			return {
				code: 'case-exists',
				problem: `${relative(skillFolder, join(base, path))} already exists; remove it or pick another ID`,
			}
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
		mkdirSync(join(base, filesPath), { recursive: true })
		paths.push(relative(skillFolder, join(base, filesPath)))
	}
	if (setup) {
		mkdirSync(join(base, 'setup'), { recursive: true })
		writeFileSync(join(base, setupPath), startScript ?? setupScaffold(id))
		chmodSync(join(base, setupPath), 0o755)
		paths.push(relative(skillFolder, join(base, setupPath)))
	}
	mkdirSync(base, { recursive: true })
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
	const all = readEvalFiles(skillFolder)
	if ('problem' in all) return all.problem
	const holder = holderOf(all.files, id)
	if (holder) return { code: 'case-exists', problem: `${holder.label} already has a case ${id}` }
	const { file, source, doc } = all.files[0] as EvalFile
	const before = (doc.toJS() ?? {}) as EvalsFile
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
 * Removes an outcome case: its entry from the eval file that lists it, in any scope, and the files folder and setup
 * script it names (relative to that file's folder) when no other case names them. Refuses, changing nothing, when a path
 * the entry names reaches outside the skill's `evals/` folder.
 */
export function removeCase(skillFolder: string, id: string): CaseChange | { code: CaseProblemCode; problem: string } {
	const bad = idProblem(id)
	if (bad) return bad
	const all = readEvalFiles(skillFolder)
	if ('problem' in all) return all.problem
	const found = findCase(all.files, id)
	if (!found) {
		const ids = all.files.flatMap((item) => listedIn(item).map((entry) => entry.id))
		return {
			code: 'unknown-case',
			problem: `${all.files.length === 1 ? 'evals/evals.yaml' : 'the skill'} has no outcome case ${id}; its cases are ${ids.join(', ') || 'none'}`,
		}
	}
	const { file: holder, entry } = found
	const { file, source, doc } = holder
	const outcome = doc.get('outcome')
	const items = listedIn(holder)
	const index = items.findIndex((item) => item.id === id)
	if (!isSeq(outcome)) return { code: 'unknown-case', problem: `${holder.label} has no outcome case ${id}` }
	const evals = join(skillFolder, 'evals')
	const named = [entry.files, entry.setup].filter((path): path is string => path !== undefined)
	for (const path of named)
		if (!strictlyInside(evals, resolve(holder.folder, path)))
			return {
				code: 'outside-evals',
				problem: `case ${id} names ${path}, which is outside the skill's evals folder; remove it from ${holder.label} by hand`,
			}
	const others = all.files.flatMap((item) =>
		listedIn(item)
			.filter((other) => !(item === holder && other.id === id))
			.map((other) => ({ item: other, folder: item.folder })),
	)
	const shared = (path: string) =>
		others.some(({ item, folder }) =>
			[item.files, item.setup].some(
				(theirs) => theirs !== undefined && resolve(folder, theirs) === resolve(holder.folder, path),
			),
		)
	const paths: string[] = []
	for (const path of named) {
		const target = resolve(holder.folder, path)
		if (shared(path) || !existsSync(target)) continue
		rmSync(target, { recursive: true, force: true })
		paths.push(relative(skillFolder, target))
	}
	const value = doc.toJS()
	const text =
		inPlace({ ...value, outcome: items.filter((_, other) => other !== index) }, removedText(source, doc, index)) ??
		(() => {
			outcome.delete(index)
			return doc.toString()
		})()
	writeFileSync(file, text)
	return { skill: skillFolder, case: id, evals: file, paths }
}
