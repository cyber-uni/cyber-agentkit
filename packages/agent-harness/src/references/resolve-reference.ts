import { type Dirent, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	type MergeMode,
	mergeSections,
	parseDocument,
	parseSections,
	readMergeMode,
	renderSections,
	stripMergeComments,
} from './reference-document.js'
import { interfaceIdOf } from './reference-interface.js'
import type { ReferenceLayer, ReferenceTier } from './reference-layers.js'

export type ReferenceName = { name: string; plugin: string | undefined; raw: string }

const namePattern = /^[a-z0-9]+(?:[-.][a-z0-9]+)*$/i
const pluginPattern = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i

/**
 * Rejects rather than sanitizes — silently answering a different question is how untrusted input
 * reads a file outside the layer. The plugin qualifier is only ever compared with known plugin
 * names, never joined into a path.
 */
export function parseReferenceName(value: string): ReferenceName {
	if (value.endsWith('.md')) {
		throw new Error(`"${value}" names a file. Ask for the reference by name, without the .md extension.`)
	}
	const slash = value.lastIndexOf('/')
	const name = slash === -1 ? value : value.slice(slash + 1)
	const plugin = slash === -1 ? undefined : value.slice(0, slash)
	if (!namePattern.test(name) || (plugin !== undefined && !pluginPattern.test(plugin))) {
		throw new Error(
			`"${value}" is not a reference name. A name is letters, digits, hyphens, and dots, optionally after "<plugin>/" — not a path.`,
		)
	}
	return { name, plugin, raw: value }
}

const folderCandidates = ['README.md', 'index.md', 'SKILL.md']

/** Search order within one layer; the first that reads wins. */
export function candidateFiles(name: string): string[] {
	return [`${name}.md`, ...folderCandidates.map((file) => `${name}/${file}`)]
}

export type TraceEntry = {
	tier: ReferenceTier
	plugin: string
	path: string
	found: boolean
	candidate: string
	merge: string
	outcome: string
	/** The layer's own frontmatter `description`, so `list` can show it per row. */
	description: string
}

export type UsedLayer = { tier: ReferenceTier; plugin: string; path: string; merge: MergeMode }

export type ReferenceStatus = 'found' | 'missing' | 'ambiguous'

export type ResolvedReference = {
	name: string
	status: ReferenceStatus
	tier?: ReferenceTier
	plugin?: string
	path?: string
	merge?: MergeMode
	metadata?: Record<string, unknown>
	content?: string
	layers: UsedLayer[]
	warnings: string[]
	/** Qualified names to ask for instead, when two plugins hold an unqualified name. */
	plugins: string[]
	trace: TraceEntry[]
}

type FoundDocument = {
	layer: ReferenceLayer
	entry: TraceEntry
	metadata: Record<string, unknown>
	body: string
	merge: MergeMode
	/** The plugins this copy sits above, from a plugin copy's `overrides`. */
	overrides: string[]
}

export type ResolveOptions = {
	/** How a path is shown in a label or a warning — the command collapses the home directory. */
	display?: (path: string) => string
	/** A file read as absent, so `delete --dry-run` can report what answers once it is gone. */
	without?: string | undefined
}

function tryRead(path: string): string | undefined {
	try {
		return readFileSync(path, 'utf8')
	} catch {
		return undefined
	}
}

function pluginLabel(layer: ReferenceLayer): string {
	return layer.plugins[0] ?? ''
}

function layerName(layer: ReferenceLayer): string {
	return layer.tier === 'plugin' ? `plugin ${pluginLabel(layer)}` : layer.tier
}

type Hit = { candidate: string; raw: string }

/** Every candidate file a layer holds for a name, in the order they answer. */
function layerHits(layer: ReferenceLayer, name: string, without: string | undefined): Hit[] {
	return candidateFiles(name).flatMap((candidate) => {
		const path = join(layer.dir, candidate)
		const raw = path === without ? undefined : tryRead(path)
		return raw === undefined ? [] : [{ candidate, raw }]
	})
}

function readOverrides(metadata: Record<string, unknown>, warn: (message: string) => void): string[] {
	const value = metadata['overrides']
	if (value === undefined) return []
	const list: unknown = typeof value === 'string' ? [value] : value
	if (Array.isArray(list) && list.every((item) => typeof item === 'string')) return list
	warn('`overrides` is not a list of plugin names; it is ignored')
	return []
}

