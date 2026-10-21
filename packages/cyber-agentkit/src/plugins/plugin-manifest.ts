import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { isRecord } from './json-file.js'

/**
 * Where a plugin keeps its manifest, relative to its root: the Agent Plugins `plugin.json` at the
 * root (E-VSC-P2, E-COPILOT-P8), then each harness's own folder (E-CODEX-P4, E-CUR-P4, E-COPILOT-P8).
 */
export const pluginManifestPaths: readonly string[] = [
	'plugin.json',
	'.claude-plugin/plugin.json',
	'.cursor-plugin/plugin.json',
	'.codex-plugin/plugin.json',
	'.github/plugin.json',
	'.github/plugin/plugin.json',
]

/**
 * The `name` in the first plugin manifest a folder holds, or `undefined` when it holds none: then
 * the folder is not a plugin, whatever its `package.json` says.
 */
export function pluginManifestName(root: string): string | undefined {
	for (const path of pluginManifestPaths) {
		let manifest: unknown
		try {
			manifest = JSON.parse(readFileSync(join(root, path), 'utf8'))
		} catch {
			continue
		}
		if (isRecord(manifest) && typeof manifest['name'] === 'string' && manifest['name']) return manifest['name']
	}
	return undefined
}
