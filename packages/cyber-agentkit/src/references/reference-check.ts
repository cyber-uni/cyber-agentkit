import { aliasIndex } from './reference-aliases.js'
import { catalogNames } from './reference-catalog.js'
import { baseMovedWarnings, hiddenWarnings, splitComposeWarnings } from './reference-check-warnings.js'
import type { ReferenceStatusCode, ReferenceWarning } from './reference-codes.js'
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
import { heldPlugins } from './reference-package-plugins.js'
import { projectSectionNames } from './reference-project-sections.js'
import {
	parseReferenceName,
	type ReferenceStatus,
	type ResolvedReference,
	type ResolveOptions,
	resolveReference,
} from './resolve-reference.js'
import { skillHoldings, withDefault } from './skill-defaults.js'

export type ReferenceCheckKind = 'interface' | 'implementation' | 'none'

/** A failed check, named by the check; a name not `found` fails with its status code. */
export type ReferenceCheckFailure = {
	check: InterfaceCheck | ReferenceStatusCode
	/** The interface id the failure is about, when the document names one. */
	interface?: string
	message: string
}

export type ReferenceCheckEntry = {
	name: string
	kind: ReferenceCheckKind
	/**
	 * `passed` and `failed` are about the composed document; the others mean none was composed. A name
	 * a `remove` turned off is `missing` with no failures: it is off on purpose (R117).
	 */
	status: 'passed' | 'failed' | 'missing' | 'ambiguous' | 'invalid'
	/** Empty when the entry passes. */
	failures: ReferenceCheckFailure[]
	/** For an implementation: the optional listed sections it marks `**Unsupported.**` or leaves out. */
	unsupported: string[]
	/**
	 * What is passed on and never fails a check: a warning composing raised that depends on what is
	 * installed or chosen (UC6.8), every warning a project section raised (R118), an interface's older
	 * id (R96), a moved base (R86), a hidden file (R112).
	 */
	warnings: ReferenceWarning[]
	/** Checked as this skill loads the name, its default joined. */
	loadedBy?: string
}

export type CheckOptions = ResolveOptions & {
	/** The references to check; every name found when omitted. */
	names?: readonly string[] | undefined
}

type Source = ReferenceLayers | readonly ReferenceLayer[]

/**
 * An interface, resolved once per id within one run. `renamed` is set when `id` is an older id an
 * interface document lists in its `aliases` (R96): the interface is that document's.
 */
export type InterfaceLookup = (id: string) => {
	value?: ReferenceInterface
	failure?: ReferenceCheckFailure
	renamed?: string
}

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
	if (resolved.status === 'missing') {
		const owners = [...aliasIndex(source).interfaces]
			.filter(([, aliases]) => aliases.some(({ alias }) => alias === id))
			.map(([owner]) => owner)
		if (owners.length > 1) {
			return lookupFailure(id, `${id} is an older id of ${owners.join(' and ')}; implement one of them by its own id`)
		}
		if (owners.length === 1) {
			const owner = owners[0] as string
			const found = readFound(owner, resolveReference(`${owner}${interfaceSuffix}`, source, options))
			return found.value ? { ...found, renamed: owner } : found
		}
	}
	return readFound(id, resolved)
}

function lookupFailure(id: string, message: string): ReturnType<InterfaceLookup> {
	return { failure: { check: 'interface-found', interface: id, message } }
}

