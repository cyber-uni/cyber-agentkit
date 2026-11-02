import type { ReferenceStatusCode, ReferenceWarning, WarnFn } from './reference-codes.js'
import {
	composedMetadata,
	composeOrder,
	type OrderedContribution,
	trimLeadingBlank,
	withNewline,
} from './reference-compose.js'
import { type Contribution, layerNames, readContribution } from './reference-contribution.js'
import {
	composedSections,
	type MergeOperation,
	renderComposed,
	type SectionSource,
	stripMergeMarkers,
} from './reference-document.js'
import type { ReferenceFormat } from './reference-format.js'
import { interfaceIdOf } from './reference-interface.js'
import type { ReferenceLayer, ReferenceLayers, ReferenceTier } from './reference-layers.js'
import { parseReferenceName, type ReferenceName } from './reference-name.js'
import {
	type ProjectSections,
	type ReferenceTraceProjectSection,
	type ResolvedProjectSection,
	readProjectSections,
} from './reference-project-sections.js'
import { type Lookup, namesDefault, plan } from './reference-stack.js'

export { candidateFiles, contributionLabel, layerNames } from './reference-contribution.js'
export type { ReferenceName } from './reference-name.js'
export { parseReferenceName } from './reference-name.js'
export type { ReferenceTraceProjectSection, ResolvedProjectSection } from './reference-project-sections.js'
export type { ExtendsStep } from './reference-stack.js'
export { readExtends } from './reference-stack.js'

export type ReferenceStatus = 'found' | 'missing' | 'ambiguous' | 'invalid'

/** Why an ambiguous name's contributions cannot be put in one order. */
export type AmbiguousCause = 'unordered' | 'cycle' | 'repeat'

/** Where a contribution's operation came from: its own `merge`, a step's key, or the default `patch`. */
export type OperationSource = 'contribution' | 'step' | 'default'

/** One layer checked, as the trace reports it. */
export type ReferenceTraceLayer = {
	tier: ReferenceTier
	plugin?: string
	skill?: string
	/** The file matched, or the folder checked when none matched. */
	path: string
	/** The file that answered, relative to the folder: `<name>.md`, `<name>/README.md`, `<name>.default.md`, or the same with a data extension. */
	file?: string
	/** Its frontmatter as written. */
	frontmatter?: Record<string, unknown>
	operation?: MergeOperation
	operationFrom?: OperationSource
	/** `used`; `shadowed by ...`; `not used (...)`; `not read (...)`; `ambiguous`; or `missing`. */
	outcome: string
	/** Set when its `extends` was written but did not build the stack, and why. */
	extendsOutcome?: string
	description?: string
	/** A contribution with `extends` and no body: it picks the stack and changes nothing else. */
	selection?: boolean
	/** A contribution with no body, which changes nothing unless it is a `remove`. */
	empty?: boolean
}

export type ReferenceTraceContribution = {
	tier: ReferenceTier
	plugin?: string
	skill?: string
	path: string
	operation: MergeOperation
}

export type ReferenceTraceSection = {
	/** The heading path, such as `Review > Checklist`. */
	path: string
	/** The contributions that supplied its text, bottom first, each with the operation it applied. */
	contributions: SectionSource[]
	/** Set on a section a `remove` dropped: the contribution that dropped it. */
	removedBy?: string
}

export type ReferenceTrace = {
	/** The plugins and `default` the name builds on, bottom first. */
	stack: string[]
	/** What built the stack: the contribution whose `extends` was used, a plugin's own `extends`, or `none`. */
	builtBy: string
	/** The contributions whose text the document holds, bottom first. */
	contributions: ReferenceTraceContribution[]
	sections: ReferenceTraceSection[]
	/** Every layer checked, highest first. */
	layers: ReferenceTraceLayer[]
	/** The harnesses detected, whose managed folders and enabled plugins were read. */
	harnesses: string[]
	/** When a `remove` turned the whole name off (`reference-removed`): that contribution. */
	removedBy?: string
	/** Each project section found, in path order, delivered or not, and each one in a folder git ignores. */
	projectSections: ReferenceTraceProjectSection[]
}

