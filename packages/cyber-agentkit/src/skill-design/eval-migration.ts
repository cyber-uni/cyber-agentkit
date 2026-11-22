import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { isMap, isScalar, isSeq, type Pair, parseDocument, stringify, type YAMLMap, type YAMLSeq } from 'yaml'
import { type Attestation, readAttestations } from './attestation.js'
import { inPlace, lineStart, nextLine } from './eval-case.js'
import { type EvalSuite, type OutcomeItem, readEvalSuite, rootScope, suiteCases, triggerScope } from './eval-suite.js'
import { type ExpectedEntry, type ExpectedFile, expectedView, isExpectedFile, readEvalSet } from './expected-result.js'
import type { SkillFiles } from './skill-files.js'
import { acceptedFolder, expectedPath, readExpectedFile, stem, writeExpectedFile } from './skill-test.js'
import { isExternal, linkTargets, resolveIn } from './skill-text.js'
import type { InputHashes } from './test-result.js'
import { caseIdPattern, type EvalsFile, positionalTriggerId, triggerCaseId } from './verification-checks.js'

/**
 * Moving a skill's evals from the single-list form into scopes (R184, UC6.27), as a plan first and a write only on
 * request. The plan gives each trigger case with no `id` one made from its prompt, which the author may change; moves
 * each root outcome case whose ID names an instructions file (K10) into that file's eval folder, with the files
 * folder and setup script only it names; lists the outcome cases that match none, which stay in the root scope; and
 * splits the expected result into one per scope (R181), each case's known-failure marks with it.
 *
 * An old trigger entry is matched by its prompt and an old outcome entry by its ID. Each entry matched is carried to
 * the inputs after the move, marked carried by migration, keeping the date it was recorded; one that was already behind
 * its inputs before the move keeps the hashes it had, so it stays stale. A case whose old entry no longer matches gets
 * none, so it reads as stale too.
 */

/** The reason a carried entry gives when the migration carried it. */
export const migrationReason = 'carried by migration'

/** A trigger case the migration gives an ID: its positional ID, the new one, and its prompt. */
export type TriggerId = { from: string; id: string; prompt: string; named: boolean }
/** An outcome case the migration moves into the eval folder of the instructions file its ID names. */
export type CaseMove = { case: string; scope: string; file: string }
/**
 * A files folder or setup script of a moved case: `moved` when only cases going to the same folder name it, so it moves
 * there under the same path; otherwise the path stays and the case names it from its new folder.
 */
export type PathMove = { case: string; key: 'files' | 'setup'; from: string; to: string; moved: boolean }
/** One scope's expected result after the migration: the cases carried, those with no entry, those already behind. */
export type ScopeExpected = { scope: string; file: string; carried: string[]; noEntry: string[]; behind: string[] }

export type MigrationPlan = {
	skill: string
	/** The trigger cases given an ID, in list order. */
	triggerIds: TriggerId[]
	/** The outcome cases moved into eval folders. */
	moves: CaseMove[]
	/** The root outcome cases whose ID names no instructions file, which stay in the root scope. */
	stay: string[]
	/** Each files folder and setup script of a moved case, and where it goes. */
	paths: PathMove[]
	/** The expected result split per scope; undefined when the skill has none. */
	expected?: {
		/** When the old expected result was written. */
		from: string
		scopes: ScopeExpected[]
		/** The old entries that match no case now, which are not carried. */
		dropped: string[]
	}
	/** True when the evals are already in scopes and there is nothing to move, name, or split. */
	nothing: boolean
}

export type MigrationProblem = { code: 'no-cases' | 'evals-invalid' | 'bad-case-id'; problem: string }

/** The names of the instructions files `SKILL.md` links (K10): `references/<name>.md` files that exist. */
export function instructionsFiles(skill: SkillFiles): string[] {
	const files = new Set(skill.files)
	const names = linkTargets(skill.body)
		.filter((target) => !isExternal(target))
		.map((target) => resolveIn('.', target.split('#')[0] as string))
		.filter((path) => /^references\/[^/]+\.md$/.test(path) && files.has(path))
		.map((path) => path.slice('references/'.length, -'.md'.length))
	return [...new Set(names)].sort()
}

