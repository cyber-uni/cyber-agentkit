import { aliasIndex, shownName } from './reference-aliases.js'
import { checkResolved, interfaceLookup } from './reference-check.js'
import type { ReferenceWarning } from './reference-codes.js'
import { ReferenceFailure } from './reference-error.js'
import { type InterfaceCardinality, interfaceIdOf, interfaceSuffix, readImplements } from './reference-interface.js'
import type { ReferenceLayer, ReferenceLayers, ReferenceTier } from './reference-layers.js'
import { type FamilyName, isFamilyName, parseFamily, parseReferenceName } from './reference-name.js'
import { type ResolvedReference, type ResolveOptions, referenceNames, resolveReference } from './resolve-reference.js'

export type ReferenceImplementation = {
	/**
	 * What a consumer loads: a plugin's implementation by its qualified name, `<plugin>/<name>`; a
	 * `repo` or `user` implementation of a `many` interface by its bare name (R35).
	 */
	pin: string
	description: string
	/** The optional listed sections it marks `**Unsupported.**` or leaves out, in the interface's order. */
	unsupported: string[]
	name: string
	/** `plugin`, or the `repo` or `user` tier of a bare-name implementation. */
	tier: ReferenceTier
	version: number
}

export type ExcludedImplementation = { name: string; reasons: string[] }

export type ReferenceImplementations = {
	interface: string
	cardinality: InterfaceCardinality
	/** The versions an implementation must declare to be listed. */
	accept: number[]
	implementations: ReferenceImplementation[]
	/**
	 * A `one` interface's implementation in use (R129): the pin of the listed candidate, or `default`, that a
	 * load of the name builds on. Absent when the name is not `found`, and for a `many` interface.
	 */
	inUse?: string
	excluded: ExcludedImplementation[]
	warnings: ReferenceWarning[]
}

/** What `implementations <prefix>.*` lists (R134): each matched interface in name order, as its own call lists it. */
export type FamilyImplementations = {
	family: string
	interfaces: ReferenceImplementations[]
}

export type ImplementationsOptions = ResolveOptions & {
	/** The versions the consumer knows; the interface's own `versions` when omitted. */
	accept?: readonly number[] | undefined
}

type Source = ReferenceLayers | readonly ReferenceLayer[]

function firstLine(value: unknown): string {
	return typeof value === 'string' ? value.split('\n')[0]?.trim() || '' : ''
}

/** Whether a name is in the interface's namespace but declares another interface that its name fits. */
function belongsElsewhere(name: string, declared: string | undefined, id: string): boolean {
	return declared !== undefined && declared !== id && (name === declared || name.startsWith(`${declared}.`))
}

/** The highest `repo` or `user` file with a body the document holds: what makes the bare name its own. */
function ownTier(resolved: ResolvedReference): ReferenceTier | undefined {
	const top = resolved.trace.layers.find(
		(layer) =>
			(layer.tier === 'repo' || layer.tier === 'user') &&
			layer.file &&
			(layer.outcome === 'used' || layer.outcome === 'stale') &&
			!layer.selection &&
			!layer.empty,
	)
	return top?.tier
}

/** The plugins holding a file for the name, as read. */
function holders(resolved: ResolvedReference): string[] {
	return [
		...new Set(
			resolved.trace.layers.flatMap(({ tier, plugin, file }) =>
				tier === 'plugin' && plugin !== undefined && file ? [plugin] : [],
			),
		),
	]
}

type Candidate = { pin: string; name: string; resolved: ResolvedReference; tier: ReferenceTier }

/**
 * The implementations of interface `id` a consumer may load, each checked as `check` would on its
 * composed document, and every candidate left out with why (R35). A candidate is a name in the
 * interface's namespace (`<id>` or `<id>.<key>`) or a reference that declares `implements: <id>@<n>`:
 * a plugin's, pinned by its qualified name, or, for a `many` interface, a `repo` or `user` one,
 * pinned by its bare name. When a `repo` or `user` implementation answers the bare name, a plugin's
 * of that name is left out (C1, J3), since loading the bare name returns the other. Plugins holding
 * a name no `extends` orders are all left out until a customizer picks one (R87). A skill's default
 * is never listed: it has no qualified name to pin. An unknown interface throws.
 */