/** A name resolved, with every field: the command prints a subset. A bad name is a status, never thrown. */
export type ResolvedReference = {
	name: string
	status: ReferenceStatus
	/** Set when not `found`. */
	code?: ReferenceStatusCode
	/** Why it is not `found`, for a person. */
	message?: string
	content?: string
	/** Set when `found`: `markdown`, or the format of the data file that answered whole. */
	format?: ReferenceFormat
	/** The composed frontmatter, key by key with the higher contribution winning, without `merge` and `extends`. */
	metadata?: Record<string, unknown>
	/** When `found`: what each folder below the root adds after the main document, in path order (R99). */
	projectSections: ResolvedProjectSection[]
	/** When `ambiguous`: each `<plugin>/<name>`, and `default` when the skill has one. */
	options?: string[]
	cause?: AmbiguousCause
	warnings: ReferenceWarning[]
	trace: ReferenceTrace
}

export type ResolveOptions = {
	/** How a path is shown in a label or a warning — the command collapses the home directory. */
	display?: (path: string) => string
	/** A file read as absent, so `delete --dry-run` can report what answers once it is gone. */
	without?: string | undefined
	/** Read only the layers below this folder, so `where` can report the document below a file it would write. */
	below?: string | undefined
}

type Source = ReferenceLayers | readonly ReferenceLayer[]

function layersOf(source: Source): ReferenceLayers {
	return Array.isArray(source)
		? { layers: [...(source as readonly ReferenceLayer[])], harnesses: [] }
		: (source as ReferenceLayers)
}

function emptyTrace(harnesses: readonly string[]): ReferenceTrace {
	return {
		stack: [],
		builtBy: 'none',
		contributions: [],
		sections: [],
		layers: [],
		harnesses: [...harnesses],
		projectSections: [],
	}
}

/**
 * The trace's layers in R9 order: the tiers as read (managed, repo, user), then the stack from its
 * top, then every other plugin and `default` layer as read.
 */
function stackOrder(layers: readonly ReferenceTraceLayer[], stack: readonly string[]): ReferenceTraceLayer[] {
	const rank = (layer: ReferenceTraceLayer) => {
		if (layer.tier !== 'plugin' && layer.tier !== 'default') return -1
		const at = stack.indexOf(layer.tier === 'default' ? 'default' : (layer.plugin ?? ''))
		return at === -1 ? stack.length : stack.length - 1 - at
	}
	return layers
		.map((layer, index) => ({ layer, index, rank: rank(layer) }))
		.sort((a, b) => a.rank - b.rank || a.index - b.index)
		.map(({ layer }) => layer)
}

/**
 * Resolves one name: reads each layer, puts the contributions in one order (the stack under the
 * user, repo, and managed tiers), and composes them bottom first, each with its operation.
 */