/** Whether a plugin layer's copy of a name declares it overrides one of `plugins`. */
function overridesAny(layer: ReferenceLayer, name: string, plugins: ReadonlySet<string>, without?: string): boolean {
	const [hit] = layerHits(layer, name, without)
	if (!hit) return false
	const { metadata } = parseDocument(hit.raw, () => {})
	return readOverrides(metadata, () => {}).some((plugin) => plugins.has(plugin))
}

/**
 * The layers a name is resolved through, in the order `resolveReference` traces them. A qualified
 * name reads that plugin's layers, and each other plugin layer whose copy overrides it.
 */
export function layersFor(
	ref: ReferenceName,
	layers: readonly ReferenceLayer[],
	without?: string | undefined,
): ReferenceLayer[] {
	const plugin = ref.plugin
	if (plugin === undefined) return [...layers]
	const pinned = layers.filter((layer) => layer.tier === 'plugin' && layer.plugins.includes(plugin))
	if (!pinned.length) {
		// A placeholder so the trace says the plugin asked for is not there, rather than saying nothing.
		return [
			...layers.filter((layer) => layer.tier !== 'plugin'),
			{ tier: 'plugin', dir: `(no dependency named ${plugin})`, plugins: [plugin], status: '' },
		]
	}
	const aliases = new Set(pinned.flatMap((layer) => layer.plugins))
	return layers.filter(
		(layer) =>
			layer.tier !== 'plugin' ||
			pinned.includes(layer) ||
			(interfaceIdOf(ref.name) === undefined && !layer.skipped && overridesAny(layer, ref.name, aliases, without)),
	)
}

/** One plugin's copies of a name, and the plugins they say they sit above. */
type Holder = { label: string; aliases: Set<string>; overrides: string[]; documents: FoundDocument[] }

function holdersOf(documents: readonly FoundDocument[]): Holder[] {
	const holders = new Map<string, Holder>()
	for (const document of documents) {
		const label = document.entry.plugin
		const holder = holders.get(label) ?? { label, aliases: new Set(), overrides: [], documents: [] }
		for (const alias of document.layer.plugins) holder.aliases.add(alias)
		holder.overrides.push(...document.overrides)
		holder.documents.push(document)
		holders.set(label, holder)
	}
	return [...holders.values()]
}

/** The names in `a`'s `overrides` that are `b`. */
function namesOf(a: Holder, b: Holder): string[] {
	return [...new Set(a.overrides.filter((plugin) => b.aliases.has(plugin)))]
}

function sitsAbove(a: Holder, b: Holder): boolean {
	return namesOf(a, b).length > 0 && namesOf(b, a).length === 0
}

/**
 * Highest first, when each holder overrides every holder below it and none overrides one above it;
 * `undefined` when two of them do not order, such as a pair overriding each other or a holder no one names.
 */
function stack(holders: readonly Holder[]): Holder[] | undefined {
	const remaining = [...holders]
	const order: Holder[] = []
	while (remaining.length > 1) {
		const top = remaining.find((holder) => remaining.every((other) => other === holder || sitsAbove(holder, other)))
		if (!top) return undefined
		order.push(top)
		remaining.splice(remaining.indexOf(top), 1)
	}
	return [...order, ...remaining]
}

/** The holders to choose between: those overriding no other holder, or every holder when none is. */
function choicesOf(holders: readonly Holder[]): Holder[] {
	const bases = holders.filter((holder) => holders.every((other) => other === holder || !namesOf(holder, other).length))
	return bases.length ? bases : [...holders]
}

/**
 * Orders the plugin tier's copies. Unqualified, the holders must stack by `overrides`, or the name
 * is ambiguous. Qualified, the plugin asked for is the base, and each copy that overrides it sits above.
 */
function orderPlugins(
	ref: ReferenceName,
	documents: readonly FoundDocument[],
	warn: (message: string) => void,
): { order: Holder[]; choices?: Holder[] } {
	const holders = holdersOf(documents)
	if (ref.plugin === undefined) {
		if (holders.length < 2) return { order: holders }
		const order = stack(holders)
		return order ? { order } : { order: holders, choices: choicesOf(holders) }
	}
	const plugin = ref.plugin
	const pinned = holders.find((holder) => holder.aliases.has(plugin))
	const overlays = pinned ? holders.filter((holder) => holder !== pinned && sitsAbove(holder, pinned)) : []
	for (const holder of holders) {
		if (holder === pinned || overlays.includes(holder)) continue
		for (const { entry } of holder.documents) {
			entry.outcome = pinned ? `not read — it and ${plugin} override each other` : `not read — ${plugin} holds no copy`
		}
	}
	if (!pinned) return { order: [] }
	const order = stack([...overlays, pinned])
	if (order) return { order }
	warn(
		`${ref.raw}: ${overlays.map(({ label }) => label).join(', ')} each override ${plugin} but not one another; they apply in plugin order`,
	)
	return { order: [...overlays, pinned] }
}

