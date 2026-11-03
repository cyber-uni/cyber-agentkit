import { type Dirent, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AssetLayer, AssetLayers, AssetTier, AssetWarning } from './asset-layers.js'
import {
	type AssetFormat,
	type AssetName,
	assetDataExtensions,
	assetNamePattern,
	formatOfAssetFile,
	parseAssetName,
} from './asset-name.js'

export type AssetStatus = 'found' | 'missing' | 'ambiguous' | 'invalid'

/** One layer checked, as the trace reports it. */
export type AssetTraceLayer = {
	tier: AssetTier
	plugin?: string
	skill?: string
	/** The file matched, or the folder checked when none matched. */
	path: string
	/** The file that answered, relative to the folder: `<name>.<ext>`. */
	file?: string
	operation?: 'replace'
	operationFrom?: 'default' | 'contribution'
	/** `used`; `shadowed by ...`; `not used (...)`; `not read (...)`; `ambiguous`; or `missing`. */
	outcome: string
	/** A file with nothing in it. */
	empty?: boolean
}

export type AssetTraceContribution = {
	tier: AssetTier
	plugin?: string
	skill?: string
	path: string
	operation: 'replace'
}

export type AssetTrace = {
	/** The plugins and `default` the name builds on, bottom first. */
	stack: string[]
	/** What decided the stack: `selection`, `qualified name`, or `none`. */
	builtBy: string
	/** The contributions whose text the answer holds, bottom first. */
	contributions: AssetTraceContribution[]
	/** Always empty: an asset is never composed. Kept so the trace has the shape a reference trace has. */
	sections: never[]
	/** Every layer checked, highest first. */
	layers: AssetTraceLayer[]
	/** The harnesses detected, whose managed folders and enabled plugins were read. */
	harnesses: string[]
}

/** A name resolved, with every field: the command prints a subset. A bad name is a status, never thrown. */
export type ResolvedAsset = {
	name: string
	status: AssetStatus
	/** Set when not `found`. */
	code?: 'reference-missing' | 'reference-ambiguous' | 'reference-invalid'
	/** Why it is not `found`, for a person. */
	message?: string
	/** The file as written. */
	content?: string
	/** Set when `found`: `markdown`, or the format of the data file that answered. */
	format?: AssetFormat
	/** Always empty: an asset has no frontmatter that composes. */
	metadata?: Record<string, unknown>
	/** When `ambiguous`: each `<plugin>/<name>`, and `default` when the skill has one. */
	options?: string[]
	cause?: 'unordered'
	warnings: AssetWarning[]
	trace: AssetTrace
}

export type ResolveAssetOptions = {
	/** How a path is shown in a warning: the command collapses the home directory. */
	display?: (path: string) => string
	/** A file read as absent, so `select --clear` can report what answers once it is gone. */
	without?: string | undefined
}

type Contribution = {
	layer: AssetLayer
	entry: AssetTraceLayer
	label: string
	path: string
	body: string
	hasBody: boolean
	format: AssetFormat
}

type Source = AssetLayers | readonly AssetLayer[]

type Warn = (code: AssetWarning['code'], message: string) => void

function layersOf(source: Source): AssetLayers {
	return Array.isArray(source)
		? { layers: [...(source as readonly AssetLayer[])], harnesses: [] }
		: (source as AssetLayers)
}

function tryRead(path: string): string | undefined {
	try {
		return readFileSync(path, 'utf8')
	} catch {
		return undefined
	}
}

/** The files that answer a name in a layer, in the order they answer. */
function candidateFiles(name: string): string[] {
	return [`${name}.md`, ...assetDataExtensions.map(({ extension }) => `${name}${extension}`)]
}

function contributionLabel(layer: AssetLayer, path: string, display: (path: string) => string): string {
	if (layer.tier === 'plugin') return `plugin ${layer.plugin}`
	if (layer.tier === 'default') return `default of ${layer.skill}`
	return `${layer.tier} ${display(path)}`
}

type StackEntry = { target: string; contribution: Contribution; from: 'default' }

type Plan = { entries: StackEntry[]; builtBy: string }

type Failure = { status: 'missing' | 'ambiguous'; message: string; cause?: 'unordered' }

/** The plugin or `default` a managed, project, or user `<name>.select` file names; the highest one wins. */
function readSelection(layers: readonly AssetLayer[], name: string, warn: Warn): string | undefined {
	for (const layer of layers) {
		if (layer.skipped || !['managed', 'project', 'user'].includes(layer.tier)) continue
		const raw = tryRead(join(layer.dir, `${name}.select`))
		if (raw === undefined) continue
		const value = raw.trim()
		if (!assetNamePattern.test(value)) {
			warn(
				'selection-invalid',
				`${layer.tier} ${name}.select holds "${value}", which is not a plugin name or default; it is ignored`,
			)
			continue
		}
		return value
	}
	return undefined
}