export function resolveReference(
	input: string | ReferenceName,
	source: Source,
	{ display = (path) => path, without, below }: ResolveOptions = {},
): ResolvedReference {
	const ref = typeof input === 'string' ? parseReferenceName(input) : input
	const { layers: all, harnesses, root, projects } = layersOf(source)
	const trace = emptyTrace(harnesses)
	const warnings: ReferenceWarning[] = []
	const result: ResolvedReference = { name: ref.raw, status: 'missing', projectSections: [], warnings, trace }
	if (ref.invalid) return { ...result, status: 'invalid', code: 'reference-invalid', message: ref.invalid }
	const seen = new Set<string>()
	const warnAt =
		(where: string): WarnFn =>
		(code, message) => {
			const text = where ? `${where}: ${message}` : message
			if (seen.has(`${code} ${text}`)) return
			seen.add(`${code} ${text}`)
			warnings.push({ code, message: text })
		}
	const warn = warnAt('')

	const cut = below === undefined ? -1 : all.findIndex((layer) => layer.dir === below)
	const layers = cut === -1 ? all : all.slice(cut + 1)
	const contributions: Contribution[] = []
	for (const layer of layers) {
		if (layer.warning) warn(layer.warning.code, layer.warning.message)
		const entry: ReferenceTraceLayer = { tier: layer.tier, path: layer.dir, outcome: 'missing' }
		if (layer.plugin !== undefined) entry.plugin = layer.plugin
		if (layer.skill !== undefined) entry.skill = layer.skill
		trace.layers.push(entry)
		if (layer.skipped) {
			entry.outcome = `not read (${layer.skipped})`
			continue
		}
		const contribution = readContribution(layer, ref.name, entry, { display, without, warnAt })
		if (contribution) contributions.push(contribution)
		else if (layer.tier === 'default') entry.outcome = 'not read (no default)'
	}

	const holders = new Map<string, Contribution>()
	for (const contribution of contributions.filter(({ layer }) => layer.tier === 'plugin')) {
		const plugin = contribution.layer.plugin as string
		const first = holders.get(plugin)
		if (first) contribution.entry.outcome = `not read (plugin ${plugin} answers from ${display(first.path)})`
		else holders.set(plugin, contribution)
	}
	const defaultContribution = contributions.find(({ layer }) => layer.tier === 'default')
	const tiered = contributions.filter(({ layer }) => layer.tier !== 'plugin' && layer.tier !== 'default')
	const readable = new Set(layers.flatMap(({ plugin, skipped }) => (plugin && !skipped ? [plugin] : [])))
	const lookup: Lookup = (target) => {
		if (target === 'default') return defaultContribution ?? { reason: 'has no default' }
		return holders.get(target) ?? { reason: readable.has(target) ? `holds no ${ref.name}` : 'is not installed' }
	}
	const options = () => [
		...[...holders.keys()].map((plugin) => `${plugin}/${ref.name}`),
		...(defaultContribution ? ['default'] : []),
	]

	if (interfaceIdOf(ref.name) !== undefined) {
		return resolveInterface(ref, contributions, holders, defaultContribution, result, warn, options)
	}

	// `where` reads only the layers below a file, which no project section is part of.
	const sectionsOver = (format: ReferenceFormat | undefined): ProjectSections => {
		if (root === undefined || below !== undefined) return { sections: [], trace: [] }
		const managed = tiered.find(({ layer }) => layer.tier === 'managed')
		const found = readProjectSections(ref.name, { root, cache: projects, managed, format, display, without, warnAt })
		trace.projectSections = found.trace
		return found
	}

	const decided = plan(ref, tiered, holders, lookup, defaultContribution, warn)
	if ('status' in decided) {
		if (decided.status === 'ambiguous') {
			for (const { entry } of contributions) if (entry.outcome === '') entry.outcome = 'ambiguous'
			return {
				...result,
				status: 'ambiguous',
				code: 'reference-ambiguous',
				message: decided.message,
				cause: decided.cause as AmbiguousCause,
				options: options(),
			}
		}
		for (const { entry } of contributions) if (entry.outcome === '') entry.outcome = 'not used (qualified name)'
		return { ...result, status: 'missing', code: 'reference-missing', message: decided.message }
	}

	if (!layers.some(({ tier }) => tier === 'default') && contributions.some(({ steps }) => namesDefault(steps))) {
		trace.layers.push({ tier: 'default', path: '(no skill folder given)', outcome: 'not read (no default)' })
	}
	trace.stack = decided.entries.map(({ target }) => target)
	trace.builtBy = decided.builtBy
	trace.layers = stackOrder(trace.layers, trace.stack)
	const inStack = new Set(trace.stack)
	for (const [target, contribution] of [
		...holders.entries(),
		...(defaultContribution ? [['default', defaultContribution] as const] : []),
	]) {
		if (inStack.has(target)) continue
		const replaced = decided.replaced.find((item) => item.target === target)
		contribution.entry.outcome =
			ref.plugin !== undefined
				? 'not used (qualified name)'
				: replaced
					? `not used (${replaced.step}'s extends replaced by ${decided.replacedBy})`
					: 'not used (not in extends)'
	}

	const order: OrderedContribution[] = [
		...decided.entries,
		...[...tiered].reverse().map((contribution) => ({
			contribution,
			operation: contribution.merge ?? 'patch',
			from: (contribution.merge ? 'contribution' : 'default') as OperationSource,
		})),
	]
	const { composed, applied, removedBy, used, whole } = composeOrder(order, warnAt)
	trace.sections = composed.removed.map(({ path, by }) => ({ path, contributions: [], removedBy: by }))
	if (!applied.length) {
		const only = sectionsOver(undefined).sections
		if (only.length) {
			// No main document, but project sections answer (UC1.16).
			return { ...result, status: 'found', content: '', format: 'markdown', metadata: {}, projectSections: only }
		}
		if (removedBy) {
			trace.removedBy = removedBy.label
			return {
				...result,
				status: 'missing',
				code: 'reference-removed',
				message: `"${ref.name}" is turned off by ${removedBy.label} (remove)`,
			}
		}
		const message =
			ref.plugin !== undefined
				? `the plugin ${ref.plugin} holds no document for "${ref.name}"`
				: `no tier holds a document for "${ref.name}"`
		return { ...result, status: 'missing', code: 'reference-missing', message }
	}

	const shown = used.filter(({ entry }) => entry.outcome === 'used')
	trace.contributions = applied.map(({ layer, entry }) => {
		const row: ReferenceTraceContribution = {
			tier: layer.tier,
			path: entry.path,
			operation: entry.operation as MergeOperation,
		}
		if (entry.plugin !== undefined) row.plugin = entry.plugin
		if (entry.skill !== undefined) row.skill = entry.skill
		return row
	})
	trace.sections = [
		...composedSections(composed).map(({ path, sources }) => ({ path, contributions: sources })),
		...trace.sections,
	]
	if (whole) {
		sectionsOver(whole.format)
		return {
			...result,
			status: 'found',
			content: whole.body,
			format: whole.format,
			metadata: {},
		}
	}
	// One contribution with no marker reads as written; anything composed is rendered from its sections.
	const single = applied.length === 1 && !composed.removed.length ? (applied[0] as Contribution).body : undefined
	const content =
		single !== undefined && stripMergeMarkers(single) === single
			? withNewline(trimLeadingBlank(single))
			: renderComposed(composed)
	return {
		...result,
		status: 'found',
		content,
		format: 'markdown',
		metadata: composedMetadata(shown),
		projectSections: sectionsOver('markdown').sections,
	}
}

