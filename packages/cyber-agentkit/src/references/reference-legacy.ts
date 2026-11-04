import { isRecord } from '../plugins/json-file.js'
import type { WarnFn } from './reference-codes.js'
import { hasBody } from './reference-document.js'

/**
 * A form of a contribution that version 1 wrote and 2.0 retired (K37). `default-layout` is a skill's
 * default at `references/<name>.md`; `project-selection` is the `extends` with no body that
 * `reference select` wrote when run in a folder below the root.
 */
export type LegacyForm = 'merge-sections' | 'first-wins' | 'overrides' | 'default-layout' | 'project-selection'

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
	const into = finding.to === undefined ? '' : `; its 2.0 form is ${finding.to}`
	const how = finding.manual === undefined ? fix : `To fix it, ${finding.manual}.`
	warn('reference-legacy-format', `\`${finding.from}\` is a version 1 form, and ${finding.reads}${into}. ${how}`)
}
