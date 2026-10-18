import { homedir } from 'node:os'
import type { Platform } from '../harness/platform.js'
import { type ReferenceLayerOptions, referenceLayers } from './reference-layers.js'
import { parseReferenceName, type ResolvedReference, resolveReference } from './resolve-reference.js'

/** `referenceLayers`' options, with the machine's own home directory, platform, and environment by default. */
export type LoadReferenceOptions = Omit<ReferenceLayerOptions, 'home' | 'platform'> & {
	home?: string | undefined
	platform?: Platform | undefined
}

/**
 * Resolves one reference for `root` the way `reference show` does: every tier read, each layer
 * combined as its `merge` mode asks. A name that is not a reference name throws; a name no layer
 * holds comes back with status `missing`.
 */
export async function loadReference(name: string, options: LoadReferenceOptions): Promise<ResolvedReference> {
	const parsed = parseReferenceName(name)
	const layers = await referenceLayers({
		...options,
		home: options.home ?? homedir(),
		platform: options.platform ?? process.platform,
		programData: options.programData ?? process.env['ProgramData'],
	})
	return resolveReference(parsed, layers)
}
