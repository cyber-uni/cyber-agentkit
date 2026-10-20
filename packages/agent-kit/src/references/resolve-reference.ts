import { type Dirent, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isRecord } from '../plugins/json-file.js'
import {
	applyContribution,
	type Composed,
	composedSections,
	emptyComposed,
	hasBody,
	isMergeOperation,
	type MergeOperation,
	parseDocument,
	readMergeOperation,
	renderComposed,
	type SectionSource,
	stripMergeMarkers,
} from './reference-document.js'
import { interfaceIdOf } from './reference-interface.js'
import type { ReferenceLayer, ReferenceLayers, ReferenceTier } from './reference-layers.js'
import { defaultSuffix, namePattern, parseReferenceName, type ReferenceName } from './reference-name.js'
import type { ReferenceCode, ReferenceWarning, WarnFn } from './reference-warning.js'

export type { ReferenceName } from './reference-name.js'
export { parseReferenceName } from './reference-name.js'

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
	/** The file that answered, relative to the folder: `<name>.md`, `<name>/README.md`, or `<name>.default.md`. */
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
}

/** A name resolved, with every field: the command prints a subset. A bad name is a status, never thrown. */
export type ResolvedReference = {
	name: string
	status: ReferenceStatus
	/** Set when not `found`. */
	code?: ReferenceCode
	/** Why it is not `found`, for a person. */
	message?: string
	content?: string
	/** The composed frontmatter, key by key with the higher contribution winning, without `merge` and `extends`. */
	metadata?: Record<string, unknown>
	/** When `ambiguous`: each `<plugin>/<name>`, and `default` when the skill has one. */
	options?: string[]
	cause?: AmbiguousCause
	/** When a `remove` turned the name off: that contribution. */
	removedBy?: string
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

/** One `extends` entry: a plugin or `default`, with the keys to use for it in place of its own. */
export type ExtendsStep = { target: string; merge?: MergeOperation; extends?: ExtendsStep[] }

type Contribution = {
	layer: ReferenceLayer
	entry: ReferenceTraceLayer
	label: string
	path: string
	metadata: Record<string, unknown>
	body: string
	hasBody: boolean
	merge: MergeOperation | undefined
	/** Its own `extends`, when written and well formed. */
	steps: ExtendsStep[] | undefined
}

type Source = ReferenceLayers | readonly ReferenceLayer[]

function layersOf(source: Source): ReferenceLayers {
	return Array.isArray(source)
		? { layers: [...(source as readonly ReferenceLayer[])], harnesses: [] }
		: (source as ReferenceLayers)
}

function tryRead(path: string): string | undefined {
	try {
		return readFileSync(path, 'utf8')
	} catch {
		return undefined
	}
}

/** The files that answer a name in a layer, in the order they answer. */
export function candidateFiles(layer: Pick<ReferenceLayer, 'tier'>, name: string): string[] {
	return layer.tier === 'default' ? [`${name}${defaultSuffix}.md`] : [`${name}.md`, `${name}/README.md`]
}

export function contributionLabel(layer: ReferenceLayer, path: string, display: (path: string) => string): string {
	if (layer.tier === 'plugin') return `plugin ${layer.plugin}`
	if (layer.tier === 'default') return `default of ${layer.skill}`
	return `${layer.tier} ${display(path)}`
}

/** Reads `extends`: a plugin or `default` per step, bottom first. `undefined` when it is not written or malformed. */
export function readExtends(value: unknown, warn: WarnFn): ExtendsStep[] | undefined {
	if (value === undefined) return undefined
	const malformed = (why: string) => {
		warn('extends-invalid', `\`extends\` ${why}; it is read as not written`)
		return undefined
	}
	const list: unknown[] | undefined = typeof value === 'string' ? [value] : Array.isArray(value) ? value : undefined
	if (!list) return malformed('is not a list of plugins')
	const steps: ExtendsStep[] = []
	for (const item of list) {
		const step = readStep(item, warn)
		if (typeof step === 'string') return malformed(step)
		steps.push(step)
	}
	return steps
}

function readStep(item: unknown, warn: WarnFn): ExtendsStep | string {
	if (typeof item === 'string') {
		return namePattern.test(item) ? { target: item } : `names "${item}", which is not a plugin name or default`
	}
	if (!isRecord(item) || Object.keys(item).length !== 1) return `holds ${JSON.stringify(item)}, which is not a step`
	const [target, keys] = Object.entries(item)[0] as [string, unknown]
	if (!namePattern.test(target)) return `names "${target}", which is not a plugin name or default`
	if (keys === null || keys === undefined) return { target }
	const step: ExtendsStep = { target }
	if (typeof keys === 'string') {
		step.merge = readStepMerge(keys, target, warn)
		return step
	}
	if (!isRecord(keys) || Object.keys(keys).some((key) => key !== 'merge' && key !== 'extends')) {
		return `gives "${target}" keys other than merge and extends`
	}
	if (keys['merge'] !== undefined) step.merge = readStepMerge(keys['merge'], target, warn)
	if (keys['extends'] !== undefined) {
		const nested = readExtends(keys['extends'], warn)
		if (!nested) return `gives "${target}" a malformed extends`
		step.extends = nested
	}
	return step
}

function readStepMerge(value: unknown, target: string, warn: WarnFn): MergeOperation {
	if (isMergeOperation(value)) return value
	warn('merge-unknown', `unknown merge "${String(value)}" on the step ${target}; read as patch`)
	return 'patch'
}

type StackEntry = { target: string; contribution: Contribution; operation: MergeOperation; from: OperationSource }

type Ambiguity = { cause: AmbiguousCause; message: string }

type Expansion = {
	entries: StackEntry[]
	/** The steps that could not be used, each with why. */
	missing: { target: string; reason: string }[]
	/** Every listed step was missing: the `extends` counts as not written. */
	allMissing: boolean
	/** Plugins a step's own `extends` would have brought in, had the step not replaced it. */
	replaced: { target: string; step: string }[]
	ambiguous?: Ambiguity
}

type Lookup = (target: string) => Contribution | { reason: string }

/**
 * Expands a list of steps bottom first: each step brings its own `extends` beneath it, recursively.
 * Under a written list (`written`), bringing in stops silently at a plugin already in the stack;
 * among the plugins' own `extends`, a cycle makes the name ambiguous.
 */
function expand(top: readonly ExtendsStep[], owner: string, mode: 'written' | 'plugins', lookup: Lookup, warn: WarnFn) {
	const result: Expansion = { entries: [], missing: [], allMissing: false, replaced: [] }
	const placed = new Set<string>()
	const inProgress = new Set<string>()
	const normalize = (steps: readonly ExtendsStep[], who: string, self?: string): ExtendsStep[] => {
		const out: ExtendsStep[] = []
		for (const step of steps) {
			if (step.target === self) {
				warn('extends-self', `${who} lists itself in its extends; that entry is ignored`)
				continue
			}
			if (out.at(-1)?.target === step.target) continue
			if (out.some(({ target }) => target === step.target) && !result.ambiguous) {
				result.ambiguous = { cause: 'repeat', message: `${who}'s extends lists ${step.target} at two places` }
			}
			out.push(step)
		}
		return out
	}
	const listed = normalize(top, owner)
	const listedTargets = new Set(listed.map(({ target }) => target))
	const visit = (step: ExtendsStep, isTop: boolean, chain: readonly string[]) => {
		if (result.ambiguous || placed.has(step.target)) return
		if (inProgress.has(step.target)) {
			if (mode === 'plugins') {
				result.ambiguous = {
					cause: 'cycle',
					message: `the plugins' own extends form a cycle: ${[...chain, step.target].join(' → ')}`,
				}
			}
			return
		}
		if (!isTop && listedTargets.has(step.target)) return
		const found = lookup(step.target)
		if ('reason' in found) {
			result.missing.push({ target: step.target, reason: found.reason })
			if (step.target !== 'default') {
				warn(
					'extends-step-missing',
					`the step ${step.target} in ${chain.at(-1) ?? owner}'s extends ${found.reason}; it is skipped`,
				)
			}
			return
		}
		inProgress.add(step.target)
		const own = found.steps ?? []
		if (step.extends) {
			const kept = new Set(step.extends.map(({ target }) => target))
			for (const { target } of own) if (!kept.has(target)) result.replaced.push({ target, step: step.target })
		}
		for (const sub of normalize(step.extends ?? own, `plugin ${step.target}`, step.target)) {
			visit(sub, false, [...chain, step.target])
		}
		inProgress.delete(step.target)
		const operation = step.merge ?? found.merge ?? 'patch'
		const from: OperationSource = step.merge ? 'step' : found.merge ? 'contribution' : 'default'
		result.entries.push({ target: step.target, contribution: found, operation, from })
		placed.add(step.target)
	}
	for (const step of listed) visit(step, true, [])
	result.allMissing =
		listed.length > 0 &&
		listed.every(({ target }) => !placed.has(target)) &&
		listed.some(({ target }) => target !== 'default')
	return result
}

type Plan = {
	entries: StackEntry[]
	builtBy: string
	/** Plugins a step's own `extends` would have brought in, and the step that replaced it. */
	replaced: { target: string; step: string }[]
	/** Who replaced a step's own `extends`, for the trace. */
	replacedBy: string
}

type Failure = { status: 'missing' | 'ambiguous'; message: string; cause?: AmbiguousCause }

const noWarn: WarnFn = () => {}

/**
 * Decides the stack: the highest written `extends` in the managed, project, and user tiers; else
 * the plugins' own `extends`; for a qualified name, that plugin's own stack.
 */
function plan(
	ref: ReferenceName,
	tiered: readonly Contribution[],
	holders: ReadonlyMap<string, Contribution>,
	lookup: Lookup,
	defaultContribution: Contribution | undefined,
	warn: WarnFn,
): Plan | Failure {
	let built: (Plan & { builder: Contribution; targets: string }) | undefined
	for (const contribution of tiered) {
		if (!contribution.steps) continue
		if (ref.plugin !== undefined) {
			contribution.entry.extendsOutcome = 'not used (qualified name)'
			continue
		}
		if (built) {
			const lower = expand(contribution.steps, contribution.label, 'written', lookup, noWarn)
			if (lower.entries.map(({ target }) => target).join(' ') !== built.targets) {
				contribution.entry.extendsOutcome = `not used (${built.builder.label}'s extends builds the stack)`
				warn(
					'extends-not-used',
					`${contribution.label} builds a different stack from ${built.builder.label}, whose extends is used`,
				)
			}
			continue
		}
		const expansion = expand(contribution.steps, contribution.label, 'written', lookup, warn)
		if (expansion.ambiguous) return { status: 'ambiguous', ...expansion.ambiguous }
		if (expansion.allMissing) {
			contribution.entry.extendsOutcome = 'not used (every step is missing)'
			warn('extends-all-missing', `every step in ${contribution.label}'s extends is missing; it is read as not written`)
			continue
		}
		built = {
			entries: expansion.entries,
			builtBy: contribution.label,
			replaced: expansion.replaced,
			replacedBy: contribution.label,
			builder: contribution,
			targets: expansion.entries.map(({ target }) => target).join(' '),
		}
	}
	if (built) return built
	if (ref.plugin !== undefined) {
		const found = lookup(ref.plugin)
		if ('reason' in found) return { status: 'missing', message: `the plugin ${ref.plugin} ${found.reason}` }
		const expansion = expand([{ target: ref.plugin }], `plugin ${ref.plugin}`, 'plugins', lookup, warn)
		if (expansion.ambiguous) return { status: 'ambiguous', ...expansion.ambiguous }
		return { entries: expansion.entries, builtBy: 'qualified name', replaced: [], replacedBy: '' }
	}
	return planFromPlugins(holders, lookup, defaultContribution, ref.name, warn)
}

function planFromPlugins(
	holders: ReadonlyMap<string, Contribution>,
	lookup: Lookup,
	defaultContribution: Contribution | undefined,
	name: string,
	warn: WarnFn,
): Plan | Failure {
	const defaultEntry = (): StackEntry[] =>
		defaultContribution
			? [
					{
						target: 'default',
						contribution: defaultContribution,
						operation: defaultContribution.merge ?? 'patch',
						from: defaultContribution.merge ? 'contribution' : 'default',
					},
				]
			: []
	const names = [...holders.keys()]
	if (!names.length) return { entries: defaultEntry(), builtBy: 'none', replaced: [], replacedBy: '' }
	const reach = new Map<string, Set<string>>()
	for (const holder of names) {
		const closure = expand([{ target: holder }], `plugin ${holder}`, 'plugins', lookup, noWarn)
		if (closure.ambiguous) return { status: 'ambiguous', ...closure.ambiguous }
		reach.set(holder, new Set(closure.entries.map(({ target }) => target).filter((target) => target !== holder)))
	}
	const tops = names.filter((holder) => !names.some((other) => other !== holder && reach.get(other)?.has(holder)))
	const unordered = (): Failure => ({
		status: 'ambiguous',
		cause: 'unordered',
		message: `the plugins ${names.join(', ')} hold it, and no extends orders them`,
	})
	if (tops.length !== 1) return unordered()
	const top = tops[0] as string
	const expansion = expand([{ target: top }], `plugin ${top}`, 'plugins', lookup, warn)
	if (expansion.ambiguous) return { status: 'ambiguous', ...expansion.ambiguous }
	const placed = new Set(expansion.entries.map(({ target }) => target))
	if (names.some((holder) => !placed.has(holder))) return unordered()
	const entries = expansion.entries
	if (defaultContribution && !placed.has('default')) {
		entries.unshift(...defaultEntry())
		const plugins = names.join(', ')
		warn(
			'default-not-selected',
			`${names.length > 1 ? 'the plugins' : 'the plugin'} ${plugins} ${names.length > 1 ? 'answer' : 'answers'} over the default of ${defaultContribution.layer.skill}, and no extends names either; run "reference select ${name} <option>..." to choose (options: ${[...names, 'default'].join(', ')})`,
		)
	}
	const builtBy = top && (holders.get(top)?.steps?.length ?? 0) > 0 ? `plugin ${top}'s extends` : 'none'
	return { entries, builtBy, replaced: [], replacedBy: '' }
}

function namesDefault(steps: readonly ExtendsStep[] | undefined): boolean {
	return (steps ?? []).some((step) => step.target === 'default' || namesDefault(step.extends))
}

function emptyTrace(harnesses: readonly string[]): ReferenceTrace {
	return { stack: [], builtBy: 'none', contributions: [], sections: [], layers: [], harnesses: [...harnesses] }
}

function withNewline(content: string): string {
	return content.endsWith('\n') ? content : `${content}\n`
}

function trimLeadingBlank(content: string): string {
	return content.replace(/^(?:[ \t]*\r?\n)+/, '')
}

/**
 * Resolves one name: reads each layer, puts the contributions in one order (the stack under the
 * user, project, and managed tiers), and composes them bottom first, each with its operation.
 */
export function resolveReference(
	input: string | ReferenceName,
	source: Source,
	{ display = (path) => path, without, below }: ResolveOptions = {},
): ResolvedReference {
	const ref = typeof input === 'string' ? parseReferenceName(input) : input
	const { layers: all, harnesses } = layersOf(source)
	const trace = emptyTrace(harnesses)
	const warnings: ReferenceWarning[] = []
	const result: ResolvedReference = { name: ref.raw, status: 'missing', warnings, trace }
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

	const order: { contribution: Contribution; operation: MergeOperation; from: OperationSource }[] = [
		...decided.entries,
		...[...tiered].reverse().map((contribution) => ({
			contribution,
			operation: contribution.merge ?? 'patch',
			from: (contribution.merge ? 'contribution' : 'default') as OperationSource,
		})),
	]
	let composed: Composed = emptyComposed()
	let applied: Contribution[] = []
	let removedBy: Contribution | undefined
	const used: Contribution[] = []
	for (const { contribution, operation, from } of order) {
		const { entry } = contribution
		entry.operation = operation
		entry.operationFrom = from
		const warnHere = warnAt(contribution.label)
		if (operation === 'remove') {
			if (contribution.hasBody)
				warnHere('remove-body-ignored', 'a merge: remove contribution has a body; it is ignored')
			for (const below of applied) below.entry.outcome = `shadowed by ${contribution.label} (remove)`
			for (const row of composedSections(composed)) {
				if (row.path !== '(before the first heading)') composed.removed.push({ path: row.path, by: contribution.label })
			}
			const removed = composed.removed
			applied = []
			composed = { ...emptyComposed(), removed }
			removedBy = contribution
			entry.outcome = 'used'
			used.push(contribution)
			continue
		}
		if (!contribution.hasBody) {
			entry.outcome = entry.extendsOutcome ?? 'used'
			if (!entry.extendsOutcome) used.push(contribution)
			continue
		}
		if (operation === 'replace') {
			for (const below of applied) below.entry.outcome = `shadowed by ${contribution.label} (replace)`
			applied = []
		}
		composed = applyContribution(composed, contribution.body, operation, contribution.label, warnHere)
		applied.push(contribution)
		removedBy = undefined
		entry.outcome = 'used'
		used.push(contribution)
	}

	trace.sections = composed.removed.map(({ path, by }) => ({ path, contributions: [], removedBy: by }))
	if (!applied.length) {
		if (removedBy) {
			return {
				...result,
				status: 'missing',
				code: 'reference-missing',
				message: `"${ref.name}" is turned off by ${removedBy.label} (remove)`,
				removedBy: removedBy.label,
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
		metadata: composedMetadata(shown),
	}
}

/** Lower first, so a higher contribution wins a key both set; `merge` and `extends` say how one applies, so they stay out. */
function composedMetadata(contributions: readonly Contribution[]): Record<string, unknown> {
	const metadata: Record<string, unknown> = Object.assign({}, ...contributions.map(({ metadata }) => metadata))
	delete metadata['merge']
	delete metadata['extends']
	return metadata
}

type ReadContext = {
	display: (path: string) => string
	without: string | undefined
	warnAt: (where: string) => WarnFn
}

function readContribution(
	layer: ReferenceLayer,
	name: string,
	entry: ReferenceTraceLayer,
	{ display, without, warnAt }: ReadContext,
): Contribution | undefined {
	if (layer.tier !== 'default') {
		const stray = join(layer.dir, `${name}${defaultSuffix}.md`)
		if (stray !== without && tryRead(stray) !== undefined) {
			warnAt(display(stray))('default-in-tier', "it is ignored: a default goes in a skill's references/ folder")
		}
	}
	const hits = candidateFiles(layer, name).flatMap((file) => {
		const path = join(layer.dir, file)
		const raw = path === without ? undefined : tryRead(path)
		return raw === undefined ? [] : [{ file, path, raw }]
	})
	const [hit, ...ignored] = hits
	if (!hit) return undefined
	for (const other of ignored) {
		warnAt(display(other.path))('file-ignored', `it is ignored: ${hit.file} answers first in that folder`)
	}
	const label = contributionLabel(layer, hit.path, display)
	const warn = warnAt(label)
	const { metadata, body } = parseDocument(hit.raw, warn)
	const merge = readMergeOperation(metadata, warn)
	const steps = readExtends(metadata['extends'], warn)
	Object.assign(entry, { path: hit.path, file: hit.file, frontmatter: metadata, outcome: '' })
	if (typeof metadata['description'] === 'string') entry.description = metadata['description']
	const bodyHeld = hasBody(body)
	if (!bodyHeld) entry.empty = true
	if (steps && !bodyHeld && merge !== 'remove') entry.selection = true
	return { layer, entry, label, path: hit.path, metadata, body, hasBody: bodyHeld, merge, steps }
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

/** Every name a layer holds; empty for a layer that is missing, unreadable, or skipped. */
export function layerNames(layer: Pick<ReferenceLayer, 'tier' | 'dir' | 'skipped'>): string[] {
	if (layer.skipped) return []
	let entries: Dirent[]
	try {
		entries = readdirSync(layer.dir, { withFileTypes: true })
	} catch {
		return []
	}
	const names = new Set<string>()
	const isDefault = layer.tier === 'default'
	for (const entry of entries) {
		let name: string | undefined
		if (isDefault) {
			if (entry.name.endsWith(`${defaultSuffix}.md`)) name = entry.name.slice(0, -`${defaultSuffix}.md`.length)
		} else if (entry.name.endsWith('.md') && !entry.isDirectory()) {
			name = entry.name.slice(0, -3)
		} else if (!entry.isFile() && tryRead(join(layer.dir, entry.name, 'README.md')) !== undefined) {
			name = entry.name
		}
		if (name === undefined || parseReferenceName(name).invalid) continue
		names.add(name)
	}
	return [...names]
}

export function referenceNames(source: Source): string[] {
	return [...new Set(layersOf(source).layers.flatMap(layerNames))].sort((a, b) => a.localeCompare(b))
}
