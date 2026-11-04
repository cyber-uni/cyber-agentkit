import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { isRecord } from '../plugins/json-file.js'
import type { WarnFn } from './reference-codes.js'
import { hasBody } from './reference-document.js'
import { defaultSuffix, metadataSuffix, namePattern } from './reference-name.js'

/**
 * A form of a contribution that version 1 wrote and 2.0 retired (K37). `default-layout` is a skill's
 * default at `references/<name>.md`; `project-selection` is the `extends` with no body that
 * `reference select` wrote when run in a folder below the root; `qualified-override` is a
 * `<plugin>/<name>.md` in a subfolder of a tier or project folder, the override of one plugin's copy.
 */
export type LegacyForm =
	| 'merge-sections'
	| 'first-wins'
	| 'overrides'
	| 'default-layout'
	| 'project-selection'
	| 'qualified-override'

/** A legacy form found in one file: what it is now, and its 2.0 form, or why it needs a person. */
export type LegacyFinding = {
	form: LegacyForm
	/** The form as written. */
	from: string
	/** What `migrate` writes in its place; unset when the change is `manual`. */
	to?: string
	/** Why `migrate` leaves it to a person. */
	manual?: string
	/** How load reads it today. */
	reads: string
	/** What applying it does that version 1 never did. */
	note?: string
}

/** Where a contribution sits: a project section carries no `merge` or `extends` (K24). */
export type LegacyPlace = 'contribution' | 'project'

const legacyMerges = { 'merge-sections': undefined, 'first-wins': 'replace' } as const

type LegacyMerge = keyof typeof legacyMerges

export function isLegacyMerge(value: unknown): value is LegacyMerge {
	return value === 'merge-sections' || value === 'first-wins'
}

/** The plugins `overrides` names, each qualified entry reduced to its plugin; `undefined` when it is not a list of them. */
function overriddenPlugins(value: unknown): string[] | undefined {
	const list: unknown[] | undefined = typeof value === 'string' ? [value] : Array.isArray(value) ? value : undefined
	if (!list?.length || !list.every((item) => typeof item === 'string' && item.trim())) return undefined
	return [...new Set((list as string[]).map((item) => (item.split('/')[0] as string).trim()))]
}

/** The plugin or `default` each `extends` step names, as written; `undefined` when it is not a list of steps. */
function stepTargets(value: unknown): string[] | undefined {
	const list: unknown[] | undefined = typeof value === 'string' ? [value] : Array.isArray(value) ? value : undefined
	if (!list) return undefined
	const targets: string[] = []
	for (const item of list) {
		if (typeof item === 'string') targets.push(item)
		else if (isRecord(item) && Object.keys(item).length === 1) targets.push(Object.keys(item)[0] as string)
		else return undefined
	}
	return targets
}

const flow = (items: readonly string[]) => `[${items.join(', ')}]`

export type LegacyRewrite = {
	findings: LegacyFinding[]
	/** The frontmatter keys that state the same in 2.0: a value to set, `undefined` to remove. Manual findings add none. */
	keys: Record<string, unknown>
}

/**
 * The legacy forms a Markdown contribution's frontmatter holds (K37), and the frontmatter that says
 * the same in 2.0 (R122). The body and every other key are left as written.
 */
export function legacyRewrite(
	metadata: Record<string, unknown>,
	body: string,
	place: LegacyPlace,
	name: string,
): LegacyRewrite {
	const findings: LegacyFinding[] = []
	const keys: Record<string, unknown> = {}
	const merge = metadata['merge']
	if (isLegacyMerge(merge)) {
		const into = legacyMerges[merge]
		keys['merge'] = place === 'project' ? undefined : into
		findings.push({
			form: merge,
			from: `merge: ${merge}`,
			to:
				place === 'project'
					? 'no merge: a project section carries none'
					: into === undefined
						? 'no merge: patch is the default'
						: `merge: ${into}`,
			reads: 'it reads as patch',
		})
	}
	if ('overrides' in metadata) {
		findings.push(overridesFinding(metadata, place, keys))
	}
	if (place === 'project' && metadata['extends'] !== undefined && !hasBody(body)) {
		const steps = stepTargets(metadata['extends'])
		findings.push({
			form: 'project-selection',
			from: `extends: ${steps ? flow(steps) : JSON.stringify(metadata['extends'])}`,
			manual: `a pick now applies to the whole repository: run \`reference customize ${name} --extends ${steps?.join(' ') ?? '<step>...'}\` at the root, then delete this file`,
			reads: 'its extends is ignored',
		})
	}
	return { findings, keys }
}

