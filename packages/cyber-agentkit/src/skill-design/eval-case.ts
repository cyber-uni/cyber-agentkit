import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { isMap, isSeq, parseDocument, YAMLMap, YAMLSeq } from 'yaml'
import { evalsProblems } from './verification-checks.js'

/**
 * `skill case`: adds and removes one outcome case of a skill, its files and its `evals/evals.yaml` entry, so no one
 * deletes or rewrites case folders by shell (R159). It never touches a path outside the skill's `evals/` folder.
 */

/** Why a case command changed nothing. */
export type CaseProblemCode = 'bad-case-id' | 'case-exists' | 'unknown-case' | 'evals-invalid' | 'outside-evals'

export type CaseChange = {
	skill: string
	case: string
	/** The `evals/evals.yaml` the entry was added to or removed from. */
	evals: string
	/** The files and folders made (`add`) or deleted (`remove`), relative to the skill folder. */
	paths: string[]
}

/** A case ID names its files folder and setup script, so it is one plain path segment; `trigger-<n>` names trigger cases. */
const caseId = /^[A-Za-z0-9][A-Za-z0-9._-]*$/

function idProblem(id: string): { code: 'bad-case-id'; problem: string } | undefined {
	if (!caseId.test(id) || id.includes('..'))
		return {
			code: 'bad-case-id',
			problem: `${JSON.stringify(id)} is not a case ID: use letters, digits, '.', '_', and '-', starting with a letter or digit`,
		}
	if (/^trigger-\d+$/.test(id))
		return { code: 'bad-case-id', problem: `${id} names a trigger case; give an outcome case another ID` }
	return undefined
}

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

function readEvals(
	skillFolder: string,
): { file: string; doc: ReturnType<typeof parseDocument> } | { problem: { code: 'evals-invalid'; problem: string } } {
	const file = join(skillFolder, 'evals', 'evals.yaml')
	const doc = parseDocument(existsSync(file) ? readFileSync(file, 'utf8') : '')
	if (doc.errors.length)
		return {
			problem: {
				code: 'evals-invalid' as const,
				problem: `evals/evals.yaml is not valid YAML: ${doc.errors[0]?.message.split('\n')[0]}`,
			},
		}
	const value = doc.toJS() ?? {}
	const problems = evalsProblems(value)
	if (problems.length)
		return { problem: { code: 'evals-invalid' as const, problem: `evals/evals.yaml: ${problems.join('; ')}` } }
	return { file, doc }
}

/** What a new setup script holds: a shell script with the rules it runs under. */
export function setupScaffold(id: string): string {
	return `#!/bin/sh
# The setup of case ${id}: it runs in each run's folder, a git repository with the case's files committed, before
# the model starts, with and without the skill. Make the state the case needs here, such as commits and uncommitted
# work; the prompt then holds only the request. It runs contained: it writes only to the run's folder and has no
# network. A non-zero exit reports the run as not run, with this script's output.
set -e
`
}

/**
 * Adds an outcome case: its entry in `evals/evals.yaml` (made when missing), its files folder `evals/files/<id>/`,
 * and, with `setup`, its setup script `evals/setup/<id>.sh`. With `setup`, the files folder is made only when `files`
 * is also set. Changes nothing when the ID is taken or not a plain name.
 */
export function addCase(
	skillFolder: string,
	id: string,
	{
		prompt,
		setup = false,
		files = !setup,
	}: { prompt: string; setup?: boolean | undefined; files?: boolean | undefined },
): CaseChange | { code: CaseProblemCode; problem: string } {
	const bad = idProblem(id)
	if (bad) return bad
	const read = readEvals(skillFolder)
	if ('problem' in read) return read.problem
	const { file, doc } = read
	const outcome = doc.get('outcome')
	if ((doc.toJS()?.outcome ?? []).some((item: { id?: string }) => item.id === id))
		return { code: 'case-exists', problem: `evals/evals.yaml already has a case ${id}` }
	const evals = join(skillFolder, 'evals')
	const filesPath = join('files', id)
	const setupPath = join('setup', `${id}.sh`)
	for (const path of [...(files ? [filesPath] : []), ...(setup ? [setupPath] : [])]) {
		if (!strictlyInside(evals, join(evals, path)))
			return { code: 'outside-evals', problem: `evals/${path} is outside the skill's evals folder` }
		if (existsSync(join(evals, path)))
			return { code: 'case-exists', problem: `evals/${path} already exists; remove it or pick another ID` }
	}
	const entry = new YAMLMap()
	entry.set('id', id)
	entry.set('prompt', prompt)
	if (files) entry.set('files', filesPath.split('\\').join('/'))
	if (setup) entry.set('setup', setupPath.split('\\').join('/'))
	if (isSeq(outcome)) outcome.add(entry)
	else {
		const list = new YAMLSeq()
		list.add(entry)
		if (!isMap(doc.contents)) doc.contents = doc.createNode({}) as never
		doc.set('outcome', list)
	}
	const paths: string[] = []
	if (files) {
		mkdirSync(join(evals, filesPath), { recursive: true })
		paths.push(join('evals', filesPath))
	}
	if (setup) {
		mkdirSync(join(evals, 'setup'), { recursive: true })
		writeFileSync(join(evals, setupPath), setupScaffold(id))
		chmodSync(join(evals, setupPath), 0o755)
		paths.push(join('evals', setupPath))
	}
	mkdirSync(evals, { recursive: true })
	writeFileSync(file, doc.toString())
	return { skill: skillFolder, case: id, evals: file, paths }
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
	const { file, doc } = read
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
	outcome.delete(index)
	writeFileSync(file, doc.toString())
	return { skill: skillFolder, case: id, evals: file, paths }
}
