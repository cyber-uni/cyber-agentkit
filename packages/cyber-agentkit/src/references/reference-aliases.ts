import type { ReferenceWarning, WarnFn } from './reference-codes.js'
import { type Contribution, layerNames, readContribution } from './reference-contribution.js'
import { interfaceIdOf } from './reference-interface.js'
import type { ReferenceLayer, ReferenceLayers } from './reference-layers.js'
import { parseReferenceName, type ReferenceName } from './reference-name.js'
import type { ReferenceTraceLayer } from './resolve-reference.js'

/** The owner's contribution of a name that lists an older name in `aliases` (R96): a plugin's or a default's. */
export type AliasOwner = {
	/** The new name. */
	name: string
	tier: 'plugin' | 'default'
	plugin?: string
	skill?: string
	/** The file listing the alias: the contribution, or a non-Markdown name's metadata file. */
	path: string
}

/**
 * Every `aliases` the owners of names list (R96, R98), read once per set of layers. An interface
 * document's aliases are its older interface ids, which a name follows as U9's interface rules say,
 * so they are kept apart.
 */
export type AliasIndex = {
	/** Each older name, with the owners of the new names listing it. */
	byAlias: ReadonlyMap<string, readonly AliasOwner[]>
	/** Each new name, with the older names its owners list. */
	byName: ReadonlyMap<string, readonly string[]>
	/** The names a plugin's or a default's contribution holds as its own, each with who holds it. */
	owned: ReadonlyMap<string, readonly string[]>
	/** Each new name, with the warnings about an invalid alias its owners list (`alias-invalid`). */
	warnings: ReadonlyMap<string, readonly ReferenceWarning[]>
	/** Each interface id whose document lists older ids, with those ids and the owners listing them. */
	interfaces: ReadonlyMap<string, readonly { alias: string; owner: AliasOwner }[]>
}

type Source = ReferenceLayers | readonly ReferenceLayer[]

const cache = new WeakMap<ReferenceLayers, AliasIndex>()

const quiet = () => () => {}

function ownerLabel(owner: Pick<AliasOwner, 'tier' | 'plugin' | 'skill'>): string {
	return owner.tier === 'plugin' ? `plugin ${owner.plugin}` : `default of ${owner.skill}`
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
	const list = map.get(key)
	if (list) list.push(value)
	else map.set(key, [value])
}

/** The `aliases` a contribution lists, as written: one name, or a list of them. */
function listed(value: unknown): unknown[] {
	if (value === undefined || value === null) return []
	return Array.isArray(value) ? value : [value]
}

/**
 * Reads the aliases every plugin and default lists. Only an owner renames a name, so the tier
 * folders are never read here. A set of layers a command built is read once; a plain list of layers,
 * which a caller may change between calls, is read each time.
 */
export function aliasIndex(source: Source): AliasIndex {
	const keyed = Array.isArray(source) ? undefined : (source as ReferenceLayers)
	const hit = keyed && cache.get(keyed)
	if (hit) return hit
	const layers = Array.isArray(source) ? (source as readonly ReferenceLayer[]) : (source as ReferenceLayers).layers
	const byAlias = new Map<string, AliasOwner[]>()
	const byName = new Map<string, string[]>()
	const owned = new Map<string, string[]>()
	const warnings = new Map<string, ReferenceWarning[]>()
	const interfaces = new Map<string, { alias: string; owner: AliasOwner }[]>()
	for (const layer of layers) {
		if ((layer.tier !== 'plugin' && layer.tier !== 'default') || layer.skipped) continue
		for (const name of layerNames(layer)) {
			const entry: ReferenceTraceLayer = { tier: layer.tier, path: layer.dir, outcome: '' }
			const read = readContribution(layer, name, entry, { display: (path) => path, without: undefined, warnAt: quiet })
			if (!read) continue
			const owner: AliasOwner = { name, tier: layer.tier, path: aliasFile(read) }
			if (layer.plugin !== undefined) owner.plugin = layer.plugin
			if (layer.skill !== undefined) owner.skill = layer.skill
			push(owned, name, ownerLabel(owner))
			const id = interfaceIdOf(name)
			for (const value of listed(read.metadata['aliases'])) {
				const alias = typeof value === 'string' ? value.trim() : undefined
				const parsed = alias === undefined ? undefined : parseReferenceName(alias)
				if (alias === undefined || !parsed || parsed.invalid || parsed.plugin !== undefined || alias === (id ?? name)) {
					push(warnings, name, {
						code: 'alias-invalid',
						message: `${ownerLabel(owner)}: the alias ${JSON.stringify(value)} is not a reference name of its own; it is ignored`,
					})
					continue
				}
				if (id !== undefined) {
					push(interfaces, id, { alias, owner })
					continue
				}
				push(byAlias, alias, owner)
				const older = byName.get(name) ?? []
				if (!older.includes(alias)) byName.set(name, [...older, alias])
			}
		}
	}
	const index: AliasIndex = { byAlias, byName, owned, warnings, interfaces }
	if (keyed) cache.set(keyed, index)
	return index
}

