import {
	checkImplementation,
	type InterfaceCheckFailure,
	interfaceIdOf,
	interfaceSuffix,
	type ReferenceInterface,
	readImplements,
	readInterface,
} from './reference-interface.js'
import type { ReferenceLayer, ReferenceTier } from './reference-layers.js'
import {
	parseReferenceName,
	type ResolvedReference,
	type ResolveOptions,
	referenceNames,
	resolveReference,
} from './resolve-reference.js'

export type ReferenceCheckKind = 'interface' | 'implementation' | 'none'

export type ReferenceCheckEntry = {
	name: string
	kind: ReferenceCheckKind
	/** `passed` and `failed` are about the resolved document; `missing` and `ambiguous` mean none resolved. */
	status: 'passed' | 'failed' | 'missing' | 'ambiguous'
	tier?: ReferenceTier
	failures: InterfaceCheckFailure[]
}

export type CheckOptions = ResolveOptions & {
	/** The references to check; every interface document and implementation found when omitted. */
	names?: readonly string[] | undefined
}

/** An interface, resolved once per id within one run. */
export type InterfaceLookup = (id: string) => { value?: ReferenceInterface; failure?: InterfaceCheckFailure }

export function interfaceLookup(layers: readonly ReferenceLayer[], options: ResolveOptions = {}): InterfaceLookup {
	const cache = new Map<string, ReturnType<InterfaceLookup>>()
	return (id) => {
		const cached = cache.get(id)
		if (cached) return cached
		const answer = lookUp(id, layers, options)
		cache.set(id, answer)
		return answer
	}
}

function lookUp(id: string, layers: readonly ReferenceLayer[], options: ResolveOptions): ReturnType<InterfaceLookup> {
	const name = `${id}${interfaceSuffix}`
	let resolved: ResolvedReference
	try {
		resolved = resolveReference(parseReferenceName(name), layers, options)
	} catch {
		return { failure: { check: 'interface found', interface: id, message: `${id} is not an interface id` } }
	}
	if (resolved.status === 'missing') {
		return { failure: { check: 'interface found', interface: id, message: `no interface document ${name}` } }
	}
	if (resolved.status === 'ambiguous') {
		return {
			failure: {
				check: 'interface found',
				interface: id,
				message: `${name} is ambiguous between ${resolved.plugins.join(' and ')}`,
			},
		}
	}
	const { value, problems } = readInterface(id, resolved.metadata ?? {})
	if (value) return { value }
	return {
		failure: { check: 'interface found', interface: id, message: `${name} is malformed: ${problems.join('; ')}` },
	}
}

/** What a resolved document declares: an interface, an implementation, or neither. */
export function kindOf(resolved: ResolvedReference): ReferenceCheckKind {
	const name = resolved.name.slice(resolved.name.lastIndexOf('/') + 1)
	const metadata = resolved.metadata ?? {}
	if (interfaceIdOf(name) !== undefined || metadata['interface'] !== undefined) return 'interface'
	return metadata['implements'] === undefined ? 'none' : 'implementation'
}

/**
 * Checks a resolved document, after every override is merged, against the interfaces it declares.
 * An interface document is checked for well-formed frontmatter. `accept` overrides the versions
 * accepted for one interface id.
 */
export function checkResolved(
	resolved: ResolvedReference,
	lookup: InterfaceLookup,
	accept?: { id: string; versions: readonly number[] },
): InterfaceCheckFailure[] {
	if (resolved.status !== 'found') return []
	const name = resolved.name.slice(resolved.name.lastIndexOf('/') + 1)
	const metadata = resolved.metadata ?? {}
	const failures: InterfaceCheckFailure[] = []
	if (kindOf(resolved) === 'interface') {
		const id = interfaceIdOf(name)
		if (id === undefined) {
			failures.push({
				check: 'interface',
				message: `${name} has an \`interface:\` block; an interface document is named <id>${interfaceSuffix}`,
			})
		} else {
			for (const problem of readInterface(id, metadata).problems) {
				failures.push({ check: 'interface', interface: id, message: problem })
			}
		}
		if (metadata['implements'] === undefined) return failures
	}
	const { entries, problems } = readImplements(metadata)
	for (const problem of problems) failures.push({ check: 'interface found', message: problem })
	for (const entry of entries) {
		const iface = lookup(entry.id)
		if (!iface.value) {
			failures.push(iface.failure as InterfaceCheckFailure)
			continue
		}
		const { failures: found } = checkImplementation(iface.value, {
			name,
			version: entry.version,
			tiers: resolved.layers.map(({ tier }) => tier),
			content: resolved.content ?? '',
			accept: accept?.id === entry.id ? accept.versions : undefined,
		})
		failures.push(...found)
	}
	return failures
}

/** Every pin a name resolves to: itself, or each plugin's qualified name when two plugins hold it. */
function resolvedCopies(name: string, layers: readonly ReferenceLayer[], options: ResolveOptions): ResolvedReference[] {
	const resolved = resolveReference(parseReferenceName(name), layers, options)
	if (resolved.status !== 'ambiguous') return [resolved]
	return resolved.plugins.map((qualified) => resolveReference(parseReferenceName(qualified), layers, options))
}

function entryOf(resolved: ResolvedReference, lookup: InterfaceLookup): ReferenceCheckEntry {
	const kind = resolved.status === 'found' ? kindOf(resolved) : 'none'
	const entry: ReferenceCheckEntry = { name: resolved.name, kind, status: 'passed', failures: [] }
	if (resolved.status !== 'found') {
		entry.status = resolved.status
		entry.failures.push({
			check: 'interface found',
			message:
				resolved.status === 'missing'
					? `no reference named ${resolved.name}`
					: `${resolved.name} is ambiguous between ${resolved.plugins.join(' and ')}`,
		})
		return entry
	}
	const failures: InterfaceCheckFailure[] =
		kind === 'none'
			? [
					{
						check: 'interface found',
						message: `${resolved.name} declares no \`implements\` and is not an interface document`,
					},
				]
			: checkResolved(resolved, lookup)
	return {
		name: resolved.name,
		kind,
		status: failures.length ? 'failed' : 'passed',
		tier: resolved.tier as ReferenceTier,
		failures,
	}
}

/**
 * Checks each named reference, or, with no names, every interface document and every reference that
 * declares `implements`. A name two plugins hold is checked once per plugin when found by the sweep.
 */
export function checkReferences(layers: readonly ReferenceLayer[], options: CheckOptions = {}): ReferenceCheckEntry[] {
	const { names, ...resolveOptions } = options
	const lookup = interfaceLookup(layers, resolveOptions)
	if (names?.length) {
		return names.map((name) => entryOf(resolveReference(parseReferenceName(name), layers, resolveOptions), lookup))
	}
	return referenceNames(layers)
		.flatMap((name) => resolvedCopies(name, layers, resolveOptions))
		.filter((resolved) => resolved.status === 'found' && kindOf(resolved) !== 'none')
		.map((resolved) => entryOf(resolved, lookup))
}
