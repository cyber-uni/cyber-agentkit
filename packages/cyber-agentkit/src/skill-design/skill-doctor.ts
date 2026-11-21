import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { checkReferences, type ReferenceCheckEntry } from '../references/reference-check.js'
import { referenceImplementations } from '../references/reference-implementations.js'
import { interfaceSuffix } from '../references/reference-interface.js'
import type { ReferenceLayers } from '../references/reference-layers.js'
import { loadsIn } from '../references/reference-uses.js'
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
}

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

/**
 * The files an agent reads when it runs the skill: its `SKILL.md` and the text under its `references/`, never a
 * bundled default copy. Its `README.md` is for the people who keep it and its `evals/` are test fixtures, so a load
 * line either one shows is not a load.
 */
function runtimeFiles(folder: string): string[] {
	const files = [join(folder, 'SKILL.md')]
	const walk = (dir: string) => {
		if (!existsSync(dir)) return
		for (const entry of readdirSync(dir).sort()) {
			const path = join(dir, entry)
			if (statSync(path).isDirectory()) walk(path)
			else if (/\.(md|mdx|txt)$/i.test(entry) && !/\.default\.[a-z]+$/i.test(entry)) files.push(path)
		}
	}
	walk(join(folder, 'references'))
	return files.filter((file) => existsSync(file))
}

/** The names and interfaces the skill loads when it runs, as `reference uses` reads load lines, outside fenced examples. */
function skillLoads(folder: string): { names: string[]; interfaces: string[] } {
	const names = new Set<string>()
	const interfaces = new Set<string>()
	for (const file of runtimeFiles(folder)) {
		const loaded = loadsIn(readFileSync(file, 'utf8').replace(fence, ''))
		for (const name of loaded.names) names.add(name)
		for (const id of loaded.interfaces) interfaces.add(id)
	}
	return { names: [...names], interfaces: [...interfaces] }
}

function doctorOne(skill: FoundSkill, layers: ReferenceLayers, display: (path: string) => string): SkillDoctorEntry {
	const loadLayers = withDefault(layers, skill.folder)
	const uses = skillLoads(skill.folder)
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
		status: statusOf(references.map((reference) => referenceStatus(reference))),
		references,
		...(uses.interfaces.length ? { interfaces: uses.interfaces } : {}),
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
	{ display = (path) => path }: DoctorOptions = {},
): SkillDoctorReport {
	const entries = skills.map((skill) => doctorOne(skill, layers, display))
	return { status: statusOf(entries.map(({ status }) => status)), skills: entries }
}