function aliasFile(read: Contribution): string {
	return read.entry.frontmatter && read.whole ? read.path.replace(/\.[^./]+$/, '.meta.md') : read.path
}

/** How a requested name reads once its aliases are followed. */
export type AliasResolution =
	/** Not an older name: it resolves as itself. */
	| { kind: 'own' }
	/** An older name: it resolves as `ref`, the name listing it. */
	| { kind: 'renamed'; ref: ReferenceName; alias: string }
	/** Two names list it: each is an option. */
	| { kind: 'ambiguous'; names: string[]; message: string }

/**
 * The pre-pass before a name's layers are read (R96, R98): an older name resolves as the name
 * listing it, a qualified `<plugin>/<older name>` as that plugin's new name. A name a plugin or a
 * default holds as its own is never read as an alias, and an alias two names list is ambiguous.
 * Aliases are not followed transitively.
 */
export function resolveAlias(ref: ReferenceName, index: AliasIndex, warn: WarnFn): AliasResolution {
	if (ref.invalid) return { kind: 'own' }
	const owners = (index.byAlias.get(ref.name) ?? []).filter(
		(owner) => ref.plugin === undefined || owner.plugin === ref.plugin,
	)
	if (!owners.length) return { kind: 'own' }
	const holders = index.owned.get(ref.name)
	if (holders) {
		warn('alias-not-used', notUsedMessage(ref.name, holders, owners))
		return { kind: 'own' }
	}
	const names = [...new Set(owners.map(({ name }) => name))].sort((a, b) => a.localeCompare(b))
	if (names.length > 1) {
		const options = ref.plugin === undefined ? names : names.map((name) => `${ref.plugin}/${name}`)
		return {
			kind: 'ambiguous',
			names: options,
			message: `"${ref.name}" is an older name of ${names.join(' and ')}; load one of them by its own name`,
		}
	}
	const name = names[0] as string
	warn('reference-renamed', `"${ref.raw}" is renamed "${name}"; load "${name}" instead`)
	const renamed: ReferenceName = { raw: ref.raw, name }
	if (ref.plugin !== undefined) renamed.plugin = ref.plugin
	return { kind: 'renamed', ref: renamed, alias: ref.name }
}

function notUsedMessage(alias: string, holders: readonly string[], owners: readonly AliasOwner[]): string {
	const listing = [...new Set(owners.map((owner) => `${ownerLabel(owner)}'s "${owner.name}"`))].join(' and ')
	return `the alias "${alias}" that ${listing} lists is not used: ${holders.join(' and ')} ${holders.length > 1 ? 'hold' : 'holds'} "${alias}" as its own name`
}

/**
 * The older names a file filed under applies as `name` (R97): each alias its owners list that no
 * plugin or default holds as its own and no other name lists. Resolving `name` raises the warnings
 * about its aliases: one not used (R98), and one that is invalid (R96).
 */
export function olderNames(name: string, index: AliasIndex, warn: WarnFn): string[] {
	for (const warning of index.warnings.get(name) ?? []) warn(warning.code, warning.message)
	const usable: string[] = []
	for (const alias of index.byName.get(name) ?? []) {
		const owners = index.byAlias.get(alias) ?? []
		const holders = index.owned.get(alias)
		if (holders) {
			warn('alias-not-used', notUsedMessage(alias, holders, owners))
			continue
		}
		if (new Set(owners.map((owner) => owner.name)).size > 1) continue
		usable.push(alias)
	}
	return usable
}

/** The name a listed name shows as: an older name a single name lists shows as that name (R98). */
export function shownName(name: string, index: AliasIndex): string {
	if (index.owned.has(name)) return name
	const names = new Set((index.byAlias.get(name) ?? []).map((owner) => owner.name))
	return names.size === 1 ? ([...names][0] as string) : name
}

/**
 * `aliases` on a contribution other than an owner's (a managed, `repo`, or `user` one) is ignored with
 * an `alias-invalid` warning: only the owner renames a name (UC19.4). A project section's is warned
 * about as a key a section does not carry (R110).
 */
export function warnMisplacedAliases(contributions: readonly Contribution[], warnAt: (where: string) => WarnFn): void {
	for (const contribution of contributions) {
		const { tier } = contribution.layer
		if (tier === 'plugin' || tier === 'default' || !('aliases' in contribution.metadata)) continue
		warnAt(contribution.label)(
			'alias-invalid',
			"`aliases` is ignored: only the owner's contribution, a plugin's or a skill's default, renames a name",
		)
	}
}