/** The instructions file an outcome case's ID names: the longest `<name>` it equals or starts with as `<name>-`. */
export function scopeNamed(id: string, names: string[]): string | undefined {
	return [...names]
		.sort((a, b) => b.length - a.length)
		.find((name) => id === name || id.startsWith(`${name}-`) || id.startsWith(`${name}.`) || id.startsWith(`${name}_`))
}

/** An ID made from a trigger case's prompt: its first words, lowercase, joined by `-`. */
export function promptId(prompt: string): string {
	const words = prompt
		.toLowerCase()
		.normalize('NFKD')
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, ' ')
		.trim()
		.split(' ')
		.filter(Boolean)
	const kept: string[] = []
	for (const word of words) {
		if (kept.length === 5 || [...kept, word].join('-').length > 40) break
		kept.push(word)
	}
	return kept.join('-') || 'trigger-case'
}

const normalized = (text: string) => text.replace(/\s+/g, ' ').trim()
const posix = (path: string) => path.split('\\').join('/')

/**
 * The migration's plan for a skill, or why it cannot be made. `ids` gives a trigger case an ID of the author's
 * choosing, by its positional ID (`trigger-3`). `before`, the input hashes as they are now, tells which old entries were
 * already behind their inputs.
 */
export function planMigration(
	skill: SkillFiles,
	criteria: string[],
	options: { ids?: Record<string, string>; before?: InputHashes | undefined } = {},
): MigrationPlan | MigrationProblem {
	const suite = readEvalSuite(skill.folder, criteria)
	if ('problem' in suite) return suite
	const name =
		typeof skill.frontmatter?.['name'] === 'string' ? (skill.frontmatter['name'] as string) : skill.folderName
	const evalsFolder = join(skill.folder, 'evals')
	const names = instructionsFiles(skill)
	const triggers = suite.root.trigger ?? []
	const outcomeIds = suiteCases(suite, evalsFolder)
		.filter((item) => item.kind === 'outcome')
		.map((item) => item.id)
	const ids = options.ids ?? {}
	const unnamed = new Set(
		triggers.flatMap((item, index) => (item.id === undefined ? [triggerCaseId(item, index)] : [])),
	)
	const unknown = Object.keys(ids).filter((from) => !unnamed.has(from))
	if (unknown.length)
		return {
			code: 'bad-case-id',
			problem: `--id names ${unknown.join(', ')}, which ${unknown.length === 1 ? 'is' : 'are'} no trigger case without an \`id\`${unnamed.size ? `; those are ${[...unnamed].join(', ')}` : ''}`,
		}
	for (const id of Object.values(ids))
		if (!caseIdPattern.test(id) || id.includes('..') || positionalTriggerId.test(id))
			return {
				code: 'bad-case-id',
				problem: `${JSON.stringify(id)} is not a case ID a trigger case can take: use letters, digits, '.', '_', and '-', starting with a letter or digit, and not the form \`trigger-<n>\``,
			}
	// Every ID stays unique in the skill (R175): the ones the cases have, the author's, then the ones made from prompts.
	const taken = new Set([...outcomeIds, ...triggers.flatMap((item) => (item.id === undefined ? [] : [item.id]))])
	for (const id of Object.values(ids)) {
		if (taken.has(id))
			return { code: 'bad-case-id', problem: `${id} is already the ID of another case; pick another with --id` }
		taken.add(id)
	}
	const triggerIds: TriggerId[] = []
	triggers.forEach((item, index) => {
		if (item.id !== undefined) return
		const from = triggerCaseId(item, index)
		let id = ids[from]
		if (!id) {
			const base = promptId(item.prompt)
			id = base
			for (let n = 2; taken.has(id) || positionalTriggerId.test(id); n++) id = `${base}-${n}`
			taken.add(id)
		}
		triggerIds.push({ from, id, prompt: item.prompt, named: from in ids })
	})
	const moves: CaseMove[] = []
	const stay: string[] = []
	for (const item of suite.root.outcome ?? []) {
		const scope = scopeNamed(item.id, names)
		if (scope) moves.push({ case: item.id, scope, file: `evals/${scope}/evals.yaml` })
		else stay.push(item.id)
	}
	const paths = pathMoves(suite, evalsFolder, moves)
	const expected = expectedPlan(skill, criteria, suite, triggerIds, moves, options.before)
	const nothing = !triggerIds.length && !moves.length && (!expected || splitAlready(skill.folder, suite))
	return { skill: name, triggerIds, moves, stay, paths, ...(expected ? { expected } : {}), nothing }
}

