import { homedir } from 'node:os'
import type { Platform } from '../harness/platform.js'
import { type ReferenceLayerOptions, referenceLayers } from './reference-layers.js'
import { requireName } from './reference-name.js'
import { type ResolvedReference, resolveReference } from './resolve-reference.js'

/** `referenceLayers`' options, with the machine's own home directory, platform, and environment by default. */
export type LoadReferenceOptions = Omit<ReferenceLayerOptions, 'home' | 'platform'> & {
	home?: string | undefined
	platform?: Platform | undefined
}

/**
 * Resolves one reference for the root the way `reference load` does, returning the full record: every
 * field `load` prints with `--metadata` and `--trace`. A name that is not a reference name comes back
 * `invalid`, and one no contribution answers `missing`; neither throws. An empty name throws
 * `ReferenceFailure` with `name-missing`, and a `root` that does not exist with `root-missing`.
 */
export async function loadReference(name: string, options: LoadReferenceOptions): Promise<ResolvedReference> {
	requireName(name)
	const layers = await referenceLayers({
		...options,
		home: options.home ?? homedir(),
		platform: options.platform ?? process.platform,
	})
	return resolveReference(name, layers)
}
