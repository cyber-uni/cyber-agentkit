import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { defaultLayer, type ReferenceLayer, type ReferenceLayers } from '../references/reference-layers.js'
import { backtickedNames, declaredLoads, loadsIn, withoutFences } from '../references/reference-loads.js'
import { resolveReference } from '../references/resolve-reference.js'
import { type EvalSuite, readEvalSuite, rootScope, type SuiteCase, suiteCases, triggerScope } from './eval-suite.js'
import { readSkill, type SkillFiles } from './skill-files.js'
import { findSkillPlugin, pluginSkills } from './skill-plugin.js'
import { inOwnFolder, isExternal, leavesFolder, linkTargets, plainPaths, resolveIn } from './skill-text.js'
import type { InputHashes } from './test-result.js'
import type { EvalsFile } from './verification-checks.js'

/**
 * The inputs of each scope of a skill's evals, and each case's own definition, hashed (R178 to R180), so an expected
 * entry records what it was recorded against and a later change shows it stale (K12). Every input is derived from the
 * files the skill already has, never declared:
 *
 * - An instructions file's scope (`references/<name>.md` with an eval folder `evals/<name>/`): that file, every file it
 *   links or names and every named reference it loads, what each of those reaches in turn, its eval folder, and the
 *   shared part of `SKILL.md`: its front matter but the description, and its body but the router table's rows. A row
 *   belongs to the scope of the instructions file it links.
 * - The root scope: `SKILL.md`'s front matter but the description, its body but the router table's rows, what that
 *   reaches (never the instructions files the rows link), and the files of `evals/` no case and no eval folder owns.
 * - The trigger scope: the description, and the descriptions of the other skills a run loads, those of the skill's own
 *   plugin and of the plugins it depends on (#411).
 * - A named reference with `##` sections: the text before its first section, and each section the scope's own text
 *   names by its heading (#416); every section when it names none. A reference with no sections counts whole.
 * - Every scope: the settings `evals/evals.yaml` gives every case, such as `runs` and `threshold`.
 *
 * Built scripts are no input; they are hashed apart, to be reported (R179).
 */

/** Whitespace and line wrapping are not changes (R179): every run of whitespace reads as one space. */
const normalized = (text: string) => text.replace(/\s+/g, ' ').trim()

/** One input's hash, of its text normalized. */
const hashText = (text: string) => `sha256:${createHash('sha256').update(normalized(text)).digest('hex')}`

/** A hash over named parts, each normalized, so a part cannot run into the next. */
function hashOf(parts: [string, string][]): string {
	const hash = createHash('sha256')
	for (const [name, text] of parts) hash.update(`\0${name}\0${normalized(text)}`)
	return `sha256:${hash.digest('hex')}`
}

/** A scope's hash, over its inputs' hashes in name order. */
function scopeHash(inputs: Record<string, string>): string {
	return hashOf(
		Object.keys(inputs)
			.sort()
			.map((name) => [name, inputs[name] as string]),
	)
}

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

const isFile = (path: string) => existsSync(path) && statSync(path).isFile()

/** A built script: a JavaScript file under the skill's `scripts/`, which the library's own tests cover (O13a). */
export const isBuiltScript = (path: string) => path.startsWith('scripts/') && /\.(mjs|cjs|js)$/.test(path)

/** The expected and accepted results an eval folder keeps, which are no input of anything. */
const isResultFile = (path: string) =>
	path === 'expected.json' || path.startsWith('accepted/') || /(^|\/)expected\.json$/.test(path)

/** The settings of `evals.yaml` every case shares: all but its cases, its rubrics, and how many runs go at once. */
function sharedSettings(evals: EvalsFile): string {
	const { trigger: _trigger, outcome: _outcome, rubrics: _rubrics, concurrency: _concurrency, ...rest } = evals
	return JSON.stringify(rest)
}

/** `SKILL.md`'s front matter as text, without the description, which is the trigger scope's. */
function frontmatterWithoutDescription(skill: SkillFiles): string {
	const { description: _description, ...rest } = skill.frontmatter ?? {}
	return JSON.stringify(rest)
}

/** A line of a Markdown table. */
const isTableRow = (line: string) => /^\s*\|/.test(line)

/** The instructions files a line links, as `references/<name>.md` paths relative to the skill. */
function linkedInstructions(line: string): string[] {
	return linkTargets(line)
		.filter((target) => !isExternal(target))
		.map((target) => resolveIn('.', target.split('#')[0] as string))
		.filter((path) => /^references\/[^/]+\.md$/.test(path))
}