/**
 * The stack of an asset name: nothing extends or merges, so the highest tier holding the name answers
 * whole. Below the tiers, one plugin answers over the skill's own file; several plugins make the name
 * ambiguous unless a tier or a selection answers, or a qualified name picks one.
 */
function plan(
	ref: AssetName,
	layers: readonly AssetLayer[],
	tiered: readonly Contribution[],
	holders: ReadonlyMap<string, Contribution>,
	lookup: (target: string) => Contribution | { reason: string },
	defaultContribution: Contribution | undefined,
	warn: Warn,
): Plan | Failure {
	const entry = (target: string, contribution: Contribution): StackEntry => ({ target, contribution, from: 'default' })
	const lowest = defaultContribution ? [entry('default', defaultContribution)] : []
	if (ref.plugin !== undefined) {
		const found = lookup(ref.plugin)
		if ('reason' in found) return { status: 'missing', message: `the plugin ${ref.plugin} ${found.reason}` }
		return { entries: [entry(ref.plugin, found)], builtBy: 'qualified name' }
	}
	if (tiered.some(({ hasBody }) => hasBody)) return { entries: lowest, builtBy: 'none' }
	const chosen = readSelection(layers, ref.name, warn)
	if (chosen !== undefined) {
		if (chosen === 'default' && defaultContribution) return { entries: lowest, builtBy: 'selection' }
		const held = holders.get(chosen)
		if (held) return { entries: [...lowest, entry(chosen, held)], builtBy: 'selection' }
		warn(
			'selection-invalid',
			`the selection of "${ref.name}" names ${chosen}, which holds no such asset; it is ignored`,
		)
	}
	const plugins = [...holders.entries()]
	if (plugins.length > 1) {
		const names = plugins.map(([plugin]) => plugin)
		return {
			status: 'ambiguous',
			cause: 'unordered',
			message: `the plugins ${names.join(', ')} hold it; run "asset select ${ref.name} <option>" (options: ${names.join(', ')}${defaultContribution ? ', default' : ''}), ask for ${names[0]}/${ref.name}, or put the file in a project or user assets folder`,
		}
	}
	const [only] = plugins
	return { entries: [...lowest, ...(only ? [entry(only[0], only[1])] : [])], builtBy: 'none' }
}

