import { homedir } from 'node:os'
import type { Platform } from '../harness/platform.js'
import { type ReferenceLayerOptions, referenceLayers } from './reference-layers.js'
import { type ResolvedReference, resolveReference } from './resolve-reference.js'

/** `referenceLayers`' options, with the machine's own home directory, platform, and environment by default. */
export type LoadReferenceOptions = Omit<ReferenceLayerOptions, 'home' | 'platform'> & {
	home?: string | undefined
	platform?: Platform | undefined
}

/**
 * Resolves one reference for `root` the way `reference show` does, returning the full record: every
 * field `show` prints with `--metadata` and `--trace`. A name that is not a reference name comes back
 * `invalid`, and one no contribution answers `missing`; neither throws.
 */
export async function loadReference(name: string, options: LoadReferenceOptions): Promise<ResolvedReference> {
	const layers = await referenceLayers({
		...options,
		home: options.home ?? homedir(),
		platform: options.platform ?? process.platform,
	})
	return resolveReference(name, layers)
}
