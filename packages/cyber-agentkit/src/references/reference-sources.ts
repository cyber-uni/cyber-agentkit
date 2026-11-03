import type { WarnFn } from './reference-codes.js'
import type { PluginOrigin, ReferenceLayer, ReferenceLayers, ReferenceTier } from './reference-layers.js'

/**
 * A contribution a generated document is built from (K34): a plugin, as `{plugin, version}`, or a
 * skill's default, as `{default: <skill>}`, with the plugin and version of the plugin that ships the
 * skill, when one does. A source with no version is stale only when it is gone.
 */
export type ReferenceSource =
	| { plugin: string; version?: string }
	| { default: string; plugin?: string; version?: string }

/**
 * What a generated document records in its frontmatter (K25): each source with its plugin's version,
 * and the customizer's request. A project section records these alone; a whole document from an
 * interface's stub records `implements` and the request, and no sources.
 */
export type GeneratedRecord = {
	sources?: ReferenceSource[]
	request?: string
}

/** A plugin installed where the name resolves, with the version load compares a recorded one to (C5). */
export type ReferenceSourcePlugin = {
	plugin: string
	version?: string | undefined
	origin?: PluginOrigin | undefined
}

/** One recorded source, as the trace reports it: its recorded and installed versions, and whether it changed. */
export type ReferenceTraceSource = {
	plugin?: string
	default?: string
	recorded?: string
	installed?: string
	/** `current`; `changed` when the installed plugin's version differs; `missing` when the source is gone. */
	status: 'current' | 'changed' | 'missing'
}

/** What load compares a document's recorded sources against. */
export type SourceCatalog = {
	plugins: ReadonlyMap<string, ReferenceSourcePlugin>
	/** The skills known to hold a default; `undefined` when not every skill folder could be read, so none is known gone. */
	skills: ReadonlySet<string> | undefined
}

/** The tiers whose generated document goes stale at load (R101): a plugin's or a default's own file is compared only by `check`. */
export const staleTiers: ReadonlySet<ReferenceTier> = new Set(['repo', 'user', 'project'])

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string | undefined {
	if (typeof value === 'string') return value.trim() ? value.trim() : undefined
	if (typeof value === 'number') return String(value)
	return undefined
}

function readSource(value: unknown): ReferenceSource | undefined {
	if (!isRecord(value)) return undefined
	const plugin = text(value['plugin'])
	const version = text(value['version'])
	const skill = text(value['default'])
	if (skill !== undefined) {
		return {
			default: skill,
			...(plugin !== undefined ? { plugin } : {}),
			...(plugin !== undefined && version !== undefined ? { version } : {}),
		}
	}
	if (plugin === undefined) return undefined
	return version === undefined ? { plugin } : { plugin, version }
}

/**
 * The generated record a contribution's frontmatter holds: its `sources` and its `request`. A
 * malformed source is left out with a warning, so the rest still count.
 */
export function readGeneratedRecord(metadata: Record<string, unknown>, warn?: WarnFn): GeneratedRecord {
	const record: GeneratedRecord = {}
	const request = metadata['request']
	if (typeof request === 'string' && request.trim()) record.request = request
	const raw = metadata['sources']
	if (raw === undefined || raw === null) return record
	if (!Array.isArray(raw)) {
		warn?.('frontmatter-invalid', '`sources` is not a list; it is read as recording no sources')
		return record
	}
	const sources = raw.flatMap((entry) => {
		const source = readSource(entry)
		if (!source) {
			warn?.(
				'frontmatter-invalid',
				'a source in `sources` is not {plugin, version} or {default, plugin, version}; it is left out',
			)
		}
		return source ? [source] : []
	})
	if (sources.length) record.sources = sources
	return record
}

/** A generated document: a contribution that records a request (K25). */
export function isGenerated(metadata: Record<string, unknown> | undefined): boolean {
	return metadata !== undefined && readGeneratedRecord(metadata).request !== undefined
}

/**
 * The installed plugins and known skills a document's sources are compared against. A `user`
 * document's sources are only the harness's enabled plugins (R84, C6): the plugin running the
 * command counts as enabled, and a plugin found only through the root's `package.json` is never one,
 * so its absence elsewhere never makes the document stale.
 */
export function sourceCatalog(
	source: ReferenceLayers | readonly ReferenceLayer[],
	{ tier }: { tier: ReferenceTier },
): SourceCatalog {
	const layers = Array.isArray(source) ? (source as readonly ReferenceLayer[]) : (source as ReferenceLayers).layers
	const installed: readonly ReferenceSourcePlugin[] = Array.isArray(source)
		? layers.flatMap(({ tier: at, plugin, version, origin, skipped }) =>
				at === 'plugin' && plugin !== undefined && !skipped ? [{ plugin, version, origin }] : [],
			)
		: ((source as ReferenceLayers).plugins ??
			layers.flatMap(({ tier: at, plugin, version, origin, skipped }) =>
				at === 'plugin' && plugin !== undefined && !skipped ? [{ plugin, version, origin }] : [],
			))
	const plugins = new Map<string, ReferenceSourcePlugin>()
	for (const plugin of installed) {
		if (tier === 'user' && plugin.origin === 'dependency') continue
		if (!plugins.has(plugin.plugin)) plugins.set(plugin.plugin, plugin)
	}
	const defaults = layers.flatMap(({ tier: at, skill, skipped }) =>
		at === 'default' && skill !== undefined && !skipped ? [skill] : [],
	)
	const skills = Array.isArray(source) ? undefined : (source as ReferenceLayers).skills
	const known =
		skills && !skills.unverified ? new Set([...defaults, ...skills.skills.map(({ name }) => name)]) : undefined
	return { plugins, skills: known }
}

