import { homedir } from 'node:os'
import type { Platform } from '../harness/platform.js'
import { type AssetLayerOptions, assetLayers } from './asset-layers.js'
import { type ResolvedAsset, resolveAsset } from './resolve-asset.js'

/** `assetLayers`' options, with the machine's own home directory, platform, and environment by default. */
export type LoadAssetOptions = Omit<AssetLayerOptions, 'home' | 'platform'> & {
	home?: string | undefined
	platform?: Platform | undefined
}

/**
 * Resolves one asset by name the way `asset load` does, reading `assets/` folders through the tiers.
 * A data file answers whole from the highest tier holding the name; the skill's own
 * `assets/<name>.<ext>` (`defaultSkill`) is the lowest.
 */
export async function loadAsset(name: string, options: LoadAssetOptions): Promise<ResolvedAsset> {
	const layers = await assetLayers({
		...options,
		home: options.home ?? homedir(),
		platform: options.platform ?? process.platform,
	})
	return resolveAsset(name, layers)
}