function readFound(id: string, resolved: ResolvedReference): ReturnType<InterfaceLookup> {
	const name = `${id}${interfaceSuffix}`
	if (resolved.status === 'invalid') return lookupFailure(id, `${id} is not an interface id`)
	if (resolved.status === 'missing') return lookupFailure(id, `no interface document ${name}`)
	if (resolved.status === 'ambiguous') {
		return lookupFailure(id, `${name} is ambiguous between ${(resolved.options ?? []).join(' and ')}`)
	}
	const { value, problems } = readInterface(id, resolved.metadata ?? {})
	return value ? { value } : lookupFailure(id, `${name} is malformed: ${problems.join('; ')}`)
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

export type CheckResult = {
	failures: ReferenceCheckFailure[]
	unsupported: string[]
	/** What the check itself raises and passes on: an `implements` naming an interface's older id (R96). */
	warnings: ReferenceWarning[]
}

/** The `compose` failure for the defects composing a document raised (UC6.8), if any. */
function composeFailure(warnings: readonly ReferenceWarning[]): ReferenceCheckFailure | undefined {
	const { defects } = splitComposeWarnings(warnings)
	if (!defects.length) return undefined
	return {
		check: 'compose',
		message: `composing it raised ${defects.length === 1 ? 'a warning' : `${defects.length} warnings`}: ${defects.map(({ code, message }) => `${code}: ${message}`).join('; ')}`,
	}
}

/**
 * Checks a composed document against the interface it declares, or an interface document against
 * its own shape; a plain document, which is neither, gets only the `compose` check. `accept`
 * replaces the versions accepted for one interface id. The `compose` check fails when composing the
 * document raised a warning that is a defect in the document itself (UC6.8, R116).
 */
export function checkResolved(
	resolved: ResolvedReference,
	lookup: InterfaceLookup,
	accept?: { id: string; versions: readonly number[] },
): CheckResult {
	const result: CheckResult = { failures: [], unsupported: [], warnings: [] }
	if (resolved.status !== 'found') return result
	const { failures, warnings } = result
	const name = bareName(resolved.name)
	const metadata = resolved.metadata ?? {}
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
		for (const problem of problems) failures.push({ check: 'interface-found', message: problem })
		if (entry) {
			const iface = lookup(entry.id)
			if (iface.value) {
				const id = iface.value.id
				if (iface.renamed !== undefined) {
					warnings.push({
						code: 'reference-renamed',
						message: `implements names ${entry.id}@${entry.version}, an older id of ${id}; declare implements: ${id}@${entry.version}`,
					})
				}
				const checked = checkImplementation(iface.value, {
					name,
					version: entry.version,
					content: resolved.content ?? '',
					accept: accept?.id === id ? accept.versions : undefined,
					declaredId: entry.id,
				})
				failures.push(...checked.failures)
				result.unsupported = checked.unsupported
			} else failures.push(iface.failure as ReferenceCheckFailure)
		}
	}
	const compose = composeFailure(resolved.warnings)
	if (compose) failures.push(compose)
	return result
}

function dedupe(warnings: readonly ReferenceWarning[]): ReferenceWarning[] {
	const seen = new Set<string>()
	return warnings.filter(({ code, message }) => {
		const key = `${code} ${message}`
		if (seen.has(key)) return false
		seen.add(key)
		return true
	})
}

/** A key for a warning, to tell one raised twice. */
const warningKey = ({ code, message }: ReferenceWarning) => `${code} ${message}`

/**
 * A name resolved twice: `main` is the main document alone, the one checked; `full` adds its project
 * sections, whose warnings are passed on and never checked (R118). They are the same object when the
 * name has no project section.
 */
type Answer = { main: ResolvedReference; full: ResolvedReference }

/** The warnings the project sections raised: the ones `full` has and `main` does not. */
function sectionWarnings({ main, full }: Answer): ReferenceWarning[] {
	if (full === main) return []
	const own = new Set(main.warnings.map(warningKey))
	return full.warnings.filter((warning) => !own.has(warningKey(warning)))
}

/**
 * One name's entry: every warning `load` raises for it is reported (R116). A defect in the main
 * document fails it; everything else is passed on. A name not `found` fails with its status code,
 * except one a `remove` turned off (R117), and one only project sections answer (UC1.16) is plain.
 */