/**
 * Each recorded source against what is installed (R101). Only a plugin's version is compared (N8);
 * a source with no recorded version is `missing` only when it is gone.
 */
export function compareSources(
	sources: readonly ReferenceSource[],
	{ plugins, skills }: SourceCatalog,
): ReferenceTraceSource[] {
	return sources.map((source) => {
		const row: ReferenceTraceSource = { status: 'current' }
		if ('default' in source) row.default = source.default
		if (source.plugin !== undefined) row.plugin = source.plugin
		if (source.version !== undefined) row.recorded = source.version
		if (source.plugin === undefined) {
			// A standalone skill's default: gone only when every skill folder was read and none holds it.
			if ('default' in source && skills && !skills.has(source.default)) row.status = 'missing'
			return row
		}
		const installed = plugins.get(source.plugin)
		if (!installed) {
			row.status = 'missing'
			return row
		}
		if (installed.version !== undefined) row.installed = installed.version
		if (source.version !== undefined && source.version !== installed.version) row.status = 'changed'
		return row
	})
}

function describeSource(row: ReferenceTraceSource): string {
	const what = row.default !== undefined ? `the default of ${row.default}` : `plugin ${row.plugin}`
	if (row.status === 'missing') {
		return row.plugin !== undefined && row.default !== undefined
			? `${what} (plugin ${row.plugin}) is not installed`
			: `${what} is not installed`
	}
	const via = row.default !== undefined ? ` (plugin ${row.plugin})` : ''
	return `${what}${via} is ${row.installed ?? 'installed with no version'}, recorded ${row.recorded}`
}

/** The `reference-stale` message: each changed or missing source, and how to revise the document (UC20). */
export function staleMessage(name: string, rows: readonly ReferenceTraceSource[]): string {
	const changed = rows.filter(({ status }) => status !== 'current').map(describeSource)
	return `it is stale: ${changed.join('; ')}. Customize mode revises "${name}" from its recorded request`
}

export type StaleCheck = { sources: ReferenceTraceSource[]; request?: string; stale: boolean }

/**
 * A generated document's recorded sources checked against what is installed. `undefined` when it
 * records neither sources nor a request; never stale when it records no sources.
 */
export function checkGenerated(
	metadata: Record<string, unknown>,
	catalog: SourceCatalog,
	warn?: WarnFn,
): StaleCheck | undefined {
	const record = readGeneratedRecord(metadata, warn)
	if (record.sources === undefined && record.request === undefined) return undefined
	const sources = compareSources(record.sources ?? [], catalog)
	const check: StaleCheck = { sources, stale: sources.some(({ status }) => status !== 'current') }
	if (record.request !== undefined) check.request = record.request
	return check
}

/**
 * The sources a document generated over `stack` records (K34), for a writer: each plugin in the stack
 * with its installed version, and the `default` as its skill, with the plugin and version of the
 * plugin that ships it when one does. A plugin the catalog does not hold is left out, so a `user`
 * document never records a plugin found only through a repository's `package.json`.
 */
export function recordedSources(
	stack: readonly string[],
	catalog: SourceCatalog,
	defaultSkill?: { skill: string; plugin?: string | undefined } | undefined,
): ReferenceSource[] {
	return stack.flatMap((target): ReferenceSource[] => {
		if (target === 'default') {
			if (!defaultSkill) return []
			const shipped = defaultSkill.plugin === undefined ? undefined : catalog.plugins.get(defaultSkill.plugin)
			if (!shipped) return [{ default: defaultSkill.skill }]
			return [
				shipped.version === undefined
					? { default: defaultSkill.skill, plugin: shipped.plugin }
					: { default: defaultSkill.skill, plugin: shipped.plugin, version: shipped.version },
			]
		}
		const installed = catalog.plugins.get(target)
		if (!installed) return []
		return [installed.version === undefined ? { plugin: target } : { plugin: target, version: installed.version }]
	})
}

/** The keys a generated record adds to frontmatter, in the order a writer puts them: `sources`, then `request`. */
export function generatedFrontmatter(record: GeneratedRecord): Record<string, unknown> {
	const keys: Record<string, unknown> = {}
	if (record.sources?.length) keys['sources'] = record.sources.map((source) => ({ ...source }))
	if (record.request !== undefined)
		keys['request'] = record.request.endsWith('\n') ? record.request : `${record.request}\n`
	return keys
}