export function referenceImplementations(
	family: FamilyName,
	source: Source,
	options?: ImplementationsOptions,
): FamilyImplementations
export function referenceImplementations(
	id: string,
	source: Source,
	options?: ImplementationsOptions,
): ReferenceImplementations
export function referenceImplementations(
	id: string,
	source: Source,
	options: ImplementationsOptions = {},
): ReferenceImplementations | FamilyImplementations {
	return isFamilyName(id) || id.includes('*')
		? familyImplementations(id, source, options)
		: interfaceImplementations(id, source, options)
}

/**
 * The interfaces a family names (K39): each interface document whose id starts with the prefix and a
 * dot, at any depth, never a plain document or an implementation (R130). Sorted by id. Throws
 * `name-invalid` for a malformed family (R136), and `interface-unknown` when none match (R135).
 */
export function familyInterfaces(family: string, source: Source, options: ResolveOptions = {}): string[] {
	const parsed = parseFamily(family)
	if (parsed.invalid !== undefined) throw new ReferenceFailure('name-invalid', parsed.invalid)
	const lookup = interfaceLookup(source, options)
	const aliases = aliasIndex(source)
	const ids = new Set<string>()
	for (const name of referenceNames(source)) {
		const id = interfaceIdOf(shownName(name, aliases))
		if (id === undefined || !id.startsWith(`${parsed.prefix}.`)) continue
		const value = lookup(id).value
		if (value) ids.add(value.id)
	}
	if (!ids.size) {
		throw new ReferenceFailure('interface-unknown', `no interface document matches ${family}.`, {
			help: 'Run `reference list` for the names found.',
		})
	}
	return [...ids].sort((a, b) => a.localeCompare(b))
}

/** `implementations <prefix>.*`: each matched interface, in name order, as `implementations <id>` lists it (R134). */
export function familyImplementations(
	family: string,
	source: Source,
	options: ImplementationsOptions = {},
): FamilyImplementations {
	const ids = familyInterfaces(family, source, options)
	return { family, interfaces: ids.map((id) => interfaceImplementations(id, source, options)) }
}