export function resolveReference(
	ref: ReferenceName,
	layers: readonly ReferenceLayer[],
	{ display = (path) => path, without }: ResolveOptions = {},
): ResolvedReference {
	const warnings: string[] = []
	const trace: TraceEntry[] = []
	const found: FoundDocument[] = []

	for (const layer of layersFor(ref, layers, without)) {
		const entry: TraceEntry = {
			tier: layer.tier,
			plugin: pluginLabel(layer),
			path: layer.dir,
			found: false,
			candidate: '',
			merge: '',
			outcome: 'missing',
			description: '',
		}
		trace.push(entry)
		if (layer.skipped) {
			entry.outcome = layer.skipped
			continue
		}
		const [hit, ...ignored] = layerHits(layer, ref.name, without)
		if (!hit) continue
		for (const other of ignored) {
			warnings.push(
				`${display(join(layer.dir, other.candidate))} is ignored: ${hit.candidate} answers first in that folder`,
			)
		}
		const path = join(layer.dir, hit.candidate)
		const warn = (message: string) => warnings.push(`${display(path)}: ${message}`)
		const { metadata, body } = parseDocument(hit.raw, warn)
		const merge = readMergeMode(metadata, warn)
		let overrides = readOverrides(metadata, warn)
		if (overrides.length && layer.tier !== 'plugin') {
			warn("`overrides` applies only to a plugin's copy; it is ignored")
			overrides = []
		} else if (overrides.length && interfaceIdOf(ref.name) !== undefined) {
			warn('`overrides` is ignored: an interface document is not overridable')
			overrides = []
		}
		const description = typeof metadata['description'] === 'string' ? metadata['description'] : ''
		Object.assign(entry, { path, found: true, candidate: hit.candidate, merge, outcome: '', description })
		found.push({ layer, entry, metadata, body, merge, overrides })
	}

	const result: ResolvedReference = { name: ref.raw, status: 'missing', layers: [], warnings, plugins: [], trace }

	if (interfaceIdOf(ref.name) !== undefined) return resolveInterfaceDocument(ref, found, result, display)

	// Plugins are alternatives, not a stack, unless their copies say which sits above which: once
	// resolution reaches the plugin tier, two plugins that do not order leave nothing to choose between.
	const { order, choices } = orderPlugins(
		ref,
		found.filter(({ layer }) => layer.tier === 'plugin'),
		(message) => warnings.push(message),
	)
	const ordered = [
		...found.filter(({ layer }) => layer.tier !== 'plugin'),
		...order.flatMap(({ documents }) => documents),
	]
	const stop = ordered.findIndex(({ merge }) => merge === 'first-wins')
	const chain = stop === -1 ? ordered : ordered.slice(0, stop + 1)
	const shadowed = stop === -1 ? [] : ordered.slice(stop + 1)
	const base = chain.at(-1)

	if (choices && chain.some(({ layer }) => layer.tier === 'plugin')) {
		for (const { entry } of found) entry.outcome = 'ambiguous'
		result.status = 'ambiguous'
		result.plugins = choices.map(({ label }) => `${label}/${ref.name}`)
		return result
	}
	for (const document of shadowed) {
		document.entry.outcome = `shadowed by ${(base as FoundDocument).layer.tier} (first-wins)`
	}
	if (!base) return result

	for (const { entry } of chain) entry.outcome = 'used'
	for (const [index, holder] of order.entries()) {
		const below = order.slice(index + 1)
		const named = [...new Set(holder.overrides.filter((plugin) => below.some(({ aliases }) => aliases.has(plugin))))]
		if (!named.length) continue
		for (const { entry } of holder.documents.filter((document) => chain.includes(document))) {
			entry.outcome = `used (overrides ${named.join(', ')})`
		}
	}
	return foundResult(result, chain, display)
}