/**
 * Whether the expected result is already per scope: `evals/expected.json` is the per-case form and holds no entry of
 * an eval folder's scope, which the single-file form of #369 did. A version 1 file is one saved run, so it is not.
 */
function splitAlready(skillFolder: string, suite: EvalSuite): boolean {
	let value: unknown
	try {
		value = JSON.parse(readFileSync(expectedPath(skillFolder), 'utf8'))
	} catch {
		return true
	}
	if (!isExpectedFile(value)) return !expectedView(value)
	const folders = new Set(suite.folders.map((folder) => folder.name))
	return !Object.values(value.entries).some((entry) => folders.has(entry.scope))
}

/** Each files folder and setup script the moved cases name, and where each goes. */
function pathMoves(suite: EvalSuite, evalsFolder: string, moves: CaseMove[]): PathMove[] {
	const target = new Map(moves.map((move) => [move.case, move.scope]))
	// Every path a case names, absolute, with the folder its case lists it from after the move.
	const named = suiteCases(suite, evalsFolder).flatMap((item) => {
		if (item.kind !== 'outcome') return []
		const scope = target.get(item.id)
		const lister = scope ? join(evalsFolder, scope) : item.folder
		return (['files', 'setup'] as const).flatMap((key) =>
			typeof item.item[key] === 'string'
				? [
						{
							case: item.id,
							key,
							value: item.item[key] as string,
							path: resolve(item.folder, item.item[key] as string),
							lister,
						},
					]
				: [],
		)
	})
	const overlaps = (a: string, b: string) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)
	return named.flatMap((entry) => {
		const scope = target.get(entry.case)
		if (!scope) return []
		const folder = join(evalsFolder, scope)
		const inside = relative(evalsFolder, entry.path)
		const shared = named.some((other) => other.lister !== folder && overlaps(other.path, entry.path))
		const destination = join(folder, entry.value)
		const movable =
			!shared &&
			inside !== '' &&
			!inside.startsWith('..') &&
			!relative(folder, destination).startsWith('..') &&
			!existsSync(destination)
		return [
			{
				case: entry.case,
				key: entry.key,
				from: posix(relative(evalsFolder, entry.path)),
				to: movable ? posix(entry.value) : posix(relative(folder, entry.path)),
				moved: movable,
			},
		]
	})
}

/** The case IDs after the migration, by the ID each had before it. */
function renames(triggerIds: TriggerId[]): Map<string, string> {
	return new Map(triggerIds.map((item) => [item.from, item.id]))
}

/** The old entries matched to the cases after the migration, each with its new ID and scope. */
type Matched = { id: string; scope: string; from: string; entry: ExpectedEntry; behind: boolean }

