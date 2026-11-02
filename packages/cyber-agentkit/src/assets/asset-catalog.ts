import type { AssetLayer, AssetLayers, AssetTier, AssetWarning } from './asset-layers.js'
import { type AssetStatus, assetNames, type ResolveAssetOptions, resolveAsset } from './resolve-asset.js'

/** One row per name. */
export type AssetListRow = {
	format?: string
	name: string
	status: AssetStatus
	/** When `ambiguous`: each `<plugin>/<name>`, and `default` when the skill has one. */
	options?: string[]
}

/** One row per name per tier or plugin layer holding it, with the outcome that file gets. */
export type AssetListLayerRow = {
	name: string
	tier: AssetTier
	plugin?: string
	skill?: string
	path: string
	outcome: string
}

export type AssetListing = {
	references: AssetListRow[]
	layers: AssetListLayerRow[]
	warnings: AssetWarning[]
}

export type ListAssetOptions = ResolveAssetOptions & {
	/** Keep only names matching this pattern: `*` stands for any run of characters, everything else is literal and case-sensitive. */
	pattern?: string | undefined
}

function patternMatcher(pattern: string): RegExp {
	const source = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
	return new RegExp(`^${source.join('.*')}$`, 's')
}

/**
 * One row per asset name any layer holds, and one row per name per layer holding it (the skill's own
 * `default` tier is not listed per layer). A `pattern` keeps only the names it matches exactly.
 */
export function listAssetNames(
	source: AssetLayers | readonly AssetLayer[],
	{ pattern, ...resolveOptions }: ListAssetOptions = {},
): AssetListing {
	const matcher = pattern === undefined ? undefined : patternMatcher(pattern)
	const listing: AssetListing = { references: [], layers: [], warnings: [] }
	const seen = new Set<string>()
	for (const name of assetNames(source)) {
		if (matcher && !matcher.test(name)) continue
		const resolved = resolveAsset(name, source, resolveOptions)
		for (const warning of resolved.warnings) {
			const key = `${warning.code} ${warning.message}`
			if (!seen.has(key)) listing.warnings.push(warning)
			seen.add(key)
		}
		const row: AssetListRow = { name, status: resolved.status }
		if (resolved.format && resolved.format !== 'markdown') row.format = resolved.format
		// The skill's own file is not named as an option: `select` takes it as `default`.
		if (resolved.options) row.options = resolved.options.filter((option) => option !== 'default')
		listing.references.push(row)
		for (const entry of resolved.trace.layers) {
			if (entry.file === undefined || entry.tier === 'default') continue
			const layerRow: AssetListLayerRow = { name, tier: entry.tier, path: entry.path, outcome: entry.outcome }
			if (entry.plugin !== undefined) layerRow.plugin = entry.plugin
			if (entry.skill !== undefined) layerRow.skill = entry.skill
			listing.layers.push(layerRow)
		}
	}
	return listing
}