function entryOf(
	answer: Answer,
	lookup: InterfaceLookup,
	extra: readonly ReferenceWarning[] = [],
): ReferenceCheckEntry {
	const { main, full } = answer
	const found = main.status === 'found' || full.status === 'found'
	const checked: CheckResult =
		main.status === 'found' ? checkResolved(main, lookup) : { failures: [], unsupported: [], warnings: [] }
	const failures = [...checked.failures]
	if (main.status !== 'found') {
		if (!found && main.code !== 'reference-removed') {
			failures.push({ check: main.code as ReferenceStatusCode, message: main.message ?? main.status })
		}
		const compose = composeFailure(main.warnings)
		if (compose) failures.push(compose)
	}
	return {
		name: main.name,
		kind: main.status === 'found' ? kindOf(main) : 'none',
		status: found ? (failures.length ? 'failed' : 'passed') : (main.status as Exclude<ReferenceStatus, 'found'>),
		failures,
		unsupported: checked.unsupported,
		warnings: dedupe([
			...checked.warnings,
			...splitComposeWarnings(main.warnings).passed,
			...sectionWarnings(answer),
			...extra,
		]),
	}
}

/** The plugins holding a name, as qualified names, when more than one does. */
function pluginCopies(name: string, resolved: ResolvedReference): string[] {
	const plugins = [
		...new Set(resolved.trace.layers.flatMap(({ plugin, file }) => (plugin !== undefined && file ? [plugin] : []))),
	]
	return plugins.length > 1 ? plugins.map((plugin) => `${plugin}/${name}`) : []
}

/**
 * Checks each named reference, or, with no names, every name found, reporting every warning `load`
 * raises for each (R116). A name several plugins hold is also checked as each `<plugin>/<name>`, so
 * each author sees their own result, and each skill's default as its skill loads it. Beside what
 * `load` raises, a hidden `repo`, `user`, or project-section file (J2, R112) and a plugin's or
 * default's file whose base moved (R86) are passed on. A warning never fails a check.
 */
export function checkReferences(source: Source, options: CheckOptions = {}): ReferenceCheckEntry[] {
	const { names, ...rest } = options
	const display = rest.display ?? ((path: string) => path)
	// The main document is checked alone: a project section is not checked against an interface (R118).
	const resolveOptions: ResolveOptions = { ...rest, projectSections: false }
	const lookup = interfaceLookup(source, rest)
	const layers = Array.isArray(source) ? undefined : (source as ReferenceLayers)
	const sectionNames = new Set(
		layers?.root === undefined ? [] : projectSectionNames(layers.root, layers.projects, heldPlugins(layers)),
	)
	const resolve = (name: string): Answer => {
		const ref = parseReferenceName(name)
		const main = resolveReference(ref, source, resolveOptions)
		const full = ref.plugin === undefined && sectionNames.has(ref.name) ? resolveReference(ref, source, rest) : main
		return { main, full }
	}
	/** What a checked name's files raise beside `load`: each hidden file, and each moved base. */
	const fileWarnings = ({ main, full }: Answer) => [
		...hiddenWarnings(full, display),
		...baseMovedWarnings(main, source),
	]
	if (names?.length) {
		return names.map((name) => {
			const answer = resolve(name)
			return entryOf(answer, lookup, fileWarnings(answer))
		})
	}
	const entries: ReferenceCheckEntry[] = []
	const plain = new Map<string, string | undefined>()
	for (const name of catalogNames(source)) {
		const answer = resolve(name)
		plain.set(name, answer.main.content)
		entries.push(entryOf(answer, lookup, fileWarnings(answer)))
		for (const copy of pluginCopies(name, answer.main).map(resolve)) {
			entries.push(entryOf(copy, lookup, baseMovedWarnings(copy.main, source)))
		}
	}
	// Each skill's default as its skill loads it, where the default changes what the name composes to.
	for (const { name, skill } of skillHoldings(source)) {
		const loadedSource = withDefault(source, skill.folder)
		const loaded = resolveReference(name, loadedSource, resolveOptions)
		const used = loaded.trace.layers.some(({ tier, outcome }) => tier === 'default' && outcome === 'used')
		if (loaded.status !== 'found' || !used) continue
		const moved = baseMovedWarnings(loaded, loadedSource)
		if (loaded.content === plain.get(name) && !moved.length) continue
		entries.push({ ...entryOf({ main: loaded, full: loaded }, lookup, moved), loadedBy: skill.name })
	}
	return entries
}
