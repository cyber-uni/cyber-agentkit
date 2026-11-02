import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { type AssetLayers, projectAssetsDir, userAssetsDir } from './asset-layers.js'
import { parseAssetName } from './asset-name.js'
import { type ResolvedAsset, resolveAsset } from './resolve-asset.js'
import { AssetError } from './skill-assets.js'

export type SelectAssetArgs = {
	root: string
	home: string
	name: string
	/** A plugin's manifest name, or `default` for the skill's own file. Not used with `clear`. */
	option?: string | undefined
	scope?: string | undefined
	clear?: boolean | undefined
}

export type SelectAssetResult = { path: string; selected?: string; cleared: boolean; after: ResolvedAsset }

/** The options a name can be selected between: each plugin holding it, and `default` when the skill's file exists. */
function options(layers: AssetLayers, name: string): string[] {
	const found = resolveAsset(name, layers).trace.layers
	return [
		...found.filter(({ tier, file }) => tier === 'plugin' && file).map(({ plugin }) => plugin as string),
		...(found.some(({ tier, file }) => tier === 'default' && file) ? ['default'] : []),
	]
}

/**
 * Writes `<name>.select` in the project or user `assets/` folder: one line, the plugin or `default` that
 * answers the name. Nothing else is in the file, and nothing extends or merges.
 */
export function selectAsset(layers: AssetLayers, args: SelectAssetArgs): SelectAssetResult {
	const name = parseAssetName(args.name)
	if (name.invalid || name.plugin !== undefined) {
		throw new AssetError('name-invalid', name.invalid ?? 'select takes a bare name.', true)
	}
	if (args.scope !== undefined && args.scope !== 'project' && args.scope !== 'user') {
		throw new AssetError('options-invalid', '--scope is project or user.', true)
	}
	const dir = args.scope === 'user' ? userAssetsDir(args.home) : projectAssetsDir(resolve(args.root))
	const path = join(dir, `${name.name}.select`)
	if (args.clear) {
		if (!existsSync(path)) throw new AssetError('no-file', `${path} does not exist, so there is no selection to clear.`)
		rmSync(path)
	} else {
		const held = options(layers, name.name)
		if (!args.option || !held.includes(args.option)) {
			throw new AssetError(
				'option-invalid',
				`"${args.option ?? ''}" cannot be selected for "${name.name}". Options: ${held.join(', ') || 'none, no plugin or default holds it'}.`,
				!args.option,
			)
		}
		mkdirSync(dirname(path), { recursive: true })
		writeFileSync(path, `${args.option}\n`)
	}
	const result: SelectAssetResult = {
		path,
		cleared: Boolean(args.clear),
		after: resolveAsset(name.name, layers, { without: args.clear ? path : undefined }),
	}
	return args.clear ? result : { ...result, selected: args.option as string }
}