/**
 * An interface document is never composed: the lowest contribution answers, and a higher one, an
 * `extends`, or a `merge` on it is ignored with a warning, since it would change the contract under
 * every consumer without telling it.
 */
function resolveInterface(
	ref: ReferenceName,
	contributions: readonly Contribution[],
	holders: ReadonlyMap<string, Contribution>,
	defaultContribution: Contribution | undefined,
	result: ResolvedReference,
	warn: WarnFn,
	options: () => string[],
): ResolvedReference {
	for (const contribution of contributions) {
		if (contribution.merge !== undefined || contribution.steps !== undefined) {
			warn(
				'interface-not-composed',
				`${contribution.label}: merge and extends on an interface document are ignored; an interface is never composed`,
			)
		}
	}
	if (ref.plugin === undefined && holders.size > 1) {
		for (const { entry } of contributions) if (entry.outcome === '') entry.outcome = 'ambiguous'
		return {
			...result,
			status: 'ambiguous',
			code: 'reference-ambiguous',
			message: `the plugins ${[...holders.keys()].join(', ')} each hold the interface document`,
			cause: 'unordered',
			options: options(),
		}
	}
	const plugins =
		ref.plugin === undefined
			? [...holders.values()]
			: holders.has(ref.plugin)
				? [holders.get(ref.plugin) as Contribution]
				: []
	if (ref.plugin !== undefined) {
		for (const [plugin, contribution] of holders)
			if (plugin !== ref.plugin) contribution.entry.outcome = 'not used (qualified name)'
		if (!plugins.length) {
			return {
				...result,
				status: 'missing',
				code: 'reference-missing',
				message: `the plugin ${ref.plugin} holds no "${ref.name}"`,
			}
		}
	}
	const tiered = contributions.filter(({ layer }) => layer.tier !== 'plugin' && layer.tier !== 'default')
	const bottomFirst = [
		...(ref.plugin === undefined && defaultContribution ? [defaultContribution] : []),
		...plugins,
		...[...tiered].reverse(),
	]
	const [lowest, ...higher] = bottomFirst
	if (!lowest) {
		return {
			...result,
			status: 'missing',
			code: 'reference-missing',
			message: `no tier holds a document for "${ref.name}"`,
		}
	}
	for (const contribution of higher) {
		contribution.entry.outcome = 'not used (an interface document is never composed)'
		warn(
			'interface-not-composed',
			`${contribution.label} is ignored: an interface document is never composed; define a new interface id instead`,
		)
	}
	if (defaultContribution && defaultContribution !== lowest)
		defaultContribution.entry.outcome = 'not used (qualified name)'
	lowest.entry.outcome = 'used'
	lowest.entry.operation = 'replace'
	lowest.entry.operationFrom = 'default'
	const { trace } = result
	if (lowest.layer.tier === 'plugin') trace.stack = [lowest.layer.plugin as string]
	if (lowest.layer.tier === 'default') trace.stack = ['default']
	trace.contributions = [
		{
			tier: lowest.layer.tier,
			...(lowest.entry.plugin ? { plugin: lowest.entry.plugin } : {}),
			...(lowest.entry.skill ? { skill: lowest.entry.skill } : {}),
			path: lowest.path,
			operation: 'replace',
		},
	]
	return {
		...result,
		status: 'found',
		content: withNewline(trimLeadingBlank(stripMergeMarkers(lowest.body))),
		metadata: composedMetadata([lowest]),
	}
}

export function referenceNames(source: Source): string[] {
	return [...new Set(layersOf(source).layers.flatMap(layerNames))].sort((a, b) => a.localeCompare(b))
}