function overridesFinding(
	metadata: Record<string, unknown>,
	place: LegacyPlace,
	keys: Record<string, unknown>,
): LegacyFinding {
	const value = metadata['overrides']
	const plugins = overriddenPlugins(value)
	const from = `overrides: ${plugins ? flow(Array.isArray(value) ? (value as string[]) : [String(value)]) : JSON.stringify(value)}`
	const reads = 'it is ignored'
	if (place === 'project') {
		keys['overrides'] = undefined
		return { form: 'overrides', from, to: 'removed: a project section carries no extends', reads }
	}
	if (!plugins) return { form: 'overrides', from, manual: '`overrides` is not a list of plugin names', reads }
	const written = metadata['extends']
	if (written === undefined) {
		keys['overrides'] = undefined
		keys['extends'] = plugins
		return { form: 'overrides', from, to: `extends: ${flow(plugins)}`, reads }
	}
	const targets = stepTargets(written)
	const missing = plugins.filter((plugin) => !targets?.includes(plugin))
	if (targets && !missing.length) {
		keys['overrides'] = undefined
		return { form: 'overrides', from, to: 'removed: extends already names each plugin', reads }
	}
	return {
		form: 'overrides',
		from,
		manual: `\`extends\` is also written and does not name ${missing.join(', ')}; add ${missing.length > 1 ? 'them' : 'it'} to \`extends\` where it belongs, then remove \`overrides\``,
		reads,
	}
}

/** The 2.0 form of a skill's default in the old layout (K37). */
export function defaultLayoutFinding(name: string): LegacyFinding {
	return {
		form: 'default-layout',
		from: `references/${name}.md`,
		to: `references/${name}.default.md`,
		reads: 'it is not read as the default',
	}
}

/** The warning a legacy form raises at load (R119): the form, how it reads, its 2.0 form, and the fix. */
export function warnLegacy(finding: LegacyFinding, fix: string, warn: WarnFn): void {
	const note = finding.note === undefined ? '' : `, and ${finding.note}`
	const into = finding.to === undefined ? '' : `; its 2.0 form is ${finding.to}${note}`
	const how =
		finding.manual === undefined
			? fix
			: `To fix it, ${finding.manual}${finding.note === undefined ? '' : `; ${finding.note}`}.`
	warn('reference-legacy-format', `\`${finding.from}\` is a version 1 form, and ${finding.reads}${into}. ${how}`)
}

/** A qualified-name override (K37): `<plugin>/<name>.md` in a subfolder of a tier or project folder. */
export type QualifiedOverride = {
	plugin: string
	name: string
	path: string
	/** `<plugin>/<name>.md`, relative to the folder. */
	file: string
}

function directoryEntries(dir: string) {
	try {
		return readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
	} catch {
		return []
	}
}

/**
 * The qualified-name overrides a tier or project folder holds, of `name` when given. A subfolder
 * holding `README.md` is a reference in folder form, not a plugin's, so its files are left alone.
 */
export function qualifiedOverrides(dir: string, name?: string): QualifiedOverride[] {
	const found: QualifiedOverride[] = []
	for (const folder of directoryEntries(dir)) {
		const plugin = folder.name
		if (!folder.isDirectory() || !namePattern.test(plugin)) continue
		const files = directoryEntries(join(dir, plugin))
		if (files.some((file) => file.name === 'README.md')) continue
		for (const file of files) {
			if (!file.isFile() || !file.name.endsWith('.md')) continue
			const held = file.name.slice(0, -'.md'.length)
			if (!namePattern.test(held) || held.endsWith(defaultSuffix) || held.endsWith(metadataSuffix)) continue
			if (name !== undefined && held !== name) continue
			found.push({ plugin, name: held, path: join(dir, plugin, file.name), file: `${plugin}/${file.name}` })
		}
	}
	return found
}

const neverApplied = 'no released version read it, so the override never applied'
const turnsOn = 'applying the plan turns it on'

/**
 * The 2.0 form of a qualified-name override (K37): `<name>.md` beside the subfolder, with
 * `extends: [<plugin>]`. A project section carries no `extends` (K24), so there it is manual.
 */
export function qualifiedOverrideFinding(found: QualifiedOverride, place: LegacyPlace): LegacyFinding {
	const { plugin, name, file } = found
	// No released version read this file, so moving it turns on an override that never applied.
	const said = { form: 'qualified-override', from: file, reads: neverApplied, note: turnsOn } as const
	if (place === 'project') {
		return {
			...said,
			manual: `pick plugin ${plugin} for the whole repository with \`reference customize ${name} --extends ${plugin}\` at the root, since a project section carries no extends; then move this file's body into ${name}.md in this folder and delete this file`,
		}
	}
	return { ...said, to: `${name}.md with extends: [${plugin}]` }
}