function matchEntries(
	old: ExpectedFile,
	suite: EvalSuite,
	evalsFolder: string,
	triggerIds: TriggerId[],
	moves: CaseMove[],
	before: InputHashes | undefined,
): { matched: Matched[]; noEntry: { id: string; scope: string }[]; dropped: string[] } {
	const renamed = renames(triggerIds)
	const moved = new Map(moves.map((move) => [move.case, move.scope]))
	const used = new Set<string>()
	const matched: Matched[] = []
	const noEntry: { id: string; scope: string }[] = []
	const behindOf = (from: string, entry: ExpectedEntry) => {
		if (!entry.hashes || !before) return false
		const scope = before.scopeOf?.[from]
		return entry.hashes.case !== before.cases[from] || !scope || entry.hashes.scope !== before.scopes[scope]
	}
	for (const item of suiteCases(suite, evalsFolder)) {
		if (item.kind === 'trigger') {
			const id = renamed.get(item.id) ?? item.id
			// An old trigger entry is matched by its prompt, and what it expects (R184).
			const found = Object.entries(old.entries).find(
				([key, entry]) =>
					!used.has(key) &&
					entry.prompt !== undefined &&
					normalized(entry.prompt) === normalized(item.item.prompt) &&
					(entry.expect === undefined || entry.expect === item.item.expect),
			)
			if (!found) {
				noEntry.push({ id, scope: triggerScope })
				continue
			}
			used.add(found[0])
			matched.push({ id, scope: triggerScope, from: found[0], entry: found[1], behind: behindOf(found[0], found[1]) })
			continue
		}
		const scope = moved.get(item.id) ?? item.scope
		// An old outcome entry is matched by its ID (R184).
		const entry = old.entries[item.id]
		if (!entry || entry.prompt !== undefined) {
			noEntry.push({ id: item.id, scope })
			continue
		}
		used.add(item.id)
		matched.push({ id: item.id, scope, from: item.id, entry, behind: behindOf(item.id, entry) })
	}
	return { matched, noEntry, dropped: Object.keys(old.entries).filter((key) => !used.has(key)) }
}

const scopeFile = (scope: string) =>
	scope === triggerScope || scope === rootScope ? 'evals/expected.json' : `evals/${scope}/expected.json`

function expectedPlan(
	skill: SkillFiles,
	criteria: string[],
	suite: EvalSuite,
	triggerIds: TriggerId[],
	moves: CaseMove[],
	before: InputHashes | undefined,
): MigrationPlan['expected'] {
	const old = readExpectedFile(skill.folder, readEvalSet(skill.folder, criteria))
	if (!old) return undefined
	const { matched, noEntry, dropped } = matchEntries(old, suite, join(skill.folder, 'evals'), triggerIds, moves, before)
	const scopes = new Map<string, ScopeExpected>()
	const of = (scope: string) => {
		const found = scopes.get(scope) ?? { scope, file: scopeFile(scope), carried: [], noEntry: [], behind: [] }
		scopes.set(scope, found)
		return found
	}
	for (const item of [...matched, ...noEntry.map((n) => ({ ...n, none: true as const }))]) of(item.scope)
	for (const item of matched) (item.behind ? of(item.scope).behind : of(item.scope).carried).push(item.id)
	for (const item of noEntry) of(item.scope).noEntry.push(item.id)
	return { from: old.at, scopes: [...scopes.values()], dropped }
}

/** The column of the `-` that opens a block sequence item, or undefined when the item does not open its line with one. */
function dashColumn(source: string, item: { range?: [number, number, number] | null }): number | undefined {
	if (!item.range) return undefined
	const start = lineStart(source, item.range[0])
	const match = /^( *)- +$/.exec(source.slice(start, item.range[0]))
	return match ? (match[1] as string).length : undefined
}

