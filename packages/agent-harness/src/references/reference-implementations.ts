import { checkResolved, interfaceLookup } from './reference-check.js'
import {
	checkImplementation,
	fitsName,
	type InterfaceCardinality,
	interfaceSuffix,
	readImplements,
} from './reference-interface.js'
import type { ReferenceLayer, ReferenceTier } from './reference-layers.js'
import {
	parseReferenceName,
	type ResolvedReference,
	type ResolveOptions,
	referenceNames,
	resolveReference,
} from './resolve-reference.js'

export type ReferenceImplementation = {
	/** What a consumer loads: `<plugin>/<name>` when a plugin's copy is the base, else the bare name. */
	pin: string
	name: string
	/** The tier of the highest layer used. */
	tier: ReferenceTier
	version: number
	description: string
	/** The optional sections it marks `**Unsupported.**` or leaves out, in the interface's order. */
	unsupported: string[]
}

export type ExcludedImplementation = { name: string; reasons: string[] }

export type ReferenceImplementations = {
	interface: string
	cardinality: InterfaceCardinality
	/** The versions an implementation must declare to be listed. */
	accept: number[]
	implementations: ReferenceImplementation[]
	excluded: ExcludedImplementation[]
	/** Only when resolving a candidate raised one. */
	warnings?: string[]
}

export type ImplementationsOptions = ResolveOptions & {
	/** The versions the consumer knows; the interface's own `versions` when omitted. */
	accept?: readonly number[] | undefined
}

function implementedIds(resolved: ResolvedReference): string[] {
	return readImplements(resolved.metadata ?? {}).entries.map(({ id }) => id)
}

/** Whether a name is in the interface's namespace but declares another interface that its name fits. */
function belongsElsewhere(name: string, ids: readonly string[], id: string): boolean {
	return ids.some((other) => other !== id && (name === other || name.startsWith(`${other}.`)))
}

function pinOf(resolved: ResolvedReference, name: string): string {
	const lowest = resolved.layers.at(-1)
	return lowest?.tier === 'plugin' ? `${lowest.plugin}/${name}` : name
}

/**
 * The implementations of interface `id` a consumer may load, each checked as `check` would on its
 * resolved document, and every candidate left out with why. A candidate is a name in the interface's
 * namespace (`<id>` or `<id>.<key>`) or a reference that declares `implements: <id>@<n>`.
 */
export function referenceImplementations(
	id: string,
	layers: readonly ReferenceLayer[],
	options: ImplementationsOptions = {},
): ReferenceImplementations {
	const { accept: acceptOption, ...resolveOptions } = options
	parseReferenceName(`${id}${interfaceSuffix}`)
	const lookup = interfaceLookup(layers, resolveOptions)
	const iface = lookup(id)
	if (!iface.value) throw new Error(iface.failure?.message ?? `no interface ${id}`)
	const accept = [...(acceptOption?.length ? acceptOption : iface.value.versions)]
	const report: ReferenceImplementations = {
		interface: id,
		cardinality: iface.value.cardinality,
		accept,
		implementations: [],
		excluded: [],
	}
	const warnings = new Set<string>()
	for (const name of referenceNames(layers)) {
		if (name === `${id}${interfaceSuffix}`) continue
		const resolved = resolveReference(parseReferenceName(name), layers, resolveOptions)
		const inNamespace = name === id || name.startsWith(`${id}.`)
		if (resolved.status === 'ambiguous') {
			if (!inNamespace) continue
			report.excluded.push({ name, reasons: [`ambiguous between ${resolved.plugins.join(' and ')}`] })
			continue
		}
		if (resolved.status !== 'found') continue
		const ids = implementedIds(resolved)
		const declares = ids.includes(id)
		if (!declares && (!inNamespace || name.endsWith(interfaceSuffix) || belongsElsewhere(name, ids, id))) continue
		for (const warning of resolved.warnings) warnings.add(warning)
		if (!declares) {
			const shape = fitsName(iface.value, name)
				? ''
				: ` and is not named ${iface.value.cardinality === 'one' ? id : `${id}.<key>`}`
			report.excluded.push({ name, reasons: [`declares no implements ${id}@<version>${shape}`] })
			continue
		}
		const failures = checkResolved(resolved, lookup, { id, versions: accept }).filter(
			(failure) => failure.interface === id || failure.interface === undefined,
		)
		if (failures.length) {
			report.excluded.push({ name, reasons: failures.map(({ message }) => message) })
			continue
		}
		const version = readImplements(resolved.metadata ?? {}).entries.find((entry) => entry.id === id)?.version as number
		const { unsupported } = checkImplementation(iface.value, {
			name,
			version,
			tiers: resolved.layers.map(({ tier }) => tier),
			content: resolved.content ?? '',
			accept,
		})
		const description = resolved.metadata?.['description']
		report.implementations.push({
			pin: pinOf(resolved, name),
			name,
			tier: resolved.tier as ReferenceTier,
			version,
			description: typeof description === 'string' ? description.split('\n')[0]?.trim() || '' : '',
			unsupported,
		})
	}
	if (warnings.size) report.warnings = [...warnings]
	return report
}
