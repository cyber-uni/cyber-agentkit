import { join } from 'node:path'
import { parse } from 'yaml'
import { isRecord } from '../plugins/json-file.js'
import type { ReferenceWarning } from './reference-codes.js'
import { tryRead } from './reference-contribution.js'
import type { ReferenceLayer, ReferenceLayers } from './reference-layers.js'
import { parseReferenceName } from './reference-name.js'

/**
 * A plugin's rename table, in its `references/` folder (K38). A leading `_` is not a reference name,
 * so the file never answers one.
 */
export const renameTableFile = '_renames.yaml'

/** One entry of a plugin's rename table: an older name and the name it became. */
export type RenameEntry = { from: string; to: string; plugin: string }

export type RenameTable = {
	/** Each older name, with the entries renaming it. */
	byOld: ReadonlyMap<string, readonly RenameEntry[]>
	/** Each entry or table that is not a pair of valid bare names, ignored (`rename-invalid`). */
	warnings: readonly ReferenceWarning[]
}

type Source = ReferenceLayers | readonly ReferenceLayer[]

const cache = new WeakMap<ReferenceLayers, RenameTable>()

function bare(value: unknown): string | undefined {
	if (typeof value !== 'string') return undefined
	const parsed = parseReferenceName(value.trim())
	return parsed.invalid || parsed.plugin !== undefined ? undefined : parsed.name
}

/**
 * Every rename table the plugin tier's plugins ship (R120, R124), read once per set of layers. Only
 * a plugin renames its names, so no other tier is read.
 */
export function renameTable(source: Source): RenameTable {
	const keyed = Array.isArray(source) ? undefined : (source as ReferenceLayers)
	const hit = keyed && cache.get(keyed)
	if (hit) return hit
	const layers = Array.isArray(source) ? (source as readonly ReferenceLayer[]) : (source as ReferenceLayers).layers
	const byOld = new Map<string, RenameEntry[]>()
	const warnings: ReferenceWarning[] = []
	const seen = new Set<string>()
	for (const layer of layers) {
		if (layer.tier !== 'plugin' || layer.skipped || layer.plugin === undefined) continue
		const path = join(layer.dir, renameTableFile)
		if (seen.has(path)) continue
		seen.add(path)
		const raw = tryRead(path)
		if (raw === undefined) continue
		const plugin = layer.plugin
		let value: unknown
		try {
			value = parse(raw)
		} catch {
			value = undefined
		}
		if (value === null || value === undefined) {
			if (raw.trim()) {
				warnings.push({ code: 'rename-invalid', message: `plugin ${plugin}: ${path} is not YAML; it is ignored` })
			}
			continue
		}
		if (!isRecord(value)) {
			warnings.push({
				code: 'rename-invalid',
				message: `plugin ${plugin}: ${path} is not a mapping of older names to new names; it is ignored`,
			})
			continue
		}
		for (const [key, target] of Object.entries(value)) {
			const from = bare(key)
			const to = bare(target)
			if (from === undefined || to === undefined || from === to) {
				warnings.push({
					code: 'rename-invalid',
					message: `plugin ${plugin}: the rename ${JSON.stringify(key)}: ${JSON.stringify(target)} in ${renameTableFile} is not a pair of bare reference names; it is ignored`,
				})
				continue
			}
			const list = byOld.get(from) ?? []
			if (!list.some((entry) => entry.to === to && entry.plugin === plugin)) list.push({ from, to, plugin })
			byOld.set(from, list)
		}
	}
	const table: RenameTable = { byOld, warnings }
	if (keyed) cache.set(keyed, table)
	return table
}