/**
 * `SKILL.md`'s body split into the shared part and the router rows (O13b): a table row that links an instructions file
 * belongs to that file's scope, by the file's name; every other line is shared.
 */
export function splitBody(body: string): { shared: string; rows: Record<string, string[]> } {
	const shared: string[] = []
	const rows: Record<string, string[]> = {}
	for (const line of body.split('\n')) {
		const linked = isTableRow(line) ? linkedInstructions(line) : []
		if (!linked.length) {
			shared.push(line)
			continue
		}
		for (const path of linked) {
			const name = basename(path, '.md')
			rows[name] = [...(rows[name] ?? []), line]
		}
	}
	return { shared: shared.join('\n'), rows }
}

/** What a set of texts reaches in the skill: the files, by path relative to the skill, and the named references. */
type Reach = { files: string[]; names: string[] }

/**
 * Every file the texts link or name as a plain path, and every file those reach in turn, and every named reference any
 * of them loads (R178). A file outside the skill folder, under `evals/`, or a built script is not followed; a name
 * counts when a load line names it or it is backticked and the skill declares it.
 */
function reachOf(skill: SkillFiles, texts: { text: string; from: string }[], declared: Set<string>): Reach {
	const files = new Set<string>()
	const names = new Set<string>()
	const known = new Set(skill.files)
	const queue = [...texts]
	const follow = (path: string) => {
		if (!known.has(path) || path === 'SKILL.md' || files.has(path)) return
		if (path.startsWith('evals/') || isBuiltScript(path)) return
		files.add(path)
		if (/\.mdx?$/i.test(path)) {
			const text = readFileSync(join(skill.folder, path), 'utf8')
			queue.push({ text, from: dirname(path) })
		}
	}
	while (queue.length) {
		const { text, from } = queue.shift() as { text: string; from: string }
		for (const target of linkTargets(text)) {
			if (isExternal(target)) continue
			const path = resolveIn(from, target.split('#')[0] as string)
			if (path && !leavesFolder(path)) follow(path)
		}
		for (const path of plainPaths(text)) {
			if (!inOwnFolder(path)) continue
			for (const target of [resolveIn(from, path), resolveIn('.', path)]) if (!leavesFolder(target)) follow(target)
		}
		const bare = withoutFences(text)
		for (const name of loadsIn(bare).names) names.add(name)
		for (const name of backtickedNames(bare)) if (declared.has(name)) names.add(name)
	}
	return { files: [...files].sort(), names: [...names].sort() }
}

