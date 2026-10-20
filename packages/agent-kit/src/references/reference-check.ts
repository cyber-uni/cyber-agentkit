import {
	checkImplementation,
	type InterfaceCheck,
	interfaceIdOf,
	interfaceSuffix,
	type ReferenceInterface,
	readImplements,
	readInterface,
} from './reference-interface.js'
import type { ReferenceLayer, ReferenceLayers } from './reference-layers.js'
import type { ReferenceCode } from './reference-warning.js'
import {
	parseReferenceName,
	type ResolvedReference,
	type ResolveOptions,
	referenceNames,
	resolveReference,
} from './resolve-reference.js'
import { skillHoldings, withDefault } from './skill-defaults.js'

export type ReferenceCheckKind = 'interface' | 'implementation' | 'none'

/** A failed check, named by the check; a name not `found` fails with its status code. */
export type ReferenceCheckFailure = {
	check: InterfaceCheck | ReferenceCode
	/** The interface id the failure is about, when the document names one. */
	interface?: string
	message: string
}

export type ReferenceCheckEntry = {
	name: string
	kind: ReferenceCheckKind
	/** `passed` and `failed` are about the composed document; the others mean none was composed. */
	status: 'passed' | 'failed' | 'missing' | 'ambiguous' | 'invalid'
	failures: ReferenceCheckFailure[]
	/** For an implementation: the listed sections it marks `**Unsupported.**` or leaves out. */
	unsupported: string[]
	/** Checked as this skill loads the name, its default joined. */
	loadedBy?: string
}

export type CheckOptions = ResolveOptions & {
	/** The references to check; every interface document and implementation found when omitted. */
	names?: readonly string[] | undefined
}

type Source = ReferenceLayers | readonly ReferenceLayer[]

/** An interface, resolved once per id within one run. */
export type InterfaceLookup = (id: string) => { value?: ReferenceInterface; failure?: ReferenceCheckFailure }

export function interfaceLookup(source: Source, options: ResolveOptions = {}): InterfaceLookup {
	const cache = new Map<string, ReturnType<InterfaceLookup>>()
	return (id) => {
		const cached = cache.get(id)
		if (cached) return cached
		const answer = lookUp(id, source, options)
		cache.set(id, answer)
		return answer
	}
}

function lookUp(id: string, source: Source, options: ResolveOptions): ReturnType<InterfaceLookup> {
	const name = `${id}${interfaceSuffix}`
	const resolved = resolveReference(name, source, options)
	const failure = (message: string) => ({ failure: { check: 'interface found' as const, interface: id, message } })
	if (resolved.status === 'invalid') return failure(`${id} is not an interface id`)
	if (resolved.status === 'missing') return failure(`no interface document ${name}`)
	if (resolved.status === 'ambiguous') {
		return failure(`${name} is ambiguous between ${(resolved.options ?? []).join(' and ')}`)
	}
	const { value, problems } = readInterface(id, resolved.metadata ?? {})
	return value ? { value } : failure(`${name} is malformed: ${problems.join('; ')}`)
}

function bareName(name: string): string {
	return name.slice(name.lastIndexOf('/') + 1)
}

/** What a composed document declares: an interface, an implementation, or neither. */
export function kindOf(resolved: ResolvedReference): ReferenceCheckKind {
	const metadata = resolved.metadata ?? {}
	if (interfaceIdOf(bareName(resolved.name)) !== undefined || metadata['interface'] !== undefined) return 'interface'
	return metadata['implements'] === undefined ? 'none' : 'implementation'
}

export type CheckResult = { failures: ReferenceCheckFailure[]; unsupported: string[] }

/**
 * Checks a composed document against the interface it declares, or an interface document against
 * its own shape. `accept` replaces the versions accepted for one interface id. The `compose` check
 * fails when composing the document raised any warning.
 */
