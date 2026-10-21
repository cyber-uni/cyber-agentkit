import { checkResolved, interfaceLookup } from './reference-check.js'
import { fitsName, type InterfaceCardinality, interfaceSuffix, readImplements } from './reference-interface.js'
import type { ReferenceLayer, ReferenceLayers, ReferenceTier } from './reference-layers.js'
import { parseReferenceName } from './reference-name.js'
import type { ReferenceWarning } from './reference-warning.js'
import { type ResolvedReference, type ResolveOptions, referenceNames, resolveReference } from './resolve-reference.js'

export type ReferenceImplementation = {
	/** What a consumer loads: the name as it resolved, `<plugin>/<name>` when no extends orders the plugins holding it. */
	pin: string
	description: string
	/** The listed sections it marks `**Unsupported.**` or leaves out, in the interface's order. */
	unsupported: string[]
	name: string
	/** The tier of the highest contribution whose text it holds. */
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
	excluded: ExcludedImplementation[]
	warnings: ReferenceWarning[]
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

/**
 * The implementations of interface `id` a consumer may load, each checked as `check` would on its
 * composed document, and every candidate left out with why. A candidate is a name in the interface's
 * namespace (`<id>` or `<id>.<key>`) or a reference that declares `implements: <id>@<n>`. A skill's
 * default is never listed: it has no qualified name to pin. An unknown interface throws.
 */
export function referenceImplementations(
	id: string,
	source: Source,
	options: ImplementationsOptions = {},
): ReferenceImplementations {
	const { accept: acceptOption, ...resolveOptions } = options
	const ifaceName = parseReferenceName(`${id}${interfaceSuffix}`)
	if (ifaceName.invalid || ifaceName.plugin !== undefined) throw new Error(`"${id}" is not an interface id.`)
	const lookup = interfaceLookup(source, resolveOptions)
	const iface = lookup(id)
	const value = iface.value
	if (!value) throw new Error(iface.failure?.message ?? `no interface ${id}`)
	const accept = [...(acceptOption?.length ? acceptOption : value.versions)]
	const report: ReferenceImplementations = {
		interface: id,
		cardinality: value.cardinality,
		accept,
		implementations: [],
		excluded: [],
		warnings: [],
	}
	const seen = new Set<string>()
	const consider = (name: string, resolved: ResolvedReference) => {
		if (resolved.status !== 'found') return
		const declared = readImplements(resolved.metadata ?? {}).entry
		const inNamespace = name === id || name.startsWith(`${id}.`)
		const declares = declared?.id === id
		if (!declares && (!inNamespace || name.endsWith(interfaceSuffix) || belongsElsewhere(name, declared?.id, id)))
			return
		for (const warning of resolved.warnings) {
			const key = `${warning.code} ${warning.message}`
			if (!seen.has(key)) report.warnings.push(warning)
			seen.add(key)
		}
		if (!declares) {
			const shape = fitsName(value, name) ? '' : ` and is not named ${value.cardinality === 'one' ? id : `${id}.<key>`}`
			report.excluded.push({ name: resolved.name, reasons: [`declares no implements ${id}@<version>${shape}`] })
			return
		}
		const { failures, unsupported } = checkResolved(resolved, lookup, { id, versions: accept })
		if (failures.length) {
			report.excluded.push({
				name: resolved.name,
				reasons: failures.map(({ check, message }) => `${check}: ${message}`),
			})
			return
		}
		const top = resolved.trace.contributions.at(-1)
		report.implementations.push({
			pin: resolved.name,
			description: firstLine(resolved.metadata?.['description']),
			unsupported,
			name,
			tier: top?.tier ?? 'plugin',
			version: (declared as { version: number }).version,
		})
	}
	for (const name of referenceNames(source)) {
		if (name === `${id}${interfaceSuffix}`) continue
		const resolved = resolveReference(name, source, resolveOptions)
		if (resolved.status !== 'ambiguous') {
			consider(name, resolved)
			continue
		}
		for (const option of resolved.options ?? []) {
			if (option !== 'default') consider(name, resolveReference(option, source, resolveOptions))
		}
	}
	return report
}
