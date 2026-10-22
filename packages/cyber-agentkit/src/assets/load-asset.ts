import { type LoadReferenceOptions, loadReference } from '../references/load-reference.js'
import type { ResolvedReference } from '../references/resolve-reference.js'

/**
 * Resolves one asset by name the way `asset load` does: the reference engine, reading `assets/` where
 * it reads `references/`. A data file answers whole from the highest tier holding the name; the skill's
 * own `assets/<name>.<ext>` (`defaultSkill`) is the lowest.
 */
export async function loadAsset(name: string, options: LoadReferenceOptions): Promise<ResolvedReference> {
	return loadReference(name, { ...options, folder: 'assets' })
}