/** Where the comment lines right above the line at `start` begin: a case's comments move with it. */
function withComments(source: string, start: number): number {
	let at = start
	while (at > 0) {
		const previous = lineStart(source, at - 1)
		if (!/^\s*#/.test(source.slice(previous, at - 1))) break
		at = previous
	}
	return at
}

/** A path as a YAML scalar: plain when it can be, quoted otherwise. */
const scalar = (text: string) => (/^[A-Za-z0-9._/][A-Za-z0-9._/-]*$/.test(text) ? text : JSON.stringify(text))

type Edit = { start: number; end: number; text: string }

function applyEdits(source: string, edits: Edit[]): string {
	let out = source
	for (const edit of [...edits].sort((a, b) => b.start - a.start))
		out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
	return out
}

/**
 * The root `evals.yaml` after the migration, and the text of each moved case for its folder, edited in the author's
 * own text where each change is; undefined for one that cannot be placed there, which is then written whole.
 */
function editedRoot(
	source: string,
	triggerIds: TriggerId[],
	moves: CaseMove[],
	paths: PathMove[],
): { root: string | undefined; moved: Map<string, string | undefined> } {
	const doc = parseDocument(source)
	const edits: Edit[] = []
	const moved = new Map<string, string | undefined>()
	const given = new Map(triggerIds.map((item) => [item.from, item.id]))
	const trigger = doc.get('trigger', true)
	let placed = true
	if (given.size) {
		if (!isSeq(trigger)) placed = false
		else
			(trigger as YAMLSeq).items.forEach((node, index) => {
				const id = given.get(`trigger-${index + 1}`)
				if (!id || !placed) return
				if (!isMap(node) || !node.range || !node.items.length) {
					placed = false
					return
				}
				const first = (node.items[0] as Pair).key as { range?: [number, number, number] }
				if (!first?.range) {
					placed = false
					return
				}
				if (node.flow) edits.push({ start: first.range[0], end: first.range[0], text: `id: ${scalar(id)}, ` })
				else {
					const column = first.range[0] - lineStart(source, first.range[0])
					edits.push({ start: first.range[0], end: first.range[0], text: `id: ${scalar(id)}\n${' '.repeat(column)}` })
				}
			})
	}
	const leaving = new Set(moves.map((move) => move.case))
	const outcomePair = isMap(doc.contents)
		? (doc.contents as YAMLMap).items.find((pair) => isScalar(pair.key) && pair.key.value === 'outcome')
		: undefined
	const outcome = outcomePair?.value
	if (leaving.size) {
		if (!isSeq(outcome) || outcome.flow) placed = false
		else {
			const items = outcome.items as YAMLMap[]
			const gone = items.filter((node) => leaving.has(String(node.get?.('id'))))
			items.forEach((node, index) => {
				const id = String(node.get?.('id'))
				if (!leaving.has(id)) return
				const column = dashColumn(source, node)
				const next = items[index + 1]
				if (column === undefined || !node.range || (next && dashColumn(source, next) === undefined)) {
					placed = false
					moved.set(id, undefined)
					return
				}
				const start = withComments(source, lineStart(source, node.range[0]))
				const end = next?.range
					? withComments(source, lineStart(source, next.range[0]))
					: nextLine(source, node.range[2])
				edits.push({ start, end, text: '' })
				moved.set(
					id,
					caseText(
						source,
						node,
						start,
						end,
						column,
						paths.filter((p) => p.case === id),
					),
				)
			})
			if (gone.length === items.length) {
				const key = outcomePair?.key as { range?: [number, number, number] } | undefined
				if (!key?.range) placed = false
				else {
					const start = lineStart(source, key.range[0])
					const firstItem = items[0]?.range
						? withComments(source, lineStart(source, (items[0] as YAMLMap).range?.[0] as number))
						: nextLine(source, key.range[2])
					edits.push({ start, end: firstItem, text: '' })
				}
			}
		}
	}
	return { root: placed ? applyEdits(source, edits) : undefined, moved }
}

/** A moved case's own text, re-indented to `- ` at column 2, with its files folder and setup script pointed at. */
function caseText(
	source: string,
	node: YAMLMap,
	start: number,
	end: number,
	column: number,
	paths: PathMove[],
): string | undefined {
	const edits: Edit[] = []
	for (const path of paths) {
		const pair = node.items.find((p) => isScalar(p.key) && p.key.value === path.key)
		const value = pair?.value as { range?: [number, number, number] } | undefined
		if (!value?.range) return undefined
		edits.push({ start: value.range[0] - start, end: value.range[1] - start, text: scalar(path.to) })
	}
	const text = applyEdits(source.slice(start, end), edits)
	const shift = 2 - column
	const lines = text.replace(/\n*$/, '\n').split('\n')
	if (shift < 0 && lines.some((line) => line.trim() && !line.startsWith(' '.repeat(-shift)))) return undefined
	return lines.map((line) => (!line ? line : shift >= 0 ? ' '.repeat(shift) + line : line.slice(-shift))).join('\n')
}

/** What the migration writes: each eval file, and each path moved, relative to the skill folder. */
export type MigrationWrite = {
	/** The eval files written. */
	evals: string[]
	/** The files folders and setup scripts moved. */
	moved: string[]
	/** The expected result files written. */
	expected: string[]
	/** Where the old expected result was kept, when there was one. */
	kept?: string
	/** The eval files written whole, since an edit could not be placed in the author's own text. */
	rewritten: string[]
}

/**
 * Writes the plan (R184): the eval files, each moved case's files folder and setup script, and the expected result per
 * scope, its matched entries carried to the inputs `after` hashes once the evals are in place. The old expected result
 * is kept in `evals/accepted/`. `at` is when the migration ran.
 */
export function writeMigration(
	skill: SkillFiles,
	criteria: string[],
	plan: MigrationPlan,
	after: () => InputHashes | undefined,
	at: string,
	before?: InputHashes,
): MigrationWrite | MigrationProblem {
	const suite = readEvalSuite(skill.folder, criteria)
	if ('problem' in suite) return suite
	const evalsFolder = join(skill.folder, 'evals')
	const rootPath = join(evalsFolder, 'evals.yaml')
	const source = readFileSync(rootPath, 'utf8')
	const old = plan.expected ? readExpectedFile(skill.folder, readEvalSet(skill.folder, criteria)) : undefined
	const attested = readAttestations(skill.folder)
	const written: MigrationWrite = { evals: [], moved: [], expected: [], rewritten: [] }

	// The values every eval file must hold after the move, which a text edit must read back as.
	const given = renames(plan.triggerIds)
	const target = new Map(plan.moves.map((move) => [move.case, move.scope]))
	const pointed = (item: OutcomeItem): OutcomeItem => {
		const out = { ...item }
		for (const path of plan.paths.filter((p) => p.case === item.id)) out[path.key] = path.to
		return out
	}
	const rootValue: EvalsFile = { ...suite.root }
	if (suite.root.trigger)
		rootValue.trigger = suite.root.trigger.map((item, index) => {
			const id = given.get(triggerCaseId(item, index))
			return id ? { id, ...item } : item
		})
	const staying = (suite.root.outcome ?? []).filter((item) => !target.has(item.id))
	if (suite.root.outcome) {
		if (staying.length) rootValue.outcome = staying
		else delete rootValue.outcome
	}
	const edited = editedRoot(source, plan.triggerIds, plan.moves, plan.paths)
	const rootText = inPlace(rootValue, edited.root)
	if (plan.triggerIds.length || plan.moves.length) {
		if (rootText === undefined) written.rewritten.push('evals/evals.yaml')
		writeFileSync(rootPath, rootText ?? stringify(rootValue, { lineWidth: 0 }))
		written.evals.push('evals/evals.yaml')
	}
	for (const scope of [...new Set(plan.moves.map((move) => move.scope))]) {
		const file = `evals/${scope}/evals.yaml`
		const path = join(skill.folder, file)
		const existing = suite.folders.find((folder) => folder.name === scope)
		const cases = plan.moves.filter((move) => move.scope === scope).map((move) => move.case)
		const items = cases.map((id) => pointed((suite.root.outcome ?? []).find((item) => item.id === id) as OutcomeItem))
		const value = { outcome: [...(existing?.outcome ?? []), ...items] }
		const head = existing ? readFileSync(path, 'utf8') : 'outcome:\n'
		const texts = cases.map((id) => edited.moved.get(id))
		const text = texts.every((t) => t !== undefined)
			? inPlace(value, `${head}${head.endsWith('\n') ? '' : '\n'}${texts.join('')}`)
			: undefined
		mkdirSync(dirname(path), { recursive: true })
		if (text === undefined) written.rewritten.push(file)
		writeFileSync(path, text ?? stringify(value, { lineWidth: 0 }))
		written.evals.push(file)
	}
	for (const path of plan.paths.filter((p) => p.moved)) {
		const from = join(evalsFolder, path.from)
		const scope = target.get(path.case) as string
		const to = join(evalsFolder, scope, path.to)
		if (!existsSync(from) || existsSync(to)) continue
		mkdirSync(dirname(to), { recursive: true })
		try {
			renameSync(from, to)
		} catch {
			cpSync(from, to, { recursive: true })
			rmSync(from, { recursive: true, force: true })
		}
		written.moved.push(posix(relative(skill.folder, to)))
	}

	if (old && plan.expected) {
		const now = after()
		const moved = readEvalSuite(skill.folder, criteria)
		if ('problem' in moved) return moved
		const { matched } = matchEntries(old, suite, evalsFolder, plan.triggerIds, plan.moves, before)
		const renamedCase = (id: string) => given.get(id) ?? id
		const entries: Record<string, ExpectedEntry> = {}
		const byId = new Map(matched.map((item) => [item.id, item]))
		for (const item of suiteCases(moved, evalsFolder)) {
			const match = byId.get(item.id)
			if (!match) continue
			const { carried: _carried, ...entry } = match.entry
			const knownFailures = entry.knownFailures?.map((k) => ({ ...k, case: item.id }))
			const sandboxFailures = entry.sandboxFailures?.map((s) => ({ ...s, case: item.id }))
			const caseHash = now?.cases[item.id]
			const scopeHash = now?.scopes[item.scope]
			const base: ExpectedEntry = {
				...entry,
				scope: item.scope,
				...(knownFailures ? { knownFailures } : {}),
				...(sandboxFailures ? { sandboxFailures } : {}),
			}
			entries[item.id] =
				match.behind || !caseHash || !scopeHash
					? base
					: { ...base, hashes: { case: caseHash, scope: scopeHash }, carried: { reason: migrationReason, at } }
		}
		const inputs: Record<string, Record<string, string>> = { ...(old.inputs ?? {}) }
		for (const [scope, hash] of Object.entries(now?.scopes ?? {})) {
			const list = now?.inputs?.[scope]
			if (list) inputs[hash] = list
		}
		const recorded = new Set(Object.values(entries).flatMap((entry) => (entry.hashes ? [entry.hashes.scope] : [])))
		const keptInputs = Object.fromEntries(Object.entries(inputs).filter(([hash]) => recorded.has(hash)))
		const { inputs: _inputs, attested: _attested, ...rest } = old
		const file: ExpectedFile = {
			...rest,
			entries,
			...(Object.keys(keptInputs).length ? { inputs: keptInputs } : {}),
			...(now?.reported ? { reported: now.reported } : {}),
		}
		// The old expected result is kept as a past accepted one, as an accept keeps the result it replaces.
		const oldPath = expectedPath(skill.folder)
		if (existsSync(oldPath)) {
			const folder = acceptedFolder(skill.folder)
			mkdirSync(folder, { recursive: true })
			const kept = join(folder, `${stem(old.at)}.json`)
			if (!existsSync(kept)) {
				cpSync(oldPath, kept)
				written.kept = posix(relative(skill.folder, kept))
			}
		}
		const renamedAttested: Attestation[] = attested.map((entry) =>
			entry.case !== undefined ? { ...entry, case: renamedCase(entry.case) } : entry,
		)
		written.expected = writeExpectedFile(skill.folder, file, renamedAttested).map((path) =>
			posix(relative(skill.folder, path)),
		)
	}
	return written
}
