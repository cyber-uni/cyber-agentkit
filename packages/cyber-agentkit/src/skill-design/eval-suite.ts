import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'
import { type EvalsFile, evalsProblems, failsProblems, triggerCaseId } from './verification-checks.js'

/**
 * A skill's evals as scopes (K11): the root `evals/evals.yaml`, holding the trigger cases, the settings every case
 * shares, the shared rubrics, and the root scope's outcome cases; and one eval folder per instructions file (K10),
 * `evals/<name>/evals.yaml` beside `references/<name>.md`, holding that scope's outcome cases. A case's `files` and
 * `setup` are relative to the folder of the file that lists it. A skill with no eval folder is the single-list form:
 * the root scope and the trigger scope only (R185).
 */

/** The scope of a skill's trigger cases. */
export const triggerScope = 'trigger'
/** The scope of the outcome cases in `evals/evals.yaml`, the scope of `SKILL.md`. */
export const rootScope = 'root'

/** One outcome case as an eval file lists it. */
export type OutcomeItem = NonNullable<EvalsFile['outcome']>[number]

/** An eval folder named for an instructions file: its scope's name, its folder, and its outcome cases. */
export type EvalFolder = {
	/** The scope's name, which is the folder's and its instructions file's (`references/<name>.md`). */
	name: string
	/** The folder, absolute. */
	folder: string
	/** The eval file, relative to the skill, as messages name it. */
	file: string
	outcome: OutcomeItem[]
}

export type EvalSuite = {
	/** The root `evals/evals.yaml`. */
	root: EvalsFile
	/** The eval folders, by name. */
	folders: EvalFolder[]
}

/** One case of a suite, with the scope it belongs to and the folder its paths are relative to. */
export type SuiteCase =
	| { id: string; kind: 'trigger'; scope: string; item: NonNullable<EvalsFile['trigger']>[number] }
	| { id: string; kind: 'outcome'; scope: string; item: OutcomeItem; folder: string }

export type SuiteProblem = { code: 'no-cases' | 'evals-invalid'; problem: string }

/** The keys an eval folder's file may hold: its cases only, since triggers and shared settings are at the root. */
const folderKeys = new Set(['outcome'])

/** The names of a skill's eval folders: each folder under `evals/` that holds an `evals.yaml`, sorted. */
export function evalFolderNames(skillFolder: string): string[] {
	const evals = join(skillFolder, 'evals')
	if (!existsSync(evals) || !statSync(evals).isDirectory()) return []
	return readdirSync(evals, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && existsSync(join(evals, entry.name, 'evals.yaml')))
		.map((entry) => entry.name)
		.sort()
}

function readYaml(path: string, file: string): { value: unknown } | SuiteProblem {
	try {
		return { value: parse(readFileSync(path, 'utf8')) ?? {} }
	} catch (error) {
		return { code: 'evals-invalid', problem: `${file} is not valid YAML: ${(error as Error).message.split('\n')[0]}` }
	}
}

/**
 * Reads a skill's evals as scopes, or answers why it cannot: the root file is missing or invalid, an eval folder's file
 * is invalid or holds more than its cases, a folder is named for no instructions file, or two cases share an ID.
 * `criteria`, the skill's criterion IDs, checks the known-failure marks of a case with no `criteria` of its own.
 */
export function readEvalSuite(skillFolder: string, criteria?: string[]): EvalSuite | SuiteProblem {
	const path = join(skillFolder, 'evals', 'evals.yaml')
	if (!existsSync(path)) return { code: 'no-cases', problem: 'the skill has no evals/evals.yaml' }
	const read = readYaml(path, 'evals/evals.yaml')
	if ('problem' in read) return read
	const problems = evalsProblems(read.value)
	if (problems.length) return { code: 'evals-invalid', problem: `evals/evals.yaml: ${problems.join('; ')}` }
	const marks = criteria ? failsProblems(read.value, criteria) : []
	if (marks.length) return { code: 'evals-invalid', problem: `evals/evals.yaml: ${marks.join('; ')}` }
	const root = read.value as EvalsFile
	const folders: EvalFolder[] = []
	for (const name of evalFolderNames(skillFolder)) {
		const file = `evals/${name}/evals.yaml`
		if (!existsSync(join(skillFolder, 'references', `${name}.md`)))
			return {
				code: 'evals-invalid',
				problem: `the eval folder evals/${name}/ is named for no instructions file: there is no references/${name}.md`,
			}
		const value = readYaml(join(skillFolder, file), file)
		if ('problem' in value) return value
		const own = evalsProblems(value.value)
		const extra =
			value.value && typeof value.value === 'object' && !Array.isArray(value.value)
				? Object.keys(value.value).filter((key) => !folderKeys.has(key))
				: []
		if (extra.length)
			own.push(
				`${extra.map((key) => `\`${key}\``).join(', ')} belong${extra.length === 1 ? 's' : ''} in evals/evals.yaml; an eval folder holds its outcome cases only`,
			)
		if (criteria) own.push(...failsProblems(value.value, criteria))
		if (own.length) return { code: 'evals-invalid', problem: `${file}: ${own.join('; ')}` }
		folders.push({
			name,
			folder: join(skillFolder, 'evals', name),
			file,
			outcome: (value.value as EvalsFile).outcome ?? [],
		})
	}
	// Every case's ID is unique in the skill (R175), across its eval files too.
	const ids = suiteCases({ root, folders }, join(skillFolder, 'evals')).map((item) => item.id)
	const twice = [...new Set(ids.filter((id, at) => ids.indexOf(id) !== at))]
	if (twice.length)
		return {
			code: 'evals-invalid',
			problem: `case ID${twice.length === 1 ? '' : 's'} ${twice.join(', ')} name${twice.length === 1 ? 's' : ''} more than one case across the skill's eval files; give each case its own`,
		}
	return { root, folders }
}

/** Every case of a suite in order: trigger cases, the root's outcome cases, then each eval folder's. */
export function suiteCases(suite: EvalSuite, evalsFolder: string): SuiteCase[] {
	return [
		...(suite.root.trigger ?? []).map((item, index) => ({
			id: triggerCaseId(item, index),
			kind: 'trigger' as const,
			scope: triggerScope,
			item,
		})),
		...(suite.root.outcome ?? [])
			.filter((item) => typeof item?.id === 'string')
			.map((item) => ({ id: item.id, kind: 'outcome' as const, scope: rootScope, item, folder: evalsFolder })),
		...suite.folders.flatMap((folder) =>
			folder.outcome
				.filter((item) => typeof item?.id === 'string')
				.map((item) => ({ id: item.id, kind: 'outcome' as const, scope: folder.name, item, folder: folder.folder })),
		),
	]
}

/**
 * The suite as one eval file for a plan: the root's settings, trigger cases, and rubrics, with every scope's outcome
 * cases, each `files` and `setup` resolved to an absolute path from the folder of the file that lists it.
 */
export function mergedEvals(suite: EvalSuite, evalsFolder: string): EvalsFile {
	const absolute = (item: OutcomeItem, folder: string): OutcomeItem => ({
		...item,
		...(item.files !== undefined ? { files: resolve(folder, item.files) } : {}),
		...(item.setup !== undefined ? { setup: resolve(folder, item.setup) } : {}),
	})
	const outcome = [
		...(suite.root.outcome ?? []).map((item) => absolute(item, evalsFolder)),
		...suite.folders.flatMap((folder) => folder.outcome.map((item) => absolute(item, folder.folder))),
	]
	return { ...suite.root, ...(outcome.length ? { outcome } : {}) }
}
