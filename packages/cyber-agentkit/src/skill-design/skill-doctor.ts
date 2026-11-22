import { readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { parse } from 'yaml'
import type { HarnessId } from '../harness/harness-id.js'
import { checkReferences, type ReferenceCheckEntry } from '../references/reference-check.js'
import { referenceImplementations } from '../references/reference-implementations.js'
import { interfaceSuffix } from '../references/reference-interface.js'
import type { ReferenceLayers } from '../references/reference-layers.js'
import { consumerLoads, knownBy } from '../references/reference-loads.js'
import { resolveReference } from '../references/resolve-reference.js'
import { withDefault } from '../references/skill-defaults.js'
import type { FoundSkill } from '../skills/skill-folder.js'

/** A failure or a warning on one reference, with what the user can do about it. */
export type DoctorProblem = {
	/** The failed check, or the warning's code. */
	code: string
	message: string
	/** What the user can do: the command that owns the repair, or who to ask. Doctor itself changes nothing. */
	action: string
}

/** One reference a skill loads, as this machine and this repository resolve it. */
export type DoctorReference = {
	name: string
	/** `passed` or `failed` for a composed document; otherwise why none was composed. */
	status: ReferenceCheckEntry['status']
	/** The tiers whose contribution is used, bottom first: `managed`, `repo`, `user`, `plugin <name>`, or `default`. */
	answeredBy: string[]
	/** The file of the top contribution used, the one to look at first. */
	file?: string
	/** Set for an implementation of an interface the skill loads the implementations of. */
	implements?: string
	failures?: DoctorProblem[]
	warnings?: DoctorProblem[]
}

export type SkillDoctorEntry = {
	skill: string
	folder: string
	/** `failed` when a reference fails; `warned` when one only warns; `passed` otherwise, a skill that loads none included. */
	status: 'passed' | 'warned' | 'failed'
	references: DoctorReference[]
	/** The interfaces whose implementations the skill loads. */
	interfaces?: string[]
	/** Warnings on a file the checked harness reads by a fixed path, such as Codex's `agents/openai.yaml`. */
	warnings?: DoctorProblem[]
	/** Pointers, never failures: a file read from outside `references/`, or one not examined, and why. */
	notes?: string[]
}

export type SkillDoctorReport = {
	status: 'passed' | 'warned' | 'failed'
	skills: SkillDoctorEntry[]
	/** Why some skills may be missing from an examination of every skill, when the detected harnesses leave any out. */
	unverified?: string
}

export type DoctorOptions = {
	/** How a path is shown, such as with the home folder as `~`. */
	display?: ((path: string) => string) | undefined
	/**
	 * The harness the skills are checked for. Codex also reads `agents/openai.yaml` (E-CODEX-K1), so it is
	 * examined only for `codex`. Leave it out, or pass `unknown`, to read only the harness-neutral files.
	 */
	harness?: HarnessId | 'unknown' | undefined
}

/** The file Codex reads beside a skill's `SKILL.md` (E-CODEX-K1). */
const codexMetadata = join('agents', 'openai.yaml')

type Answer = { answeredBy: string[]; tier?: string; plugin?: string; file?: string }

function answerOf(name: string, layers: ReferenceLayers, display: (path: string) => string): Answer {
	const used = resolveReference(name, layers).trace.layers.filter(({ outcome }) => outcome === 'used')
	const top = used.at(-1)
	return {
		answeredBy: used.map((layer) => (layer.tier === 'plugin' && layer.plugin ? `plugin ${layer.plugin}` : layer.tier)),
		...(top ? { tier: top.tier } : {}),
		...(top?.plugin ? { plugin: top.plugin } : {}),
		...(top ? { file: display(top.path) } : {}),
	}
}

/** Who answers a fix for the document a tier holds. */
function ownerAction(name: string, answer: Answer, verb: 'Fix' | 'Review'): string {
	const file = answer.file ?? name
	switch (answer.tier) {
		case 'repo':
		case 'user':
			return `${verb} ${file}, the ${answer.tier} copy: \`reference customize ${name}\` revises it, and \`reference delete ${name}${answer.tier === 'user' ? ' --scope user' : ''}\` removes it so the tier below answers.`
		case 'project':
			return `${verb} ${file}, the copy a project folder holds for the work inside it.`
		case 'managed':
			return `${verb === 'Fix' ? 'Ask' : 'Tell'} whoever manages this machine's policy about ${file}: the managed copy answers it, and only they can change it.`
		case 'plugin':
			return `The ${answer.plugin ? `${answer.plugin} plugin's` : "plugin's"} own copy (${file}) answers it: update the plugin or report it to its author, or override it in this repository with \`reference customize ${name}\`.`
		case 'default':
			return `The skill's bundled default (${file}) answers it: update the skill or report it to its author, or override it in this repository with \`reference customize ${name}\`.`
		default:
			return `${verb} the file that answers it: \`reference where ${name}\` names it.`
	}
}

function failureAction(name: string, check: string, answer: Answer): string {
	switch (check) {
		case 'reference-missing':
			return `No tier holds it: install or enable the plugin that ships it, or write one with \`reference create ${name}\`.`
		case 'reference-ambiguous':
			return `Several contributions answer it in no order: pick one with \`reference customize ${name}\`, which writes an \`extends\` that orders them.`
		case 'reference-invalid':
			return "The skill's load line names something that is not a reference name: report it to the skill's author."
		default:
			return ownerAction(name, answer, 'Fix')
	}
}

function warningAction(name: string, code: string, answer: Answer): string {
	switch (code) {
		case 'reference-legacy-format':
		case 'reference-renamed':
			return `\`reference migrate ${name}\` updates the file.`
		case 'reference-stale':
			return `\`reference customize ${name}\` revises it from its recorded request.`
		default:
			return ownerAction(name, answer, 'Review')
	}
}

/** The names to check for one interface: its document, then each implementation a load of it may return. */
function interfaceNames(id: string, layers: ReferenceLayers): { name: string; excluded?: string[] }[] {
	const names: { name: string; excluded?: string[] }[] = [{ name: `${id}${interfaceSuffix}` }]
	try {
		const found = referenceImplementations(id, layers)
		if (!('implementations' in found)) return names
		for (const { pin } of found.implementations) names.push({ name: pin })
		for (const { name, reasons } of found.excluded) names.push({ name, excluded: reasons })
	} catch {
		// An unknown interface: its document's own check reports it missing.
	}
	return names
}

/** A fenced code block: an example of a load line, not a load. */
const fence = /^(```|~~~)[^\n]*\n[\s\S]*?^\1[ \t]*$/gm

const textFile = /\.(md|mdx|txt|ya?ml|json|toml)$/i
/** A bundled default copy, which is a reference itself and not text that loads one. */
const defaultCopy = /\.default\.[a-z]+$/i
/** A Markdown link's target. */
const linkTarget = /\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g
/** A backticked path under a folder a skill keeps its files in, which a skill names as plain text (SHP-2). */
const pathToken = /`((?:\.\/)?(?:references|scripts|assets)\/[^`\s]+\.[A-Za-z0-9]+)`/g

function isFile(path: string): boolean {
	try {
		return statSync(path).isFile()
	} catch {
		return false
	}
}

/** The files a text links or names as a path, resolved from its own folder, else from the skill's. */
function linkedFiles(text: string, from: string, folder: string): string[] {
	const found: string[] = []
	const targets = [...text.matchAll(linkTarget)].map((match) => match[1] as string)
	const named = [...text.matchAll(pathToken)].map((match) => match[1] as string)
	for (const raw of [...targets, ...named]) {
		const target = raw.split('#')[0] as string
		if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || isAbsolute(target) || target.startsWith('~')) continue
		const path = [resolve(dirname(from), target), resolve(folder, target)].find(isFile)
		if (path && textFile.test(path) && !defaultCopy.test(path)) found.push(path)
	}
	return found
}

/** Whether `path` is `folder` or inside it. */
function inside(folder: string, path: string): boolean {
	const rel = relative(folder, path)
	return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/**
 * The files an agent reads when it runs the skill: its `SKILL.md`, then every file it links or names, and every file
 * those link, wherever each sits: a Markdown link to any file, and a plain-text path under `references/`,
 * `scripts/`, or `assets/`. A file in the skill's `agents/` folder is for one harness: Codex's `agents/openai.yaml`
 * is read by its fixed path when Codex is checked (`codexMetadataProblems`), and no other harness's file there is
 * verified, so none is followed. Each followed file outside `references/` and `assets/` is passed on as a pointer to
 * `skill check`, which owns where a skill's files belong.
 */
function runtimeFiles(folder: string, display: (path: string) => string): { files: string[]; notes: string[] } {
	const metadata = join(folder, codexMetadata)
	const entry = join(folder, 'SKILL.md')
	const files: string[] = []
	const notes: string[] = []
	const seen = new Set<string>()
	const queue = isFile(entry) ? [entry] : []
	while (queue.length) {
		const file = queue.shift() as string
		if (seen.has(file)) continue
		seen.add(file)
		if (file === metadata) continue
		if (file !== entry && inside(join(folder, 'agents'), file)) {
			notes.push(
				`${relative(folder, file)} is for one harness, and which harness reads it is not verified, so its loads are not examined`,
			)
			continue
		}
		files.push(file)
		if (file !== entry && !['references', 'assets'].some((kept) => inside(join(folder, kept), file)))
			notes.push(
				`${inside(folder, file) ? relative(folder, file) : display(file)} is read when the skill runs but sits outside references/ and assets/; \`skill check\` reports where a skill's files belong`,
			)
		if (/\.(md|mdx)$/i.test(file))
			queue.push(...linkedFiles(readFileSync(file, 'utf8').replace(fence, ''), file, folder))
	}
	return { files, notes }
}

/**
 * The names and interfaces the skill loads when it runs: the lists its `SKILL.md` declares under `metadata`, else
 * what `reference uses` reads from the files it reads, outside fenced examples. Also the notes on those files.
 */
function skillLoads(
	folder: string,
	display: (path: string) => string,
	resolves: (name: string) => boolean,
): { names: string[]; interfaces: string[]; notes: string[] } {
	const { files, notes } = runtimeFiles(folder, display)
	const entry = join(folder, 'SKILL.md')
	const loads = consumerLoads(
		isFile(entry) ? entry : undefined,
		files.map((file) => readFileSync(file, 'utf8')),
		knownBy(resolves),
	)
	return { names: loads.names, interfaces: loads.interfaces, notes }
}

type CodexMetadataResult = { warnings: DoctorProblem[]; notes: string[] }

const codexAction = (file: string) =>
	`Fix ${file}, or report it to the skill's author. Codex still loads SKILL.md without what it ignores.`

/**
 * What Codex makes of the skill's `agents/openai.yaml`: it ignores the whole file when it is not valid YAML
 * (E-CODEX-K3), and an icon that is not a relative path under the skill's `assets/` (E-CODEX-K4).
 */
function codexMetadataProblems(folder: string): CodexMetadataResult {
	const path = join(folder, codexMetadata)
	const file = codexMetadata.split(sep).join('/')
	const result: CodexMetadataResult = { warnings: [], notes: [] }
	if (!isFile(path)) return result
	let parsed: unknown
	try {
		parsed = parse(readFileSync(path, 'utf8'))
	} catch (error) {
		result.warnings.push({
			code: 'codex-metadata-invalid',
			message: `Codex ignores ${file}: it is not valid YAML (${(error as Error).message.split('\n')[0]})`,
			action: codexAction(file),
		})
		return result
	}
	if (parsed === null || parsed === undefined) return result
	if (typeof parsed !== 'object' || Array.isArray(parsed)) {
		result.warnings.push({
			code: 'codex-metadata-invalid',
			message: `Codex ignores ${file}: it is not a mapping of \`interface\`, \`dependencies\`, and \`policy\``,
			action: codexAction(file),
		})
		return result
	}
	const record = parsed as Record<string, unknown>
	const iface = record['interface']
	if (iface && typeof iface === 'object' && !Array.isArray(iface))
		for (const field of ['icon_small', 'icon_large']) {
			const value = (iface as Record<string, unknown>)[field]
			if (typeof value !== 'string' || !value) continue
			const normalized = normalize(value)
			const parts = normalized.split(/[\\/]/).filter((part) => part && part !== '.')
			if (isAbsolute(value) || (!parts.includes('..') && parts[0] !== 'assets')) {
				result.warnings.push({
					code: 'codex-icon-ignored',
					message: `Codex ignores \`interface.${field}\` (${value}): an icon must be a relative path under the skill's assets/`,
					action: codexAction(file),
				})
				continue
			}
			if (!isFile(resolve(folder, value)))
				result.warnings.push({
					code: 'codex-icon-missing',
					message: `\`interface.${field}\` names ${value}, which does not exist`,
					action: codexAction(file),
				})
		}
	const policy = record['policy']
	if (
		policy &&
		typeof policy === 'object' &&
		(policy as Record<string, unknown>)['allow_implicit_invocation'] === false
	)
		result.notes.push(
			`${file} sets \`policy.allow_implicit_invocation: false\`, so Codex runs the skill only when it is named (\`$<skill>\`)`,
		)
	return result
}

function doctorOne(
	skill: FoundSkill,
	layers: ReferenceLayers,
	display: (path: string) => string,
	harness: HarnessId | 'unknown' | undefined,
): SkillDoctorEntry {
	const loadLayers = withDefault(layers, skill.folder)
	const uses = skillLoads(skill.folder, display, (name) => resolveReference(name, loadLayers).status === 'found')
	const own: CodexMetadataResult =
		harness === 'codex'
			? codexMetadataProblems(skill.folder)
			: {
					warnings: [],
					notes: isFile(join(skill.folder, codexMetadata))
						? [
								`${codexMetadata.split(sep).join('/')} is read by Codex, which is not checked here, so it is not examined; \`--all-harnesses\` checks it when Codex is installed`,
							]
						: [],
				}
	const notes = [...uses.notes, ...own.notes]
	const wanted: { name: string; implements?: string; excluded?: string[] }[] = uses.names.map((name) => ({ name }))
	for (const id of uses.interfaces)
		for (const entry of interfaceNames(id, loadLayers)) {
			if (wanted.some(({ name }) => name === entry.name)) continue
			wanted.push(entry.name === `${id}${interfaceSuffix}` ? entry : { ...entry, implements: id })
		}
	const entries = wanted.length ? checkReferences(loadLayers, { names: wanted.map(({ name }) => name), display }) : []
	const references = entries.map((entry, index): DoctorReference => {
		const { name, implements: iface, excluded } = wanted[index] as (typeof wanted)[number]
		const answer = answerOf(name, loadLayers, display)
		const failures = entry.failures.map(({ check, message }) => ({
			code: check,
			message,
			action: failureAction(name, check, answer),
		}))
		const warnings: DoctorProblem[] = entry.warnings.map(({ code, message }) => ({
			code,
			message,
			action: warningAction(name, code, answer),
		}))
		if (excluded?.length && !failures.length)
			warnings.push({
				code: 'implementation-excluded',
				message: `a load of the ${iface} implementations leaves it out: ${excluded.join('; ')}`,
				action: ownerAction(name, answer, 'Review'),
			})
		return {
			name,
			status: entry.status,
			answeredBy: answer.answeredBy,
			...(answer.file ? { file: answer.file } : {}),
			...(iface ? { implements: iface } : {}),
			...(failures.length ? { failures } : {}),
			...(warnings.length ? { warnings } : {}),
		}
	})
	return {
		skill: skill.name,
		folder: display(skill.folder),
		status: statusOf([
			...references.map((reference) => referenceStatus(reference)),
			...(own.warnings.length ? (['warned'] as const) : []),
		]),
		references,
		...(uses.interfaces.length ? { interfaces: uses.interfaces } : {}),
		...(own.warnings.length ? { warnings: own.warnings } : {}),
		...(notes.length ? { notes } : {}),
	}
}

function referenceStatus(reference: DoctorReference): SkillDoctorEntry['status'] {
	return reference.failures?.length ? 'failed' : reference.warnings?.length ? 'warned' : 'passed'
}

function statusOf(statuses: readonly SkillDoctorEntry['status'][]): SkillDoctorEntry['status'] {
	return statuses.includes('failed') ? 'failed' : statuses.includes('warned') ? 'warned' : 'passed'
}

/**
 * Examines each skill as installed and configured here: lists the references it loads when it runs, read as
 * `reference uses` reads load lines, and checks each one as `reference check` composes it through the tiers with the skill's own default joined. For an
 * interface whose implementations the skill loads, it checks the interface document and each implementation. Each
 * failure and warning carries what the user can do. Writes nothing.
 */
export function doctorSkills(
	skills: readonly FoundSkill[],
	layers: ReferenceLayers,
	{ display = (path) => path, harness }: DoctorOptions = {},
): SkillDoctorReport {
	const entries = skills.map((skill) => doctorOne(skill, layers, display, harness))
	return { status: statusOf(entries.map(({ status }) => status)), skills: entries }
}