function readContribution(
	layer: AssetLayer,
	name: string,
	entry: AssetTraceLayer,
	display: (path: string) => string,
	without: string | undefined,
	warnAt: (where: string) => Warn,
): Contribution | undefined {
	if (layer.tier !== 'default') {
		const stray = join(layer.dir, `${name}.default.md`)
		if (stray !== without && tryRead(stray) !== undefined) {
			warnAt(display(stray))('default-in-tier', "it is ignored: a default goes in a skill's references/ folder")
		}
	}
	const hits = candidateFiles(name).flatMap((file) => {
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
	Object.assign(entry, { path: hit.path, file: hit.file, outcome: '' })
	const held = hit.raw.trim().length > 0
	if (!held) entry.empty = true
	return { layer, entry, label, path: hit.path, body: hit.raw, hasBody: held, format: formatOfAssetFile(hit.file) }
}

/**
 * Resolves one asset name: reads each layer, decides which plugin or skill file answers under the
 * tiers, and returns the highest file as written. Nothing merges or extends.
 */
export function resolveAsset(
	input: string | AssetName,
	source: Source,
	{ display = (path) => path, without }: ResolveAssetOptions = {},
): ResolvedAsset {
	const ref = typeof input === 'string' ? parseAssetName(input) : input
	const { layers, harnesses } = layersOf(source)
	const trace: AssetTrace = {
		stack: [],
		builtBy: 'none',
		contributions: [],
		sections: [],
		layers: [],
		harnesses: [...harnesses],
	}
	const warnings: AssetWarning[] = []
	const result: ResolvedAsset = { name: ref.raw, status: 'missing', warnings, trace }
	if (ref.invalid) return { ...result, status: 'invalid', code: 'reference-invalid', message: ref.invalid }
	const seen = new Set<string>()
	const warnAt =
		(where: string): Warn =>
		(code, message) => {
			const text = where ? `${where}: ${message}` : message
			if (seen.has(`${code} ${text}`)) return
			seen.add(`${code} ${text}`)
			warnings.push({ code, message: text })
		}
	const warn = warnAt('')

	const contributions: Contribution[] = []
	for (const layer of layers) {
		if (layer.warning) warn(layer.warning.code, layer.warning.message)
		const entry: AssetTraceLayer = { tier: layer.tier, path: layer.dir, outcome: 'missing' }
		if (layer.plugin !== undefined) entry.plugin = layer.plugin
		if (layer.skill !== undefined) entry.skill = layer.skill
		trace.layers.push(entry)
		if (layer.skipped) {
			entry.outcome = `not read (${layer.skipped})`
			continue
		}
		const contribution = readContribution(layer, ref.name, entry, display, without, warnAt)
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
	const lookup = (target: string): Contribution | { reason: string } => {
		if (target === 'default') return defaultContribution ?? { reason: 'has no default' }
		return holders.get(target) ?? { reason: readable.has(target) ? `holds no ${ref.name}` : 'is not installed' }
	}

	const decided = plan(ref, layers, tiered, holders, lookup, defaultContribution, warn)
	if ('status' in decided) {
		if (decided.status === 'ambiguous') {
			for (const { entry } of contributions) if (entry.outcome === '') entry.outcome = 'ambiguous'
			return {
				...result,
				status: 'ambiguous',
				code: 'reference-ambiguous',
				message: decided.message,
				cause: 'unordered',
				options: [
					...[...holders.keys()].map((plugin) => `${plugin}/${ref.name}`),
					...(defaultContribution ? ['default'] : []),
				],
			}
		}
		for (const { entry } of contributions) if (entry.outcome === '') entry.outcome = 'not used (qualified name)'
		return { ...result, status: 'missing', code: 'reference-missing', message: decided.message }
	}

	trace.stack = decided.entries.map(({ target }) => target)
	trace.builtBy = decided.builtBy
	const inStack = new Set(trace.stack)
	for (const [target, contribution] of [
		...holders.entries(),
		...(defaultContribution ? [['default', defaultContribution] as const] : []),
	]) {
		if (inStack.has(target)) continue
		contribution.entry.outcome = ref.plugin !== undefined ? 'not used (qualified name)' : 'not used (not in extends)'
	}

	const order: { contribution: Contribution; from: 'default' | 'contribution' }[] = [
		...decided.entries,
		...[...tiered].reverse().map((contribution) => ({ contribution, from: 'contribution' as const })),
	]
	let applied: Contribution[] = []
	let whole: Contribution | undefined
	for (const { contribution, from } of order) {
		const { entry } = contribution
		entry.operation = 'replace'
		if (contribution.hasBody) {
			entry.operationFrom = 'default'
			for (const below of applied) below.entry.outcome = `shadowed by ${contribution.label} (replace)`
			applied = [contribution]
			whole = contribution
		} else {
			entry.operationFrom = from
		}
		entry.outcome = 'used'
	}

	if (!applied.length) {
		const message =
			ref.plugin !== undefined
				? `the plugin ${ref.plugin} holds no document for "${ref.name}"`
				: `no tier holds a document for "${ref.name}"`
		return { ...result, status: 'missing', code: 'reference-missing', message }
	}

	trace.contributions = applied.map(({ layer, entry }) => {
		const row: AssetTraceContribution = { tier: layer.tier, path: entry.path, operation: 'replace' }
		if (entry.plugin !== undefined) row.plugin = entry.plugin
		if (entry.skill !== undefined) row.skill = entry.skill
		return row
	})
	const answer = whole as Contribution
	return { ...result, status: 'found', content: answer.body, format: answer.format, metadata: {} }
}

/** Every name a layer holds; empty for a layer that is missing, unreadable, or skipped. */
function layerNames(layer: AssetLayer): string[] {
	if (layer.skipped) return []
	let entries: Dirent[]
	try {
		entries = readdirSync(layer.dir, { withFileTypes: true })
	} catch {
		return []
	}
	const names = new Set<string>()
	for (const entry of entries) {
		if (
			entry.isDirectory() ||
			!['.md', ...assetDataExtensions.map((item) => item.extension)].some((extension) => entry.name.endsWith(extension))
		) {
			continue
		}
		const name = entry.name.slice(0, entry.name.lastIndexOf('.'))
		if (parseAssetName(name).invalid) continue
		names.add(name)
	}
	return [...names]
}

/** Every asset name any layer holds, sorted. */
export function assetNames(source: Source): string[] {
	return [...new Set(layersOf(source).layers.flatMap(layerNames))].sort((a, b) => a.localeCompare(b))
}