function foundResult(
	result: ResolvedReference,
	chain: readonly FoundDocument[],
	display: (path: string) => string,
): ResolvedReference {
	const warnings = result.warnings
	const top = chain[0] as FoundDocument
	return {
		...result,
		status: 'found',
		tier: top.layer.tier,
		plugin: top.entry.plugin,
		path: top.entry.path,
		merge: top.merge,
		// Lower layers first, so each document above overrides a key the one below also sets.
		metadata: Object.assign({}, ...[...chain].reverse().map(({ metadata }) => metadata)),
		content: withNewline(stripMergeComments(fold(chain, display, (message) => warnings.push(message)))),
		layers: chain.map(({ layer, entry, merge }) => ({
			tier: layer.tier,
			plugin: entry.plugin,
			path: entry.path,
			merge,
		})),
	}
}

const ignoredInterface = 'ignored (an interface document is not overridable)'

/**
 * An interface document answers from its lowest layer, the owner's: a higher copy would change the
 * contract under every consumer without telling it, so it is ignored with a warning.
 */
function resolveInterfaceDocument(
	ref: ReferenceName,
	found: readonly FoundDocument[],
	result: ResolvedReference,
	display: (path: string) => string,
): ResolvedReference {
	const holders = [...new Set(found.filter(({ layer }) => layer.tier === 'plugin').map(({ entry }) => entry.plugin))]
	if (ref.plugin === undefined && holders.length > 1) {
		for (const { entry } of found) entry.outcome = 'ambiguous'
		return { ...result, status: 'ambiguous', plugins: holders.map((plugin) => `${plugin}/${ref.name}`) }
	}
	const base = found.at(-1)
	if (!base) return result
	for (const document of found.slice(0, -1)) {
		document.entry.outcome = ignoredInterface
		result.warnings.push(
			`${display(document.entry.path)} is ignored: an interface document is not overridable; define a new interface id instead`,
		)
	}
	base.entry.outcome = 'used'
	return foundResult(result, [{ ...base, merge: 'first-wins' }], display)
}

type Part = { labels: string[]; body: string }

/** Bottom-up: the base is the lowest document read, and each document above says how it applies. */
function fold(chain: readonly FoundDocument[], display: (path: string) => string, warn: (message: string) => void) {
	const label = ({ layer, entry }: FoundDocument) => `${layerName(layer)} ${display(entry.path)}`
	const [base, ...above] = [...chain].reverse() as [FoundDocument, ...FoundDocument[]]
	let parts: Part[] = [{ labels: [label(base)], body: base.body }]
	for (const document of above) {
		if (document.merge === 'combine') {
			parts = [{ labels: [label(document)], body: document.body }, ...parts]
			continue
		}
		const below = parts.map(({ body }) => body.trim()).join('\n\n')
		const merged = mergeSections(parseSections(below, warn), parseSections(document.body, warn), label(document), warn)
		parts = [{ labels: [label(document), ...parts.flatMap(({ labels }) => labels)], body: renderSections(merged) }]
	}
	if (parts.length === 1) return (parts[0] as Part).body
	return [
		`> Combined from ${parts.length} layers, highest precedence first. Where they conflict, the first layer wins.`,
		...parts.map(({ labels, body }) => `<!-- layer: ${labels.join(', ')} -->\n\n${body.trim()}`),
	].join('\n\n')
}

function withNewline(content: string): string {
	return content.endsWith('\n') ? content : `${content}\n`
}

/** Every name a layer holds in any candidate form; empty for a layer that is missing or unreadable. */
export function layerNames(dir: string): string[] {
	let entries: Dirent[]
	try {
		entries = readdirSync(dir, { withFileTypes: true })
	} catch {
		return []
	}
	const names = new Set<string>()
	for (const entry of entries) {
		const name = entry.isFile() && entry.name.endsWith('.md') ? entry.name.slice(0, -3) : entry.name
		if (!namePattern.test(name)) continue
		if (
			entry.isFile()
				? entry.name.endsWith('.md')
				: folderCandidates.some((file) => tryRead(join(dir, name, file)) !== undefined)
		) {
			names.add(name)
		}
	}
	return [...names]
}

export function referenceNames(layers: readonly ReferenceLayer[]): string[] {
	return [...new Set(layers.flatMap(({ dir, skipped }) => (skipped ? [] : layerNames(dir))))].sort((a, b) =>
		a.localeCompare(b),
	)
}
