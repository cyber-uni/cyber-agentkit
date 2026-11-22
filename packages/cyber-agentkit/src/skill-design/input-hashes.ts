import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parse } from 'yaml'
import type { SkillFiles } from './skill-files.js'
import type { InputHashes } from './test-result.js'
import { type EvalsFile, triggerCaseId } from './verification-checks.js'

/**
 * The hashes an expected entry is recorded against (R178, R180), so a later change shows the entry is behind its
 * inputs (K12). Until the scopes of instructions files arrive (#369), a skill has two scopes: `trigger`, its trigger
 * cases, and `root`, every outcome case.
 */

/** Whitespace and line wrapping are not changes (R179): every run of whitespace reads as one space. */
const normalized = (text: string) => text.replace(/\s+/g, ' ').trim()

/** Every file under a folder, relative to it with `/` separators, sorted; none when it is missing. */
function filesUnder(folder: string): string[] {
	if (!existsSync(folder) || !statSync(folder).isDirectory()) return []
	const walk = (under: string): string[] =>
		readdirSync(join(folder, under), { withFileTypes: true }).flatMap((entry) => {
			const path = under ? `${under}/${entry.name}` : entry.name
			if (entry.isDirectory()) return walk(path)
			return entry.isFile() ? [path] : []
		})
	return walk('').sort()
}

/** A hash over named parts, each normalized, so a part cannot run into the next. */
function hashOf(parts: [string, string][]): string {
	const hash = createHash('sha256')
	for (const [name, text] of parts) hash.update(`\0${name}\0${normalized(text)}`)
	return `sha256:${hash.digest('hex')}`
}

/** The files of a folder as hash parts, each named by `prefix` and its path under the folder. */
function folderParts(folder: string, prefix: string): [string, string][] {
	return filesUnder(folder).map((path) => [`${prefix}/${path}`, readFileSync(join(folder, path), 'utf8')])
}

/** The settings of `evals.yaml` every case shares: all but its cases and rubrics, which are the cases' own. */
function sharedSettings(evals: EvalsFile): string {
	const { trigger: _trigger, outcome: _outcome, rubrics: _rubrics, ...rest } = evals
	return JSON.stringify(rest)
}

/**
 * Each scope's input hash and each case's own (R178, R180), from the skill's files as they are now; undefined when its
 * `evals/evals.yaml` cannot be read. `criteria` is every criterion ID the skill lists, the ones a case with no
 * `criteria` tests.
 *
 * - A case's own definition is its entry in `evals.yaml`, its files folder, its setup script, and the shared rubrics of
 *   the criteria it tests.
 * - The trigger scope's inputs are the skill's description; the root scope's are the body of `SKILL.md`, every file
 *   under `references/`, and the shared settings of `evals.yaml`. #369 derives them from what each file links.
 */
export function inputHashes(skill: SkillFiles, criteria: string[]): InputHashes | undefined {
	const evalsFolder = join(skill.folder, 'evals')
	let evals: EvalsFile
	try {
		evals = (parse(readFileSync(join(evalsFolder, 'evals.yaml'), 'utf8')) ?? {}) as EvalsFile
	} catch {
		return undefined
	}
	const cases: Record<string, string> = {}
	;(evals.trigger ?? []).forEach((item, index) => {
		cases[triggerCaseId(item, index)] = hashOf([['case', JSON.stringify(item)]])
	})
	const rubrics = evals.rubrics ?? {}
	for (const item of evals.outcome ?? []) {
		if (typeof item?.id !== 'string') continue
		const parts: [string, string][] = [['case', JSON.stringify(item)]]
		for (const id of item.criteria ?? criteria)
			if (rubrics[id]) parts.push([`rubric/${id}`, JSON.stringify(rubrics[id])])
		if (typeof item.files === 'string') parts.push(...folderParts(resolve(evalsFolder, item.files), 'files'))
		if (typeof item.setup === 'string') {
			const setup = resolve(evalsFolder, item.setup)
			if (existsSync(setup) && statSync(setup).isFile()) parts.push(['setup', readFileSync(setup, 'utf8')])
		}
		cases[item.id] = hashOf(parts)
	}
	const description = skill.frontmatter?.['description']
	const references = join(skill.folder, 'references')
	return {
		scopes: {
			trigger: hashOf([['description', typeof description === 'string' ? description : '']]),
			root: hashOf([
				['SKILL.md', skill.body],
				...folderParts(references, relative(skill.folder, references).split('\\').join('/')),
				['evals.yaml', sharedSettings(evals)],
			]),
		},
		cases,
	}
}

/** The scope a case belongs to: `trigger` for a trigger case, `root` for an outcome case, until #369 adds more. */
export function scopeOfCase(kind: 'trigger' | 'outcome'): string {
	return kind === 'trigger' ? 'trigger' : 'root'
}