function interfaceImplementations(
	id: string,
	source: Source,
	options: ImplementationsOptions,
): ReferenceImplementations {
	const { accept: acceptOption, ...rest } = options
	const resolveOptions: ResolveOptions = { ...rest, projectSections: false }
	const ifaceName = parseReferenceName(`${id}${interfaceSuffix}`)
	if (ifaceName.invalid || ifaceName.plugin !== undefined)
		throw new ReferenceFailure('interface-unknown', `"${id}" is not an interface id.`)
	const lookup = interfaceLookup(source, rest)
	const iface = lookup(id)
	const value = iface.value
	if (!value) throw new ReferenceFailure('interface-unknown', iface.failure?.message ?? `no interface ${id}`)
	const aliases = aliasIndex(source)
	const ids = [value.id, ...(aliases.interfaces.get(value.id) ?? []).map(({ alias }) => alias)]
	const accept = [...(acceptOption?.length ? acceptOption : value.versions)]
	const report: ReferenceImplementations = {
		interface: value.id,
		cardinality: value.cardinality,
		accept,
		implementations: [],
		excluded: [],
		warnings: [],
	}
	const seen = new Set<string>()
	const warn = (warnings: readonly ReferenceWarning[]) => {
		for (const warning of warnings) {
			const key = `${warning.code} ${warning.message}`
			if (!seen.has(key)) report.warnings.push(warning)
			seen.add(key)
		}
	}
	if (iface.renamed !== undefined) {
		warn([{ code: 'reference-renamed', message: `${id} is an older id of ${value.id}; ask for ${value.id} instead` }])
	}
	const inNamespace = (name: string) => ids.some((each) => name === each || name.startsWith(`${each}.`))
	/** Whether a resolved document is a candidate at all: it declares the interface, or its name is in the namespace. */
	const relevant = (name: string, resolved: ResolvedReference) => {
		const declared = readImplements(resolved.metadata ?? {}).entry?.id
		if (declared !== undefined && ids.includes(declared)) return true
		return inNamespace(name) && !ids.some((each) => belongsElsewhere(name, declared, each))
	}
	const consider = ({ pin, name, resolved, tier }: Candidate) => {
		warn(resolved.warnings)
		const declared = readImplements(resolved.metadata ?? {}).entry
		if (!declared || !ids.includes(declared.id)) {
			const shape = fitsNamespace(value.cardinality, ids, name)
				? ''
				: ` and is not named ${value.cardinality === 'one' ? value.id : `${value.id}.<key>`}`
			report.excluded.push({ name: pin, reasons: [`declares no implements ${value.id}@<version>${shape}`] })
			return
		}
		const checked = checkResolved(resolved, lookup, { id: value.id, versions: accept })
		warn(checked.warnings)
		if (checked.failures.length) {
			report.excluded.push({ name: pin, reasons: checked.failures.map(({ check, message }) => `${check}: ${message}`) })
			return
		}
		report.implementations.push({
			pin,
			description: firstLine(resolved.metadata?.['description']),
			unsupported: checked.unsupported,
			name,
			tier,
			version: declared.version,
		})
	}
	const qualified = (plugin: string, name: string) =>
		resolveReference(parseReferenceName(`${plugin}/${name}`), source, resolveOptions)
	const names = [...new Set(referenceNames(source).map((name) => shownName(name, aliases)))]
	for (const name of names) {
		if (interfaceIdOf(name) !== undefined) continue
		const resolved = resolveReference(name, source, resolveOptions)
		if (resolved.status === 'ambiguous') {
			for (const option of resolved.options ?? []) {
				if (option === 'default') continue
				const copy = resolveReference(parseReferenceName(option), source, resolveOptions)
				if (copy.status !== 'found' || !relevant(name, copy)) continue
				warn(copy.warnings)
				report.excluded.push({
					name: option,
					reasons: [`ambiguous: ${resolved.message}; each is left out until a customizer picks one`],
				})
			}
			continue
		}
		if (resolved.status !== 'found' || !relevant(name, resolved)) continue
		const plugins = holders(resolved)
		const tier = value.cardinality === 'many' ? ownTier(resolved) : undefined
		if (tier !== undefined) {
			consider({ pin: name, name, resolved, tier })
			for (const plugin of plugins) {
				report.excluded.push({
					name: `${plugin}/${name}`,
					reasons: [`the ${tier} implementation answers ${name}; a consumer loads it by that name`],
				})
			}
			continue
		}
		const stacked = resolved.trace.stack.filter((target) => target !== 'default')
		const pick = stacked.at(-1)
		if (pick === undefined) continue
		consider({ pin: `${pick}/${name}`, name, resolved: qualified(pick, name), tier: 'plugin' })
		for (const plugin of plugins) {
			if (plugin === pick) continue
			report.excluded.push({
				name: `${plugin}/${name}`,
				reasons: [`${name} loads the stack of ${pick}, the pick; load ${pick}/${name}`],
			})
		}
	}
	if (value.cardinality === 'one') {
		const inUse = implementationInUse(value.id, source, resolveOptions, report.implementations)
		if (inUse !== undefined) report.inUse = inUse
	}
	return report
}

/**
 * The implementation a load of a `one` interface's name builds on (R129), read from the stack the
 * load composes: the pin of the listed candidate for the plugin it builds on, or `default` when only
 * the skill's default is in the stack. None when the name is not `found`, or the plugin it builds on
 * is not listed.
 */
function implementationInUse(
	id: string,
	source: Source,
	options: ResolveOptions,
	listed: readonly ReferenceImplementation[],
): string | undefined {
	const resolved = resolveReference(parseReferenceName(id), source, options)
	if (resolved.status !== 'found') return undefined
	const pick = resolved.trace.stack.filter((target) => target !== 'default').at(-1)
	if (pick === undefined) return resolved.trace.stack.includes('default') ? 'default' : undefined
	return listed.find(({ pin }) => pin === `${pick}/${id}`)?.pin
}

/** Whether a name fits the interface's cardinality under its id or one of its older ids. */
function fitsNamespace(cardinality: InterfaceCardinality, ids: readonly string[], name: string): boolean {
	return ids.some((id) =>
		cardinality === 'one' ? name === id : name.startsWith(`${id}.`) && name.length > id.length + 1,
	)
}