export function checkResolved(
	resolved: ResolvedReference,
	lookup: InterfaceLookup,
	accept?: { id: string; versions: readonly number[] },
): CheckResult {
	if (resolved.status !== 'found') return { failures: [], unsupported: [] }
	const name = bareName(resolved.name)
	const metadata = resolved.metadata ?? {}
	const failures: ReferenceCheckFailure[] = []
	let unsupported: string[] = []
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
	} else {
		const { entry, problems } = readImplements(metadata)
		for (const problem of problems) failures.push({ check: 'interface found', message: problem })
		if (entry) {
			const iface = lookup(entry.id)
			if (iface.value) {
				const checked = checkImplementation(iface.value, {
					name,
					version: entry.version,
					content: resolved.content ?? '',
					accept: accept?.id === entry.id ? accept.versions : undefined,
				})
				failures.push(...checked.failures)
				unsupported = checked.unsupported
			} else failures.push(iface.failure as ReferenceCheckFailure)
		}
	}
	if (resolved.warnings.length) {
		failures.push({
			check: 'compose',
			message: `composing it raised ${resolved.warnings.length === 1 ? 'a warning' : `${resolved.warnings.length} warnings`}: ${resolved.warnings.map(({ code, message }) => `${code}: ${message}`).join('; ')}`,
		})
	}
	return { failures, unsupported }
}

function entryOf(resolved: ResolvedReference, lookup: InterfaceLookup): ReferenceCheckEntry {
	if (resolved.status !== 'found') {
		return {
			name: resolved.name,
			kind: 'none',
			status: resolved.status,
			failures: [{ check: resolved.code as ReferenceCode, message: resolved.message ?? resolved.status }],
			unsupported: [],
		}
	}
	const kind = kindOf(resolved)
	const { failures, unsupported } =
		kind === 'none'
			? {
					failures: [
						{
							check: 'interface found' as const,
							message: `${resolved.name} declares no \`implements\` and is not an interface document`,
						},
					],
					unsupported: [],
				}
			: checkResolved(resolved, lookup)
	return { name: resolved.name, kind, status: failures.length ? 'failed' : 'passed', failures, unsupported }
}

/** The plugins holding a name, as qualified names, when more than one does. */
function pluginCopies(name: string, resolved: ResolvedReference): string[] {
	const plugins = [
		...new Set(resolved.trace.layers.flatMap(({ plugin, file }) => (plugin !== undefined && file ? [plugin] : []))),
	]
	return plugins.length > 1 ? plugins.map((plugin) => `${plugin}/${name}`) : []
}

/**
 * Checks each named reference, or, with no names, every interface document and implementation found.
 * A name several plugins hold is also checked as each `<plugin>/<name>`, so each author sees their own
 * result, and each skill's default as its skill loads it.
 */
export function checkReferences(source: Source, options: CheckOptions = {}): ReferenceCheckEntry[] {
	const { names, ...resolveOptions } = options
	const lookup = interfaceLookup(source, resolveOptions)
	const resolve = (name: string) => resolveReference(parseReferenceName(name), source, resolveOptions)
	if (names?.length) return names.map((name) => entryOf(resolve(name), lookup))
	const entries: ReferenceCheckEntry[] = []
	const plain = new Map<string, string | undefined>()
	for (const name of referenceNames(source)) {
		const resolved = resolve(name)
		plain.set(name, resolved.content)
		const copies = [...(resolved.status === 'found' ? [resolved] : []), ...pluginCopies(name, resolved).map(resolve)]
		for (const copy of copies) {
			if (copy.status === 'found' && kindOf(copy) !== 'none') entries.push(entryOf(copy, lookup))
		}
	}
	// Each skill's default as its skill loads it, where the default changes what the name composes to.
	for (const { name, skill } of skillHoldings(source)) {
		const loaded = resolveReference(name, withDefault(source, skill.folder), resolveOptions)
		const used = loaded.trace.layers.some(({ tier, outcome }) => tier === 'default' && outcome === 'used')
		if (loaded.status !== 'found' || !used || kindOf(loaded) === 'none' || loaded.content === plain.get(name)) continue
		entries.push({ ...entryOf(loaded, lookup), loadedBy: skill.name })
	}
	return entries
}