/** A reference's text split at its `## ` headings: what comes before the first, and each section by its heading. */
export function splitSections(content: string): { preamble: string; sections: { heading: string; text: string }[] } {
	const lines = content.replace(/\r\n/g, '\n').split('\n')
	const preamble: string[] = []
	const sections: { heading: string; lines: string[] }[] = []
	let fenced = false
	for (const line of lines) {
		if (/^\s*(```|~~~)/.test(line)) fenced = !fenced
		const heading = fenced ? null : /^##\s+(\S.*?)\s*#*\s*$/.exec(line)
		if (heading) sections.push({ heading: heading[1] as string, lines: [line] })
		else (sections.at(-1)?.lines ?? preamble).push(line)
	}
	return {
		preamble: preamble.join('\n'),
		sections: sections.map(({ heading, lines }) => ({ heading, text: lines.join('\n') })),
	}
}

/** Whether the text names a heading, as a whole phrase and whatever the case. A heading with no word in it counts as named. */
function names(text: string, heading: string): boolean {
	const phrase = normalized(heading).toLowerCase()
	if (!/[\p{L}\p{N}]/u.test(phrase)) return true
	const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu').test(normalized(text))
}

/**
 * The inputs of one named reference a scope loads (#416). A reference with `##` sections records its text before the
 * first section, and each section the scope's own text names by its heading, so an edit to a section the scope never
 * names does not stale it. When the scope names none of the sections, or the reference has none, it cannot tell what
 * the scope uses, so it records every section: a change then stales it.
 */
function referenceInputs(name: string, content: string | undefined, read: string): Record<string, string> {
	const key = `reference ${name}`
	if (content === undefined) return { [key]: hashText(`(unresolved) ${name}`) }
	const { preamble, sections } = splitSections(content)
	if (!sections.length) return { [key]: hashText(content) }
	const named = sections.filter((section) => names(read, section.heading))
	const used = named.length ? named : sections
	return {
		[key]: hashText(preamble),
		...Object.fromEntries(used.map((section) => [`${key} ## ${section.heading}`, hashText(section.text)])),
	}
}

/** A case's own definition as hash parts (R180): its entry, the shared rubrics it tests, its files folder, its setup script. */
function caseHash(item: SuiteCase, rubrics: NonNullable<EvalsFile['rubrics']>, criteria: string[]): string {
	// A case's own cost cap bounds a run's spend and changes no result, so it is no part of the definition (#394).
	const { costCap: _costCap, ...definition } = item.item as { costCap?: number }
	const parts: [string, string][] = [['case', JSON.stringify(definition)]]
	if (item.kind === 'outcome') {
		for (const id of item.item.criteria ?? criteria)
			if (rubrics[id]) parts.push([`rubric/${id}`, JSON.stringify(rubrics[id])])
		if (typeof item.item.files === 'string') {
			const folder = resolve(item.folder, item.item.files)
			for (const path of filesUnder(folder)) parts.push([`files/${path}`, readFileSync(join(folder, path), 'utf8')])
		}
		if (typeof item.item.setup === 'string') {
			const setup = resolve(item.folder, item.item.setup)
			if (isFile(setup)) parts.push(['setup', readFileSync(setup, 'utf8')])
		}
	}
	return hashOf(parts)
}

/** The paths under `folder` that a case owns, its files folder and setup script, relative to `folder`. */
function ownedPaths(cases: SuiteCase[], folder: string): string[] {
	return cases.flatMap((item) => {
		if (item.kind !== 'outcome' || item.folder !== folder) return []
		return [item.item.files, item.item.setup]
			.filter((path): path is string => typeof path === 'string')
			.map((path) => relative(folder, resolve(folder, path)).split('\\').join('/'))
	})
}

/** The files of an eval folder no case owns, as inputs, each named by its path in the skill. */
function folderInputs(folder: string, under: string, owned: string[], skip: (path: string) => boolean) {
	const inputs: Record<string, string> = {}
	for (const path of filesUnder(folder)) {
		if (path === 'evals.yaml' || isResultFile(path) || skip(path)) continue
		if (owned.some((own) => path === own || path.startsWith(`${own}/`))) continue
		inputs[`${under}/${path}`] = hashText(readFileSync(join(folder, path), 'utf8'))
	}
	return inputs
}

export type InputOptions = {
	/**
	 * The content a run resolves for a named reference (R179), or undefined when it resolves none. Without it, a named
	 * reference counts by its name alone.
	 */
	resolve?: ((name: string) => string | undefined) | undefined
	/** The folders of the other skills a run loads, beyond the skills of the skill's own plugin, such as its dependencies'. */
	otherSkills?: string[] | undefined
}

/** The other skills a run of the skill loads: the skills of the plugin it is developed in, and any named, but itself. */
export function otherSkills(skillFolder: string, extra: string[] = []): string[] {
	const own = resolve(skillFolder)
	const found = findSkillPlugin(own)
	return [...new Set([...(found ? pluginSkills(found.root) : []), ...extra.map((folder) => resolve(folder))])]
		.filter((folder) => folder !== own)
		.sort()
}

/**
 * Each scope's input hash and each case's own (R178, R180), from the skill's files as they are now, with each scope's
 * inputs by name, so a report can name the one that changed (R177). Undefined when its evals cannot be read.
 * `criteria` is every criterion ID the skill lists, the ones a case with no `criteria` tests.
 */
export function inputHashes(
	skill: SkillFiles,
	criteria: string[],
	options: InputOptions = {},
): InputHashes | undefined {
	const read = readEvalSuite(skill.folder)
	if ('problem' in read) return undefined
	return hashesOf(skill, read, criteria, options)
}

function hashesOf(skill: SkillFiles, suite: EvalSuite, criteria: string[], options: InputOptions): InputHashes {
	const evalsFolder = join(skill.folder, 'evals')
	const all = suiteCases(suite, evalsFolder)
	const rubrics = suite.root.rubrics ?? {}
	const cases: Record<string, string> = {}
	const scopeOf: Record<string, string> = {}
	for (const item of all) {
		cases[item.id] = caseHash(item, rubrics, criteria)
		scopeOf[item.id] = item.scope
	}
	const declared = new Set(declaredLoads(skill.frontmatter)?.names ?? [])
	const named = (reach: Reach, texts: string[]) => {
		const files = reach.files.filter((path) => /\.mdx?$/i.test(path))
		const read = [...texts, ...files.map((path) => readFileSync(join(skill.folder, path), 'utf8'))].join('\n')
		return Object.assign({}, ...reach.names.map((name) => referenceInputs(name, options.resolve?.(name), read)))
	}
	const fileInputs = (reach: Reach) =>
		Object.fromEntries(reach.files.map((path) => [path, hashText(readFileSync(join(skill.folder, path), 'utf8'))]))
	const settings = { 'evals/evals.yaml settings': hashText(sharedSettings(suite.root)) }
	const frontmatter = { 'SKILL.md front matter': hashText(frontmatterWithoutDescription(skill)) }
	const { shared, rows } = splitBody(skill.body)

	const inputs: Record<string, Record<string, string>> = {}
	const description = skill.frontmatter?.['description']
	inputs[triggerScope] = {
		description: hashText(typeof description === 'string' ? description : ''),
		...Object.fromEntries(
			otherSkills(skill.folder, options.otherSkills).map((folder) => {
				const other = readSkill(folder)
				const text = other?.frontmatter?.['description']
				return [`description of ${basename(folder)}`, hashText(typeof text === 'string' ? text : '')]
			}),
		),
		...settings,
	}
	const scopeFolders = new Set(suite.folders.map((folder) => folder.name))
	const rootReach = reachOf(skill, [{ text: shared, from: '.' }], declared)
	inputs[rootScope] = {
		...frontmatter,
		'SKILL.md body': hashText(shared),
		...fileInputs(rootReach),
		...named(rootReach, [shared]),
		...folderInputs(evalsFolder, 'evals', ownedPaths(all, evalsFolder), (path) =>
			scopeFolders.has(path.split('/')[0] as string),
		),
		...settings,
	}
	for (const folder of suite.folders) {
		const instructions = `references/${folder.name}.md`
		const own = rows[folder.name] ?? []
		const reach = reachOf(
			skill,
			[
				{ text: shared, from: '.' },
				{ text: own.join('\n'), from: '.' },
				{ text: `[${folder.name}](${instructions})`, from: '.' },
			],
			declared,
		)
		inputs[folder.name] = {
			...frontmatter,
			'SKILL.md shared sections': hashText(shared),
			...(own.length ? { [`SKILL.md router row for ${instructions}`]: hashText(own.join('\n')) } : {}),
			...fileInputs(reach),
			...named(reach, [shared, own.join('\n')]),
			...folderInputs(folder.folder, `evals/${folder.name}`, ownedPaths(all, folder.folder), () => false),
			...settings,
		}
	}
	const scopes = Object.fromEntries(Object.entries(inputs).map(([scope, list]) => [scope, scopeHash(list)]))
	return { scopes, cases, scopeOf, inputs }
}

/** The hash of a skill's built scripts, which are reported when they change and select no case (O13a, R179). */
export function builtScriptsHash(skill: SkillFiles): string | undefined {
	const scripts = skill.files.filter(isBuiltScript)
	if (!scripts.length) return undefined
	return hashOf(scripts.map((path) => [path, readFileSync(join(skill.folder, path), 'utf8')]))
}

/**
 * The content a run resolves for a named reference (R179). A run starts in an empty home folder and a folder of its
 * own, so it reads no user or repository tier: it reads the managed tier, the references of the plugin the skill is
 * developed in (the run loads a copy of it), the host plugin's, and the skill's own defaults.
 */
export function runResolver(layers: ReferenceLayers, skillFolder: string): (name: string) => string | undefined {
	const found = findSkillPlugin(skillFolder)
	const read: ReferenceLayer[] = [
		...layers.layers.filter((layer) => layer.tier === 'managed'),
		...(found ? [{ tier: 'plugin' as const, dir: join(found.root, 'references'), plugin: found.name }] : []),
		...layers.layers.filter(
			(layer) => layer.tier === 'plugin' && layer.origin === 'host' && layer.plugin !== found?.name,
		),
		defaultLayer(skillFolder),
	]
	return (name) => {
		const resolved = resolveReference(name, { layers: read, harnesses: [] }, { projectSections: false })
		return resolved.status === 'found' ? resolved.content : undefined
	}
}
